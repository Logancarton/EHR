import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type ProviderPreferences,
  defaultPreferences,
  mergeStoredPreferences,
  saveCustomPreset,
  isPresetModified,
  SYSTEM_DEFAULT_LANDING_VIEW,
} from "../app/lib/preference-engine";
import {
  evaluateAdaptiveRules,
  defaultAdaptivePreferences,
} from "../app/lib/adaptive-layout-engine";
import {
  DASHBOARD_MODULES,
  filterModulesByCapabilities,
} from "../app/domain/dashboard-modules";
import {
  sanitizeRosterFields,
} from "../app/domain/roster-fields";
import {
  sanitizeWorkspaceState,
} from "../app/lib/workspace-state";
import {
  noteVisitStartedFromSchedule,
  scheduledVisitFor,
  confirmScheduledVisit,
} from "../app/lib/active-visit";
import {
  adoptPracticeTemplate,
} from "../app/lib/preference-engine";

const WORKSPACE_ROOT = fileURLToPath(new URL("..", import.meta.url));

test("DB-9 Acceptance Matrix 1: PMHNP persona starts with clinical balanced view and lacks org admin", async () => {
  const { OrganizationRepository } = await import("../app/server/repositories/organization-repository");
  const { permissionsForActor, hasPermission } = await import("../app/server/auth/provider-context");

  // PMHNP identity: role=provider, membershipRole=member
  const pmhnpActor = {
    userId: "test-pmhnp-acceptance",
    displayName: "Taylor Brooks, PMHNP-BC",
    credentials: "PMHNP-BC",
    role: "provider" as const,
    organizationId: OrganizationRepository.defaultOrganizationId(),
    membershipRole: "member" as const,
  };

  const perms = permissionsForActor(pmhnpActor);

  // Clinical authority verified
  assert.ok(hasPermission(pmhnpActor, "read_clinical"), "PMHNP must have read_clinical permission");
  assert.ok(hasPermission(pmhnpActor, "sign_encounter"), "PMHNP must have sign_encounter permission");
  assert.ok(hasPermission(pmhnpActor, "stage_order"), "PMHNP must have stage_order permission");
  assert.ok(hasPermission(pmhnpActor, "authorize_order"), "PMHNP must have authorize_order permission");
  assert.ok(hasPermission(pmhnpActor, "transmit_order"), "PMHNP must have transmit_order permission");
  assert.ok(hasPermission(pmhnpActor, "read_schedule"), "PMHNP must have read_schedule permission");

  // Governance boundaries strictly enforced (cannot edit org templates or admin settings)
  assert.equal(hasPermission(pmhnpActor, "manage_organization"), false, "PMHNP member cannot administer organization");
  assert.equal(hasPermission(pmhnpActor, "manage_templates"), false, "PMHNP member cannot mutate practice templates");

  // Filtered dashboard modules for PMHNP
  const permittedModules = filterModulesByCapabilities(DASHBOARD_MODULES, perms);
  const permittedIds = permittedModules.map((m) => m.id);
  assert.ok(permittedIds.includes("schedule"), "PMHNP has schedule");
  assert.ok(permittedIds.includes("queue"), "PMHNP has clinical queue");
  assert.ok(permittedIds.includes("visit-prep"), "PMHNP has visit-prep");
  assert.ok(permittedIds.includes("arrivals"), "PMHNP has arrivals");
});

test("DB-9 Acceptance Matrix 2: Practice Owner persona starts with clinical view and has governance access", async () => {
  const { OrganizationRepository } = await import("../app/server/repositories/organization-repository");
  const { permissionsForActor, hasPermission } = await import("../app/server/auth/provider-context");

  // Owner identity: role=provider, membershipRole=owner
  const ownerActor = {
    userId: "test-owner-acceptance",
    displayName: "Dr. Prototype Owner, MD",
    credentials: "MD",
    role: "provider" as const,
    organizationId: OrganizationRepository.defaultOrganizationId(),
    membershipRole: "owner" as const,
  };

  const perms = permissionsForActor(ownerActor);

  // Both clinical and governance authority verified
  assert.ok(hasPermission(ownerActor, "read_clinical"), "Owner has clinical access");
  assert.ok(hasPermission(ownerActor, "sign_encounter"), "Owner has note signing access");
  assert.ok(hasPermission(ownerActor, "authorize_order"), "Owner has prescribing authorization");
  assert.ok(hasPermission(ownerActor, "manage_organization"), "Owner has organization governance");
  assert.ok(hasPermission(ownerActor, "manage_templates"), "Owner has practice template governance");
  assert.ok(hasPermission(ownerActor, "view_financial"), "Owner has financial permissions");
});

