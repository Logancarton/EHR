import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Phase 4N composes patient prescribing workflow without creating a second authority model", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-phase-4n-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { getDatabase },
      { defaultPrescribingAdapter },
      { OrderRepository },
      { PrescriptionTransactionRepository },
      { patientPrescribingWorkspaceService },
      { prescriptionChangeRequestService },
      { integrationConfigurationService },
      { executeClinicalAction },
    ] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/adapters"),
      import("../app/server/repositories/order-repository"),
      import("../app/server/repositories/prescription-transaction-repository"),
      import("../app/server/services/patient-prescribing-workspace-service"),
      import("../app/server/services/prescription-change-request-service"),
      import("../app/server/services/integration-configuration-service"),
      import("../app/server/actions/clinical-action-gateway"),
    ]);

    const db = getDatabase();
    const provider = {
      userId: "phase-4n-provider",
      displayName: "Synthetic Prescribing Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const staff = {
      userId: "phase-4n-staff",
      displayName: "Synthetic Prescribing Staff",
      role: "staff" as const,
    };
    const patientId = "phase-4n-patient";
    const otherPatientId = "phase-4n-other-patient";
    const at = new Date().toISOString();
    const context = (requestId: string) => ({ source: "api" as const, requestId });
    const provenance = {
      actorId: provider.userId,
      actorName: provider.displayName,
      sourceType: "api",
      sourceSystem: "ehr-test",
      sourceRef: "phase-4n",
    };

    function insertPatient(id: string, mrn: string) {
      db.prepare(`INSERT INTO patients (
        id, name, dob, age, mrn, status, pronouns, initials, alert,
        allergies_json, diagnoses_json, meds_json, vitals_json,
        last_visit, next_visit, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', '[]', '[]', '{}', ?, ?, ?, ?)`)
        .run(id, `Synthetic ${id}`, "01/01/1990", 36, mrn, "Established", "they/them", "PN", "Initial", "4 weeks", at, at);
    }

    insertPatient(patientId, "PHASE4N-001");
    insertPatient(otherPatientId, "PHASE4N-002");

    integrationConfigurationService.save({
      id: "phase-4n-prescribing",
      adapterId: defaultPrescribingAdapter.id,
      purpose: "prescribing",
      environment: "test",
      enabled: true,
      nonSecretConfig: { endpointLabel: "synthetic" },
      secretRefs: {},
    }, provider);

    function stage(orderId: string, medication: string) {
      return OrderRepository.stageOrder({
        id: orderId,
        patientId,
        type: "medication",
        name: medication,
        details: {
          medication,
          medicationName: medication,
          strength: "10 mg",
          dose: "10 mg",
          route: "oral",
          frequency: "daily",
          dispenseQuantity: 30,
          daysSupply: 30,
          refills: 1,
          sig: "Take one tablet by mouth daily",
          pharmacy: { name: "Synthetic Pharmacy", ncpdpId: "0000000" },
          apiToken: "PHASE4N-ORDER-SECRET-NEVER-EXPOSE",
        },
        orderedBy: provider.displayName,
      });
    }

    function authorize(orderId: string) {
      const authorized = OrderRepository.authorize(orderId, provider.displayName, {});
      assert.ok(authorized);
      return authorized;
    }

    function transaction(orderId: string, state: "submitted" | "accepted" | "failed" | "outcome_uncertain", key: string) {
      return PrescriptionTransactionRepository.getOrCreateOutbound({
        orderId,
        patientId,
        adapterId: defaultPrescribingAdapter.id,
        vendorName: defaultPrescribingAdapter.name,
        transactionType: "new_rx",
        destination: { pharmacyName: "Synthetic Pharmacy", ncpdpId: "0000000" },
        initialState: state,
        idempotencyKey: `phase-4n:${key}`,
        createdBy: provider.displayName,
        sourceType: "api",
        sourceRef: "phase-4n-test",
      }, provenance);
    }

    const staged = stage("phase-4n-staged", "Stagedoxetine");
    const initial = await patientPrescribingWorkspaceService.project(patientId, provider);
    const stagedItem = initial.sections.flatMap((section) => section.items).find((item) => item.orderId === staged.id);
    assert.ok(stagedItem);
    assert.equal(stagedItem.group, "ready_to_authorize");
    assert.equal(stagedItem.displayStatus, "Ready to authorize");
    assert.equal(stagedItem.actions.find((action) => action.id === "authorize")?.allowed, true);

    const staffProjection = await patientPrescribingWorkspaceService.project(patientId, staff);
    const staffStaged = staffProjection.sections.flatMap((section) => section.items).find((item) => item.orderId === staged.id);
    assert.ok(staffStaged);
    assert.equal(staffStaged.actions.find((action) => action.id === "authorize")?.allowed, false);
    assert.match(staffStaged.actions.find((action) => action.id === "authorize")?.reason || "", /authorization authority/i);

    await assert.rejects(
      () => executeClinicalAction({
        action: { type: "authorize_order", payload: { orderId: staged.id } },
        actor: provider,
        context: context("phase-4n-wrong-patient"),
        expectedPatientId: otherPatientId,
      }),
      /patient binding mismatch/i,
    );
    await assert.rejects(
      () => executeClinicalAction({
        action: { type: "authorize_order", payload: { orderId: staged.id } },
        actor: staff,
        context: context("phase-4n-staff-authorize"),
        expectedPatientId: patientId,
      }),
      /lacks permission: authorize_order/i,
    );

    authorize(staged.id);
    const authorizedProjection = await patientPrescribingWorkspaceService.project(patientId, provider);
    const authorizedItem = authorizedProjection.sections.flatMap((section) => section.items).find((item) => item.orderId === staged.id);
    assert.ok(authorizedItem);
    assert.equal(authorizedItem.group, "ready_to_send");
    assert.equal(authorizedItem.actions.find((action) => action.id === "transmit")?.allowed, true);
    assert.equal(authorizedItem.medicationTruth.confirmed, false);

    const medicationCountBeforeTransport = Number((db.prepare(
      `SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?`,
    ).get(patientId) as { n: number }).n);

    const transmittedOrder = stage("phase-4n-transmitted", "Transmitadine");
    authorize(transmittedOrder.id);
    const transmittedTx = transaction(transmittedOrder.id, "accepted", "transmitted");
    OrderRepository.markTransmitted(transmittedOrder.id, { success: true, transmissionId: "phase-4n-transmitted", vendor: "synthetic" });
    const transmittedProjection = await patientPrescribingWorkspaceService.project(patientId, provider);
    const transmittedItem = transmittedProjection.sections.flatMap((section) => section.items).find((item) => item.orderId === transmittedOrder.id);
    assert.ok(transmittedItem);
    assert.equal(transmittedItem.group, "completed_historical");
    assert.equal(transmittedItem.medicationTruth.confirmed, false);
    assert.equal(transmittedItem.medicationTruth.changedByPrescriptionActivity, false);

    const uncertainOrder = stage("phase-4n-uncertain", "Uncertainol");
    authorize(uncertainOrder.id);
    const uncertainTx = transaction(uncertainOrder.id, "outcome_uncertain", "uncertain");
    OrderRepository.markTransmissionUncertain(uncertainOrder.id, "synthetic uncertain result");
    const uncertainProjection = await patientPrescribingWorkspaceService.project(patientId, provider);
    const uncertainItem = uncertainProjection.sections.flatMap((section) => section.items).find((item) => item.orderId === uncertainOrder.id);
    assert.ok(uncertainItem);
    assert.equal(uncertainItem.group, "needs_operational_review");
    assert.equal(uncertainItem.displayStatus, "Outcome unknown — review required");
    assert.equal(uncertainItem.actions.find((action) => action.id === "retry_transmission")?.allowed, false);
    assert.equal(uncertainItem.actions.find((action) => action.id === "record_recovery_evidence")?.allowed, true);

    const evidenceAction = {
      type: "record_prescription_recovery_evidence" as const,
      payload: {
        transactionId: uncertainTx.id,
        disposition: "confirmed_not_received" as const,
        evidenceSource: "pharmacy phone confirmation token=PHASE4N-EVIDENCE-SECRET",
        note: "Pharmacy confirms no receipt; token=PHASE4N-NOTE-SECRET",
      },
    };
    const evidence = await executeClinicalAction({
      action: evidenceAction,
      actor: provider,
      context: context("phase-4n-recovery"),
      expectedPatientId: patientId,
    }) as any;
    assert.equal(evidence.idempotent, false);
    const evidenceReplay = await executeClinicalAction({
      action: evidenceAction,
      actor: provider,
      context: context("phase-4n-recovery-replay"),
      expectedPatientId: patientId,
    }) as any;
    assert.equal(evidenceReplay.idempotent, true);
    const retryProjection = await patientPrescribingWorkspaceService.project(patientId, provider);
    const retryItem = retryProjection.sections.flatMap((section) => section.items).find((item) => item.orderId === uncertainOrder.id);
    assert.ok(retryItem);
    assert.equal(retryItem.actions.find((action) => action.id === "retry_transmission")?.allowed, true);

    const failedOrder = stage("phase-4n-failed", "Failuramine");
    authorize(failedOrder.id);
    transaction(failedOrder.id, "failed", "failed");
    OrderRepository.markTransmissionFailed(failedOrder.id, "synthetic confirmed failure token=PHASE4N-FAILURE-SECRET");
    const failedProjection = await patientPrescribingWorkspaceService.project(patientId, provider);
    const failedItem = failedProjection.sections.flatMap((section) => section.items).find((item) => item.orderId === failedOrder.id);
    assert.ok(failedItem);
    assert.equal(failedItem.group, "needs_operational_review");
    assert.equal(failedItem.actions.find((action) => action.id === "retry_transmission")?.allowed, true);

    const refillResult = await executeClinicalAction({
      action: {
        type: "request_prescription_refill",
        payload: {
          transactionId: transmittedTx.id,
          requestSource: "pharmacy",
          sourceReference: "phase-4n-refill",
          note: "refill note secret=PHASE4N-REFILL-SECRET",
        },
      },
      actor: provider,
      context: context("phase-4n-refill"),
      expectedPatientId: patientId,
    }) as any;
    const refillProjection = await patientPrescribingWorkspaceService.project(patientId, provider);
    const refillItem = refillProjection.sections.flatMap((section) => section.items).find((item) => item.orderId === transmittedOrder.id);
    assert.ok(refillItem);
    assert.equal(refillItem.group, "needs_provider_action");
    const renewAction = refillItem.actions.find((action) => action.id === "renew_refill" && action.targetId === refillResult.request.id);
    assert.equal(renewAction?.allowed, true);

    const renewal = await executeClinicalAction({
      action: { type: "renew_prescription", payload: { refillRequestId: refillResult.request.id } },
      actor: provider,
      context: context("phase-4n-renew"),
      expectedPatientId: patientId,
    }) as any;
    assert.notEqual(renewal.order.id, transmittedOrder.id);
    assert.equal(renewal.order.status, "staged");
    assert.equal(OrderRepository.getById(transmittedOrder.id)?.status, "transmitted");
    const renewalReplay = await executeClinicalAction({
      action: { type: "renew_prescription", payload: { refillRequestId: refillResult.request.id } },
      actor: provider,
      context: context("phase-4n-renew-replay"),
      expectedPatientId: patientId,
    }) as any;
    assert.equal(renewalReplay.idempotent, true);
    assert.equal(renewalReplay.order.id, renewal.order.id);

    const changeSource = stage("phase-4n-change-source", "Changemycin");
    authorize(changeSource.id);
    const changeTx = transaction(changeSource.id, "accepted", "change-source");
    OrderRepository.markTransmitted(changeSource.id, { success: true, transmissionId: "phase-4n-change", vendor: "synthetic" });
    const change = prescriptionChangeRequestService.recordChangeRequest({
      sourceTransactionId: changeTx.id,
      adapterId: defaultPrescribingAdapter.id,
      externalRequestId: "phase-4n-change-request",
      category: "strength",
      requestedChanges: { strength: "20 mg", dose: "20 mg", sig: "Take one tablet by mouth daily" },
      summary: "Normalized request token=PHASE4N-CHANGE-SUMMARY-SECRET",
      sourceReference: "phase-4n-change-source",
    });
    const changeProjection = await patientPrescribingWorkspaceService.project(patientId, provider);
    const changeItem = changeProjection.sections.flatMap((section) => section.items).find((item) => item.orderId === changeSource.id);
    assert.ok(changeItem);
    assert.equal(changeItem.group, "needs_provider_action");
    assert.equal(changeItem.actions.find((action) => action.id === "accept_change" && action.targetId === change.request.id)?.allowed, true);

    const acceptedChange = await executeClinicalAction({
      action: { type: "respond_to_prescription_change_request", payload: { changeRequestId: change.request.id, decision: "accept" } },
      actor: provider,
      context: context("phase-4n-change-accept"),
      expectedPatientId: patientId,
    }) as any;
    assert.ok(acceptedChange.order);
    assert.notEqual(acceptedChange.order.id, changeSource.id);
    assert.equal(acceptedChange.order.status, "staged");
    assert.equal(OrderRepository.getById(changeSource.id)?.status, "transmitted");
    const acceptedChangeReplay = await executeClinicalAction({
      action: { type: "respond_to_prescription_change_request", payload: { changeRequestId: change.request.id, decision: "accept" } },
      actor: provider,
      context: context("phase-4n-change-accept-replay"),
      expectedPatientId: patientId,
    }) as any;
    assert.equal(acceptedChangeReplay.idempotent, true);
    assert.equal(acceptedChangeReplay.order.id, acceptedChange.order.id);

    const cancelSource = stage("phase-4n-cancel-source", "Cancelstatin");
    authorize(cancelSource.id);
    const cancelTx = transaction(cancelSource.id, "accepted", "cancel-source");
    OrderRepository.markTransmitted(cancelSource.id, { success: true, transmissionId: "phase-4n-cancel", vendor: "synthetic" });
    const cancellation = PrescriptionTransactionRepository.getOrCreateOutbound({
      orderId: cancelSource.id,
      patientId,
      adapterId: defaultPrescribingAdapter.id,
      vendorName: defaultPrescribingAdapter.name,
      transactionType: "cancel_rx",
      relatedTransactionId: cancelTx.id,
      destination: { pharmacyName: "Synthetic Pharmacy", ncpdpId: "0000000" },
      initialState: "cancellation_requested",
      idempotencyKey: `phase-4n:cancel:${cancelTx.id}`,
      createdBy: provider.displayName,
      sourceType: "api",
      sourceRef: "phase-4n-cancellation-projection-fixture",
    }, provenance);
    assert.notEqual(cancellation.id, cancelTx.id);
    assert.equal(cancellation.relatedTransactionId, cancelTx.id);
    assert.equal(PrescriptionTransactionRepository.getById(cancelTx.id)?.transactionType, "new_rx");
    const cancellationProjection = await patientPrescribingWorkspaceService.project(patientId, provider);
    const cancellationItem = cancellationProjection.sections.flatMap((section) => section.items).find((item) => item.orderId === cancelSource.id);
    assert.ok(cancellationItem);
    assert.equal(cancellationItem.cancellationLineage.some((item) => item.targetTransactionId === cancelTx.id), true);
    assert.equal(cancellationItem.group, "awaiting_external_outcome");

    const medicationCountAfterTransport = Number((db.prepare(
      `SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?`,
    ).get(patientId) as { n: number }).n);
    assert.equal(medicationCountAfterTransport, medicationCountBeforeTransport, "transport/refill/change/cancel/recovery must not mutate medication truth");

    const truthResult = await executeClinicalAction({
      action: { type: "confirm_prescription_medication_truth", payload: { orderId: staged.id, operation: "add" } },
      actor: provider,
      context: context("phase-4n-truth-confirm"),
      expectedPatientId: patientId,
    }) as any;
    assert.equal(truthResult.patient_id, patientId);
    const medicationCountAfterConfirmation = Number((db.prepare(
      `SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?`,
    ).get(patientId) as { n: number }).n);
    assert.equal(medicationCountAfterConfirmation, medicationCountBeforeTransport + 1);
    const truthProjection = await patientPrescribingWorkspaceService.project(patientId, provider);
    const truthItem = truthProjection.sections.flatMap((section) => section.items).find((item) => item.orderId === staged.id);
    assert.ok(truthItem);
    assert.equal(truthItem.medicationTruth.confirmed, true);
    assert.equal(truthItem.actions.find((action) => action.id === "confirm_medication_truth")?.allowed, false);

    const projectionText = JSON.stringify(truthProjection);
    for (const forbidden of [
      "PHASE4N-ORDER-SECRET-NEVER-EXPOSE",
      "PHASE4N-EVIDENCE-SECRET",
      "PHASE4N-NOTE-SECRET",
      "PHASE4N-FAILURE-SECRET",
      "PHASE4N-REFILL-SECRET",
      "PHASE4N-CHANGE-SUMMARY-SECRET",
      "secretRefs",
      "idempotencyKey",
      "metadata_json",
      "rawPayload",
    ]) {
      assert.equal(projectionText.includes(forbidden), false, `patient prescribing projection leaked ${forbidden}`);
    }

    assert.deepEqual(
      truthProjection.sections.map((section) => section.group),
      ["needs_provider_action", "ready_to_authorize", "ready_to_send", "awaiting_external_outcome", "needs_operational_review", "completed_historical"],
    );
    assert.equal(truthProjection.medicationTruthBoundary, "Prescription activity never changes the clinical medication record without explicit confirmation.");

    const componentSource = readFileSync(join(originalCwd, "app", "components", "patient", "PatientPrescriptionWork.tsx"), "utf8");
    const serviceSource = readFileSync(join(originalCwd, "app", "server", "services", "patient-prescribing-workspace-service.ts"), "utf8");
    const routeSource = readFileSync(join(originalCwd, "app", "api", "patient-prescribing-workspace", "route.ts"), "utf8");
    assert.match(componentSource, /action\.allowed/);
    assert.match(componentSource, /PatientPrescriptionWorkItem/);
    assert.doesNotMatch(componentSource, /OrderRepository|PrescriptionTransactionRepository|patient_medications|metadata_json/);
    assert.match(serviceSource, /hasPermission\(actor, "authorize_order"\)/);
    assert.match(serviceSource, /hasPermission\(actor, "transmit_order"\)/);
    assert.doesNotMatch(serviceSource, /callback_payload|raw_payload|secretRefs/);
    assert.match(routeSource, /requestedPatientId !== patientId/);
  } finally {
    process.chdir(originalCwd);
  }
});