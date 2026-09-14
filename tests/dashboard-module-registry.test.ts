import test from "node:test";
import assert from "node:assert/strict";
import {
  DASHBOARD_MODULE_REGISTRY,
  PLANNED_DASHBOARD_MODULES,
  getDashboardModule,
  listActiveDashboardModules,
  isModulePermitted,
  sanitizeModuleSettings,
  type DashboardModuleId,
} from "../app/domain/dashboard-modules";
import {
  createDefaultDashboardLayout,
  sanitizeDashboardLayout,
  moveDashboardModule,
  cycleDashboardModuleSpan,
  setDashboardModuleVisible,
  toggleDashboardModuleCollapse,
  visibleDashboardModules,
  hiddenDashboardModules,
  addableDashboardModules,
  type DashboardLayoutState,
} from "../app/lib/dashboard-layout-model";
import {
  getDefaultPreferences,
  mergeStoredPreferences,
  BUILT_IN_PRESETS,
} from "../app/lib/preference-engine";
import type { ClinicalPermission } from "../app/server/auth/provider-context";

// ─── TEST FIXTURES ───
const PROVIDER_USER: { permissions: ClinicalPermission[] } = {
  permissions: ["read_schedule", "read_clinical", "manage_tasks", "collaborate_team"],
};

const FRONT_DESK_USER: { permissions: ClinicalPermission[] } = {
  permissions: ["read_schedule"],
};

test("module registry defines bounded catalog and keeps planned modules separate", () => {
  const activeIds = listActiveDashboardModules().map((m) => m.id);
  
  // All 6 core modules must exist in the active registry
  assert.ok(activeIds.includes("schedule"), "schedule must be in registry");
  assert.ok(activeIds.includes("queue"), "queue must be in registry");
  assert.ok(activeIds.includes("team"), "team must be in registry");
  assert.ok(activeIds.includes("briefing"), "briefing must be in registry");
  assert.ok(activeIds.includes("metrics"), "metrics must be in registry");
  assert.ok(activeIds.includes("shortcuts"), "shortcuts must be in registry");

  // Planned modules (e.g. billing, reports) must be marked planned and excluded from active registry
  for (const planned of PLANNED_DASHBOARD_MODULES) {
    const meta = getDashboardModule(planned.id as DashboardModuleId);
    assert.strictEqual(meta?.status, "planned");
    assert.ok(!activeIds.includes(planned.id as DashboardModuleId));
  }
});

test("schedule is strictly permanent and cannot be hidden", () => {
  const scheduleMeta = getDashboardModule("schedule");
  assert.ok(scheduleMeta);
  assert.strictEqual(scheduleMeta.permanent, true, "schedule must be marked permanent");

  const initialLayout = createDefaultDashboardLayout();
  const attemptHide = setDashboardModuleVisible(initialLayout, "schedule", false);
  
  const scheduleItem = attemptHide.modules.find((m) => m.id === "schedule");
  assert.ok(scheduleItem);
  assert.strictEqual(scheduleItem.visible, true, "schedule cannot be hidden via setDashboardModuleVisible");
});

test("module span constraints are enforced", () => {
  const scheduleMeta = getDashboardModule("schedule");
  assert.deepStrictEqual(scheduleMeta?.allowedSpans, ["full"]);

  const queueMeta = getDashboardModule("queue");
  assert.deepStrictEqual(queueMeta?.allowedSpans, ["half", "full"]);

  const teamMeta = getDashboardModule("team");
  assert.deepStrictEqual(teamMeta?.allowedSpans, ["half", "full"]);

  const layout = createDefaultDashboardLayout();

  // Cycle span on schedule should do nothing (it only supports full)
  const cycledSchedule = cycleDashboardModuleSpan(layout, "schedule");
  assert.strictEqual(
    cycledSchedule.modules.find((m) => m.id === "schedule")?.span,
    "full"
  );

  // Cycle span on queue should toggle between half and full
  const initialQueueSpan = layout.modules.find((m) => m.id === "queue")?.span ?? "half";
  const cycledQueue = cycleDashboardModuleSpan(layout, "queue");
  const nextQueueSpan = cycledQueue.modules.find((m) => m.id === "queue")?.span;
  assert.notStrictEqual(initialQueueSpan, nextQueueSpan);
});

test("permission-filtered catalog grants access appropriately", () => {
  const activeModules = listActiveDashboardModules();

  // Provider with all permissions can access all active modules
  const providerModules = activeModules.filter((m) => isModulePermitted(m, PROVIDER_USER));
  assert.strictEqual(providerModules.length, activeModules.length);

  // Receptionist without 'sign_notes' or 'collaborate_team' cannot access queue or team
  const deskModules = activeModules.filter((m) => isModulePermitted(m, FRONT_DESK_USER));
  const deskModuleIds = deskModules.map((m) => m.id);
  assert.ok(deskModuleIds.includes("schedule"), "Desk staff can see schedule");
  assert.ok(!deskModuleIds.includes("queue"), "Desk staff cannot see queue without sign_notes / manage_clinical_inbox");
  assert.ok(!deskModuleIds.includes("team"), "Desk staff cannot see team without collaborate_team");
});