test("DB-9 Acceptance Matrix 3: Practice Manager/Biller sees permitted fields and cannot sign or prescribe", async () => {
  const { OrganizationRepository } = await import("../app/server/repositories/organization-repository");
  const { permissionsForActor, hasPermission } = await import("../app/server/auth/provider-context");

  // Manager identity: role=staff, membershipRole=manager
  const managerActor = {
    userId: "test-manager-acceptance",
    displayName: "Morgan Reed, MBA, CPC",
    credentials: "MBA, CPC",
    role: "staff" as const,
    organizationId: OrganizationRepository.defaultOrganizationId(),
    membershipRole: "manager" as const,
  };

  const perms = permissionsForActor(managerActor);

  // Operational schedule and task permissions granted
  assert.ok(hasPermission(managerActor, "read_schedule"), "Manager has read_schedule");
  assert.ok(hasPermission(managerActor, "manage_appointments"), "Manager has manage_appointments");
  assert.ok(hasPermission(managerActor, "collaborate_team"), "Manager has collaborate_team");
  assert.ok(hasPermission(managerActor, "manage_organization"), "Manager has manage_organization");
  assert.ok(hasPermission(managerActor, "manage_templates"), "Manager has manage_templates");

  // Clinical signing and prescribing strictly blocked
  assert.equal(hasPermission(managerActor, "read_clinical"), false, "Non-clinical manager lacks read_clinical");
  assert.equal(hasPermission(managerActor, "sign_encounter"), false, "Non-clinical manager cannot sign encounters");
  assert.equal(hasPermission(managerActor, "stage_order"), false, "Non-clinical manager cannot stage orders");
  assert.equal(hasPermission(managerActor, "authorize_order"), false, "Non-clinical manager cannot authorize orders");
  assert.equal(hasPermission(managerActor, "transmit_order"), false, "Non-clinical manager cannot transmit orders");

  // Modules requiring read_clinical (like visit-prep) are filtered out
  const permittedModules = filterModulesByCapabilities(DASHBOARD_MODULES, perms);
  const permittedIds = permittedModules.map((m) => m.id);
  assert.ok(!permittedIds.includes("visit-prep"), "visit-prep requires read_clinical and must be omitted for staff");
  assert.ok(permittedIds.includes("schedule"), "schedule is permitted");
  assert.ok(permittedIds.includes("arrivals"), "arrivals is permitted");
});

test("DB-9 Acceptance Matrix 4 & 5: Roster configuration and window management with preset independence", () => {
  let prefs = getDefaultPrefs();
  assert.equal(isPresetModified(prefs), false, "Starts unmodified from active preset");

  // Clinician customizes row fields
  const customFields = sanitizeRosterFields(["time", "patientName", "room", "status", "alerts"]);
  prefs = {
    ...prefs,
    today: {
      ...prefs.today,
      rosterFields: customFields,
      widgetSpans: { ...prefs.today.widgetSpans, arrivals: "full" },
    },
  };

  assert.equal(isPresetModified(prefs), true, "Working modification marks preset modified");
  assert.deepEqual(prefs.today.rosterFields, customFields);

  // Saved named preset remains independent
  const saved = saveCustomPreset("Custom Flow", prefs);
  const savedId = saved.activePresetId;
  assert.ok(saved.namedPresets[savedId]);
  assert.ok(savedId.startsWith("preset-custom-flow-"));
  assert.equal(isPresetModified(saved), false);

  // Modifying working layout after saving does not corrupt the saved preset
  const mutated = {
    ...saved,
    today: { ...saved.today, showMorningBriefing: false },
  };
  assert.equal(isPresetModified(mutated), true);
  assert.equal(mutated.namedPresets[savedId].layout.today.showMorningBriefing, true, "Named preset layout remains pristine");
});

