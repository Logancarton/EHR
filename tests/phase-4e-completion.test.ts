import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { MedicationRecord, MedicationStatus } from "../app/domain/clinical-records";
import type { MedicationPrescriptionIntent } from "../app/domain/medication-prescription-intent";

test("prescription review treats discontinued and completed medication matches as historical context, not no-change", async () => {
  const { reviewMedicationPrescriptionIntent } = await import("../app/domain/medication-prescription-intent");
  const patientId = "historical-rx-patient";

  const record = (status: MedicationStatus): MedicationRecord => ({
    id: `historical-sertraline-${status}`,
    patient_id: patientId,
    display_text: "Sertraline 100 mg once daily",
    medication_name: "Sertraline",
    generic_name: "sertraline",
    strength: "100 mg",
    dose: "100 mg",
    route: "Oral",
    frequency: "Once daily",
    status,
    start_date: "2026-01-01",
    end_date: status === "active" ? null : "2026-05-01",
    prescriber: "Synthetic Prescriber",
    source_type: "clinician",
    source_system: "ehr-local",
    source_ref: null,
    recorded_by: "synthetic-provider",
    recorded_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
  });

  const intent: MedicationPrescriptionIntent = {
    patientId,
    medicationName: "Sertraline",
    genericName: "sertraline",
    strength: "100 mg",
    dose: "100 mg",
    route: "Oral",
    frequency: "Once daily",
    quantity: 30,
    refills: 2,
    sig: "Take 1 tablet by mouth once daily.",
    source: "clinician",
    lifecycle: "draft",
  };

  for (const status of ["discontinued", "completed"] as const) {
    const historical = record(status);
    const review = reviewMedicationPrescriptionIntent({ intent, medications: [historical] });
    assert.equal(review.truthImpact.kind, "unclear");
    assert.equal(review.truthImpact.medicationId, null, "historical match must not auto-select a mutation target");
    assert.equal(review.truthImpact.medicationDisplay, null);
    assert.match(review.truthImpact.summary, new RegExp(`historical ${status}`, "i"));
    assert.match(review.truthImpact.summary, /restart|new course|replacement/i);
    assert.deepEqual(review.truthImpact.alternatives, [{ medicationId: historical.id, displayText: historical.display_text }]);
  }

  const active = record("active");
  const activeReview = reviewMedicationPrescriptionIntent({ intent, medications: [active] });
  assert.equal(activeReview.truthImpact.kind, "no-change", "an actual active exact match should remain a continuation/no-change advisory");
  assert.equal(activeReview.truthImpact.medicationId, active.id);

  const explicitlyHistoricalIntent: MedicationPrescriptionIntent = {
    ...intent,
    associatedMedicationRecordId: "historical-sertraline-discontinued",
  };
  const explicitHistorical = record("discontinued");
  const competingActive = { ...record("active"), id: "active-sertraline-competing" };
  const explicitReview = reviewMedicationPrescriptionIntent({
    intent: explicitlyHistoricalIntent,
    medications: [competingActive, explicitHistorical],
  });
  assert.equal(explicitReview.truthImpact.kind, "unclear");
  assert.equal(explicitReview.truthImpact.medicationId, null, "an explicit historical association must not be silently redirected to an active record");
});

test("omnibox builds a structured AI prescription proposal without guessing missing clinical fields or mutating state", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-phase-4e-omnibox-"));
  process.chdir(isolatedRoot);

  try {
    const [{ getDatabase }, { OmniboxPlannerService }] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/ai/omnibox-planner"),
    ]);
    const db = getDatabase();
    const beforeOrders = Number((db.prepare("SELECT COUNT(*) AS count FROM orders").get() as { count: number }).count);
    const actor = {
      userId: "phase-4e-ai-provider",
      displayName: "Synthetic Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };

    const plan = await new OmniboxPlannerService().plan({
      query: "Draft sertraline 100 mg once daily, #30, 2 refills",
      activePatientId: "maya-chen",
    }, actor);

    assert.equal(plan.intent.kind, "propose_clinical_actions");
    assert.equal(plan.proposals.length, 1);
    const proposal = plan.proposals[0];
    assert.equal(proposal.type, "stage_order");
    if (proposal.type !== "stage_order" || proposal.parameters.orderType !== "medication") {
      assert.fail("expected a medication stage-order proposal");
    }

    const prescription = proposal.parameters.prescriptionIntent;
    assert.equal(prescription.patientId, "maya-chen");
    assert.equal(prescription.medicationName.toLowerCase(), "sertraline");
    assert.equal(prescription.strength, "100 mg");
    assert.equal(prescription.dose, "100 mg");
    assert.equal(prescription.frequency, "Once daily");
    assert.equal(prescription.quantity, 30);
    assert.equal(prescription.refills, 2);
    assert.equal(prescription.route, undefined, "route must remain missing when it was not explicitly supplied");
    assert.equal(prescription.sig, undefined, "SIG must remain missing when it was not explicitly supplied or safely generated");
    assert.equal(prescription.daysSupply, undefined, "days supply must not be guessed from quantity/frequency");
    assert.equal(prescription.source, "ai");
    assert.equal(prescription.lifecycle, "draft");
    assert.equal(proposal.execution, "not_executed");
    assert.equal(plan.safety.mutatesClinicalRecord, false);

    const afterOrders = Number((db.prepare("SELECT COUNT(*) AS count FROM orders").get() as { count: number }).count);
    assert.equal(afterOrders, beforeOrders, "AI planning must not stage or persist the prescription proposal");
  } finally {
    process.chdir(originalCwd);
  }
});

test("untrusted AI prescription output cannot set protected prescription authority fields", async () => {
  const { validateOmniboxPlanningModelOutput } = await import("../app/domain/omnibox");

  assert.throws(() => validateOmniboxPlanningModelOutput({
    confidence: 0.9,
    intent: {
      kind: "propose_clinical_actions",
      actions: [{
        type: "stage_medication_order",
        name: "Sertraline",
        prescription: {
          medicationName: "Sertraline",
          dose: "100 mg",
          patientId: "wrong-patient",
          source: "clinician",
          lifecycle: "authorized",
        },
      }],
    },
  }), /unexpected field: patientId/i);
});

test("DrFirst remains a non-network placeholder and does not fake EPCS or pharmacy transmission", async () => {
  const { MockDrFirstAdapter } = await import("../app/adapters/prescribing/drfirst-adapter");
  const adapter = new MockDrFirstAdapter();

  const epcs = await adapter.verifyEpcsCredentials("1234567890", "TESTDEA", "1234", "567890");
  assert.equal(epcs.verified, false);
  assert.equal(epcs.auditToken, "");
  assert.match(epcs.error || "", /not implemented|no credential verification/i);

  await assert.rejects(
    adapter.transmitPrescriptions([
      { requiresEpcs: false, deaSchedule: "None" } as any,
    ], {} as any),
    /network transmission is not implemented|does not send prescriptions/i,
  );

  await assert.rejects(
    adapter.transmitPrescriptions([
      { requiresEpcs: true, deaSchedule: "II" } as any,
    ], {} as any),
    /EPCS is not implemented|controlled-substance prescriptions cannot be transmitted/i,
  );
});
