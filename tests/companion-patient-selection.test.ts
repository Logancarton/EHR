import test from "node:test";
import assert from "node:assert/strict";
import { followCompanionPatient } from "../app/lib/companion-patient-selection";
import { companionToolIdsFor, PATIENT_RECORD_TOOLS } from "../app/lib/workspace-tools";
import { derivePatientToolScope } from "../app/lib/companion-tool-scope";
import { deriveWorkspaceCanvasContext } from "../app/lib/workspace-canvas-context";

test("open tool follows successive charts, retains its target on practice canvases, and rebinds on chart return", () => {
  let selection = { patientId: "", foregroundId: null as string | null };
  selection = followCompanionPatient(selection, "maya");
  assert.equal(selection.patientId, "maya");
  selection = followCompanionPatient(selection, "jordan");
  assert.equal(selection.patientId, "jordan");
  selection = followCompanionPatient(selection, null);
  assert.equal(selection.patientId, "jordan");
  selection = { patientId: "manually-selected", foregroundId: null };
  selection = followCompanionPatient(selection, "jordan");
  assert.equal(selection.patientId, "jordan");
  assert.deepEqual(followCompanionPatient({ patientId: "", foregroundId: null }, null), { patientId: "", foregroundId: null });
});

test("old and empty pin layouts retain all clinical record entry points exactly once", () => {
  const ids = companionToolIdsFor({ left: [], right: ["labs", "ai", "messages"] });
  for (const id of PATIENT_RECORD_TOOLS) assert.equal(ids.filter((entry) => entry === id).length, 1);
  assert.equal(ids.includes("ai"), true);
  assert.deepEqual(companionToolIdsFor({ left: [], right: [] }), [...PATIENT_RECORD_TOOLS]);
});

test("explicit retained lab targets are usable on Dashboard, while unbound and wrong-chart targets remain gated", () => {
  const dashboard = deriveWorkspaceCanvasContext({ activeView: "today", activeModule: null });
  const boundPatient = { patientId: "maya", patientName: "Maya" };
  assert.equal(derivePatientToolScope({ workspaceContext: dashboard, boundPatient }).canMutate, false);
  assert.equal(derivePatientToolScope({ workspaceContext: dashboard, boundPatient, allowRetainedPatient: true }).canMutate, true);
  assert.equal(derivePatientToolScope({ workspaceContext: dashboard, boundPatient: null, allowRetainedPatient: true }).canMutate, false);
  const other = deriveWorkspaceCanvasContext({ activeView: "patient", activeModule: null, activePatientId: "jordan" });
  assert.equal(derivePatientToolScope({ workspaceContext: other, boundPatient, allowRetainedPatient: true }).canMutate, false);
});