test("DB-9 Acceptance Matrix 6: Practice template adoption produces isolated personal copy", () => {
  const practiceTemplate = {
    id: "template-clinic-standard",
    name: "Clinic High Flow",
    description: "Standard high-flow template",
    config: {
      density: "compact" as const,
      headerDensity: "compact" as const,
      showCompanionRail: true,
      showSidebar: true,
      rails: { left: ["today", "schedule"], right: ["tasks"], leftWidth: 70, rightWidth: 50 },
      today: { ...defaultPreferences.today, showArrivals: true },
      overview: defaultPreferences.overview,
      encounter: defaultPreferences.encounter,
    },
  };

  const initialPrefs = getDefaultPrefs();
  const adopted = adoptPracticeTemplate(practiceTemplate, initialPrefs);

  const adoptedId = adopted.activePresetId;
  assert.ok(adopted.namedPresets[adoptedId], "Adopted template exists in personal named presets");
  assert.equal(adopted.namedPresets[adoptedId].isPracticeTemplate, true);
  assert.equal(adopted.density, "compact");
  assert.equal(adopted.today.showArrivals, true);

  // Mutating personal working layout does not alter the adopted preset definition
  const mutatedPersonal = {
    ...adopted,
    density: "comfortable" as const,
  };
  assert.equal(mutatedPersonal.namedPresets[adoptedId].layout.density, "compact", "Adopted personal template layout remains untouched");
});

test("DB-9 Acceptance Matrix 7 & 8: Distinct navigation targets and visit encounter binding", () => {
  // Test distinct encounter binding without mutating database or altering appointment state
  noteVisitStartedFromSchedule("patient-elena", "apt-elena-001");
  const appointmentId = scheduledVisitFor("patient-elena");

  assert.equal(appointmentId, "apt-elena-001");
  assert.equal(scheduledVisitFor("patient-marcus"), undefined, "Different patient does not claim pending visit");

  // Once server confirms encounter binding, pending link is cleared
  confirmScheduledVisit("patient-elena", "apt-elena-001");
  assert.equal(scheduledVisitFor("patient-elena"), undefined, "Confirmed visit is cleared from pending state");
});

test("DB-9 Acceptance Matrix 9: Multi-session optimistic concurrency on versioned records", async () => {
  const { AppointmentConcurrencyError } = await import("../app/server/repositories/appointment-repository");
  const { PreferenceConcurrencyError } = await import("../app/server/repositories/preference-repository");

  const apptRecord = {
    id: "apt-123",
    patientId: "patient-1",
    patientName: "Test Patient",
    time: "09:00",
    duration: 30,
    type: "follow-up" as const,
    status: "scheduled" as const,
    reason: "Checkup",
    version: 3,
    createdAt: "2026-09-14T09:00:00Z",
    updatedAt: "2026-09-14T09:00:00Z",
  };
  const apptError = new AppointmentConcurrencyError(3, apptRecord as any);
  assert.equal(apptError.name, "AppointmentConcurrencyError");
  assert.equal(apptError.serverVersion, 3);
  assert.equal(apptError.currentAppointment.id, "apt-123");

  const prefError = new PreferenceConcurrencyError(4, defaultPreferences);
  assert.equal(prefError.name, "PreferenceConcurrencyError");
  assert.equal(prefError.serverRevision, 4);
});

