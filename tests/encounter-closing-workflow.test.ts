import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LabOrder, ProviderAuth } from "../app/domain/orders";
import type { Patient } from "../app/domain/patient";
import type {
  LabRequisitionAdapter,
  LabRequisitionSlip,
  LabTransmissionResult,
} from "../app/adapters/labs/types";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

class FlakyLabAdapter implements LabRequisitionAdapter {
  id = "synthetic-flaky-lab";
  name = "Synthetic Flaky Lab";
  protocol = "TEST";
  description = "Fails once, then succeeds, for encounter-closing recovery tests.";
  calls = 0;

  generateRequisitionSlip(
    orders: LabOrder[],
    patient: Patient,
    auth: ProviderAuth,
    requisitionNumber: string,
  ): LabRequisitionSlip {
    return {
      requisitionNumber,
      barcode: `*${requisitionNumber}*`,
      facility: "Synthetic Lab",
      facilityAddress: "100 Test Way",
      dateGenerated: "Sep 7, 2026",
      patient: {
        name: patient.name,
        dob: patient.dob,
        age: patient.age,
        gender: "Unknown",
        mrn: patient.mrn,
      },
      orderingProvider: {
        name: auth.providerName,
        npi: auth.npi,
        clinicName: "Synthetic Clinic",
        clinicPhone: "555-0100",
      },
      tests: orders.map((order) => ({
        testName: order.testName,
        loincCode: order.loincCode,
        specimen: order.specimen,
        fasting: order.fastingRequired,
        icd10: order.indication,
      })),
      specimenCollectionInstructions: "Synthetic test only",
      priority: "Routine",
    };
  }

  async transmitLabOrders(
    orders: LabOrder[],
    patient: Patient,
    auth: ProviderAuth,
  ): Promise<LabTransmissionResult> {
    this.calls += 1;
    if (this.calls === 1) throw new Error("Synthetic lab gateway timeout");

    const requisitionNumber = "SYNTH-REQ-001";
    return {
      success: true,
      transmissionId: "SYNTH-TX-001",
      requisitionNumber,
      vendor: this.name,
      protocol: this.protocol,
      transmittedCount: orders.length,
      facilityName: "Synthetic Lab",
      hl7MessagePreview: "MSH|^~\\&|SYNTHETIC|TEST",
      requisitionSlip: this.generateRequisitionSlip(
        orders,
        patient,
        auth,
        requisitionNumber,
      ),
      timestamp: "12:00:00 PM",
    };
  }
}

