import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sanitizeWorkspaceState } from "../app/lib/workspace-state";

test("workspace state sanitizes stale ids, invalid sections, duplicates, and unsafe geometry", () => {
  const state = sanitizeWorkspaceState({
    version: 99,
    activeView: "patient",
    dockedPatientIds: ["patient-a", "patient-a", "", 42],
    detachedPatientIds: ["patient-a", "patient-b", "patient-b"],
    activePatientId: "missing-patient",
    activeSection: "NotASection",
    detachedSections: {
      "patient-b": "Labs",
      "missing-patient": "Messages",
    },
    activeCompanionPanel: "tasks",
    sidebarToolIds: ["today", "tasks", "patients", "bogus", "today"],
    windowStates: {
      "patient-b": {
        leftRatio: -10,
        topRatio: 40,
        widthRatio: 99,
        heightRatio: 0,
        snapTarget: "right",
        minimized: true,
      },
      "missing-patient": {
        leftRatio: 0.5,
        topRatio: 0.5,
        widthRatio: 0.5,
        heightRatio: 0.5,
      },
    },
    savedAt: "2026-09-06T12:00:00.000Z",
  });

  assert.ok(state);
  assert.deepEqual(state.dockedPatientIds, ["patient-a"]);
  assert.deepEqual(state.detachedPatientIds, ["patient-b"]);
  assert.equal(state.activePatientId, "patient-a");
  assert.equal(state.activeSection, "Overview");
  assert.equal(state.detachedSections["patient-b"], "Labs");
  assert.equal(state.detachedSections["missing-patient"], undefined);
  assert.deepEqual(state.sidebarToolIds, ["today", "tasks"]);
  assert.equal(state.windowStates["missing-patient"], undefined);
  assert.equal(state.windowStates["patient-b"].leftRatio, 0);
  assert.equal(state.windowStates["patient-b"].topRatio, 1);
  assert.equal(state.windowStates["patient-b"].widthRatio, 1);
  assert.equal(state.windowStates["patient-b"].heightRatio, 0.15);
  assert.equal(state.windowStates["patient-b"].snapTarget, "right");
  assert.equal(state.windowStates["patient-b"].minimized, true);
});

test("workspace state preserves supported global modules and removes patient sidebar tool", () => {
  const state = sanitizeWorkspaceState({
    version: 1,
    activeView: "inbox",
    dockedPatientIds: ["patient-a"],
    detachedPatientIds: [],
    activePatientId: "patient-a",
    activeSection: "Messages",
    detachedSections: {},
    activeCompanionPanel: null,
    sidebarToolIds: ["today", "patients", "inbox", "documents", "billing"],
    windowStates: {},
    savedAt: new Date().toISOString(),
  });

  assert.ok(state);
  assert.equal(state.activeView, "inbox");
  assert.deepEqual(state.sidebarToolIds, ["today", "inbox", "documents", "billing"]);
});

test("provider workspace snapshot persists without replacing display preferences", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-workspace-state-"));
  process.chdir(isolatedRoot);

  try {
    const [{ PreferenceRepository }, { defaultPreferences }] = await Promise.all([
      import("../app/server/repositories/preference-repository"),
      import("../app/lib/preference-engine"),
    ]);

    const providerId = "workspace-state-provider";
    const displayPreferences = {
      ...defaultPreferences,
      activePresetId: "cockpit",
      density: "compact" as const,
      headerDensity: "compact" as const,
      showCompanionRail: false,
    };
    PreferenceRepository.savePreferences(displayPreferences, providerId);

    const workspaceState = sanitizeWorkspaceState({
      version: 1,
      activeView: "patient",
      dockedPatientIds: ["patient-a", "patient-b"],
      detachedPatientIds: ["patient-c"],
      activePatientId: "patient-b",
      activeSection: "Meds",
      detachedSections: { "patient-c": "History" },
      activeCompanionPanel: "ai",
      sidebarToolIds: ["today", "schedule", "inbox"],
      windowStates: {
        "patient-c": {
          leftRatio: 0.5,
          topRatio: 0.1,
          widthRatio: 0.45,
          heightRatio: 0.8,
          snapTarget: "right",
        },
      },
      savedAt: new Date().toISOString(),
    });
    assert.ok(workspaceState);

    const current = PreferenceRepository.getPreferences(providerId) as Record<string, unknown>;
    PreferenceRepository.savePreferences({ ...current, workspaceState } as never, providerId);

    const restored = PreferenceRepository.getPreferences(providerId) as unknown as Record<string, any>;
    assert.equal(restored.density, "compact");
    assert.equal(restored.headerDensity, "compact");
    assert.equal(restored.showCompanionRail, false);
    assert.equal(restored.activePresetId, "cockpit");
    assert.deepEqual(restored.workspaceState.dockedPatientIds, ["patient-a", "patient-b"]);
    assert.deepEqual(restored.workspaceState.detachedPatientIds, ["patient-c"]);
    assert.equal(restored.workspaceState.activePatientId, "patient-b");
    assert.equal(restored.workspaceState.activeSection, "Meds");
    assert.equal(restored.workspaceState.detachedSections["patient-c"], "History");
  } finally {
    process.chdir(originalCwd);
  }
});
