import test from "node:test";
import assert from "node:assert/strict";
import { planWithModel, type OmniboxPlanningModel } from "../app/server/ai/omnibox-model-gateway";
import { isLabOrderStaged, type LabOrder } from "../app/domain/orders";
import { calculateEncounterCoding, createInitialEncounter } from "../app/lib/encounter-engine";
import { initialTasks } from "../app/domain/tasks";

const labModel: OmniboxPlanningModel = {
  provider: "test", model: "misclassified-operation",
  async plan() { return { confidence: 0.99, intent: { kind: "propose_clinical_actions", actions: [{ type: "stage_lab_order", name: "Lithium level" }] } }; },
};

test("the model boundary refuses a lab substitution for a medication operation", async () => {
  for (const query of ["Start lithium for David Kim", "Refill valproate for Maya Chen", "Increase sertraline to 100 mg"]) {
    const output = await planWithModel(labModel, { query });
    assert.equal(output.intent.kind, "clarification_required");
    assert.equal(output.confidence, 0);
  }
  const explicit = await planWithModel(labModel, { query: "Start lithium and order a lithium level for David Kim" });
  assert.equal(explicit.intent.kind, "propose_clinical_actions");
});

test("staged monitoring detection resolves the catalog name and keeps patient and status boundaries", () => {
  const order = { patientId: "maya-chen", type: "lab", testName: "Comprehensive Metabolic Panel (CMP)", status: "staged" } as LabOrder;
  assert.equal(isLabOrderStaged("maya-chen", "CMP", [order]), true);
  assert.equal(isLabOrderStaged("jordan-reed", "CMP", [order]), false);
  assert.equal(isLabOrderStaged("maya-chen", "CMP", [{ ...order, status: "cancelled" }]), false);
  assert.equal(isLabOrderStaged("maya-chen", "", [order]), false);
  assert.equal(isLabOrderStaged("maya-chen", "CBC", [order]), false);
});

test("named synthetic follow-up tasks carry the patient they explicitly name", () => {
  assert.equal(initialTasks.find((task) => task.id === "task-1")?.patientId, "david-kim");
  assert.equal(initialTasks.find((task) => task.id === "task-3")?.patientId, "maya-chen");
});


test("an empty encounter cannot present the default code as a documentation-supported estimate", () => {
  const empty = createInitialEncounter("maya-chen");
  assert.equal(calculateEncounterCoding(empty, 0).hasDocumentedContext, false);
  assert.equal(calculateEncounterCoding({ ...empty, intervalHistory: "Patient reports improved sleep since the previous visit." }, 0).hasDocumentedContext, true);
});


test("chart recap uses recorded values with provenance and never fills missing sections", async () => {
  const { boundedChartSummary } = await import("../app/server/ai/bounded-chart-summary");
  const context = { patient: { name: "Synthetic Patient" }, activeDiagnoses: ["Recorded problem"], activeMedications: ["Recorded medication", "Unsupported item"], allergies: [], provenanceMap: { "problem-1": "problems/1", "medication-1": "medications/1" } } as unknown as import("../app/server/context/context-assembler").AssembledClinicalContext;
  const result = boundedChartSummary(context);
  assert.match(result.answer, /Recorded medication/);
  assert.doesNotMatch(result.answer, /Unsupported item/);
  assert.match(result.answer, /No supported entries available/);
  assert.deepEqual(result.evidence.map((item) => item.sourceRef), ["problems/1", "medications/1"]);
});
