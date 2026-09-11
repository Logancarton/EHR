import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { EPrescribingAdapter, PrescriptionTransmissionResult } from "../app/adapters";
import type { PrescriptionCallbackVerificationAdapter } from "../app/adapters/prescribing/callback-verification";
import type { VerifiedPrescriptionCallback } from "../app/domain/prescription-callbacks";

test("Phase 4J verifies and replay-protects external prescribing callbacks before routing", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-phase-4j-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { getDatabase },
      { OrderRepository },
      { PatientRepository },
      { AuditRepository },
      { PrescriptionTransactionRepository },
      { prescriptionTransactionService },
      { prescriptionRefillService },
      { prescriptionChangeRequestService },
      { OrderTransmissionService },
      { createPrescriptionCallbackHttpHandler },
      { resolvePrescriptionCallbackVerifier },
      adapters,
    ] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/repositories/order-repository"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/repositories/prescription-transaction-repository"),
      import("../app/server/services/prescription-transaction-service"),
      import("../app/server/services/prescription-refill-service"),
      import("../app/server/services/prescription-change-request-service"),
      import("../app/server/services/order-transmission-service"),
      import("../app/server/http/prescription-callback-http"),
      import("../app/adapters/prescribing/callback-verification"),
      import("../app/adapters"),
    ]);

    const db = getDatabase();
    const at = new Date().toISOString();
    const patientId = "phase-4j-patient";
    db.prepare(`INSERT INTO patients (
      id, name, dob, mrn, status, pronouns, initials, alert,
      allergies_json, diagnoses_json, meds_json, vitals_json,
      last_visit, next_visit, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '[]', '[]', '[]', '{}', ?, ?, ?, ?)`)
      .run(
        patientId, "Synthetic Phase 4J Patient", "01/01/1990", "PHASE4J-001",
        "Established", "they/them", "PJ", "Initial", "4 weeks", at, at,
      );

    const provider = {
      userId: "phase-4j-provider",
      displayName: "Synthetic Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const orderId = "phase-4j-rx";
    OrderRepository.stageOrder({
      id: orderId,
      patientId,
      type: "medication",
      name: "Synthetic Sertraline",
      details: {
        medication: "Synthetic Sertraline",
        medicationName: "Synthetic Sertraline",
        strength: "100 mg",
        dose: "100 mg",
        route: "oral",
        frequency: "daily",
        dispenseQuantity: 30,
        daysSupply: 30,
        refills: 1,
        sig: "Take one tablet daily",
        pharmacy: { name: "Synthetic Pharmacy", ncpdpId: "0000000" },
      },
      orderedBy: "Synthetic Provider",
    });
    OrderRepository.authorize(orderId, "Synthetic Provider", {});

    const fakeAdapter: EPrescribingAdapter = {
      id: "synthetic-callback-adapter",
      name: "Synthetic Callback Adapter",
      standard: "synthetic",
      description: "test only",
      async transmitPrescriptions(): Promise<PrescriptionTransmissionResult> {
        return {
          success: true,
          transmissionId: "phase-4j-external-rx",
          vendor: "Synthetic Callback Adapter",
          standard: "synthetic",
          transmittedCount: 1,
          pharmacyRouting: {
            pharmacyName: "Synthetic Pharmacy",
            ncpdpId: "0000000",
            deliveryMethod: "EDI",
          },
          timestamp: at,
          epcsVerified: false,
        };
      },
      async searchPharmacies() { return []; },
      async verifyEpcsCredentials(npi, deaNumber) {
        return {
          verified: false,
          providerNpi: npi,
          deaNumber,
          timestamp: at,
          auditToken: "",
          authMethod: "Two-Factor Push / TOTP" as const,
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
    const transmitted = await transmissionService.transmit(
      orderId,
      { npi: "0000000000" },
      provider,
      { source: "api" as const, requestId: "phase-4j-setup" },
    );
    const transaction = transmitted.transaction!;
    assert.equal(transmitted.order.status, "transmitted");
    assert.equal(transaction.state, "submitted");

    const persistenceMarker = "RAW-TRANSPORT-MARKER-4J";
    const verifier: PrescriptionCallbackVerificationAdapter = {
      id: fakeAdapter.id,
      async verifyInboundCallback(input) {
        if (input.headers.get("x-synthetic-verification") !== "verified-fixture") {
          return { verified: false, reason: "fixture verification failed" };
        }
        try {
          return {
            verified: true,
            callback: JSON.parse(new TextDecoder().decode(input.body)) as VerifiedPrescriptionCallback,
          };
        } catch {
          return { verified: true, callback: {} as VerifiedPrescriptionCallback };
        }
      },
    };
    const handler = createPrescriptionCallbackHttpHandler((adapterId) =>
      adapterId === verifier.id ? verifier : undefined,
    );
    const request = (callback: unknown, proof = "verified-fixture", adapterId = fakeAdapter.id) =>
      new Request(`http://localhost/api/integrations/prescribing/callback?adapter=${adapterId}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-synthetic-verification": proof },
        body: typeof callback === "string" ? callback : JSON.stringify(callback),
      });

    const placeholder = resolvePrescriptionCallbackVerifier("drfirst-placeholder");
    assert.ok(placeholder);
    assert.equal((await placeholder!.verifyInboundCallback({
      adapterId: "drfirst-placeholder",
      headers: new Headers(),
      body: new TextEncoder().encode("{}"),
      receivedAt: at,
    })).verified, false, "development placeholder must fail closed");
    assert.equal(resolvePrescriptionCallbackVerifier("unsupported-adapter"), undefined);

    assert.equal((await handler(request({}, "verified-fixture", "unsupported-adapter"))).status, 404);
    assert.equal((await handler(request({}, "invalid-proof"))).status, 401);
    assert.equal((await handler(request("{not-json"))).status, 400);
    assert.equal((await handler(request("x".repeat(70 * 1024)))).status, 413);

    const medicationCountBefore = Number((db.prepare(
      `SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?`,
    ).get(patientId) as { n: number }).n);
    const orderCountBefore = Number((db.prepare(
      `SELECT COUNT(*) AS n FROM orders WHERE patient_id = ?`,
    ).get(patientId) as { n: number }).n);
    const transactionCountBefore = Number((db.prepare(
      `SELECT COUNT(*) AS n FROM prescription_transactions WHERE patient_id = ?`,
    ).get(patientId) as { n: number }).n);
    const sourceOrderBefore = OrderRepository.getById(orderId);

    const transactionCallback = {
      adapterId: fakeAdapter.id,
      callbackType: "transaction-event",
      externalMessageId: "callback-transaction-accepted-1",
      correlationId: transaction.correlationId,
      externalReferenceId: "phase-4j-external-rx",
      occurredAt: at,
      assertions: { patientId, orderId, transactionId: transaction.id },
      rawTransportPayload: persistenceMarker,
      payload: {
        eventType: "pharmacy_accepted",
        state: "accepted",
        transportArtifact: persistenceMarker,
        medicationEvidence: {
          evidenceType: "dispense-status",
          displayText: "Synthetic Sertraline 100 mg",
          medicationName: "Synthetic Sertraline",
          strength: "100 mg",
          observedAt: at,
        },
      },
    };
    const accepted = await handler(request(transactionCallback));
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { ok: true, idempotent: false });
    assert.equal(PrescriptionTransactionRepository.getById(transaction.id)?.state, "accepted");

    const receipt = db.prepare(`
      SELECT * FROM prescription_callback_receipts
      WHERE adapter_id = ? AND external_message_id = ?
    `).get(fakeAdapter.id, transactionCallback.externalMessageId) as any;
    assert.equal(receipt.status, "processed");
    assert.equal(receipt.patient_id, patientId);
    assert.equal(receipt.order_id, orderId);
    assert.equal(receipt.transaction_id, transaction.id);
    assert.ok(receipt.transaction_event_id);

    const candidateCount = Number((db.prepare(`
      SELECT COUNT(*) AS n FROM medication_reconciliation_candidates
      WHERE patient_id = ? AND source_type = 'external-vendor'
    `).get(patientId) as { n: number }).n);
    assert.equal(candidateCount, 1, "clinically meaningful external medication evidence must remain reconciliation evidence");
    assert.equal(Number((db.prepare(
      `SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?`,
    ).get(patientId) as { n: number }).n), medicationCountBefore);

    const eventsAfterTransaction = db.prepare(
      `SELECT * FROM prescription_transaction_events WHERE transaction_id = ? ORDER BY received_at, id`,
    ).all(transaction.id);
    const transactionAfterEvent = PrescriptionTransactionRepository.getById(transaction.id);

    const replay = await handler(request(transactionCallback));
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), { ok: true, idempotent: true });
    assert.deepEqual(
      db.prepare(`SELECT * FROM prescription_transaction_events WHERE transaction_id = ? ORDER BY received_at, id`).all(transaction.id),
      eventsAfterTransaction,
      "exact callback replay must not append or rewrite transaction events",
    );

    const conflict = structuredClone(transactionCallback);
    conflict.payload.state = "failed";
    conflict.payload.eventType = "network_failed";
    assert.equal((await handler(request(conflict))).status, 409, "callback identity cannot change event meaning");

    const mismatch = {
      ...transactionCallback,
      externalMessageId: "callback-assertion-mismatch-1",
      assertions: { patientId: "wrong-patient", orderId, transactionId: transaction.id },
    };
    assert.equal((await handler(request(mismatch))).status, 409, "correlation ID must outrank vendor assertions");

    const refillCallback = {
      adapterId: fakeAdapter.id,
      callbackType: "refill-request",
      externalMessageId: "callback-refill-1",
      correlationId: transaction.correlationId,
      assertions: { patientId, orderId, transactionId: transaction.id },
      payload: {
        externalRequestId: "external-refill-1",
        sourceReference: "network/refill/1",
        note: "Pharmacy requests renewal review.",
        ignoredTransportField: persistenceMarker,
      },
    };
    assert.equal((await handler(request(refillCallback))).status, 200);
    const refillRows = db.prepare(`SELECT * FROM prescription_refill_requests WHERE patient_id = ?`).all(patientId) as any[];
    assert.equal(refillRows.length, 1);
    assert.equal(refillRows[0].status, "pending");
    assert.equal(refillRows[0].renewal_order_id, null);
    assert.equal(refillRows[0].prior_order_id, orderId);
    assert.equal(refillRows[0].prior_transaction_id, transaction.id);
    assert.deepEqual(await (await handler(request(refillCallback))).json(), { ok: true, idempotent: true });

    const changeCallback = {
      adapterId: fakeAdapter.id,
      callbackType: "change-request",
      externalMessageId: "callback-change-1",
      correlationId: transaction.correlationId,
      assertions: { patientId, orderId, transactionId: transaction.id },
      payload: {
        externalRequestId: "external-change-1",
        category: "strength",
        requestedChanges: { strength: "50 mg", dose: "50 mg" },
        summary: "Pharmacy requests clinician review.",
        sourceReference: "network/change/1",
        ignoredTransportField: persistenceMarker,
      },
    };
    assert.equal((await handler(request(changeCallback))).status, 200);
    const changeRows = db.prepare(`SELECT * FROM prescription_change_requests WHERE patient_id = ?`).all(patientId) as any[];
    assert.equal(changeRows.length, 1);
    assert.equal(changeRows[0].status, "pending");
    assert.equal(changeRows[0].resulting_order_id, null);
    assert.deepEqual(await (await handler(request(changeCallback))).json(), { ok: true, idempotent: true });

    assert.equal(Number((db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE patient_id = ?`).get(patientId) as { n: number }).n), orderCountBefore);
    assert.equal(Number((db.prepare(`SELECT COUNT(*) AS n FROM prescription_transactions WHERE patient_id = ?`).get(patientId) as { n: number }).n), transactionCountBefore);
    assert.equal(Number((db.prepare(`
      SELECT COUNT(*) AS n FROM medication_reconciliation_candidates
      WHERE patient_id = ? AND source_type = 'external-vendor'
    `).get(patientId) as { n: number }).n), candidateCount, "refill/change requests alone must not create reconciliation evidence");
    assert.equal(Number((db.prepare(`SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?`).get(patientId) as { n: number }).n), medicationCountBefore);
    assert.deepEqual(OrderRepository.getById(orderId), sourceOrderBefore, "historical source order must remain unchanged");
    assert.deepEqual(PrescriptionTransactionRepository.getById(transaction.id), transactionAfterEvent, "request callbacks must not rewrite the source transaction");
    assert.deepEqual(
      db.prepare(`SELECT * FROM prescription_transaction_events WHERE transaction_id = ? ORDER BY received_at, id`).all(transaction.id),
      eventsAfterTransaction,
      "request callbacks must not alter append-only transaction events",
    );

    assert.throws(() => prescriptionRefillService.renewPrescription(
      refillRows[0].id,
      provider,
      { source: "ai" as const, requestId: "phase-4j-ai-refill" },
    ), /AI/i);
    assert.throws(() => prescriptionChangeRequestService.respond(
      changeRows[0].id,
      "accept",
      provider,
      { source: "ai" as const, requestId: "phase-4j-ai-change" },
    ), /AI/i);

    const persisted = JSON.stringify({
      callbacks: db.prepare(`SELECT * FROM prescription_callback_receipts`).all(),
      audits: db.prepare(`SELECT * FROM audit_logs`).all(),
      provenance: db.prepare(`SELECT * FROM provenance_events WHERE entity_type LIKE 'prescription-%'`).all(),
      events: db.prepare(`SELECT * FROM prescription_transaction_events WHERE transaction_id = ?`).all(transaction.id),
      refills: db.prepare(`SELECT * FROM prescription_refill_requests WHERE patient_id = ?`).all(patientId),
      changes: db.prepare(`SELECT * FROM prescription_change_requests WHERE patient_id = ?`).all(patientId),
    });
    assert.ok(!persisted.includes(persistenceMarker), "raw/unknown transport content must not persist");

    const callbackAuditTypes = AuditRepository.getRecent(200)
      .map((entry) => entry.eventType)
      .filter((eventType) => eventType.startsWith("prescription_callback_"));
    assert.ok(callbackAuditTypes.includes("prescription_callback_processed"));
    assert.ok(callbackAuditTypes.includes("prescription_callback_replayed"));
    assert.ok(callbackAuditTypes.includes("prescription_callback_rejected"));
  } finally {
    process.chdir(originalCwd);
  }
});
