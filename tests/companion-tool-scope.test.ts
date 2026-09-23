import test from "node:test";
import assert from "node:assert/strict";
import { derivePatientToolScope } from "../app/lib/companion-tool-scope";
import type { WorkspaceCanvasContext } from "../app/lib/workspace-canvas-context";

const maya = { patientId: "maya-chen", patientName: "Maya Chen" };

function context(overrides: Partial<WorkspaceCanvasContext>): WorkspaceCanvasContext {
  return {
    tabId: "patient:maya-chen",
    kind: "patient",
    label: "Maya Chen · Overview",
    patientId: "maya-chen",
    section: "Overview",
    customizerTab: "overview",
    ...overrides,
  };
}

test("patient tools mutate only when their bound chart owns the foreground canvas", () => {
  const active = derivePatientToolScope({
    workspaceContext: context({}),
    boundPatient: maya,
  });
  assert.equal(active.status, "active");
  assert.equal(active.canMutate, true);

  const intake = derivePatientToolScope({
    workspaceContext: context({
      tabId: "module:intake",
      kind: "workspace",
      label: "Intake workspace",
      patientId: undefined,
      section: undefined,
      customizerTab: "density",
    }),
    boundPatient: maya,
  });
  assert.equal(intake.status, "inactive");
  assert.equal(intake.canMutate, false);
  assert.match(intake.explanation, /Pinned to Maya Chen/);

  const otherChart = derivePatientToolScope({
    workspaceContext: context({
      tabId: "patient:elena-rostova",
      label: "Elena Rostova · Overview",
      patientId: "elena-rostova",
    }),
    boundPatient: maya,
  });
  assert.equal(otherChart.status, "inactive");
  assert.equal(otherChart.canMutate, false);
});

test("an unbound patient tool cannot mutate from a practice canvas", () => {
  const scope = derivePatientToolScope({
    workspaceContext: context({
      tabId: "workspace:calendar",
      kind: "workspace",
      label: "Calendar workspace",
      patientId: undefined,
      section: undefined,
      customizerTab: "density",
    }),
    boundPatient: null,
  });

  assert.equal(scope.status, "unbound");
  assert.equal(scope.canMutate, false);
  assert.equal(scope.badge, "No Active Chart");
});
