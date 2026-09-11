import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { EPrescribingAdapter, PrescriptionTransmissionResult } from "../app/adapters";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

test("Phase 4H refill requests stage a new linked prescription intent without mutating history or medication truth", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-phase-4h-refill-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { getDatabase },
      { OrderRepository },
      { PatientRepository },
      { AuditRepository },
      { PrescriptionRefillRepository },
      { PrescriptionTransactionRepository },
      { prescriptionRefillService },
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
      import("../app/server/repositories/prescription-refill-repository"),
      import("../app/server/repositories/prescription-transaction-repository"),
      import("../app/server/services/prescription-refill-service"),
      import("../app/server/services/prescription-transaction-service"),
      import("../app/server/services/clinical-service"),
      import("../app/server/services/order-transmission-service"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/adapters"),
    ]);

    // Patient access is an organization-membership decision. Synthetic actors must
    // declare their membership rather than being exempt from the boundary under test.
    const organizationId = await grantSyntheticOrganizationAccess(["phase-4h-provider", "phase-4h-staff"]);

    const db = getDatabase();
    const at = new Date().toISOString();
    const patientId = "phase-4h-patient";
    const otherPatientId = "phase-4h-other-patient";
    for (const [id, name, mrn] of [
      [patientId, "Synthetic Phase 4H Patient", "PHASE4H-001"],
      [otherPatientId, "Synthetic Other Phase 4H Patient", "PHASE4H-002"],
    ]) {
      db.prepare(`INSERT INTO patients (
        id, name, dob, mrn, status, pronouns, initials, alert,
        allergies_json, diagnoses_json, meds_json, vitals_json,
        last_visit, next_visit, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '[]', '[]', '[]', '{}', ?, ?, ?, ?)`)
        .run(id, name, "01/01/1990", mrn, "Established", "they/them", "PH", "Initial", "4 weeks", at, at);
      // A patient row without an owning organization is unreachable by design,
      // so the fixture records ownership alongside the record it creates.
      db.prepare(`INSERT OR REPLACE INTO patient_organizations (patient_id, organization_id, created_at) VALUES (?, ?, ?)`)
        .run(id, organizationId, at);
    }

    const provider = {
      userId: "phase-4h-provider",
      displayName: "Synthetic Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const staff = {
      userId: "phase-4h-staff",
      displayName: "Synthetic Staff",
      role: "staff" as const,
    };
    const context = { source: "api" as const, requestId: "phase-4h-test" };

    let transmitCalls = 0;
    const fakeAdapter: EPrescribingAdapter = {
      id: "phase-4h-adapter",
      name: "Synthetic Phase 4H Adapter",
      standard: "synthetic",
      description: "test only",
      async transmitPrescriptions(orders): Promise<PrescriptionTransmissionResult> {
        transmitCalls += 1;
        return {
          success: true,
          transmissionId: `external-${orders[0].id}`,
          vendor: "Synthetic Phase 4H Adapter",
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

    const medicationCount = () => Number((db.prepare(
      `SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?`,
    ).get(patientId) as { n: number }).n);
    const candidateCount = () => Number((db.prepare(
      `SELECT COUNT(*) AS n FROM medication_reconciliation_candidates WHERE patient_id = ?`,
    ).get(patientId) as { n: number }).n);
    const refillCount = () => Number((db.prepare(
      `SELECT COUNT(*) AS n FROM prescription_refill_requests WHERE patient_id = ?`,
    ).get(patientId) as { n: number }).n);

    const medicationCountBefore = medicationCount();
    const candidateCountBefore = candidateCount();

    const priorOrder = clinicalService.stageOrder({
      id: "phase-4h-prior-rx",
      patientId,
      type: "medication",
      name: "Synthetic Sertraline 50 mg",
      details: {
        medication: "Synthetic Sertraline",
        medicationName: "Synthetic Sertraline",
        strength: "50 mg",
        dose: "50 mg",
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
    assert.equal(priorOrder.status, "staged");
    const authorizedPriorOrder = clinicalService.authorizeOrder(priorOrder.id, {}, provider, context);
    assert.equal(authorizedPriorOrder.status, "authorized");
    const priorTransmission = await transmissionService.transmit(priorOrder.id, {}, provider, context);
    const priorTransaction = priorTransmission.transaction!;
    assert.equal(priorTransmission.order.status, "transmitted");
    assert.equal(priorTransaction.transactionType, "new_rx");
    assert.equal(priorTransaction.state, "submitted");
    const priorOrderSnapshot = JSON.stringify(OrderRepository.getById(priorOrder.id));
    const priorTransactionSnapshot = JSON.stringify(PrescriptionTransactionRepository.getById(priorTransaction.id));

    const secretNote = "Pharmacy requested renewal password=SECRET-REFILL PIN 4321 Authorization: Bearer REFILL_TOKEN";
    const requested = await ClinicalActionGateway.execute({
      action: {
        type: "request_prescription_refill",
        payload: {
          transactionId: priorTransaction.id,
          requestSource: "pharmacy",
          sourceReference: "synthetic-pharmacy-message-001",
          note: secretNote,
        },
      },
      actor: provider,
      context,
      expectedPatientId: patientId,
    });

    assert.equal(requested.request.status, "pending");
    assert.equal(requested.request.priorOrderId, priorOrder.id);
    assert.equal(requested.request.priorTransactionId, priorTransaction.id);
    assert.equal(requested.idempotent, false);
    assert.equal(requested.medicationTruthChanged, false);
    assert.equal(refillCount(), 1);
    assert.equal(medicationCount(), medicationCountBefore, "refill request must not mutate medication truth");
    assert.equal(candidateCount(), candidateCountBefore, "refill request alone must not create reconciliation evidence");
    assert.equal(JSON.stringify(OrderRepository.getById(priorOrder.id)), priorOrderSnapshot, "refill request must not mutate the old order");
    assert.equal(JSON.stringify(PrescriptionTransactionRepository.getById(priorTransaction.id)), priorTransactionSnapshot, "refill request must not mutate the old transaction");
    assert.ok(!JSON.stringify(requested.request).includes("SECRET-REFILL"));
    assert.ok(!JSON.stringify(requested.request).includes("4321"));
    assert.ok(!JSON.stringify(requested.request).includes("REFILL_TOKEN"));

    const duplicateRequest = await ClinicalActionGateway.execute({
      action: {
        type: "request_prescription_refill",
        payload: {
          transactionId: priorTransaction.id,
          requestSource: "pharmacy",
          sourceReference: "synthetic-pharmacy-message-001",
          note: "duplicate delivery",
        },
      },
      actor: provider,
      context,
      expectedPatientId: patientId,
    });
    assert.equal(duplicateRequest.idempotent, true);
    assert.equal(duplicateRequest.request.id, requested.request.id);
    assert.equal(refillCount(), 1, "replayed refill request must not duplicate workflow state");

    await assert.rejects(
      ClinicalActionGateway.execute({
        action: {
          type: "request_prescription_refill",
          payload: { transactionId: priorTransaction.id, requestSource: "patient", sourceReference: "wrong-chart" },
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
          type: "request_prescription_refill",
          payload: { transactionId: priorTransaction.id, requestSource: "patient", sourceReference: "missing-binding" },
        },
        actor: provider,
        context,
      }),
      /requires expectedPatientId/i,
    );
    await assert.rejects(
      ClinicalActionGateway.execute({
        action: {
          type: "request_prescription_refill",
          payload: { transactionId: priorTransaction.id, requestSource: "patient", sourceReference: "ai-request" },
        },
        actor: provider,
        context: { source: "ai", requestId: "phase-4h-ai-request" },
        expectedPatientId: patientId,
      }),
      /AI.*cannot create refill requests/i,
    );

    const renewed = await ClinicalActionGateway.execute({
      action: { type: "renew_prescription", payload: { refillRequestId: requested.request.id } },
      actor: provider,
      context,
      expectedPatientId: patientId,
    });
    assert.equal(renewed.request.status, "renewal_staged");
    assert.equal(renewed.order.status, "staged");
    assert.notEqual(renewed.order.id, priorOrder.id);
    assert.equal(renewed.order.details?.renewalSource?.refillRequestId, requested.request.id);
    assert.equal(renewed.order.details?.renewalSource?.priorOrderId, priorOrder.id);
    assert.equal(renewed.order.details?.renewalSource?.priorTransactionId, priorTransaction.id);
    assert.equal(renewed.order.details?.prescriptionIntent?.sourceReference, `prescription-refill-request/${requested.request.id}`);
    assert.equal(renewed.order.details?.prescriptionIntent?.relationship, "continue");
    assert.equal(renewed.order.details?.prescriptionIntent?.lifecycle, "staged");
    assert.equal(renewed.order.details?.prescriptionIntent?.startDate, undefined, "stale prior start date must not be copied forward");
    assert.equal(renewed.order.details?.medicationTruthConfirmation, undefined);
    assert.equal(renewed.order.details?.transmissionReceipt, undefined);
    assert.equal(renewed.order.details?.authorizedBy, undefined);
    assert.equal(medicationCount(), medicationCountBefore, "staged renewal intent must not mutate medication truth");
    assert.equal(candidateCount(), candidateCountBefore, "staged renewal intent must not create reconciliation evidence");
    assert.equal(JSON.stringify(OrderRepository.getById(priorOrder.id)), priorOrderSnapshot, "renewal must leave old order historically intact");
    assert.equal(JSON.stringify(PrescriptionTransactionRepository.getById(priorTransaction.id)), priorTransactionSnapshot, "renewal must leave old transaction historically intact");

    const duplicateRenewal = await ClinicalActionGateway.execute({
      action: { type: "renew_prescription", payload: { refillRequestId: requested.request.id } },
      actor: provider,
      context,
      expectedPatientId: patientId,
    });
    assert.equal(duplicateRenewal.idempotent, true);
    assert.equal(duplicateRenewal.order.id, renewed.order.id);
    assert.equal(
      OrderRepository.getByPatient(patientId).filter((order) => order.id === renewed.order.id).length,
      1,
      "repeated clinician renewal click must not duplicate the staged prescription intent",
    );

    await assert.rejects(
      ClinicalActionGateway.execute({
        action: { type: "renew_prescription", payload: { refillRequestId: requested.request.id } },
        actor: provider,
        context,
        expectedPatientId: otherPatientId,
      }),
      /patient binding mismatch/i,
    );
    await assert.rejects(
      ClinicalActionGateway.execute({
        action: { type: "renew_prescription", payload: { refillRequestId: requested.request.id } },
        actor: provider,
        context: { source: "ai", requestId: "phase-4h-ai-renew" },
        expectedPatientId: patientId,
      }),
      /AI.*cannot execute refill approval/i,
    );

    const refillStatus = prescriptionRefillService.status(requested.request.id, patientId, provider);
    assert.equal(refillStatus.renewalOrderId, renewed.order.id);
    assert.equal(refillStatus.medicationTruthChanged, false);
    assert.ok(!JSON.stringify(refillStatus).includes("SECRET-REFILL"));
    assert.ok(prescriptionRefillService.listStatus(patientId, staff).some((item) => item.refillRequestId === requested.request.id));
    assert.throws(
      () => prescriptionRefillService.status(requested.request.id, otherPatientId, provider),
      /patient binding mismatch/i,
    );

    await assert.rejects(
      ClinicalActionGateway.execute({
        action: { type: "authorize_order", payload: { orderId: renewed.order.id } },
        actor: staff,
        context,
        expectedPatientId: patientId,
      }),
      /lacks permission: authorize_order/i,
    );
    await assert.rejects(
      ClinicalActionGateway.execute({
        action: { type: "authorize_order", payload: { orderId: renewed.order.id } },
        actor: provider,
        context: { source: "ai", requestId: "phase-4h-ai-authorize" },
        expectedPatientId: patientId,
      }),
      /AI.*cannot authorize/i,
    );

    const authorizedRenewal = await ClinicalActionGateway.execute({
      action: { type: "authorize_order", payload: { orderId: renewed.order.id } },
      actor: provider,
      context,
      expectedPatientId: patientId,
    });
    assert.equal(authorizedRenewal.status, "authorized");
    assert.equal(medicationCount(), medicationCountBefore, "authorization still must not mutate medication truth");

    await assert.rejects(
      transmissionService.transmit(renewed.order.id, {}, staff, context),
      /lacks permission: transmit_order/i,
    );
    await assert.rejects(
      transmissionService.transmit(renewed.order.id, {}, provider, { source: "ai", requestId: "phase-4h-ai-transmit" }),
      /AI.*cannot transmit/i,
    );

    const callsBeforeRenewalTransmission = transmitCalls;
    const renewalTransmission = await transmissionService.transmit(renewed.order.id, {}, provider, context);
    assert.equal(transmitCalls, callsBeforeRenewalTransmission + 1);
    assert.equal(renewalTransmission.order.status, "transmitted");
    assert.equal(renewalTransmission.transaction?.transactionType, "new_rx", "approved renewal uses the normal new prescription transport path");
    assert.equal(renewalTransmission.transaction?.orderId, renewed.order.id);
    assert.notEqual(renewalTransmission.transaction?.id, priorTransaction.id);
    assert.equal(PrescriptionTransactionRepository.getById(priorTransaction.id)?.state, "submitted");
    assert.equal(OrderRepository.getById(priorOrder.id)?.status, "transmitted");
    assert.equal(medicationCount(), medicationCountBefore, "transmitted renewal must not automatically mutate medication truth");
    assert.equal(candidateCount(), candidateCountBefore, "outbound renewal transmission alone must not create reconciliation evidence");

    const renewalStatus = prescriptionTransactionService.status(renewalTransmission.transaction!.id, patientId, staff);
    assert.equal(renewalStatus.medicationTruthChanged, false);
    assert.equal(renewalStatus.orderId, renewed.order.id);

    const immutableEvent = PrescriptionTransactionRepository.listEvents(renewalTransmission.transaction!.id)[0];
    assert.throws(
      () => db.prepare(`UPDATE prescription_transaction_events SET metadata_json = '{}' WHERE id = ?`).run(immutableEvent.id),
      /append-only/i,
    );
    assert.throws(
      () => db.prepare(`DELETE FROM prescription_transaction_events WHERE id = ?`).run(immutableEvent.id),
      /append-only/i,
    );

    const persistedRequest = PrescriptionRefillRepository.getById(requested.request.id)!;
    assert.equal(persistedRequest.renewalOrderId, renewed.order.id);
    const audit = AuditRepository.getRecent(300, patientId);
    assert.ok(audit.some((entry) => entry.eventType === "prescription_refill_requested"));
    assert.ok(audit.some((entry) => entry.eventType === "prescription_renewal_staged"));
    assert.ok(!JSON.stringify(audit).includes("SECRET-REFILL"));
    assert.ok(!JSON.stringify(audit).includes("REFILL_TOKEN"));
    assert.equal(medicationCount(), medicationCountBefore);
  } finally {
    process.chdir(originalCwd);
  }
});