test("presentation state model stores strictly presentation geometry and zero patient data", () => {
  const layout = createDefaultDashboardLayout();

  // Verify that layout state contains NO patient facts, names, or MRNs
  const serialized = JSON.stringify(layout);
  assert.ok(!serialized.includes("patient"), "Layout must not store patient facts");
  assert.ok(!serialized.includes("diagnosis"), "Layout must not store diagnosis facts");
  assert.ok(!serialized.includes("medication"), "Layout must not store medication facts");

  for (const mod of layout.modules) {
    const keys = Object.keys(mod);
    // Keys must be strictly presentation-related
    for (const key of keys) {
      assert.ok(
        ["id", "visible", "collapsed", "span", "settings"].includes(key),
        `Unexpected key ${key} in presentation state`
      );
    }
  }
});

test("layout operations correctly reorder, collapse, hide, and restore modules", () => {
  let layout = createDefaultDashboardLayout();

  // 1. Move
  const firstId = layout.modules[0].id;
  const secondId = layout.modules[1].id;
  layout = moveDashboardModule(layout, 0, "down");
  assert.strictEqual(layout.modules[0].id, secondId);
  assert.strictEqual(layout.modules[1].id, firstId);

  // Boundary checks
  const unchangedTop = moveDashboardModule(layout, 0, "up");
  assert.deepStrictEqual(unchangedTop, layout);

  const unchangedBottom = moveDashboardModule(layout, layout.modules.length - 1, "down");
  assert.deepStrictEqual(unchangedBottom, layout);

  // 2. Collapse toggle
  assert.strictEqual(layout.modules.find((m) => m.id === "queue")?.collapsed, false);
  layout = toggleDashboardModuleCollapse(layout, "queue");
  assert.strictEqual(layout.modules.find((m) => m.id === "queue")?.collapsed, true);
  layout = toggleDashboardModuleCollapse(layout, "queue");
  assert.strictEqual(layout.modules.find((m) => m.id === "queue")?.collapsed, false);

  // 3. Hide & Restore
  layout = setDashboardModuleVisible(layout, "team", false);
  const visible = visibleDashboardModules(layout);
  const hidden = hiddenDashboardModules(layout);
  const addable = addableDashboardModules(layout);

  assert.ok(!visible.some((m) => m.id === "team"));
  assert.ok(hidden.some((m) => m.id === "team"));
  assert.ok(addable.some((m) => m.id === "team"));

  layout = setDashboardModuleVisible(layout, "team", true);
  assert.ok(visibleDashboardModules(layout).some((m) => m.id === "team"));
  assert.ok(!hiddenDashboardModules(layout).some((m) => m.id === "team"));
});

test("sanitizeDashboardLayout cleanses corrupt layouts and guarantees schedule permanence", () => {
  const corruptInput: any = {
    version: 999,
    columns: "invalid",
    modules: [
      { id: "unknown_hacker_module", visible: true },
      { id: "team", span: "invalid_span", collapsed: "not_boolean" },
      // Note: schedule is missing entirely!
    ],
  };

  const sanitized = sanitizeDashboardLayout(corruptInput);
  
  // Must be valid version and columns
  assert.strictEqual(sanitized.version, 1);
  assert.strictEqual(sanitized.columns, 2);

  // Schedule must be restored and visible
  const schedule = sanitized.modules.find((m) => m.id === "schedule");
  assert.ok(schedule, "Sanitization must restore missing schedule");
  assert.strictEqual(schedule.visible, true, "Schedule must be visible");
  assert.strictEqual(schedule.span, "full");

  // Unknown module must be stripped
  assert.ok(!sanitized.modules.some((m) => m.id === ("unknown_hacker_module" as any)));

  // Team module must have valid span and boolean collapse
  const team = sanitized.modules.find((m) => m.id === "team");
  assert.ok(team);
  assert.strictEqual(typeof team.collapsed, "boolean");
  assert.ok(team.span === "half" || team.span === "full");
});

test("sanitizeModuleSettings strips non-serializable and invalid setting values", () => {
  const rawSettings = {
    filter: "urgent",
    limit: 10,
    active: true,
    dangerousScript: "<script>alert(1)</script>",
    nestedObject: { malicious: true },
    nullValue: null,
  };

  const clean = sanitizeModuleSettings(rawSettings);
  assert.strictEqual(clean.filter, "urgent");
  assert.strictEqual(clean.limit, 10);
  assert.strictEqual(clean.active, true);
  assert.strictEqual(clean.dangerousScript, "<script>alert(1)</script>"); // primitives preserved safely
  assert.strictEqual(clean.nestedObject, undefined, "nested objects should be stripped");
  assert.strictEqual(clean.nullValue, undefined, "null values should be stripped");
});

test("preference engine migration includes team window and valid presets", () => {
  const defaultPrefs = getDefaultPreferences();
  assert.ok(defaultPrefs.today.widgetOrder.includes("team"), "default today widgetOrder must include team");
  assert.strictEqual(defaultPrefs.today.showTeamWindow, true);
  assert.ok(defaultPrefs.today.widgetSpans?.team);

  // Test migration of legacy preferences where 'team' was omitted
  const legacyStored = {
    today: {
      widgetOrder: ["briefing", "metrics", "roster", "queue", "shortcuts"],
      showMorningBriefing: true,
      showMetrics: true,
      showScheduleSearch: true,
      showActionQueue: true,
      showQuickReferences: true,
    },
  };

  const migrated = mergeStoredPreferences(legacyStored as any);
  assert.ok(
    migrated.today.widgetOrder.includes("team"),
    "mergeStoredPreferences must automatically append missing 'team' widget"
  );
  assert.strictEqual(migrated.today.showTeamWindow, true);

  // Verify built-in presets
  for (const preset of Object.values(BUILT_IN_PRESETS)) {
    assert.ok(preset.config.today?.widgetOrder?.includes("team"));
  }
});
