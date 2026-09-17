import assert from "node:assert/strict";
import test from "node:test";
import { GLOBAL_WORKSPACE_MODULES } from "../app/lib/workspace-navigation";
import { sanitizeWorkspaceState } from "../app/lib/workspace-state";

test("intake is a durable global workspace destination", () => {
  assert.equal(GLOBAL_WORKSPACE_MODULES.has("intake"), true);

  const state = sanitizeWorkspaceState({
    version: 1,
    activeView: "intake",
    dockedPatientIds: [],
    detachedPatientIds: [],
    activePatientId: null,
    activeSection: "Overview",
    detachedSections: {},
    patientSections: {},
    patientScrollPositions: {},
    activeCompanionPanel: null,
    sidebarToolIds: [],
    windowStates: {},
    savedAt: "2026-09-17T00:00:00.000Z",
  });

  assert.equal(state?.activeView, "intake");
});
