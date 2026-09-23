import test from "node:test";
import assert from "node:assert/strict";
import { deriveWorkspaceCanvasContext } from "../app/lib/workspace-canvas-context";

test("foreground practice modules do not inherit the remembered background patient", () => {
  const context = deriveWorkspaceCanvasContext({
    activeView: "patient",
    activeModule: "intake",
    activePatientId: "maya-chen",
    activePatientName: "Maya Chen",
    patientSection: "Documents",
  });

  assert.deepEqual(context, {
    tabId: "module:intake",
    kind: "workspace",
    label: "Intake workspace",
    customizerTab: "density",
  });
});

test("a patient chart binds companion and customizer context to its active chart tab", () => {
  const context = deriveWorkspaceCanvasContext({
    activeView: "patient",
    activeModule: null,
    activePatientId: "maya-chen",
    activePatientName: "Maya Chen",
    patientSection: "Documents",
  });

  assert.equal(context.tabId, "patient:maya-chen");
  assert.equal(context.kind, "patient");
  assert.equal(context.patientId, "maya-chen");
  assert.equal(context.label, "Maya Chen · Documents");
  assert.equal(context.customizerTab, "overview");
});

test("encounter and dashboard canvases open the matching customizer scope", () => {
  assert.equal(
    deriveWorkspaceCanvasContext({
      activeView: "patient",
      activeModule: null,
      activePatientId: "maya-chen",
      activePatientName: "Maya Chen",
      patientSection: "Encounter",
    }).customizerTab,
    "encounter",
  );

  assert.equal(
    deriveWorkspaceCanvasContext({
      activeView: "today",
      activeModule: null,
    }).customizerTab,
    "today",
  );
});

test("workspace canvases never expose a patient id to peripheral tools", () => {
  for (const activeView of ["home", "today", "calendar"] as const) {
    const context = deriveWorkspaceCanvasContext({
      activeView,
      activeModule: null,
      activePatientId: "maya-chen",
      activePatientName: "Maya Chen",
    });
    assert.equal(context.kind, "workspace");
    assert.equal(context.patientId, undefined);
  }
});
