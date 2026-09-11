import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

test("Phase 4M projects provider prescribing operations without weakening recovery or patient authority", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-phase-4m-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { getDatabase },
      { OrderRepository },
      { PrescriptionTransactionRepository },
      { prescriptionTransactionService },
      { prescriptionOperationsService },
      { integrationConfigurationService },
      { executeClinicalAction },
    ] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/repositories/order-repository"),
      import("../app/server/repositories/prescription-transaction-repository"),
      import("../app/server/services/prescription-transaction-service"),
      import("../app/server/services/prescription-operations-service"),
      import("../app/server/services/integration-configuration-service"),
      import("../app/server/actions/clinical-action-gateway"),
    ]);

    // Patient access is an organization-membership decision. Synthetic actors must
    // declare their membership rather than being exempt from the boundary under test.
    const organizationId = await grantSyntheticOrganizationAccess(["phase-4m-provider", "phase-4m-staff"]);

    const db = getDatabase();
    const provider = {
      userId: "phase-4m-provider",
      displayName: "Synthetic Operations Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const staff = {
      userId: "phase-4m-staff",
      displayName: "Synthetic Operations Staff",
      role: "staff" as const,
    };
    const patientId = "phase-4m-patient";
    const otherPatientId = "phase-4m-other-patient";
    const adapterId = "phase-4m-adapter";
    const at = new Date().toISOString();

    function insertPatient(id: string, mrn: string) {
      db.prepare(`INSERT INTO patients (
        id, name, dob, mrn, status, pronouns, initials, alert,
        allergies_json, diagnoses_json, meds_json, vitals_json,
        last_visit, next_visit, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '[]', '[]', '[]', '{}', ?, ?, ?, ?)`)
        .run(id, `Synthetic ${id}`, "01/01/1990", mrn, "Established", "they/them", "PO", "Initial", "4 weeks", at, at);
      // A patient row without an owning organization is unreachable by design,
      // so the fixture records ownership alongside the record it creates.
      db.prepare(`INSERT OR REPLACE INTO patient_organizations (patient_id, organization_id, created_at) VALUES (?, ?, ?)`)
        .run(id, organizationId, at);
    }

    insertPatient(patientId, "PHASE4M-001");
    insertPatient(otherPatientId, "PHASE4M-002");

    integrationConfigurationService.save({
      id: "phase-4m-prescribing",
      adapterId,
      purpose: "prescribing",
      environment: "test",
      enabled: true,
      nonSecretConfig: { endpointLabel: "synthetic" },
      secretRefs: {},
    }, provider);
    integrationConfigurationService.save({
      id: "phase-4m-missing-secret",
      adapterId: "phase-4m-secret-adapter",
      purpose: "prescribing",
      environment: "test",
      enabled: true,
      secretRefs: { apiToken: "PHASE4M-SECRET-REF-NEVER-EXPOSE" },
    }, provider);

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
      return OrderRepository.getById(orderId)!;
    }

    const provenance = {
      actorId: provider.userId,
      actorName: provider.displayName,
      sourceType: "api",
      sourceSystem: "ehr-test",
      sourceRef: "phase-4m-test",
    };
    const context = (requestId: string) => ({ source: "api" as const, requestId });

    const uncertainOrder = stageAuthorizedOrder("phase-4m-uncertain-order");
    const uncertainPrepared = prescriptionTransactionService.prepareOutbound(
      uncertainOrder,
      { id: adapterId, name: "Synthetic Operations Adapter" },
      provider,
      context("phase-4m-uncertain-prepare"),
    );
    const uncertain = PrescriptionTransactionRepository.transitionState(
      uncertainPrepared.id,
      "outcome_uncertain",
      { error: { message: "socket closed token=PHASE4M-TRANSPORT-TOKEN" } },
      provenance,
    );
    PrescriptionTransactionRepository.recordEvent({
      transaction: uncertain,
      eventKey: `local:${uncertain.id}:attempt:${uncertain.attemptCount}:outcome-uncertain`,
      direction: "outbound",
      eventType: "outcome_uncertain",
      state: "outcome_uncertain",
      error: { message: "network result unknown otp=PHASE4M-OTP" },
      metadata: { token: "PHASE4M-EVENT-TOKEN", boundedReason: "transport result unavailable" },
      sourceSystem: adapterId,
    }, provenance);
    OrderRepository.markTransmissionUncertain(uncertain.orderId, "network result unavailable");

    const interruptedOrder = stageAuthorizedOrder("phase-4m-interrupted-order");
    const interrupted = prescriptionTransactionService.prepareOutbound(
      interruptedOrder,
      { id: adapterId, name: "Synthetic Operations Adapter" },
      provider,
      context("phase-4m-interrupted-prepare"),
    );
    assert.equal(interrupted.state, "prepared");
    assert.equal(interrupted.attemptCount, 1);

    const failedOrder = stageAuthorizedOrder("phase-4m-failed-order");
    const failedPrepared = prescriptionTransactionService.prepareOutbound(
      failedOrder,
      { id: adapterId, name: "Synthetic Operations Adapter" },
      provider,
      context("phase-4m-failed-prepare"),
    );
    prescriptionTransactionService.recordFailure(
      failedPrepared.id,
      new Error("synthetic confirmed failure token=PHASE4M-FAILURE-TOKEN"),
      provider,
      context("phase-4m-failed"),
    );
    OrderRepository.markTransmissionFailed(failedOrder.id, "synthetic confirmed failure");

    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    db.prepare(`INSERT INTO prescription_callback_receipts (
      id, adapter_id, external_message_id, callback_type, correlation_id, normalized_fingerprint,
      patient_id, order_id, transaction_id, transaction_event_id, refill_request_id, change_request_id,
      status, failure_code, received_at, processed_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'transaction-event', ?, ?, ?, ?, ?, NULL, NULL, NULL, 'processing', NULL, ?, NULL, ?, ?)`)
      .run(
        "phase-4m-stale-callback",
        adapterId,
        "phase-4m-stale-message",
        interrupted.correlationId,
        "phase-4m-bounded-fingerprint",
        patientId,
        interrupted.orderId,
        interrupted.id,
        old,
        old,
        old,
      );

    const medicationCountBefore = Number((db.prepare(
      `SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?`,
    ).get(patientId) as { n: number }).n);

    const firstQueue = await prescriptionOperationsService.list(provider);
    const classifications = new Set(firstQueue.items.map((item) => item.classification));
    assert.equal(classifications.has("outcome_unknown"), true);
    assert.equal(classifications.has("interrupted_attempt"), true);
    assert.equal(classifications.has("transmission_failed"), true);
    assert.equal(classifications.has("callback_processing_stale"), true);

    const uncertainItem = firstQueue.items.find((item) => item.prescription.transactionId === uncertain.id && item.classification === "outcome_unknown");
    assert.ok(uncertainItem);
    assert.equal(uncertainItem.statusLabel, "Outcome unknown");
    assert.equal(uncertainItem.retry.allowed, false);
    assert.equal(uncertainItem.retry.code, "no_confirming_evidence");
    assert.match(uncertainItem.retry.reason, /confirms? the prescription was not received/i);

    const interruptedItem = firstQueue.items.find((item) => item.prescription.transactionId === interrupted.id && item.classification === "interrupted_attempt");
    assert.ok(interruptedItem);
    assert.equal(interruptedItem.retry.allowed, false);

    const staleCallbackItem = firstQueue.items.find((item) => item.callbackReceiptId === "phase-4m-stale-callback");
    assert.ok(staleCallbackItem);
    assert.equal(staleCallbackItem.retry.allowed, false);
    assert.match(staleCallbackItem.reason, /not silently marked processed or rejected/i);

    const projectionText = JSON.stringify(firstQueue);
    for (const forbidden of [
      "PHASE4M-SECRET-REF-NEVER-EXPOSE",
      "PHASE4M-TRANSPORT-TOKEN",
      "PHASE4M-OTP",
      "PHASE4M-EVENT-TOKEN",
      "PHASE4M-FAILURE-TOKEN",
      "normalized_fingerprint",
      "missingSecretAliases",
      "secretRefs",
    ]) {
      assert.equal(projectionText.includes(forbidden), false, `queue projection leaked ${forbidden}`);
    }
    assert.equal(firstQueue.integrations.some((item) => item.readiness === "missing_secret"), true);

    const evidenceAction = {
      type: "record_prescription_recovery_evidence" as const,
      payload: {
        transactionId: uncertain.id,
        disposition: "confirmed_not_received" as const,
        evidenceSource: "pharmacy phone confirmation token=PHASE4M-EVIDENCE-TOKEN",
        note: "Pharmacy reports no receipt; token=PHASE4M-NOTE-TOKEN",
      },
    };

    await assert.rejects(
      () => executeClinicalAction({
        action: evidenceAction,
        actor: provider,
        context: context("phase-4m-wrong-patient"),
        expectedPatientId: otherPatientId,
      }),
      /patient binding mismatch/i,
    );

    await assert.rejects(
      () => executeClinicalAction({
        action: evidenceAction,
        actor: staff,
        context: context("phase-4m-staff-action"),
        expectedPatientId: patientId,
      }),
      /lacks permission: transmit_order/i,
    );

    const evidenceResult = await executeClinicalAction({
      action: evidenceAction,
      actor: provider,
      context: context("phase-4m-evidence"),
      expectedPatientId: patientId,
    });
    assert.equal(evidenceResult.idempotent, false);

    const repeatedEvidence = await executeClinicalAction({
      action: evidenceAction,
      actor: provider,
      context: context("phase-4m-evidence-repeat"),
      expectedPatientId: patientId,
    });
    assert.equal(repeatedEvidence.idempotent, true);

    const retryQueue = await prescriptionOperationsService.list(provider);
    const retryItem = retryQueue.items.find((item) => item.prescription.transactionId === uncertain.id && item.classification === "outcome_unknown");
    assert.ok(retryItem);
    assert.equal(retryItem.retry.allowed, true);
    assert.equal(retryItem.retry.code, "none");

    const detail = await prescriptionOperationsService.detail(retryItem.id, provider);
    assert.equal(detail.medicationTruthChanged, false);
    assert.equal(detail.actions.find((action) => action.id === "retry_transmission")?.allowed, true);
    assert.equal(detail.timeline.some((event) => event.category === "manual_evidence"), true);
    assert.equal(detail.timeline.some((event) => event.category === "outbound_attempt"), true);
    assert.equal(detail.timeline.every((event) => !("metadata" in event)), true);
    const detailText = JSON.stringify(detail);
    assert.equal(detailText.includes("PHASE4M-EVIDENCE-TOKEN"), false);
    assert.equal(detailText.includes("PHASE4M-NOTE-TOKEN"), false);
    assert.equal(detailText.includes("PHASE4M-EVENT-TOKEN"), false);

    const vendorResult = prescriptionTransactionService.ingestVendorEvent({
      adapterId,
      correlationId: uncertain.correlationId,
      externalEventId: "phase-4m-late-accepted",
      eventType: "accepted",
      state: "accepted",
      transactionId: uncertain.id,
      orderId: uncertain.orderId,
      patientId,
      externalReferenceId: "phase-4m-external-reference",
      metadata: { token: "PHASE4M-VENDOR-TOKEN", statusText: "accepted by vendor" },
    });
    assert.equal(vendorResult.idempotent, false);
    const replay = prescriptionTransactionService.ingestVendorEvent({
      adapterId,
      correlationId: uncertain.correlationId,
      externalEventId: "phase-4m-late-accepted",
      eventType: "accepted",
      state: "accepted",
      transactionId: uncertain.id,
      orderId: uncertain.orderId,
      patientId,
      externalReferenceId: "phase-4m-external-reference",
    });
    assert.equal(replay.idempotent, true);

    const conflictQueue = await prescriptionOperationsService.list(provider);
    const conflictItem = conflictQueue.items.find((item) => item.prescription.transactionId === uncertain.id && item.classification === "evidence_conflict");
    assert.ok(conflictItem, "late verified vendor evidence must keep earlier manual evidence visible even after transport state advances");
    assert.equal(conflictItem.evidenceConflict, true);
    assert.equal(conflictItem.retry.allowed, false);
    assert.equal(conflictItem.retry.code, "evidence_conflict");

    const conflictDetail = await prescriptionOperationsService.detail(conflictItem.id, provider);
    assert.equal(conflictDetail.timeline.some((event) => event.category === "manual_evidence"), true);
    assert.equal(conflictDetail.timeline.some((event) => event.category === "verified_vendor"), true);
    assert.equal(JSON.stringify(conflictDetail).includes("PHASE4M-VENDOR-TOKEN"), false);

    await assert.rejects(
      () => executeClinicalAction({
        action: {
          ...evidenceAction,
          payload: { ...evidenceAction.payload, note: "Stale UI tries a new recovery disposition after vendor resolution" },
        },
        actor: provider,
        context: context("phase-4m-stale-action"),
        expectedPatientId: patientId,
      }),
      /no longer in an ambiguous recoverable transport state/i,
    );

    const medicationCountAfter = Number((db.prepare(
      `SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?`,
    ).get(patientId) as { n: number }).n);
    assert.equal(medicationCountAfter, medicationCountBefore);

    const operationsSource = readFileSync(join(originalCwd, "app", "components", "PrescriptionOperationsWorkspace.tsx"), "utf8");
    const routeSource = readFileSync(join(originalCwd, "app", "api", "prescription-operations", "route.ts"), "utf8");
    assert.match(operationsSource, /prescriptionOperationsApi\.recordEvidence/);
    assert.match(operationsSource, /prescriptionOperationsApi\.retry/);
    assert.doesNotMatch(operationsSource, /PrescriptionTransactionRepository|patient_medications|metadata_json/);
    assert.match(routeSource, /assertPermission\(request\.actor, "manage_integrations"\)/);
  } finally {
    process.chdir(originalCwd);
  }
});