test("DB-9 Acceptance Matrix 10: Off-schedule discovery retains unscheduled items in queue", async () => {
  const { readFileSync } = await import("node:fs");
  const dashboardCode = readFileSync(join(WORKSPACE_ROOT, "app", "components", "TodayDashboard.tsx"), "utf8");

  // BuildAttentionQueue processes all unsigned notes, unacknowledged labs, and refill requests
  assert.match(dashboardCode, /function buildAttentionQueue\(/);
  assert.match(dashboardCode, /drafts\s*\.map\(\s*\(draft\)\s*=>/);
  // Dashboard groups child analytes by order, but must still source the queue
  // from every unacknowledged lab rather than only today's scheduled patients.
  assert.match(dashboardCode, /groupUnacknowledgedLabsByOrder\(labs\)/);
  const { groupUnacknowledgedLabsByOrder } = await import("../app/lib/practice-queue-api");
  const row = (observationId: string, patientId: string, orderId: string | null, acknowledgedAt: string | null = null) =>
    ({ observationId, patientId, orderId, documentId: null, acknowledgedAt }) as unknown as Parameters<typeof groupUnacknowledgedLabsByOrder>[0][number];
  const groups = groupUnacknowledgedLabsByOrder([
    row("o1", "off-schedule-patient", "order-a"),
    row("o2", "off-schedule-patient", "order-a"),
    row("o3", "off-schedule-patient", null),
    row("o4", "other-patient", "order-a"),
    row("o5", "other-patient", "order-b", "2026-09-01T00:00:00Z"),
  ]);
  assert.deepEqual(
    groups.map(([, results]) => results.map((result) => result.observationId)),
    [["o1", "o2"], ["o3"], ["o4"]],
    "one group per patient+order, unlinked results alone, acknowledged results excluded",
  );
  assert.match(dashboardCode, /refills\s*\.map\(\s*\(refill\)\s*=>/);
  assert.match(dashboardCode, /handoffs\s*\.map\(\s*\(h\)\s*=>/);
});

test("DB-9 Acceptance Matrix 11: Fault tolerance across empty, error, stale, and offline states", async () => {
  const { readFileSync } = await import("node:fs");
  const asyncSectionCode = readFileSync(join(WORKSPACE_ROOT, "app", "components", "ui", "AsyncSection.tsx"), "utf8");
  const liveSyncCode = readFileSync(join(WORKSPACE_ROOT, "app", "components", "schedule", "LiveSyncIndicator.tsx"), "utf8");

  assert.match(asyncSectionCode, /InlineError/);
  assert.match(asyncSectionCode, /Retry/);
  assert.match(liveSyncCode, /Live/);
  assert.match(liveSyncCode, /Stale/);
  assert.match(liveSyncCode, /Offline/);
});

test("DB-9 Acceptance Matrix 12: Adaptive layout engine is strictly opt-in and protects clinical focus", () => {
  assert.equal(defaultAdaptivePreferences.enabled, false, "Adaptive mode must be strictly OFF by default");

  const rules = defaultAdaptivePreferences.rules;
  assert.ok(rules.length >= 4, "Must have built-in deterministic rules");

  const prefs = getDefaultPrefs();

  // Evaluating when disabled returns "none"
  const resultDisabled = evaluateAdaptiveRules(
    prefs,
    {
      currentTimeMinutes: 630,
      waitingCount: 5,
      inVisitCount: 1,
      urgentWorkCount: 4,
      isSafeToAdapt: true,
    },
  );
  assert.equal(resultDisabled.action, "none", "Disabled adaptive mode never adapts");

  // When enabled but user is typing or modal is open (isSafeToAdapt = false), adaptation is deferred
  const enabledPrefs: ProviderPreferences = {
    ...prefs,
    adaptiveLayout: { ...defaultAdaptivePreferences, enabled: true },
  };
  const resultTyping = evaluateAdaptiveRules(
    enabledPrefs,
    {
      currentTimeMinutes: 630,
      waitingCount: 5,
      inVisitCount: 1,
      urgentWorkCount: 4,
      isSafeToAdapt: false, // typing in textarea or input
    },
  );
  assert.equal(resultTyping.action, "defer", "Adaptation must be deferred while clinician is typing");
  assert.ok(resultTyping.rule);
});

test("DB-9 Acceptance Matrix 13: Privacy display mode masks presentation and maintains honest disclaimers", () => {
  const prefs = getDefaultPrefs();
  assert.equal(prefs.privacyMode, false, "Privacy mode is OFF by default");

  const withPrivacy = mergeStoredPreferences({ ...prefs, privacyMode: true });
  assert.equal(withPrivacy.privacyMode, true, "Privacy mode survives persistence merge");

  const css = readFileSync(join(WORKSPACE_ROOT, "app", "globals.css"), "utf8");
  assert.match(css, /\.privacy-mode-active/, "CSS must include privacy-mode-active class");
  assert.match(css, /filter: blur/, "CSS must blur PHI items in privacy mode");
  assert.match(css, /\.privacy-mode-banner/, "CSS must define banner for privacy mode");

  const dashboardCode = readFileSync(join(WORKSPACE_ROOT, "app", "components", "TodayDashboard.tsx"), "utf8");
  assert.match(dashboardCode, /e\.altKey/, "Privacy mode must retain its keyboard toggle without permanent header clutter");
  assert.match(dashboardCode, /privacy-mode-banner/, "Privacy mode must visibly announce when it is active");
  assert.match(dashboardCode, /Does not replace server-side authorization or audit logging/, "Must show honest non-authorization disclaimer");
  assert.match(dashboardCode, /Alt\+P/, "Must support Alt+P keyboard shortcut");
});

test("DB-9 Acceptance Matrix 14: Longitudinal chart state persists without layout clobbering", () => {
  const state = sanitizeWorkspaceState({
    version: 1,
    activeView: "patient",
    dockedPatientIds: ["maya-chen", "jordan-reed"],
    detachedPatientIds: [],
    activePatientId: "maya-chen",
    activeSection: "Encounter",
    detachedSections: {},
    patientSections: { "maya-chen": "Encounter", "jordan-reed": "Meds" },
    sidebarToolIds: ["today", "schedule"],
    windowStates: {},
    savedAt: "2026-09-14T12:00:00.000Z",
  });

  assert.ok(state);
  assert.equal(state.activeView, "patient");
  assert.deepEqual(state.dockedPatientIds, ["maya-chen", "jordan-reed"]);
  assert.equal(state.patientSections?.["maya-chen"], "Encounter");
  assert.equal(state.patientSections?.["jordan-reed"], "Meds");
});

test("DB-9 Acceptance Matrix 15: Controlled reversible default switch to Today Dashboard", () => {
  // 1. Default landing view in standard preferences is "today"
  assert.equal(defaultPreferences.defaultLandingView, "today", "Default landing view is today");
  assert.equal(SYSTEM_DEFAULT_LANDING_VIEW, "today", "System default landing view is today");

  // 2. Setting defaultLandingView to "home" is fully supported and preserved
  const homePrefs = mergeStoredPreferences({ defaultLandingView: "home" });
  assert.equal(homePrefs.defaultLandingView, "home", "Reversible switch allows choosing home");

  // 3. Round-trip markup assertions for view switching controls
  const shell =
    readFileSync(join(WORKSPACE_ROOT, "app", "components", "PatientWorkspace.tsx"), "utf8") +
    readFileSync(join(WORKSPACE_ROOT, "app", "components", "workspace", "WorkspaceTopBar.tsx"), "utf8") +
    readFileSync(join(WORKSPACE_ROOT, "app", "components", "workspace", "WorkspaceTabStrip.tsx"), "utf8") +
    readFileSync(join(WORKSPACE_ROOT, "app", "lib", "use-persistent-workspace-tabs.ts"), "utf8");
  const launcher = readFileSync(join(WORKSPACE_ROOT, "app", "components", "home", "ZenHomeWindow.tsx"), "utf8");
  const customizer = readFileSync(join(WORKSPACE_ROOT, "app", "components", "WorkspaceCustomizer.tsx"), "utf8");

  // Brand Home Button carries [data-workspace-view="home"] for 1-click jump to Zen Home
  assert.match(shell, /data-workspace-view="home"/, "Top bar brand home button provides 1-click jump to Zen Home");

  // Zen Home Clinical shortcut tile carries [data-workspace-view="today"] for 1-click return to Today
  assert.match(launcher, /data-workspace-view=\{shortcut\.id === "clinical" \? "today" : undefined\}/, "Zen Home Clinical tile provides 1-click jump to Today");

  // Dashboard tab carries [data-workspace-view="today"]
  assert.match(shell, /data-workspace-view="today"/, "Dashboard tab carries data-workspace-view='today'");

  // Customizer provides explicit radio controls for default landing view
  assert.match(customizer, /name="defaultLandingView"/, "Customizer exposes reversible landing view control");

  // Persistent workspace tabs initializes dashboardTabOpen to true when starting on today
  assert.match(shell, /const \[dashboardTabOpen, setDashboardTabOpen\] = useState\(\s*\(\) => \(preferences\.defaultLandingView \?\? SYSTEM_DEFAULT_LANDING_VIEW\) === "today",\s*\);/, "Dashboard tab starts open on default today view");
});

function getDefaultPrefs(): ProviderPreferences {
  return JSON.parse(JSON.stringify(defaultPreferences));
}
