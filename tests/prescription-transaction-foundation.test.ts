import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { EPrescribingAdapter, PrescriptionTransmissionResult } from "../app/adapters";

test("Phase 4F keeps external prescription transport state separate, patient-bound, idempotent, and non-authoritative", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-phase-4f-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { getDatabase },
      { OrderRepository },
      { PatientRepository },
      { AuditRepository },
      { PrescriptionTransactionRepository },
      { prescriptionTransactionService },
      { OrderTransmissionService },
      adapters,
      { MockSurescriptsAdapter },
      { MockDoseSpotAdapter },
    ] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/repositories/order-repository"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/repositories/prescription-transaction-repository"),
      import("../app/server/services/prescription-transaction-service"),
      import("../app/server/services/order-transmission-service"),
      import("../app/adapters"),
      import("../app/adapters/prescribing/surescripts-adapter"),
      import("../app/adapters/prescribing/dosespot-adapter"),
    ]);

    const db = getDatabase();
    const at = new Date().toISOString();
    const patientId = "phase-4f-patient";
    db.prepare(`INSERT INTO patients (
      id, name, dob, age, mrn, status, pronouns, initials, alert,
      allergies_json, diagnoses_json, meds_json, vitals_json,
      last_visit, next_visit, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', '[]', '[]', '{}', ?, ?, ?, ?)`)
      .run(
        patientId, "Synthetic Phase 4F Patient", "01/01/1990", 36, "PHASE4F-001",
        "Established", "they/them", "PF", "Initial", "4 weeks", at, at,
      );

    const provider = {
      userId: "phase-4f-provider",
      displayName: "Synthetic Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const context = { source: "api" as const, requestId: "phase-4f-test" };
    const orderId = "phase-4f-rx";
    OrderRepository.stageOrder({
      id: orderId,
      patientId,
      type: "medication",
      name: "Synthetic Sertraline",
      details: {
        medication: "Synthetic Sertraline",
        pharmacy: { name: "Synthetic Pharmacy", ncpdpId: "0000000" },
      },
      orderedBy: "Synthetic Provider",
    });
    const authorized = OrderRepository.authorize(orderId, "Synthetic Provider", {});
    assert.equal(authorized?.status, "authorized");

    let seenTransportContext: any;
    const receipt: PrescriptionTransmissionResult = {
      success: true,
      transmissionId: "synthetic-external-ref-1",
      vendor: "Synthetic Test Adapter",
      standard: "Synthetic test transport",
      transmittedCount: 1,
      pharmacyRouting: {
        pharmacyName: "Synthetic Pharmacy",
        ncpdpId: "0000000",
        deliveryMethod: "EDI",
      },
      ediMessagePreview: "RAW-SYNTHETIC-PAYLOAD password=hunter2",
      timestamp: at,
      auditTrailCode: "credentialSecret=do-not-persist",
      epcsVerified: false,
    };
    const fakeAdapter: EPrescribingAdapter = {
      id: "synthetic-prescribing-adapter",
      name: "Synthetic Prescribing Adapter",
      standard: "synthetic",
      description: "test only",
      async transmitPrescriptions(_orders, _auth, transportContext) {
        seenTransportContext = transportContext;
        return receipt;
      },
      async searchPharmacies() { return []; },
      async verifyEpcsCredentials(npi, deaNumber) {
        return {
          verified: false,
          providerNpi: npi,
          deaNumber,
          timestamp: at,
          auditToken: "",
          authMethod: "Two-Factor Push / TOTP",
        };
      },
      async cancelPrescription() { return false; },
    };

    const service = new OrderTransmissionService({
      orders: OrderRepository,
      patients: PatientRepository,
      audit: AuditRepository,
      prescribingAdapter: fakeAdapter,
      labAdapter: adapters.defaultLabAdapter,
      prescriptionTransactions: prescriptionTransactionService,
    });

    const medicationCountBefore = Number((db.prepare(
      `SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?`,
    ).get(patientId) as { n: number }).n);

    const outcome = await service.transmit(
      orderId,
      {
        npi: "0000000000",
        epcsPin: "1234",
        otpToken: "654321",
        accessToken: "do-not-persist",
      },
      provider,
      context,
    );

    assert.equal(outcome.order.status, "transmitted");
    assert.equal(outcome.transaction?.state, "submitted", "adapter success means submitted, not accepted");
    assert.equal(outcome.transaction?.attemptCount, 1);
    assert.equal(seenTransportContext?.internalTransactionId, outcome.transaction?.id);
    assert.equal(seenTransportContext?.correlationId, outcome.transaction?.correlationId);
    assert.equal(seenTransportContext?.idempotencyKey, outcome.transaction?.idempotencyKey);
    assert.equal(seenTransportContext?.attempt, 1);

    const persistedReceipt = OrderRepository.getById(orderId)?.details.transmissionReceipt;
    assert.equal(persistedReceipt?.transmissionId, receipt.transmissionId);
    assert.equal(persistedReceipt?.ediMessagePreview, undefined, "raw transport payload must not persist in normal order metadata");
    assert.equal(persistedReceipt?.auditTrailCode, undefined, "adapter audit/credential artifacts must not persist in normal order metadata");

    const transaction = outcome.transaction!;
    const accepted = prescriptionTransactionService.ingestVendorEvent({
      adapterId: fakeAdapter.id,
      correlationId: transaction.correlationId,
      externalEventId: "external-event-accepted-1",
      transactionId: transaction.id,
      orderId,
      patientId,
      externalReferenceId: receipt.transmissionId,
      eventType: "pharmacy_accepted",
      state: "accepted",
      metadata: {
        safeMessage: "accepted by network",
        accessToken: "secret-token-value",
        otpToken: "123456",
        nested: { password: "secret-password", keep: "safe" },
      },
      medicationEvidence: {
        evidenceType: "dispense-status",
        displayText: "Synthetic Sertraline 100 mg",
        medicationName: "Synthetic Sertraline",
        strength: "100 mg",
        observedAt: at,
      },
    });
    assert.equal(accepted.transaction.state, "accepted");
    assert.ok(accepted.event.evidenceCandidateId);
    assert.equal(accepted.idempotent, false);

    const replay = prescriptionTransactionService.ingestVendorEvent({
      adapterId: fakeAdapter.id,
      correlationId: transaction.correlationId,
      externalEventId: "external-event-accepted-1",
      transactionId: transaction.id,
      orderId,
      patientId,
      externalReferenceId: receipt.transmissionId,
      eventType: "pharmacy_accepted",
      state: "accepted",
      medicationEvidence: {
        evidenceType: "dispense-status",
        displayText: "Synthetic Sertraline 100 mg",
      },
    });
    assert.equal(replay.idempotent, true);
    assert.equal(replay.event.id, accepted.event.id);
    assert.equal(replay.event.evidenceCandidateId, accepted.event.evidenceCandidateId);

    const storedVendorEvent = PrescriptionTransactionRepository.getEventByKey(
      "vendor:synthetic-prescribing-adapter:external-event-accepted-1",
    )!;
    assert.equal(storedVendorEvent.metadata.safeMessage, "accepted by network");
    assert.equal(storedVendorEvent.metadata.accessToken, undefined);
    assert.equal(storedVendorEvent.metadata.otpToken, undefined);
    assert.deepEqual(storedVendorEvent.metadata.nested, { keep: "safe" });

    const candidateRows = db.prepare(`
      SELECT * FROM medication_reconciliation_candidates
      WHERE patient_id = ? AND source_type = 'external-vendor'
    `).all(patientId) as any[];
    assert.equal(candidateRows.length, 1, "replayed external evidence must not duplicate reconciliation candidates");
    assert.equal(candidateRows[0].status, "pending");
    assert.equal(candidateRows[0].source_system, fakeAdapter.id);

    const medicationCountAfter = Number((db.prepare(
      `SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?`,
    ).get(patientId) as { n: number }).n);
    assert.equal(medicationCountAfter, medicationCountBefore, "accepted/dispense evidence must not mutate authoritative medication truth");

    assert.throws(() => prescriptionTransactionService.ingestVendorEvent({
      adapterId: fakeAdapter.id,
      correlationId: transaction.correlationId,
      externalEventId: "wrong-patient-event",
      patientId: "different-patient",
      orderId,
      eventType: "pharmacy_accepted",
      state: "accepted",
    }), /patient identifier mismatch/i);

    assert.throws(() => prescriptionTransactionService.ingestVendorEvent({
      adapterId: fakeAdapter.id,
      correlationId: transaction.correlationId,
      externalEventId: "wrong-order-event",
      patientId,
      orderId: "different-order",
      eventType: "pharmacy_accepted",
      state: "accepted",
    }), /order identifier mismatch/i);

    const aiOrderId = "phase-4f-ai-rx";
    OrderRepository.stageOrder({
      id: aiOrderId,
      patientId,
      type: "medication",
      name: "Synthetic AI Medication",
      details: {},
      orderedBy: "Synthetic Provider",
    });
    const aiOrder = OrderRepository.authorize(aiOrderId, "Synthetic Provider", {})!;
    assert.throws(() => prescriptionTransactionService.prepareOutbound(
      aiOrder,
      { id: fakeAdapter.id, name: fakeAdapter.name },
      provider,
      { source: "ai", requestId: "ai-must-not-transmit" },
    ), /AI.*cannot create or transmit/i);

    const failureOrderId = "phase-4f-failure-rx";
    OrderRepository.stageOrder({
      id: failureOrderId,
      patientId,
      type: "medication",
      name: "Synthetic Failure Medication",
      details: {},
      orderedBy: "Synthetic Provider",
    });
    const failureOrder = OrderRepository.authorize(failureOrderId, "Synthetic Provider", {})!;
    const attempt1 = prescriptionTransactionService.prepareOutbound(
      failureOrder,
      { id: fakeAdapter.id, name: fakeAdapter.name },
      provider,
      context,
    );
    prescriptionTransactionService.recordFailure(
      attempt1.id,
      new Error("network failure token=SECRET-ONE password=SECRET-TWO"),
      provider,
      context,
    );
    const attempt2 = prescriptionTransactionService.prepareOutbound(
      failureOrder,
      { id: fakeAdapter.id, name: fakeAdapter.name },
      provider,
      context,
    );
    const failedTwice = prescriptionTransactionService.recordFailure(
      attempt2.id,
      new Error("second failure Bearer VERY_SECRET_VALUE"),
      provider,
      context,
    );
    assert.equal(failedTwice.attemptCount, 2);
    const failures = PrescriptionTransactionRepository.listEvents(failedTwice.id)
      .filter((event) => event.eventType === "failed");
    assert.equal(failures.length, 2, "failure history must append rather than overwrite");
    assert.ok(failures.every((event) => !JSON.stringify(event).includes("SECRET")));
    assert.ok(!JSON.stringify(failures).includes("VERY_SECRET_VALUE"));

    for (const placeholder of [new MockSurescriptsAdapter(), new MockDoseSpotAdapter()]) {
      await assert.rejects(
        placeholder.transmitPrescriptions([{} as any], {} as any),
        /not implemented/i,
      );
      const epcs = await placeholder.verifyEpcsCredentials("0000000000", "TEST000000", "1234", "567890");
      assert.equal(epcs.verified, false, `${placeholder.name} must not fabricate EPCS verification`);
      assert.equal(await placeholder.cancelPrescription("synthetic-order", "test"), false);
    }

    const audit = AuditRepository.getRecent(200, patientId);
    assert.ok(audit.some((entry) => entry.eventType === "prescription_transaction_submitted"));
    assert.ok(audit.some((entry) => entry.eventType === "prescription_transaction_event_ingested"));
  } finally {
    process.chdir(originalCwd);
  }
});