test("signed note survives order transmission failure and retry is idempotent", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-encounter-close-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { ClinicalActionGateway },
      { EncounterRepository },
      { OrderRepository },
      { PatientRepository },
      { AuditRepository },
      { OrderTransmissionService },
      { defaultPrescribingAdapter },
    ] = await Promise.all([
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/encounter-repository"),
      import("../app/server/repositories/order-repository"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/services/order-transmission-service"),
      import("../app/adapters"),
    ]);

    // Patient access is an organization-membership decision. Synthetic actors must
    // declare their membership rather than being exempt from the boundary under test.
    await grantSyntheticOrganizationAccess(["test-provider", "test-staff"]);

    const provider = {
      userId: "test-provider",
      displayName: "Test Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const staff = {
      userId: "test-staff",
      displayName: "Test Staff",
      role: "staff" as const,
    };
    const context = { source: "api" as const, requestId: "encounter-close-test" };

    const createPatient = async (id: string, mrn: string, name: string) =>
      ClinicalActionGateway.execute({
        actor: provider,
        context,
        action: {
          type: "create_patient",
          payload: {
            id,
            name,
            initials: name.split(" ").map((part) => part[0]).join("").slice(0, 2),
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

    const patientA = "enc-close-a";
    const patientB = "enc-close-b";
    await createPatient(patientA, "CLOSE-A-001", "Synthetic Alpha");
    await createPatient(patientB, "CLOSE-B-001", "Synthetic Beta");

    const encounterId = "enc-close-note-001";
    await ClinicalActionGateway.execute({
      actor: provider,
      context,
      expectedPatientId: patientA,
      action: {
        type: "save_encounter_draft",
        payload: {
          id: encounterId,
          patientId: patientA,
          chiefComplaint: "Synthetic medication follow-up",
          assessment: "Stable synthetic assessment",
          plan: "Obtain synthetic monitoring labs",
          cptCode: "99214",
          emLevel: "moderate",
        },
      },
    });

    const labOrder: LabOrder = {
      id: "enc-close-lab-001",
      patientId: patientA,
      type: "lab",
      testName: "Synthetic CMP",
      loincCode: "24323-8",
      specimen: "Blood",
      priority: "Routine",
      fastingRequired: false,
      clinicalRationale: "Synthetic monitoring",
      indication: "Z00.00",
      targetFacility: "Quest Diagnostics",
      status: "staged",
      orderedBy: "Test Provider",
      createdAt: "Sep 7, 2026",
    };

    await ClinicalActionGateway.execute({
      actor: provider,
      context,
      expectedPatientId: patientA,
      action: {
        type: "stage_order",
        payload: {
          id: labOrder.id,
          patientId: patientA,
          orderType: "lab",
          name: labOrder.testName,
          details: labOrder,
        },
      },
    });

    await ClinicalActionGateway.execute({
      actor: provider,
      context,
      expectedPatientId: patientA,
      action: {
        type: "sign_encounter",
        payload: { encounterId },
      },
    });
    const signedBeforeFailure = EncounterRepository.getById(encounterId);
    assert.equal(signedBeforeFailure?.status, "signed");

    await ClinicalActionGateway.execute({
      actor: provider,
      context,
      expectedPatientId: patientA,
      action: {
        type: "authorize_order",
        payload: { orderId: labOrder.id, authMetadata: { authorizationSource: "test" } },
      },
    });

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor: provider,
        context,
        expectedPatientId: patientB,
        action: {
          type: "transmit_order",
          payload: { orderId: labOrder.id },
        },
      }),
      /Patient binding mismatch/i,
      "wrong-patient chart context must never transmit another patient's order",
    );

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor: staff,
        context,
        expectedPatientId: patientA,
        action: {
          type: "transmit_order",
          payload: { orderId: labOrder.id },
        },
      }),
      /lacks permission: transmit_order/i,
      "staff cannot transmit orders when the role lacks transmission permission",
    );

    const flakyLab = new FlakyLabAdapter();
    const transmissionService = new OrderTransmissionService({
      orders: OrderRepository,
      patients: PatientRepository,
      audit: AuditRepository,
      prescribingAdapter: defaultPrescribingAdapter,
      labAdapter: flakyLab,
    });

    await assert.rejects(
      transmissionService.transmit(labOrder.id, {}, provider, context),
      /Synthetic lab gateway timeout/i,
    );

    const failed = OrderRepository.getById(labOrder.id);
    assert.equal(failed?.status, "transmission_failed");
    assert.equal(failed?.details.transmissionAttempts, 1);
    assert.match(failed?.details.lastTransmissionError?.message || "", /gateway timeout/i);

    const signedAfterFailure = EncounterRepository.getById(encounterId);
    assert.equal(signedAfterFailure?.status, "signed");
    assert.equal(signedAfterFailure?.signedAt, signedBeforeFailure?.signedAt);
    assert.equal(signedAfterFailure?.plan, signedBeforeFailure?.plan);

    const retry = await transmissionService.transmit(labOrder.id, {}, provider, context);
    assert.equal(retry.order.status, "transmitted");
    assert.equal(retry.idempotent, false);
    assert.equal(retry.order.details.transmissionAttempts, 2);
    assert.equal(flakyLab.calls, 2);

    const replay = await transmissionService.transmit(labOrder.id, {}, provider, context);
    assert.equal(replay.order.status, "transmitted");
    assert.equal(replay.idempotent, true);
    assert.equal(flakyLab.calls, 2, "idempotent replay must not call the adapter again");

    const signedAfterRetry = EncounterRepository.getById(encounterId);
    assert.equal(signedAfterRetry?.status, "signed");
    assert.equal(signedAfterRetry?.signedAt, signedBeforeFailure?.signedAt);
  } finally {
    process.chdir(originalCwd);
  }
});
