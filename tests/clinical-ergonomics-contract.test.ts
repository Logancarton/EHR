import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { derivePatientToolScope } from "../app/lib/companion-tool-scope";
import { toolScopeFor } from "../app/lib/workspace-tools";

const read = (path: string) => readFileSync(path, "utf8");

test("patient-specific companion tools are explicitly scoped in the shared registry", () => {
  assert.equal(toolScopeFor("labs"), "patient");
  assert.equal(toolScopeFor("calc"), "patient");
  assert.equal(toolScopeFor("ai"), "patient");
  assert.equal(toolScopeFor("calendar"), "global");
});

test("patient tool mutations park when a practice workspace is foregrounded", () => {
  const scope = derivePatientToolScope({
    workspaceContext: {
      tabId: "module:intake",
      kind: "workspace",
      label: "Intake workspace",
      customizerTab: "density",
    },
    boundPatient: { patientId: "maya-chen", patientName: "Maya Chen" },
  });

  assert.equal(scope.status, "inactive");
  assert.equal(scope.canMutate, false);
  assert.match(scope.badge, /Inactive Chart Pinned/);
});

test("assessment insertion requires the matching patient encounter before dispatch", () => {
  const source = read("app/components/workspace/CompanionPanelHost.tsx");
  assert.match(source, /workspaceContext\.patientId !== activePatient\.id/);
  assert.match(source, /workspaceContext\.section !== "Encounter"/);
  assert.match(source, /Review the target note, then press Insert again/);
  assert.match(source, /WORKSPACE_INSERT_TO_NOTE_EVENT/);
});

test("patient tabs saturate into an overflow menu instead of crowding the strip", () => {
  const source = read("app/components/workspace/WorkspaceTabStrip.tsx");
  assert.match(source, /MAX_VISIBLE_PATIENT_TABS = 4/);
  assert.match(source, /patient-tab-overflow-trigger/);
  assert.match(source, /Open patient tabs/);
});

test("global keyboard shortcuts preserve the browser mental model", () => {
  const source = read("app/components/WorkspaceKeyboardShortcuts.tsx");
  assert.match(source, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(source, /key === "k"/);
  assert.match(source, /event\.altKey/);
  assert.match(source, /key === "w"/);
  assert.match(source, /\^\[1-9\]\$/);
});

test("omnibox refill shortcut routes only to the staged order composer", () => {
  const source = read("app/components/omnibox/OmniboxAmbientPreview.tsx");
  assert.match(source, /data-order-route="staged-cart-only"/);
  assert.match(source, /onOpenStagedOrderComposer\(patient\.id, "prescribe"\)/);
  assert.match(source, /no vendor transmission occurs from this shortcut/);
});
