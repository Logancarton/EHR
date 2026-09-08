import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("medication prescription intent stays separate from medication truth until explicit confirmation", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-prescription-intent-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { ClinicalActionGateway },
      { ClinicalRecordRepository },
      { OrderRepository },
    ] = await Promise.all([
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/repositories/order-repository"),
    ]);

    const provider = {
      userId: "rx-provider",
      displayName: "Synthetic Prescriber",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const staff = {
      userId: "rx-staff",
      displayName: "Synthetic Staff",
      role: "staff" as const,
    };
    const apiContext = { source: "api" as const, requestId: "rx-intent-test" };
    const aiContext = { source: "ai" as const, requestId: "rx-ai-proposal-test" };
    const patientId = "rx-intent-patient";
    const otherPatientId = "rx-intent-other";

    const createPatient = (id: string, mrn: string, name: string) =>
      ClinicalActionGateway.execute({
        actor: provider,
        context: apiContext,
        action: {
          type: "create_patient",
          payload: {
            id,
            name,
            initials: "SP",
            dob: "01/01/1990",
            age: 36,
            pronouns: "they/them",
            mrn,
            status: "Established",
            allergies: [],
            diagnoses: [],
            meds: [],
            vitals: {},
            lastVisit: "Initial",
            nextVisit: "4 weeks",
          },
        },
      });

    await createPatient(patientId, "RX-001", "Synthetic Prescription Patient");
    await createPatient(otherPatientId, "RX-002", "Synthetic Other Patient");

    const currentMedication = await ClinicalActionGateway.execute({
      actor: provider,
      context: apiContext,
      expectedPatientId: patientId,
      action: {
        type: "add_medication",
        payload: {
          patientId,
          displayText: "Sertraline 50 mg once daily",
          medicationName: "Sertraline",
          genericName: "sertraline",
          strength: "50 mg",
          dose: "50 mg",
          route: "Oral",
          frequency: "Once daily",
        },
      },
    });

    const beforeStage = ClinicalRecordRepository.medications(patientId);
    assert.equal(beforeStage.length, 1);

    const doseChangeOrder = await ClinicalActionGateway.execute({
      actor: provider,
      context: apiContext,
      expectedPatientId: patientId,
      action: {
        type: "stage_order",
        payload: {
          id: "rx-sertraline-100",
          patientId,
          orderType: "medication",
          name: "Sertraline 100 mg",
          details: {
            medicationName: "Sertraline",
            genericName: "sertraline",
            strength: "100 mg",
            dose: "100 mg",
            route: "Oral",
            frequency: "Once daily",
            sig: "Take 1 tablet by mouth once daily.",
            dispenseQuantity: 30,
            daysSupply: 30,
            refills: 2,
            substitutionAllowed: true,
          },
        },
      },
    });

    assert.equal(
      ClinicalRecordRepository.medications(patientId).length,
      1,
      "staging prescription intent must not create medication truth",
    );
    assert.equal(doseChangeOrder.details.prescriptionReview.truthImpact.kind, "likely-dose-change");
    assert.equal(doseChangeOrder.details.prescriptionReview.truthImpact.medicationId, currentMedication.id);
    assert.equal(doseChangeOrder.details.prescriptionReview.canAuthorize, true);

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor: provider,
        context: apiContext,
        expectedPatientId: otherPatientId,
        action: {
          type: "authorize_order",
          payload: { orderId: doseChangeOrder.id },
        },
      }),
      /Patient binding mismatch/i,
      "wrong-patient chart context must fail closed",
    );

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor: staff,
        context: apiContext,
        expectedPatientId: patientId,
        action: {
          type: "authorize_order",
          payload: { orderId: doseChangeOrder.id },
        },
      }),
      /lacks permission: authorize_order/i,
      "roles without explicit authorization permission must fail closed",
    );

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor: provider,
        context: aiContext,
        expectedPatientId: patientId,
        action: {
          type: "authorize_order",
          payload: { orderId: doseChangeOrder.id },
        },
      }),
      /AI may draft prescription intent but cannot authorize/i,
      "AI-originated proposals cannot authorize prescriptions",
    );

    const authorized = await ClinicalActionGateway.execute({
      actor: provider,
      context: apiContext,
      expectedPatientId: patientId,
      action: {
        type: "authorize_order",
        payload: { orderId: doseChangeOrder.id },
      },
    });
    assert.equal(authorized.status, "authorized");
    assert.equal(
      ClinicalRecordRepository.medications(patientId)[0].dose,
      "50 mg",
      "authorization alone must not alter authoritative medication truth",
    );

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor: provider,
        context: aiContext,
        expectedPatientId: patientId,
        action: {
          type: "confirm_prescription_medication_truth",
          payload: {
            orderId: doseChangeOrder.id,
            operation: "update",
            medicationId: currentMedication.id,
          },
        },
      }),
      /AI may draft prescription intent but cannot change authoritative medication truth/i,
    );

    const updatedMedication = await ClinicalActionGateway.execute({
      actor: provider,
      context: apiContext,
      expectedPatientId: patientId,
      action: {
        type: "confirm_prescription_medication_truth",
        payload: {
          orderId: doseChangeOrder.id,
          operation: "update",
          medicationId: currentMedication.id,
        },
      },
    });
    assert.equal(updatedMedication.dose, "100 mg");
    assert.equal(updatedMedication.strength, "100 mg");
    assert.equal(
      OrderRepository.getById(doseChangeOrder.id)?.details.medicationTruthConfirmation.medicationRecordId,
      currentMedication.id,
    );

    const newMedicationOrder = await ClinicalActionGateway.execute({
      actor: provider,
      context: apiContext,
      expectedPatientId: patientId,
      action: {
        type: "stage_order",
        payload: {
          id: "rx-bupropion-new",
          patientId,
          orderType: "medication",
          name: "Bupropion XL 150 mg",
          details: {
            medicationName: "Bupropion XL",
            genericName: "bupropion hydrochloride ER",
            strength: "150 mg",
            dose: "150 mg",
            route: "Oral",
            frequency: "Once daily",
            sig: "Take 1 tablet by mouth once daily in the morning.",
            dispenseQuantity: 30,
            daysSupply: 30,
            refills: 2,
          },
        },
      },
    });
    assert.equal(newMedicationOrder.details.prescriptionReview.truthImpact.kind, "likely-new-medication");

    await ClinicalActionGateway.execute({
      actor: provider,
      context: apiContext,
      expectedPatientId: patientId,
      action: {
        type: "add_medication",
        payload: {
          patientId,
          displayText: "Sertraline 25 mg once daily",
          medicationName: "Sertraline",
          genericName: "sertraline",
          strength: "25 mg",
          dose: "25 mg",
          route: "Oral",
          frequency: "Once daily",
        },
      },
    });

    const ambiguousOrder = await ClinicalActionGateway.execute({
      actor: provider,
      context: apiContext,
      expectedPatientId: patientId,
      action: {
        type: "stage_order",
        payload: {
          id: "rx-sertraline-ambiguous",
          patientId,
          orderType: "medication",
          name: "Sertraline 150 mg",
          details: {
            medicationName: "Sertraline",
            genericName: "sertraline",
            strength: "150 mg",
            dose: "150 mg",
            route: "Oral",
            frequency: "Once daily",
            sig: "Take 1 tablet by mouth once daily.",
            dispenseQuantity: 30,
            daysSupply: 30,
            refills: 1,
          },
        },
      },
    });
    assert.equal(ambiguousOrder.details.prescriptionReview.truthImpact.kind, "unclear");
    assert.equal(ambiguousOrder.details.prescriptionReview.truthImpact.medicationId, null);
    assert.ok(ambiguousOrder.details.prescriptionReview.truthImpact.alternatives.length >= 2);

    const aiProposal = await ClinicalActionGateway.execute({
      actor: provider,
      context: aiContext,
      expectedPatientId: patientId,
      action: {
        type: "stage_order",
        payload: {
          id: "rx-ai-draft",
          patientId,
          orderType: "medication",
          name: "Buspirone 10 mg",
          details: {
            medicationName: "Buspirone",
            strength: "10 mg",
            dose: "10 mg",
            route: "Oral",
            frequency: "Twice daily",
            sig: "Take 1 tablet by mouth twice daily.",
            dispenseQuantity: 60,
            daysSupply: 30,
            refills: 1,
          },
        },
      },
    });
    assert.equal(aiProposal.details.prescriptionIntent.source, "ai");
    assert.equal(aiProposal.status, "staged");
    assert.equal(
      ClinicalRecordRepository.medications(patientId).some((medication) => medication.medication_name === "Buspirone"),
      false,
      "AI-generated prescription proposal must remain non-authoritative",
    );
  } finally {
    process.chdir(originalCwd);
  }
});
