import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { EPrescribingAdapter, PrescriptionTransmissionResult } from "../app/adapters";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

test("Phase 4L reconciles ambiguous prescription transport without fabricating network or medication truth", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-phase-4l-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { getDatabase },
      { IntegrationOutcomeUncertainError },
      { OrderRepository },
      { PrescriptionTransactionRepository },
      { prescriptionTransactionService },
      { prescriptionRecoveryService },
      { PrescriptionCallbackService },
      { OrderTransmissionService },
      { ClinicalActionGateway },
      adapters,
    ] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/integrations/reliability"),
      import("../app/server/repositories/order-repository"),
      import("../app/server/repositories/prescription-transaction-repository"),
      import("../app/server/services/prescription-transaction-service"),
      import("../app/server/services/prescription-recovery-service"),
      import("../app/server/services/prescription-callback-service"),
      import("../app/server/services/order-transmission-service"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/adapters"),
    ]);

    // Patient access is an organization-membership decision. Synthetic actors must
    // declare their membership rather than being exempt from the boundary under test.
    const organizationId = await grantSyntheticOrganizationAccess(["phase-4l-provider", "phase-4l-staff"]);

    const db = getDatabase();
    const provider = {
      userId: "phase-4l-provider",
      displayName: "Synthetic Recovery Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const staff = {
      userId: "phase-4l-staff",
      displayName: "Synthetic Staff",
      role: "staff" as const,
    };
    const patientId = "phase-4l-patient";
    const otherPatientId = "phase-4l-other-patient";
    const at = new Date().toISOString();

    function insertPatient(id: string, mrn: string) {
      db.prepare(`INSERT INTO patients (
        id, name, dob, mrn, status, pronouns, initials, alert,
        allergies_json, diagnoses_json, meds_json, vitals_json,
        last_visit, next_visit, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '[]', '[]', '[]', '{}', ?, ?, ?, ?)`)
        .run(id, `Synthetic ${id}`, "01/01/1990", mrn, "Established", "they/them", "PR", "Initial", "4 weeks", at, at);
      // A patient row without an owning organization is unreachable by design,
      // so the fixture records ownership alongside the record it creates.
      db.prepare(`INSERT OR REPLACE INTO patient_organizations (patient_id, organization_id, created_at) VALUES (?, ?, ?)`)
        .run(id, organizationId, at);
    }
    insertPatient(patientId, "PHASE4L-001");
    insertPatient(otherPatientId, "PHASE4L-002");

    const adapterId = "phase-4l-synthetic-adapter";
    const modes = new Map<string, "uncertain" | "success" | "failed">();
    const adapterCalls: Array<{ orderId: string; attempt?: number }> = [];
    const pinMarker = "PHASE4L-EPCS-PIN-NEVER-PERSIST";
    const otpMarker = "PHASE4L-OTP-NEVER-PERSIST";
    const secretMarker = "PHASE4L-SECRET-NEVER-PERSIST";

    const adapter: EPrescribingAdapter = {
      id: adapterId,
      name: "Synthetic Recovery Adapter",
      standard: "synthetic",
      description: "test only",
      async transmitPrescriptions(orders, auth, context): Promise<PrescriptionTransmissionResult> {
        const orderId = orders[0].id;
        adapterCalls.push({ orderId, attempt: context?.attempt });
        assert.equal(auth.epcsPin, pinMarker);
        assert.equal(auth.otpToken, otpMarker);
        const mode = modes.get(orderId) || "success";
        if (mode === "uncertain") {
          throw new IntegrationOutcomeUncertainError(`socket closed after send token=${secretMarker}`);
        }
        if (mode === "failed") throw new Error("synthetic confirmed failure");
        return {
          success: true,
          transmissionId: `synthetic-${orderId}-${context?.attempt || 0}`,
          vendor: "Synthetic Recovery Adapter",
          standard: "synthetic",
          transmittedCount: orders.length,
          pharmacyRouting: {
            pharmacyName: "Synthetic Pharmacy",
            ncpdpId: "0000000",
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
          authMethod: "Two-Factor Push / TOTP" as const,
        };
      },
      async cancelPrescription() { return true; },
    };

    const transmissionService = new OrderTransmissionService({
      orders: OrderRepository,
      prescribingAdapter: adapter,
      labAdapter: adapters.defaultLabAdapter,
      prescriptionTransactions: prescriptionTransactionService,
    });
    const callbackService = new PrescriptionCallbackService();

    function stageAuthorizedOrder(orderId: string) {
      OrderRepository.stageOrder({
        id: orderId,
        patientId,
        type: "medication",
        name: `Synthetic Medication ${orderId}`,
        details: {
          medication: `Synthetic Medication ${orderId}`,
          medicationName: `Synthetic Medication ${orderId}`,
          strength: "10 mg",
          dose: "10 mg",
          route: "oral",
          frequency: "daily",
          dispenseQuantity: 30,
          daysSupply: 30,
          refills: 1,
          sig: "Take one tablet daily",
          pharmacy: { name: "Synthetic Pharmacy", ncpdpId: "0000000" },
        },
        orderedBy: provider.displayName,
      });
      OrderRepository.authorize(orderId, provider.displayName, {});
    }

    const medicationCountBefore = Number((db.prepare(
      `SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?`,
    ).get(patientId) as { n: number }).n);

    const conflictOrderId = "phase-4l-conflict-rx";
    stageAuthorizedOrder(conflictOrderId);
    modes.set(conflictOrderId, "uncertain");
    await assert.rejects(
      () => transmissionService.transmit(
        conflictOrderId,
        { npi: "0000000000", epcsPin: pinMarker, otpToken: otpMarker },
        provider,
        { source: "api" as const, requestId: "phase-4l-uncertain-a" },
      ),
      /outcome is uncertain/i,
    );
    assert.equal(adapterCalls.length, 1);
    const conflictTransaction = PrescriptionTransactionRepository.getByOrder(conflictOrderId)[0];
    assert.equal(conflictTransaction.state, "outcome_uncertain");
    assert.equal(conflictTransaction.attemptCount, 1);
    assert.equal(OrderRepository.getById(conflictOrderId)?.status, "transmission_uncertain");

    const reopened = new DatabaseSync(join(isolatedRoot, "data", "ehr.db"));
    const durableUncertain = reopened.prepare(
      `SELECT state, attempt_count FROM prescription_transactions WHERE id = ?`,
    ).get(conflictTransaction.id) as { state: string; attempt_count: number };
    assert.equal(durableUncertain.state, "outcome_uncertain");
    assert.equal(Number(durableUncertain.attempt_count), 1);
    reopened.close();

    const workAfterReopen = prescriptionRecoveryService.listOperationalWork(provider);
    assert.ok(workAfterReopen.items.some((item) =>
      item.kind === "ambiguous_prescription_transaction" && item.transactionId === conflictTransaction.id
    ));
    assert.equal(adapterCalls.length, 1, "reopen/recovery discovery must cause zero automatic retransmissions");

    await assert.rejects(
      () => transmissionService.transmit(
        conflictOrderId,
        { npi: "0000000000", epcsPin: pinMarker, otpToken: otpMarker },
        provider,
        { source: "api" as const, requestId: "phase-4l-blind-retry" },
      ),
      /cannot be retried|cannot start another attempt|explicitly unlocks retry/i,
    );
    assert.equal(adapterCalls.length, 1);
    assert.equal(PrescriptionTransactionRepository.getByOrder(conflictOrderId).length, 1);

    const recoveryAction = {
      type: "record_prescription_recovery_evidence" as const,
      payload: {
        transactionId: conflictTransaction.id,
        disposition: "investigated_unresolved" as const,
        evidenceSource: "phone-call",
        note: "Called the pharmacy; staff could not yet determine whether the prescription was received.",
      },
    };

    await assert.rejects(
      () => ClinicalActionGateway.execute({
        action: recoveryAction,
        actor: provider,
        context: { source: "api" as const, requestId: "wrong-patient" },
        expectedPatientId: otherPatientId,
      }),
      /Patient binding mismatch/i,
    );
    await assert.rejects(
      () => ClinicalActionGateway.execute({
        action: recoveryAction,
        actor: staff,
        context: { source: "api" as const, requestId: "unauthorized" },
        expectedPatientId: patientId,
      }),
      /lacks permission: transmit_order/i,
    );
    await assert.rejects(
      () => ClinicalActionGateway.execute({
        action: recoveryAction,
        actor: provider,
        context: { source: "ai" as const, requestId: "ai-recovery" },
        expectedPatientId: patientId,
      }),
      /AI may summarize prescription uncertainty/i,
    );

    const firstReview = await ClinicalActionGateway.execute({
      action: recoveryAction,
      actor: provider,
      context: { source: "api" as const, requestId: "review-1" },
      expectedPatientId: patientId,
    });
    const replayReview = await ClinicalActionGateway.execute({
      action: recoveryAction,
      actor: provider,
      context: { source: "api" as const, requestId: "review-2" },
      expectedPatientId: patientId,
    });
    assert.equal(firstReview.idempotent, false);
    assert.equal(replayReview.idempotent, true);
    assert.equal(PrescriptionTransactionRepository.getById(conflictTransaction.id)?.state, "outcome_uncertain");
    assert.equal(prescriptionRecoveryService.inspect(conflictTransaction.id).retryAllowed, false);

    const unlocked = await ClinicalActionGateway.execute({
      action: {
        type: "record_prescription_recovery_evidence",
        payload: {
          transactionId: conflictTransaction.id,
          disposition: "confirmed_not_received",
          evidenceSource: "pharmacy-phone-verification",
          note: "Pharmacy staff confirmed no prescription was received for this attempt.",
        },
      },
      actor: provider,
      context: { source: "api" as const, requestId: "unlock-a" },
      expectedPatientId: patientId,
    });
    assert.equal(unlocked.status.retryAllowed, true);
    assert.equal(PrescriptionTransactionRepository.getById(conflictTransaction.id)?.state, "outcome_uncertain");
    const manualEvents = PrescriptionTransactionRepository.listEvents(conflictTransaction.id)
      .filter((event) => event.eventType === "manual_recovery_evidence");
    assert.equal(manualEvents.length, 2);
    assert.ok(manualEvents.every((event) => event.direction === "internal" && event.sourceSystem === "ehr-local"));
    assert.equal(manualEvents.at(-1)?.metadata.networkTruthChanged, false);

    const lateCallback = {
      adapterId,
      externalMessageId: "phase-4l-late-accepted-a",
      correlationId: conflictTransaction.correlationId,
      callbackType: "transaction-event" as const,
      assertions: {
        patientId,
        orderId: conflictOrderId,
        transactionId: conflictTransaction.id,
      },
      payload: {
        eventType: "accepted",
        state: "accepted" as const,
      },
    };
    const accepted = callbackService.processVerifiedCallback(lateCallback);
    assert.equal(accepted.idempotent, false);
    assert.equal(PrescriptionTransactionRepository.getById(conflictTransaction.id)?.state, "accepted");
    assert.equal(OrderRepository.getById(conflictOrderId)?.status, "transmitted");
    const conflictStatus = prescriptionRecoveryService.inspect(conflictTransaction.id);
    assert.equal(conflictStatus.operationalStatus, "evidence_conflict");
    assert.ok(conflictStatus.conflict);
    assert.equal(conflictStatus.retryAllowed, false);
    assert.ok(PrescriptionTransactionRepository.listEvents(conflictTransaction.id).some((event) =>
      event.direction === "inbound" && event.externalEventId === lateCallback.externalMessageId
    ));

    const old = new Date(Date.now() - 20 * 60_000).toISOString();
    db.prepare(`UPDATE prescription_callback_receipts SET
      status = 'processing', transaction_event_id = NULL, processed_at = NULL, updated_at = ?
      WHERE id = ?`).run(old, accepted.receipt.id);
    const staleWork = prescriptionRecoveryService.listOperationalWork(provider);
    assert.ok(staleWork.items.some((item) =>
      item.kind === "stale_callback_processing" && item.callbackReceiptId === accepted.receipt.id
    ));
    assert.equal((db.prepare(`SELECT status FROM prescription_callback_receipts WHERE id = ?`).get(accepted.receipt.id) as { status: string }).status, "processing");

    const resumed = callbackService.processVerifiedCallback(lateCallback);
    assert.equal(resumed.idempotent, true);
    assert.equal(resumed.receipt.status, "processed");
    assert.equal(PrescriptionTransactionRepository.listEvents(conflictTransaction.id)
      .filter((event) => event.externalEventId === lateCallback.externalMessageId).length, 1);

    const retryOrderId = "phase-4l-retry-rx";
    stageAuthorizedOrder(retryOrderId);
    modes.set(retryOrderId, "uncertain");
    await assert.rejects(
      () => transmissionService.transmit(
        retryOrderId,
        { npi: "0000000000", epcsPin: pinMarker, otpToken: otpMarker },
        provider,
        { source: "api" as const, requestId: "phase-4l-uncertain-b" },
      ),
      /outcome is uncertain/i,
    );
    const retryTransaction = PrescriptionTransactionRepository.getByOrder(retryOrderId)[0];
    assert.equal(retryTransaction.attemptCount, 1);

    await ClinicalActionGateway.execute({
      action: {
        type: "record_prescription_recovery_evidence",
        payload: {
          transactionId: retryTransaction.id,
          disposition: "confirmed_not_received",
          evidenceSource: "vendor-support-case",
          note: "Vendor support confirmed the original request did not reach the receiving endpoint.",
        },
      },
      actor: provider,
      context: { source: "api" as const, requestId: "unlock-b" },
      expectedPatientId: patientId,
    });

    modes.set(retryOrderId, "success");
    const recovered = await transmissionService.transmit(
      retryOrderId,
      { npi: "0000000000", epcsPin: pinMarker, otpToken: otpMarker },
      provider,
      { source: "api" as const, requestId: "recovered-retry-b" },
    );
    assert.equal(recovered.transaction?.id, retryTransaction.id);
    assert.equal(recovered.transaction?.attemptCount, 2);
    assert.equal(recovered.transaction?.state, "submitted");
    assert.equal(OrderRepository.getById(retryOrderId)?.status, "transmitted");
    assert.equal(PrescriptionTransactionRepository.getByOrder(retryOrderId).length, 1);
    const callsAfterRecoveredRetry = adapterCalls.length;
    const repeatedRetry = await transmissionService.transmit(
      retryOrderId,
      { npi: "0000000000", epcsPin: pinMarker, otpToken: otpMarker },
      provider,
      { source: "api" as const, requestId: "repeated-retry-b" },
    );
    assert.equal(repeatedRetry.idempotent, true);
    assert.equal(adapterCalls.length, callsAfterRecoveredRetry);

    const interruptedOrderId = "phase-4l-interrupted-prepared-rx";
    stageAuthorizedOrder(interruptedOrderId);
    const interruptedOrder = OrderRepository.getById(interruptedOrderId)!;
    const interruptedTransaction = prescriptionTransactionService.prepareOutbound(
      interruptedOrder,
      { id: adapter.id, name: adapter.name },
      provider,
      { source: "api" as const, requestId: "prepare-before-crash" },
    );
    assert.equal(interruptedTransaction.state, "prepared");
    assert.equal(interruptedTransaction.attemptCount, 1);
    const callsBeforeInterruptedRetry = adapterCalls.length;
    await assert.rejects(
      () => transmissionService.transmit(
        interruptedOrderId,
        { npi: "0000000000", epcsPin: pinMarker, otpToken: otpMarker },
        provider,
        { source: "api" as const, requestId: "restart-blind-retry" },
      ),
      /ambiguous external outcome|cannot be retried|cannot start another attempt/i,
    );
    assert.equal(adapterCalls.length, callsBeforeInterruptedRetry, "interrupted prepared attempt must not retransmit after restart/re-entry");
    const interruptedStatus = prescriptionRecoveryService.inspect(interruptedTransaction.id);
    assert.equal(interruptedStatus.operationalStatus, "requires_review");
    assert.equal(interruptedStatus.retryAllowed, false);

    await ClinicalActionGateway.execute({
      action: {
        type: "record_prescription_recovery_evidence",
        payload: {
          transactionId: interruptedTransaction.id,
          disposition: "confirmed_not_received",
          evidenceSource: "vendor-log-review",
          note: "Vendor log review confirmed no request was received for the interrupted prepared attempt.",
        },
      },
      actor: provider,
      context: { source: "api" as const, requestId: "unlock-interrupted" },
      expectedPatientId: patientId,
    });
    modes.set(interruptedOrderId, "success");
    const recoveredInterrupted = await transmissionService.transmit(
      interruptedOrderId,
      { npi: "0000000000", epcsPin: pinMarker, otpToken: otpMarker },
      provider,
      { source: "api" as const, requestId: "retry-interrupted" },
    );
    assert.equal(recoveredInterrupted.transaction?.id, interruptedTransaction.id);
    assert.equal(recoveredInterrupted.transaction?.attemptCount, 2);

    const supersededOrderId = "phase-4l-superseded-rx";
    stageAuthorizedOrder(supersededOrderId);
    modes.set(supersededOrderId, "uncertain");
    await assert.rejects(
      () => transmissionService.transmit(
        supersededOrderId,
        { npi: "0000000000", epcsPin: pinMarker, otpToken: otpMarker },
        provider,
        { source: "api" as const, requestId: "superseded-uncertain" },
      ),
      /outcome is uncertain/i,
    );
    const supersededTransaction = PrescriptionTransactionRepository.getByOrder(supersededOrderId)[0];
    const superseded = await ClinicalActionGateway.execute({
      action: {
        type: "record_prescription_recovery_evidence",
        payload: {
          transactionId: supersededTransaction.id,
          disposition: "superseded_by_verified_transaction",
          evidenceSource: "verified-replacement-review",
          note: "The original ambiguous attempt is operationally superseded by the retained verified accepted transaction.",
          supersedingTransactionId: conflictTransaction.id,
        },
      },
      actor: provider,
      context: { source: "api" as const, requestId: "superseded-resolution" },
      expectedPatientId: patientId,
    });
    assert.equal(superseded.status.operationalStatus, "superseded");
    assert.equal(superseded.status.retryAllowed, false);
    assert.equal(PrescriptionTransactionRepository.getById(supersededTransaction.id)?.state, "outcome_uncertain");

    const medicationCountAfter = Number((db.prepare(
      `SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?`,
    ).get(patientId) as { n: number }).n);
    assert.equal(medicationCountAfter, medicationCountBefore, "transport recovery must never mutate medication truth");

    const persistenceSurface = JSON.stringify({
      orders: db.prepare(`SELECT details_json FROM orders`).all(),
      transactions: db.prepare(`SELECT last_error_code, last_error_message FROM prescription_transactions`).all(),
      events: db.prepare(`SELECT metadata_json, error_code, error_message FROM prescription_transaction_events`).all(),
      callbacks: db.prepare(`SELECT normalized_fingerprint, failure_code FROM prescription_callback_receipts`).all(),
      audits: db.prepare(`SELECT description, metadata_json FROM audit_logs`).all(),
      provenance: db.prepare(`SELECT metadata_json FROM provenance_events`).all(),
    });
    assert.equal(persistenceSurface.includes(pinMarker), false);
    assert.equal(persistenceSurface.includes(otpMarker), false);
    assert.equal(persistenceSurface.includes(secretMarker), false);

    assert.ok((db.prepare(`
      SELECT COUNT(*) AS n FROM audit_logs
      WHERE event_type = 'prescription_uncertainty_resolved_by_external_evidence'
        AND patient_id = ?
    `).get(patientId) as { n: number }).n >= 1);
    assert.ok((db.prepare(`
      SELECT COUNT(*) AS n FROM audit_logs
      WHERE event_type = 'prescription_uncertainty_retry_unlocked'
        AND patient_id = ?
    `).get(patientId) as { n: number }).n >= 1);
  } finally {
    process.chdir(originalCwd);
  }
});
