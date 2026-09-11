import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { EPrescribingAdapter, PrescriptionTransmissionResult } from "../app/adapters";

test("Phase 4G cancellation is linked, patient-bound, idempotent, readable, append-only, and non-authoritative", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-phase-4g-cancel-"));
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
      { ClinicalActionGateway },
      adapters,
      { MockDrFirstAdapter },
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
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/adapters"),
      import("../app/adapters/prescribing/drfirst-adapter"),
      import("../app/adapters/prescribing/surescripts-adapter"),
      import("../app/adapters/prescribing/dosespot-adapter"),
    ]);

    const db = getDatabase();
    const at = new Date().toISOString();
    const patientId = "phase-4g-patient";
    const otherPatientId = "phase-4g-other-patient";
    for (const [id, name, mrn] of [
      [patientId, "Synthetic Phase 4G Patient", "PHASE4G-001"],
      [otherPatientId, "Synthetic Other Patient", "PHASE4G-002"],
    ]) {
      db.prepare(`INSERT INTO patients (
        id, name, dob, mrn, status, pronouns, initials, alert,
        allergies_json, diagnoses_json, meds_json, vitals_json,
        last_visit, next_visit, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '[]', '[]', '[]', '{}', ?, ?, ?, ?)`)
        .run(id, name, "01/01/1990", mrn, "Established", "they/them", "PG", "Initial", "4 weeks", at, at);
    }

    const provider = {
      userId: "phase-4g-provider",
      displayName: "Synthetic Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const staff = {
      userId: "phase-4g-staff",
      displayName: "Synthetic Staff",
      role: "staff" as const,
    };
    const context = { source: "api" as const, requestId: "phase-4g-test" };

    let cancelShouldSucceed = true;
    let cancelCalls = 0;
    let seenCancelContext: any;
    const fakeAdapter: EPrescribingAdapter = {
      id: "phase-4g-adapter",
      name: "Synthetic Phase 4G Adapter",
      standard: "synthetic",
      description: "test only",
      async transmitPrescriptions(orders): Promise<PrescriptionTransmissionResult> {
        return {
          success: true,
          transmissionId: `external-${orders[0].id}`,
          vendor: "Synthetic Phase 4G Adapter",
          standard: "synthetic",
          transmittedCount: orders.length,
          pharmacyRouting: {
            pharmacyName: orders[0].pharmacy?.name || "Synthetic Pharmacy",
            ncpdpId: orders[0].pharmacy?.ncpdpId || "0000000",
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
          authMethod: "Two-Factor Push / TOTP",
        };
      },
      async cancelPrescription(_orderId, _reason, transportContext) {
        cancelCalls += 1;
        seenCancelContext = transportContext;
        return cancelShouldSucceed;
      },
    };

    const transmissionService = new OrderTransmissionService({
      orders: OrderRepository,
      patients: PatientRepository,
      audit: AuditRepository,
      prescribingAdapter: fakeAdapter,
      labAdapter: adapters.defaultLabAdapter,
      prescriptionTransactions: prescriptionTransactionService,
    });

    async function createTransmittedPrescription(orderId: string) {
      OrderRepository.stageOrder({
        id: orderId,
        patientId,
        type: "medication",
        name: `Synthetic Medication ${orderId}`,
        details: {
          medication: `Synthetic Medication ${orderId}`,
          pharmacy: { name: "Synthetic Pharmacy", ncpdpId: "0000000" },
        },
        orderedBy: "Synthetic Provider",
      });
      OrderRepository.authorize(orderId, "Synthetic Provider", {});
      const outcome = await transmissionService.transmit(orderId, {}, provider, context);
      assert.equal(outcome.transaction?.state, "submitted");
      return outcome.transaction!;
    }

    const medicationCount = () => Number((db.prepare(
      `SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?`,
    ).get(patientId) as { n: number }).n);

    const medicationCountBefore = medicationCount();
    const target = await createTransmittedPrescription("phase-4g-rx");
    const secretReason = "patient requested cancel password=SECRET-CANCEL PIN 4321 Authorization: Bearer CANCEL_TOKEN";

    const requested = prescriptionTransactionService.requestCancellation(
      target.id,
      secretReason,
      provider,
      context,
    );
    assert.equal(requested.transaction.transactionType, "cancel_rx");
    assert.equal(requested.transaction.state, "cancellation_requested");
    assert.equal(requested.transaction.relatedTransactionId, target.id);
    assert.equal(requested.transaction.orderId, target.orderId);
    assert.equal(requested.idempotent, false);
    assert.equal(medicationCount(), medicationCountBefore, "cancel request must not change medication truth");

    const requestedEvent = PrescriptionTransactionRepository.listEvents(requested.transaction.id)
      .find((event) => event.eventType === "cancellation_requested")!;
    const requestEventText = JSON.stringify(requestedEvent);
    assert.ok(!requestEventText.includes("SECRET-CANCEL"));
    assert.ok(!requestEventText.includes("4321"));
    assert.ok(!requestEventText.includes("CANCEL_TOKEN"));

    const submitted = await transmissionService.cancelPrescription(target.id, secretReason, provider, context);
    assert.equal(submitted.transaction.id, requested.transaction.id);
    assert.equal(submitted.transaction.state, "submitted", "adapter submission is not external cancellation acknowledgement");
    assert.equal(submitted.transaction.attemptCount, 1);
    assert.equal(submitted.medicationTruthChanged, false);
    assert.equal(seenCancelContext?.internalTransactionId, submitted.transaction.id);
    assert.equal(seenCancelContext?.correlationId, submitted.transaction.correlationId);
    assert.equal(seenCancelContext?.idempotencyKey, submitted.transaction.idempotencyKey);
    assert.equal(seenCancelContext?.relatedTransactionId, target.id);
    assert.equal(seenCancelContext?.relatedExternalReferenceId, target.externalReferenceId);
    assert.equal(medicationCount(), medicationCountBefore, "submitted cancellation must not change medication truth");

    const callsAfterSubmission = cancelCalls;
    const duplicate = await transmissionService.cancelPrescription(target.id, "duplicate click", provider, context);
    assert.equal(duplicate.idempotent, true);
    assert.equal(duplicate.transaction.id, submitted.transaction.id);
    assert.equal(cancelCalls, callsAfterSubmission, "idempotent repeat must not resubmit externally");
    assert.equal(PrescriptionTransactionRepository.listRelated(target.id).filter((tx) => tx.transactionType === "cancel_rx").length, 1);

    const cancellationStatus = prescriptionTransactionService.status(submitted.transaction.id, patientId, provider);
    assert.equal(cancellationStatus.relatedTransactionId, target.id);
    assert.equal(cancellationStatus.relatedTransaction?.transactionId, target.id);
    assert.equal(cancellationStatus.medicationTruthChanged, false);
    assert.ok(cancellationStatus.recentEvents.length >= 3);
    assert.ok(!JSON.stringify(cancellationStatus).includes("SECRET-CANCEL"));
    assert.ok(cancellationStatus.recentEvents.every((event) => !("metadata" in event)), "bounded read surface must not expose event metadata");

    const targetStatus = prescriptionTransactionService.status(target.id, patientId, provider);
    assert.ok(targetStatus.linkedTransactions.some((tx) => tx.transactionId === submitted.transaction.id));
    assert.throws(
      () => prescriptionTransactionService.status(submitted.transaction.id, otherPatientId, provider),
      /patient binding mismatch/i,
    );
    assert.ok(prescriptionTransactionService.listStatus(patientId, staff).length >= 2, "staff may read bounded transaction status");
    await assert.rejects(
      transmissionService.cancelPrescription(target.id, "staff cannot cancel", staff, context),
      /lacks permission: transmit_order/i,
    );
    await assert.rejects(
      transmissionService.cancelPrescription(target.id, "AI cannot cancel", provider, { source: "ai", requestId: "ai-cancel" }),
      /AI.*cannot execute cancellation/i,
    );
    await assert.rejects(
      ClinicalActionGateway.execute({
        action: { type: "cancel_prescription", payload: { transactionId: target.id, reason: "wrong chart" } },
        actor: provider,
        context,
        expectedPatientId: otherPatientId,
      }),
      /patient binding mismatch/i,
    );

    const ack = prescriptionTransactionService.ingestVendorEvent({
      adapterId: fakeAdapter.id,
      correlationId: submitted.transaction.correlationId,
      externalEventId: "cancel-ack-1",
      transactionId: submitted.transaction.id,
      orderId: target.orderId,
      patientId,
      eventType: "cancel_acknowledged",
      state: "cancellation_acknowledged",
      metadata: { authorization: "Bearer SHOULD_NOT_PERSIST" },
    });
    assert.equal(ack.transaction.state, "cancellation_acknowledged");
    assert.ok(ack.transaction.acknowledgedAt);
    assert.equal(medicationCount(), medicationCountBefore, "acknowledged cancellation must not change medication truth");

    const completed = prescriptionTransactionService.ingestVendorEvent({
      adapterId: fakeAdapter.id,
      correlationId: submitted.transaction.correlationId,
      externalEventId: "cancel-complete-1",
      transactionId: submitted.transaction.id,
      orderId: target.orderId,
      patientId,
      eventType: "cancel_completed",
      state: "canceled",
    });
    assert.equal(completed.transaction.state, "canceled");
    assert.ok(completed.transaction.canceledAt);
    assert.equal(medicationCount(), medicationCountBefore, "completed CancelRx must not discontinue medication truth");
    assert.equal(PrescriptionTransactionRepository.getById(target.id)?.state, "submitted", "target prescription transaction remains distinct from cancellation lifecycle");

    const immutableCancellationEvent = PrescriptionTransactionRepository.listEvents(completed.transaction.id)[0];
    assert.throws(
      () => db.prepare(`UPDATE prescription_transaction_events SET metadata_json = '{}' WHERE id = ?`).run(immutableCancellationEvent.id),
      /append-only/i,
    );
    assert.throws(
      () => db.prepare(`DELETE FROM prescription_transaction_events WHERE id = ?`).run(immutableCancellationEvent.id),
      /append-only/i,
    );

    assert.throws(() => PrescriptionTransactionRepository.getOrCreateOutbound({
      orderId: target.orderId,
      patientId,
      adapterId: fakeAdapter.id,
      vendorName: fakeAdapter.name,
      transactionType: "cancel_rx",
      relatedTransactionId: submitted.transaction.id,
      idempotencyKey: submitted.transaction.idempotencyKey,
      createdBy: "Synthetic Provider",
      sourceType: "api",
    }, {
      actorId: provider.userId,
      actorName: provider.displayName,
      sourceType: "api",
      sourceSystem: "ehr-local",
    }), /already bound to another transaction identity/i, "stable idempotency key must not be rebound to another cancellation target");

    const retryTarget = await createTransmittedPrescription("phase-4g-retry-rx");
    cancelShouldSucceed = false;
    await assert.rejects(
      transmissionService.cancelPrescription(retryTarget.id, "first cancellation attempt", provider, context),
      /cancellation failed/i,
    );
    const failedCancellation = PrescriptionTransactionRepository.listRelated(retryTarget.id)
      .find((tx) => tx.transactionType === "cancel_rx")!;
    assert.equal(failedCancellation.state, "failed");
    assert.equal(failedCancellation.attemptCount, 1);

    cancelShouldSucceed = true;
    const retried = await transmissionService.cancelPrescription(retryTarget.id, "retry cancellation", provider, context);
    assert.equal(retried.transaction.id, failedCancellation.id);
    assert.equal(retried.transaction.state, "submitted");
    assert.equal(retried.transaction.attemptCount, 2);
    const retryEvents = PrescriptionTransactionRepository.listEvents(retried.transaction.id);
    assert.equal(retryEvents.filter((event) => event.eventType === "cancellation_failed").length, 1);
    assert.equal(retryEvents.filter((event) => event.eventType === "cancellation_attempt_prepared").length, 2);

    for (const placeholder of [new MockDrFirstAdapter(), new MockSurescriptsAdapter(), new MockDoseSpotAdapter()]) {
      assert.equal(
        await placeholder.cancelPrescription("synthetic-order", "test only"),
        false,
        `${placeholder.name} must not fabricate CancelRx success`,
      );
    }

    const audit = AuditRepository.getRecent(300, patientId);
    assert.ok(audit.some((entry) => entry.eventType === "prescription_cancellation_requested"));
    assert.ok(audit.some((entry) => entry.eventType === "prescription_cancellation_submitted"));
    assert.ok(audit.some((entry) => entry.eventType === "prescription_cancellation_failed"));
    assert.ok(!JSON.stringify(audit).includes("SECRET-CANCEL"));
    assert.ok(!JSON.stringify(audit).includes("CANCEL_TOKEN"));
    assert.equal(medicationCount(), medicationCountBefore);
  } finally {
    process.chdir(originalCwd);
  }
});
