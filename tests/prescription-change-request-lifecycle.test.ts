import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { EPrescribingAdapter, PrescriptionTransmissionResult } from "../app/adapters";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

test("Phase 4I pharmacy change requests create a new staged replacement without mutating prescription history or medication truth", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-phase-4i-change-request-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { getDatabase },
      { OrderRepository },
      { PatientRepository },
      { AuditRepository },
      { PrescriptionChangeRequestRepository },
      { PrescriptionTransactionRepository },
      { prescriptionChangeRequestService },
      { prescriptionTransactionService },
      { clinicalService },
      { OrderTransmissionService },
      { ClinicalActionGateway },
      adapters,
    ] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/repositories/order-repository"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/repositories/prescription-change-request-repository"),
      import("../app/server/repositories/prescription-transaction-repository"),
      import("../app/server/services/prescription-change-request-service"),
      import("../app/server/services/prescription-transaction-service"),
      import("../app/server/services/clinical-service"),
      import("../app/server/services/order-transmission-service"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/adapters"),
    ]);

    // Patient access is an organization-membership decision. Synthetic actors must
    // declare their membership rather than being exempt from the boundary under test.
    const organizationId = await grantSyntheticOrganizationAccess(["phase-4i-provider", "phase-4i-staff"]);

    const db = getDatabase();
    const at = new Date().toISOString();
    const patientId = "phase-4i-patient";
    const otherPatientId = "phase-4i-other-patient";
    for (const [id, name, mrn] of [
      [patientId, "Synthetic Phase 4I Patient", "PHASE4I-001"],
      [otherPatientId, "Synthetic Other Phase 4I Patient", "PHASE4I-002"],
    ]) {
      db.prepare(`INSERT INTO patients (
        id, name, dob, age, mrn, status, pronouns, initials, alert,
        allergies_json, diagnoses_json, meds_json, vitals_json,
        last_visit, next_visit, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', '[]', '[]', '{}', ?, ?, ?, ?)`)
        .run(id, name, "01/01/1990", 36, mrn, "Established", "they/them", "PI", "Initial", "4 weeks", at, at);
      // A patient row without an owning organization is unreachable by design,
      // so the fixture records ownership alongside the record it creates.
      db.prepare(`INSERT OR REPLACE INTO patient_organizations (patient_id, organization_id, created_at) VALUES (?, ?, ?)`)
        .run(id, organizationId, at);
    }

    const provider = {
      userId: "phase-4i-provider",
      displayName: "Synthetic Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const staff = {
      userId: "phase-4i-staff",
      displayName: "Synthetic Staff",
      role: "staff" as const,
    };
    const context = { source: "api" as const, requestId: "phase-4i-test" };

    let transmitCalls = 0;
    const fakeAdapter: EPrescribingAdapter = {
      id: "phase-4i-adapter",
      name: "Synthetic Phase 4I Adapter",
      standard: "synthetic",
      description: "test only",
      async transmitPrescriptions(orders): Promise<PrescriptionTransmissionResult> {
        transmitCalls += 1;
        return {
          success: true,
          transmissionId: `external-${orders[0].id}`,
          vendor: "Synthetic Phase 4I Adapter",
          standard: "synthetic",
          transmittedCount: orders.length,
          pharmacyRouting: {
            pharmacyName: orders[0].pharmacy?.name || "Synthetic Pharmacy",
            ncpdpId: orders[0].pharmacy?.ncpdpId || "0000000",
            deliveryMethod: "EDI",
          },
          timestamp: new Date().toISOString(),
          epcsVerified: false,
        };
      },
      async searchPharmacies() { return []; },
      async verifyEpcsCredentials(npi, deaNumber) {
        return {
          verified: false,
          providerNpi: npi,
          deaNumber,
          timestamp: new Date().toISOString(),
          auditToken: "",
          authMethod: "Two-Factor Push / TOTP",
        };
      },
      async cancelPrescription() { return false; },
    };

    const transmissionService = new OrderTransmissionService({
      orders: OrderRepository,
      patients: PatientRepository,
      audit: AuditRepository,
      prescribingAdapter: fakeAdapter,
      labAdapter: adapters.defaultLabAdapter,
      prescriptionTransactions: prescriptionTransactionService,
    });

    const medicationCount = (id = patientId) => Number((db.prepare(
      `SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?`,
    ).get(id) as { n: number }).n);
    const candidateCount = (id = patientId) => Number((db.prepare(
      `SELECT COUNT(*) AS n FROM medication_reconciliation_candidates WHERE patient_id = ?`,
    ).get(id) as { n: number }).n);
    const changeRequestCount = (id = patientId) => Number((db.prepare(
      `SELECT COUNT(*) AS n FROM prescription_change_requests WHERE patient_id = ?`,
    ).get(id) as { n: number }).n);

    async function createTransmittedPrescription(id: string, targetPatientId: string) {
      const staged = clinicalService.stageOrder({
        id,
        patientId: targetPatientId,
        type: "medication",
        name: "Synthetic Sertraline 50 mg",
        details: {
          medication: "Synthetic Sertraline",
          medicationName: "Synthetic Sertraline",
          genericName: "Synthetic Sertraline",
          strength: "50 mg",
          dose: "50 mg",
          form: "tablet",
          route: "oral",
          frequency: "daily",
          dispenseQuantity: 30,
          daysSupply: 30,
          refills: 1,
          substitutionAllowed: true,
          sig: "Take 1 tablet by mouth daily",
          startDate: "2026-08-01",
          indication: "Synthetic indication",
          pharmacy: { name: "Synthetic Pharmacy", ncpdpId: "0000000" },
          deaSchedule: "None",
        },
      }, provider, context);
      const authorized = clinicalService.authorizeOrder(staged.id, {}, provider, context);
      assert.equal(authorized.status, "authorized");
      return transmissionService.transmit(staged.id, {}, provider, context);
    }

    const medicationCountBefore = medicationCount();
    const candidateCountBefore = candidateCount();
    const priorTransmission = await createTransmittedPrescription("phase-4i-prior-rx", patientId);
    const priorOrder = priorTransmission.order;
    const priorTransaction = priorTransmission.transaction!;
    assert.equal(priorOrder.status, "transmitted");
    assert.equal(priorTransaction.transactionType, "new_rx");
    assert.equal(priorTransaction.state, "submitted");

    const priorOrderSnapshot = JSON.stringify(OrderRepository.getById(priorOrder.id));
    const priorTransactionSnapshot = JSON.stringify(PrescriptionTransactionRepository.getById(priorTransaction.id));

    const recorded = prescriptionChangeRequestService.recordChangeRequest({
      sourceTransactionId: priorTransaction.id,
      adapterId: fakeAdapter.id,
      externalRequestId: "synthetic-change-001",
      category: "strength",
      requestedChanges: {
        strength: "75 mg",
        dose: "75 mg",
        quantity: 45,
        daysSupply: 30,
        sig: "Take 1.5 tablets by mouth daily",
        apiToken: "RAW-REQUEST-SECRET",
      } as any,
      summary: "Strength change requested password=SECRET-CHANGE PIN 9876 Authorization: Bearer CHANGE_TOKEN",
      sourceReference: "vendor-message/synthetic-change-001",
      receivedAt: "2026-09-08T18:00:00Z",
    });

    assert.equal(recorded.idempotent, false);
    assert.equal(recorded.request.status, "pending");
    assert.equal(recorded.request.patientId, patientId);
    assert.equal(recorded.request.sourceOrderId, priorOrder.id);
    assert.equal(recorded.request.sourceTransactionId, priorTransaction.id);
    assert.equal(recorded.request.adapterId, fakeAdapter.id);
    assert.equal(recorded.request.externalRequestId, "synthetic-change-001");
    assert.equal(recorded.request.requestedChanges.strength, "75 mg");
    assert.equal((recorded.request.requestedChanges as any).apiToken, undefined);
    assert.equal(changeRequestCount(), 1);
    assert.equal(medicationCount(), medicationCountBefore, "recording a change request must not mutate medication truth");
    assert.equal(candidateCount(), candidateCountBefore, "a change request must not create medication reconciliation evidence");
    assert.equal(JSON.stringify(OrderRepository.getById(priorOrder.id)), priorOrderSnapshot, "recording the request must not mutate the historical order");
    assert.equal(JSON.stringify(PrescriptionTransactionRepository.getById(priorTransaction.id)), priorTransactionSnapshot, "recording the request must not mutate the historical transaction");
    assert.ok(!JSON.stringify(recorded.request).includes("RAW-REQUEST-SECRET"));
    assert.ok(!JSON.stringify(recorded.request).includes("SECRET-CHANGE"));
    assert.ok(!JSON.stringify(recorded.request).includes("9876"));
    assert.ok(!JSON.stringify(recorded.request).includes("CHANGE_TOKEN"));

    const replay = prescriptionChangeRequestService.recordChangeRequest({
      sourceTransactionId: priorTransaction.id,
      adapterId: fakeAdapter.id,
      externalRequestId: "synthetic-change-001",
      category: "strength",
      requestedChanges: {
        strength: "75 mg",
        dose: "75 mg",
        quantity: 45,
        daysSupply: 30,
        sig: "Take 1.5 tablets by mouth daily",
      },
      summary: "Redelivered message",
      sourceReference: "vendor-message/synthetic-change-001",
    });
    assert.equal(replay.idempotent, true);
    assert.equal(replay.request.id, recorded.request.id);
    assert.equal(changeRequestCount(), 1, "stable external request identity must be replay-safe");

    const otherTransmission = await createTransmittedPrescription("phase-4i-other-rx", otherPatientId);
    await assert.rejects(
      async () => prescriptionChangeRequestService.recordChangeRequest({
        sourceTransactionId: otherTransmission.transaction!.id,
        adapterId: fakeAdapter.id,
        externalRequestId: "synthetic-change-001",
        category: "strength",
        requestedChanges: { strength: "75 mg" },
      }),
      /already bound to another patient or prescription/i,
    );
    assert.equal(changeRequestCount(otherPatientId), 0, "external identity must never be rebound to another patient");

    await assert.rejects(
      ClinicalActionGateway.execute({
        action: {
          type: "respond_to_prescription_change_request",
          payload: { changeRequestId: recorded.request.id, decision: "accept" },
        },
        actor: provider,
        context,
        expectedPatientId: otherPatientId,
      }),
      /patient binding mismatch/i,
    );
    await assert.rejects(
      ClinicalActionGateway.execute({
        action: {
          type: "respond_to_prescription_change_request",
          payload: { changeRequestId: recorded.request.id, decision: "accept" },
        },
        actor: provider,
        context,
      }),
      /requires expectedPatientId/i,
    );
    await assert.rejects(
      ClinicalActionGateway.execute({
        action: {
          type: "respond_to_prescription_change_request",
          payload: { changeRequestId: recorded.request.id, decision: "accept" },
        },
        actor: provider,
        context: { source: "ai", requestId: "phase-4i-ai-accept" },
        expectedPatientId: patientId,
      }),
      /AI.*cannot accept or decline/i,
    );

    const accepted = await ClinicalActionGateway.execute({
      action: {
        type: "respond_to_prescription_change_request",
        payload: { changeRequestId: recorded.request.id, decision: "accept" },
      },
      actor: provider,
      context,
      expectedPatientId: patientId,
    });

    assert.equal(accepted.request.status, "accepted");
    assert.equal(accepted.request.resolutionDecision, "accepted");
    assert.equal(accepted.order?.status, "staged");
    assert.ok(accepted.order);
    assert.notEqual(accepted.order!.id, priorOrder.id);
    assert.equal(accepted.order!.details?.changeRequestSource?.changeRequestId, recorded.request.id);
    assert.equal(accepted.order!.details?.changeRequestSource?.sourceOrderId, priorOrder.id);
    assert.equal(accepted.order!.details?.changeRequestSource?.sourceTransactionId, priorTransaction.id);
    assert.equal(accepted.order!.details?.changeRequestSource?.adapterId, fakeAdapter.id);
    assert.equal(accepted.order!.details?.prescriptionIntent?.sourceReference, `prescription-change-request/${recorded.request.id}`);
    assert.equal(accepted.order!.details?.prescriptionIntent?.lifecycle, "staged");
    assert.equal(accepted.order!.details?.prescriptionIntent?.relationship, "change");
    assert.equal(accepted.order!.details?.prescriptionIntent?.strength, "75 mg");
    assert.equal(accepted.order!.details?.prescriptionIntent?.dose, "75 mg");
    assert.equal(accepted.order!.details?.prescriptionIntent?.quantity, 45);
    assert.equal(accepted.order!.details?.prescriptionIntent?.startDate, undefined, "historical prescription start date must not be copied into the replacement");
    assert.equal(accepted.order!.details?.medicationTruthConfirmation, undefined);
    assert.equal(accepted.order!.details?.transmissionReceipt, undefined);
    assert.equal(accepted.order!.details?.authorizedBy, undefined);
    assert.ok(accepted.order!.details?.prescriptionReview, "replacement must reuse the existing deterministic prescription review");
    assert.equal(accepted.order!.details?.prescriptionReview?.canAuthorize, true);
    assert.equal(medicationCount(), medicationCountBefore, "accepted change request must not mutate medication truth");
    assert.equal(candidateCount(), candidateCountBefore, "accepted change request must not auto-reconcile evidence");
    assert.equal(JSON.stringify(OrderRepository.getById(priorOrder.id)), priorOrderSnapshot, "acceptance must leave the old order unchanged");
    assert.equal(JSON.stringify(PrescriptionTransactionRepository.getById(priorTransaction.id)), priorTransactionSnapshot, "acceptance must leave the old transaction unchanged");

    const duplicateAccept = await ClinicalActionGateway.execute({
      action: {
        type: "respond_to_prescription_change_request",
        payload: { changeRequestId: recorded.request.id, decision: "accept" },
      },
      actor: provider,
      context,
      expectedPatientId: patientId,
    });
    assert.equal(duplicateAccept.idempotent, true);
    assert.equal(duplicateAccept.order?.id, accepted.order!.id);
    assert.equal(
      OrderRepository.getByPatient(patientId).filter((order) => order.id === accepted.order!.id).length,
      1,
      "repeated acceptance must not create duplicate replacement orders",
    );

    const status = prescriptionChangeRequestService.status(recorded.request.id, patientId, staff);
    assert.equal(status.resultingOrderId, accepted.order!.id);
    assert.equal(status.status, "accepted");
    assert.equal(status.medicationTruthChanged, false);
    assert.ok(!JSON.stringify(status).includes("SECRET-CHANGE"));
    assert.ok(prescriptionChangeRequestService.listStatus(patientId, staff).some((item) => item.changeRequestId === recorded.request.id));
    assert.throws(
      () => prescriptionChangeRequestService.status(recorded.request.id, otherPatientId, provider),
      /patient binding mismatch/i,
    );

    await assert.rejects(
      ClinicalActionGateway.execute({
        action: { type: "authorize_order", payload: { orderId: accepted.order!.id } },
        actor: staff,
        context,
        expectedPatientId: patientId,
      }),
      /lacks permission: authorize_order/i,
    );
    await assert.rejects(
      ClinicalActionGateway.execute({
        action: { type: "authorize_order", payload: { orderId: accepted.order!.id } },
        actor: provider,
        context: { source: "ai", requestId: "phase-4i-ai-authorize" },
        expectedPatientId: patientId,
      }),
      /AI.*cannot authorize/i,
    );
    assert.equal(OrderRepository.getById(accepted.order!.id)?.status, "staged", "acceptance and authorization must remain separate actions");

    const authorized = await ClinicalActionGateway.execute({
      action: { type: "authorize_order", payload: { orderId: accepted.order!.id } },
      actor: provider,
      context,
      expectedPatientId: patientId,
    });
    assert.equal(authorized.status, "authorized");
    assert.equal(medicationCount(), medicationCountBefore);

    await assert.rejects(
      transmissionService.transmit(accepted.order!.id, {}, staff, context),
      /lacks permission: transmit_order/i,
    );
    await assert.rejects(
      transmissionService.transmit(accepted.order!.id, {}, provider, { source: "ai", requestId: "phase-4i-ai-transmit" }),
      /AI.*cannot transmit/i,
    );
    assert.equal(OrderRepository.getById(accepted.order!.id)?.status, "authorized", "authorization and transmission must remain separate actions");

    const callsBeforeReplacement = transmitCalls;
    const replacementTransmission = await transmissionService.transmit(accepted.order!.id, {}, provider, context);
    assert.equal(transmitCalls, callsBeforeReplacement + 1);
    assert.equal(replacementTransmission.order.status, "transmitted");
    assert.equal(replacementTransmission.transaction?.transactionType, "new_rx");
    assert.equal(replacementTransmission.transaction?.orderId, accepted.order!.id);
    assert.notEqual(replacementTransmission.transaction?.id, priorTransaction.id);
    assert.equal(JSON.stringify(OrderRepository.getById(priorOrder.id)), priorOrderSnapshot);
    assert.equal(JSON.stringify(PrescriptionTransactionRepository.getById(priorTransaction.id)), priorTransactionSnapshot);
    assert.equal(medicationCount(), medicationCountBefore, "replacement transmission must not mutate medication truth");
    assert.equal(candidateCount(), candidateCountBefore, "replacement transmission alone must not create reconciliation evidence");

    const declineRequest = prescriptionChangeRequestService.recordChangeRequest({
      sourceTransactionId: priorTransaction.id,
      adapterId: fakeAdapter.id,
      externalRequestId: "synthetic-change-002",
      category: "dose-directions",
      requestedChanges: { sig: "Take 1 tablet by mouth each evening" },
      summary: "Clarify directions",
    });
    const ordersBeforeDecline = OrderRepository.getByPatient(patientId).length;
    const declined = await ClinicalActionGateway.execute({
      action: {
        type: "respond_to_prescription_change_request",
        payload: { changeRequestId: declineRequest.request.id, decision: "decline" },
      },
      actor: provider,
      context,
      expectedPatientId: patientId,
    });
    assert.equal(declined.request.status, "declined");
    assert.equal(declined.request.resolutionDecision, "declined");
    assert.equal(declined.order, undefined);
    assert.equal(OrderRepository.getByPatient(patientId).length, ordersBeforeDecline, "declining must not create a replacement order");
    assert.equal(JSON.stringify(OrderRepository.getById(priorOrder.id)), priorOrderSnapshot);
    assert.equal(JSON.stringify(PrescriptionTransactionRepository.getById(priorTransaction.id)), priorTransactionSnapshot);
    assert.equal(medicationCount(), medicationCountBefore);

    const duplicateDecline = await ClinicalActionGateway.execute({
      action: {
        type: "respond_to_prescription_change_request",
        payload: { changeRequestId: declineRequest.request.id, decision: "decline" },
      },
      actor: provider,
      context,
      expectedPatientId: patientId,
    });
    assert.equal(duplicateDecline.idempotent, true);

    const persisted = PrescriptionChangeRequestRepository.getById(recorded.request.id)!;
    assert.equal(persisted.resultingOrderId, accepted.order!.id);
    const versionCount = Number((db.prepare(`
      SELECT COUNT(*) AS n FROM record_versions
      WHERE entity_type = 'prescription-change-request' AND entity_id = ?
    `).get(recorded.request.id) as { n: number }).n);
    const provenanceCount = Number((db.prepare(`
      SELECT COUNT(*) AS n FROM provenance_events
      WHERE entity_type = 'prescription-change-request' AND entity_id = ?
    `).get(recorded.request.id) as { n: number }).n);
    assert.ok(versionCount >= 2, "change request creation and acceptance should retain record versions");
    assert.ok(provenanceCount >= 2, "change request creation and acceptance should retain provenance");

    const audit = AuditRepository.getRecent(400, patientId);
    assert.ok(audit.some((entry) => entry.eventType === "prescription_change_request_recorded"));
    assert.ok(audit.some((entry) => entry.eventType === "prescription_change_request_accepted"));
    assert.ok(audit.some((entry) => entry.eventType === "prescription_change_request_declined"));
    assert.ok(!JSON.stringify(audit).includes("SECRET-CHANGE"));
    assert.ok(!JSON.stringify(audit).includes("CHANGE_TOKEN"));
    assert.equal(medicationCount(), medicationCountBefore);
    assert.equal(candidateCount(), candidateCountBefore);
  } finally {
    process.chdir(originalCwd);
  }
});
