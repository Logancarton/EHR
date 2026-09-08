import type { PrescriptionTransmissionResult } from "../../adapters";
import {
  sanitizePrescriptionTransactionErrorMessage,
  type NormalizedPrescriptionVendorEvent,
  type PrescriptionDestination,
  type PrescriptionTransaction,
  type PrescriptionTransactionError,
  type PrescriptionTransactionRelationshipSummary,
  type PrescriptionTransactionStatusView,
} from "../../domain/prescription-transactions";
import { assertPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import { getDatabase } from "../db/connection";
import { AuditRepository } from "../repositories/audit-repository";
import { MedicationReconciliationRepository } from "../repositories/medication-reconciliation-repository";
import type { OrderRecord } from "../repositories/order-repository";
import {
  PrescriptionTransactionRepository,
  type TransactionProvenance,
} from "../repositories/prescription-transaction-repository";
import type { ClinicalExecutionContext } from "./clinical-service";

type PrescriptionTransactionDependencies = {
  transactions: typeof PrescriptionTransactionRepository;
  medicationEvidence: typeof MedicationReconciliationRepository;
  audit: typeof AuditRepository;
};

const defaultDependencies: PrescriptionTransactionDependencies = {
  transactions: PrescriptionTransactionRepository,
  medicationEvidence: MedicationReconciliationRepository,
  audit: AuditRepository,
};

function actorProvenance(actor: ProviderContext, context: ClinicalExecutionContext): TransactionProvenance {
  return {
    actorId: actor.userId,
    actorName: providerLabel(actor),
    sourceType: context.source,
    sourceSystem: "ehr-local",
    sourceRef: context.requestId,
  };
}

function vendorProvenance(adapterId: string, externalEventId: string): TransactionProvenance {
  return {
    actorId: `integration:${adapterId}`,
    actorName: `External prescribing adapter (${adapterId})`,
    sourceType: "external-vendor",
    sourceSystem: adapterId,
    sourceRef: externalEventId,
  };
}

function auditActor(actor: ProviderContext) {
  return { userId: actor.userId, userName: providerLabel(actor), userRole: actor.role };
}

function safeError(error: PrescriptionTransactionError | undefined): PrescriptionTransactionError | undefined {
  if (!error) return undefined;
  return { ...error, message: sanitizePrescriptionTransactionErrorMessage(error.message) };
}

function relationshipSummary(transaction: PrescriptionTransaction): PrescriptionTransactionRelationshipSummary {
  return {
    transactionId: transaction.id,
    orderId: transaction.orderId,
    transactionType: transaction.transactionType,
    state: transaction.state,
  };
}

export class PrescriptionTransactionService {
  constructor(private readonly deps: PrescriptionTransactionDependencies = defaultDependencies) {}

  list(patientId: string, actor: ProviderContext) {
    assertPermission(actor, "read_clinical");
    return this.deps.transactions.listByPatient(patientId);
  }

  events(transactionId: string, patientId: string, actor: ProviderContext) {
    assertPermission(actor, "read_clinical");
    const transaction = this.deps.transactions.getById(transactionId);
    if (!transaction) throw new Error(`Prescription transaction not found: ${transactionId}`);
    if (transaction.patientId !== patientId) {
      throw new Error(`Patient binding mismatch: transaction ${transactionId} belongs to ${transaction.patientId}, not ${patientId}.`);
    }
    return this.deps.transactions.listEvents(transactionId);
  }

  private statusView(transaction: PrescriptionTransaction): PrescriptionTransactionStatusView {
    const related = transaction.relatedTransactionId
      ? this.deps.transactions.getById(transaction.relatedTransactionId)
      : null;
    const linked = this.deps.transactions.listRelated(transaction.id);
    const recentEvents = this.deps.transactions.listEvents(transaction.id).slice(-12).map((event) => ({
      eventId: event.id,
      eventRef: `prescription-transaction/${transaction.id}/event/${event.id}`,
      direction: event.direction,
      eventType: event.eventType,
      state: event.state,
      externalEventId: event.externalEventId,
      externalReferenceId: event.externalReferenceId,
      occurredAt: event.occurredAt,
      receivedAt: event.receivedAt,
      sourceSystem: event.sourceSystem,
      evidenceCandidateId: event.evidenceCandidateId,
    }));

    return {
      transactionId: transaction.id,
      patientId: transaction.patientId,
      orderId: transaction.orderId,
      transactionType: transaction.transactionType,
      state: transaction.state,
      attemptCount: transaction.attemptCount,
      relatedTransactionId: transaction.relatedTransactionId,
      relatedTransaction: related ? relationshipSummary(related) : undefined,
      linkedTransactions: linked.map(relationshipSummary),
      externalReferenceId: transaction.externalReferenceId,
      submittedAt: transaction.submittedAt,
      acknowledgedAt: transaction.acknowledgedAt,
      failedAt: transaction.failedAt,
      canceledAt: transaction.canceledAt,
      lastError: transaction.lastError,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      source: {
        transactionRef: `prescription-transaction/${transaction.id}`,
        sourceType: transaction.sourceType,
        sourceRef: transaction.sourceRef,
      },
      recentEvents,
      medicationTruthChanged: false,
    };
  }

  status(transactionId: string, patientId: string, actor: ProviderContext): PrescriptionTransactionStatusView {
    assertPermission(actor, "read_clinical");
    const transaction = this.deps.transactions.getById(transactionId);
    if (!transaction) throw new Error(`Prescription transaction not found: ${transactionId}`);
    if (transaction.patientId !== patientId) {
      throw new Error(`Patient binding mismatch: transaction ${transactionId} belongs to ${transaction.patientId}, not ${patientId}.`);
    }
    return this.statusView(transaction);
  }

  listStatus(patientId: string, actor: ProviderContext): PrescriptionTransactionStatusView[] {
    assertPermission(actor, "read_clinical");
    return this.deps.transactions.listByPatient(patientId).map((transaction) => this.statusView(transaction));
  }

  getLatestForOrder(orderId: string): PrescriptionTransaction | undefined {
    return this.deps.transactions.getByOrder(orderId)[0];
  }

  requestCancellation(
    targetTransactionId: string,
    reason: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): { transaction: PrescriptionTransaction; idempotent: boolean } {
    if (context.source === "ai") {
      throw new Error("AI may propose prescription cancellation but cannot create, submit, or retry cancellation transactions.");
    }
    assertPermission(actor, "transmit_order");
    const target = this.deps.transactions.getById(targetTransactionId);
    if (!target) throw new Error(`Prescription transaction not found: ${targetTransactionId}`);
    if (target.transactionType !== "new_rx") {
      throw new Error(`Phase 4G cancellation must target an original new_rx transaction, not ${target.transactionType}.`);
    }
    if (!["submitted", "acknowledged", "accepted"].includes(target.state)) {
      throw new Error(`Prescription transaction ${target.id} cannot be canceled from transport state ${target.state}.`);
    }

    const safeReason = sanitizePrescriptionTransactionErrorMessage(reason).trim().slice(0, 500);
    if (!safeReason) throw new Error("Prescription cancellation reason is required.");

    const provenance = actorProvenance(actor, context);
    const db = getDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const cancellation = this.deps.transactions.getOrCreateOutbound({
        orderId: target.orderId,
        patientId: target.patientId,
        adapterId: target.adapterId,
        vendorName: target.vendorName,
        transactionType: "cancel_rx",
        destination: target.destination,
        relatedTransactionId: target.id,
        initialState: "cancellation_requested",
        idempotencyKey: `prescription:${target.orderId}:cancel:${target.id}`,
        createdBy: providerLabel(actor),
        sourceType: context.source,
        sourceRef: context.requestId,
      }, provenance);
      const recorded = this.deps.transactions.recordEvent({
        transaction: cancellation,
        eventKey: `local:${cancellation.id}:cancellation-requested`,
        direction: "internal",
        eventType: "cancellation_requested",
        state: "cancellation_requested",
        metadata: {
          relatedTransactionId: target.id,
          targetExternalReferenceId: target.externalReferenceId,
          reason: safeReason,
          medicationTruthChanged: false,
        },
        sourceSystem: "ehr-local",
      }, provenance);

      if (recorded.created) {
        this.deps.audit.log({
          ...auditActor(actor),
          eventType: "prescription_cancellation_requested",
          patientId: target.patientId,
          description: `Requested cancellation of prescription transaction ${target.id}.`,
          metadata: {
            cancellationTransactionId: cancellation.id,
            targetTransactionId: target.id,
            orderId: target.orderId,
            reason: safeReason,
            source: context.source,
            requestId: context.requestId,
            medicationTruthChanged: false,
          },
        });
      }
      db.exec("COMMIT");
      return { transaction: cancellation, idempotent: !recorded.created };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  prepareCancellationAttempt(
    transactionId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): PrescriptionTransaction {
    if (context.source === "ai") {
      throw new Error("AI cannot create, submit, or retry prescription cancellation transactions.");
    }
    assertPermission(actor, "transmit_order");
    const current = this.deps.transactions.getById(transactionId);
    if (!current) throw new Error(`Prescription transaction not found: ${transactionId}`);
    if (current.transactionType !== "cancel_rx" || !current.relatedTransactionId) {
      throw new Error(`Prescription transaction ${transactionId} is not a linked cancellation transaction.`);
    }

    const provenance = actorProvenance(actor, context);
    const db = getDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const attempt = this.deps.transactions.startAttempt(transactionId, provenance);
      this.deps.transactions.recordEvent({
        transaction: attempt,
        eventKey: `local:${attempt.id}:attempt:${attempt.attemptCount}:prepared`,
        direction: "internal",
        eventType: "cancellation_attempt_prepared",
        state: "prepared",
        metadata: {
          relatedTransactionId: attempt.relatedTransactionId,
          attempt: attempt.attemptCount,
          medicationTruthChanged: false,
        },
        sourceSystem: "ehr-local",
      }, provenance);
      this.deps.audit.log({
        ...auditActor(actor),
        eventType: "prescription_transaction_prepared",
        patientId: attempt.patientId,
        description: `Prepared cancellation attempt for prescription transaction ${attempt.relatedTransactionId}.`,
        metadata: {
          transactionId: attempt.id,
          relatedTransactionId: attempt.relatedTransactionId,
          orderId: attempt.orderId,
          adapterId: attempt.adapterId,
          attempt: attempt.attemptCount,
          correlationId: attempt.correlationId,
          medicationTruthChanged: false,
        },
      });
      db.exec("COMMIT");
      return attempt;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  recordCancellationSubmitted(
    transactionId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): PrescriptionTransaction {
    const provenance = actorProvenance(actor, context);
    const db = getDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.deps.transactions.getById(transactionId);
      if (!current || current.transactionType !== "cancel_rx") {
        throw new Error(`Cancellation transaction not found: ${transactionId}`);
      }
      const submitted = this.deps.transactions.transitionState(transactionId, "submitted", {}, provenance);
      this.deps.transactions.recordEvent({
        transaction: submitted,
        eventKey: `local:${submitted.id}:attempt:${submitted.attemptCount}:cancellation-submitted`,
        direction: "outbound",
        eventType: "cancellation_submitted",
        state: "submitted",
        metadata: {
          relatedTransactionId: submitted.relatedTransactionId,
          attempt: submitted.attemptCount,
          medicationTruthChanged: false,
        },
        sourceSystem: submitted.adapterId,
      }, provenance);
      this.deps.audit.log({
        ...auditActor(actor),
        eventType: "prescription_cancellation_submitted",
        patientId: submitted.patientId,
        description: `Submitted cancellation transaction ${submitted.id}.`,
        metadata: {
          transactionId: submitted.id,
          targetTransactionId: submitted.relatedTransactionId,
          orderId: submitted.orderId,
          adapterId: submitted.adapterId,
          attempt: submitted.attemptCount,
          transportState: submitted.state,
          medicationTruthChanged: false,
        },
      });
      db.exec("COMMIT");
      return submitted;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  recordCancellationFailure(
    transactionId: string,
    error: Error,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): PrescriptionTransaction {
    const provenance = actorProvenance(actor, context);
    const safeMessage = sanitizePrescriptionTransactionErrorMessage(error.message);
    const db = getDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.deps.transactions.getById(transactionId);
      if (!current || current.transactionType !== "cancel_rx") {
        throw new Error(`Cancellation transaction not found: ${transactionId}`);
      }
      const failed = this.deps.transactions.transitionState(transactionId, "failed", {
        error: { message: safeMessage },
      }, provenance);
      this.deps.transactions.recordEvent({
        transaction: failed,
        eventKey: `local:${failed.id}:attempt:${failed.attemptCount}:cancellation-failed`,
        direction: "outbound",
        eventType: "cancellation_failed",
        state: "failed",
        error: { message: safeMessage },
        metadata: {
          relatedTransactionId: failed.relatedTransactionId,
          attempt: failed.attemptCount,
          medicationTruthChanged: false,
        },
        sourceSystem: failed.adapterId,
      }, provenance);
      this.deps.audit.log({
        ...auditActor(actor),
        eventType: "prescription_cancellation_failed",
        patientId: failed.patientId,
        description: `Cancellation transaction ${failed.id} failed during outbound submission.`,
        metadata: {
          transactionId: failed.id,
          targetTransactionId: failed.relatedTransactionId,
          orderId: failed.orderId,
          adapterId: failed.adapterId,
          attempt: failed.attemptCount,
          error: safeMessage,
          medicationTruthChanged: false,
        },
      });
      db.exec("COMMIT");
      return failed;
    } catch (failure) {
      db.exec("ROLLBACK");
      throw failure;
    }
  }

  prepareOutbound(
    order: OrderRecord,
    adapter: { id: string; name: string },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): PrescriptionTransaction {
    if (context.source === "ai") {
      throw new Error("AI may inspect prescription transaction state but cannot create or transmit prescription transactions.");
    }
    if (order.type !== "medication") throw new Error(`Order ${order.id} is not a medication prescription.`);
    if (order.status !== "authorized" && order.status !== "transmission_failed") {
      throw new Error(`Prescription ${order.id} must be authorized before preparing an external transaction.`);
    }

    const destination: PrescriptionDestination = {
      pharmacyName: order.details?.pharmacy?.name,
      ncpdpId: order.details?.pharmacy?.ncpdpId,
    };
    const provenance = actorProvenance(actor, context);
    const db = getDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const transaction = this.deps.transactions.getOrCreateOutbound({
        orderId: order.id,
        patientId: order.patientId,
        adapterId: adapter.id,
        vendorName: adapter.name,
        transactionType: "new_rx",
        destination,
        idempotencyKey: `prescription:${order.id}:new_rx`,
        createdBy: providerLabel(actor),
        sourceType: context.source,
        sourceRef: context.requestId,
      }, provenance);
      const attempt = this.deps.transactions.startAttempt(transaction.id, provenance);
      this.deps.transactions.recordEvent({
        transaction: attempt,
        eventKey: `local:${attempt.id}:attempt:${attempt.attemptCount}:prepared`,
        direction: "internal",
        eventType: "attempt_prepared",
        state: "prepared",
        metadata: { source: context.source, requestId: context.requestId },
        sourceSystem: "ehr-local",
      }, provenance);
      this.deps.audit.log({
        ...auditActor(actor),
        eventType: "prescription_transaction_prepared",
        patientId: order.patientId,
        description: `Prepared external prescription transaction for order ${order.id}.`,
        metadata: {
          transactionId: attempt.id,
          orderId: order.id,
          adapterId: adapter.id,
          attempt: attempt.attemptCount,
          correlationId: attempt.correlationId,
          source: context.source,
          requestId: context.requestId,
        },
      });
      db.exec("COMMIT");
      return attempt;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  recordSubmitted(
    transactionId: string,
    receipt: PrescriptionTransmissionResult,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): PrescriptionTransaction {
    const provenance = actorProvenance(actor, context);
    const db = getDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      if (!this.deps.transactions.getById(transactionId)) {
        throw new Error(`Prescription transaction not found: ${transactionId}`);
      }
      const submitted = this.deps.transactions.transitionState(transactionId, "submitted", {
        externalReferenceId: receipt.transmissionId,
      }, provenance);
      this.deps.transactions.recordEvent({
        transaction: submitted,
        eventKey: `local:${submitted.id}:attempt:${submitted.attemptCount}:submitted`,
        direction: "outbound",
        eventType: "submitted",
        state: "submitted",
        externalReferenceId: receipt.transmissionId,
        metadata: {
          vendor: receipt.vendor,
          standard: receipt.standard,
          transmittedCount: receipt.transmittedCount,
          pharmacyRouting: receipt.pharmacyRouting,
          warnings: receipt.warnings,
          epcsVerified: receipt.epcsVerified,
        },
        sourceSystem: submitted.adapterId,
      }, provenance);
      this.deps.audit.log({
        ...auditActor(actor),
        eventType: "prescription_transaction_submitted",
        patientId: submitted.patientId,
        description: `Recorded submission of prescription transaction ${submitted.id}.`,
        metadata: {
          transactionId: submitted.id,
          orderId: submitted.orderId,
          adapterId: submitted.adapterId,
          externalReferenceId: submitted.externalReferenceId,
          attempt: submitted.attemptCount,
          transportState: submitted.state,
          medicationTruthChanged: false,
        },
      });
      db.exec("COMMIT");
      return submitted;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  recordFailure(
    transactionId: string,
    error: Error,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): PrescriptionTransaction {
    const provenance = actorProvenance(actor, context);
    const safeMessage = sanitizePrescriptionTransactionErrorMessage(error.message);
    const normalizedError = { message: safeMessage };
    const db = getDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.deps.transactions.getById(transactionId);
      if (!current) throw new Error(`Prescription transaction not found: ${transactionId}`);
      const failed = this.deps.transactions.transitionState(transactionId, "failed", {
        error: normalizedError,
      }, provenance);
      this.deps.transactions.recordEvent({
        transaction: failed,
        eventKey: `local:${failed.id}:attempt:${failed.attemptCount}:failed`,
        direction: "outbound",
        eventType: "failed",
        state: "failed",
        error: normalizedError,
        metadata: { attempt: failed.attemptCount },
        sourceSystem: failed.adapterId,
      }, provenance);
      this.deps.audit.log({
        ...auditActor(actor),
        eventType: "prescription_transaction_failed",
        patientId: failed.patientId,
        description: `Prescription transaction ${failed.id} failed during outbound transmission.`,
        metadata: {
          transactionId: failed.id,
          orderId: failed.orderId,
          adapterId: failed.adapterId,
          attempt: failed.attemptCount,
          error: safeMessage,
          medicationTruthChanged: false,
        },
      });
      db.exec("COMMIT");
      return failed;
    } catch (failure) {
      db.exec("ROLLBACK");
      throw failure;
    }
  }

  /**
   * Ingest only adapter-normalized events after a future adapter has authenticated/verified
   * its callback. No HTTP webhook is exposed in this phase. correlationId is authoritative;
   * vendor patient/order IDs can only make the event fail closed, never reroute it.
   */
  ingestVendorEvent(input: NormalizedPrescriptionVendorEvent) {
    if (!input.adapterId || !input.correlationId || !input.externalEventId) {
      throw new Error("Normalized prescription vendor event is missing adapter/correlation/event identity.");
    }
    const provenance = vendorProvenance(input.adapterId, input.externalEventId);
    const eventKey = `vendor:${input.adapterId}:${input.externalEventId}`;
    const normalizedError = safeError(input.error);
    const db = getDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const transaction = this.deps.transactions.getByCorrelationId(input.correlationId);
      if (!transaction) throw new Error(`Prescription transaction correlation not found: ${input.correlationId}`);
      if (transaction.adapterId !== input.adapterId) {
        throw new Error(`Prescription vendor event adapter mismatch for transaction ${transaction.id}.`);
      }
      if (input.transactionId && input.transactionId !== transaction.id) {
        throw new Error(`Prescription vendor event transaction identifier mismatch for ${transaction.id}.`);
      }
      if (input.orderId && input.orderId !== transaction.orderId) {
        throw new Error(`Prescription vendor event order identifier mismatch for ${transaction.id}.`);
      }
      if (input.patientId && input.patientId !== transaction.patientId) {
        throw new Error(`Prescription vendor event patient identifier mismatch for ${transaction.id}.`);
      }
      if (
        transaction.transactionType === "cancel_rx" &&
        !["cancellation_acknowledged", "canceled", "failed", "rejected"].includes(input.state)
      ) {
        throw new Error(`Cancellation transaction ${transaction.id} cannot accept external state ${input.state}.`);
      }

      const replay = this.deps.transactions.getEventByKey(eventKey);
      if (replay) {
        if (replay.transactionId !== transaction.id) {
          throw new Error(`Prescription vendor event ${input.externalEventId} is already bound to another transaction.`);
        }
        db.exec("COMMIT");
        return { transaction, event: replay, idempotent: true };
      }

      let evidenceCandidateId: string | undefined;
      if (input.medicationEvidence) {
        const evidence = input.medicationEvidence;
        const candidate = this.deps.medicationEvidence.record({
          patientId: transaction.patientId,
          sourceType: "external-vendor",
          sourceSystem: input.adapterId,
          sourceRef: `prescription-transaction/${transaction.id}/vendor-event/${input.adapterId}/${input.externalEventId}`,
          evidenceType: evidence.evidenceType,
          displayText: evidence.displayText,
          medicationName: evidence.medicationName,
          genericName: evidence.genericName,
          strength: evidence.strength,
          dose: evidence.dose,
          route: evidence.route,
          frequency: evidence.frequency,
          startDate: evidence.startDate,
          endDate: evidence.endDate,
          prescriber: evidence.prescriber,
          observedAt: evidence.observedAt || input.occurredAt,
        }, {
          userId: provenance.actorId,
          displayName: provenance.actorName,
        });
        evidenceCandidateId = candidate.id;
      }

      const next = this.deps.transactions.transitionState(transaction.id, input.state, {
        externalReferenceId: input.externalReferenceId,
        error: normalizedError,
      }, provenance);
      const { event } = this.deps.transactions.recordEvent({
        transaction: next,
        eventKey,
        direction: "inbound",
        eventType: input.eventType,
        state: input.state,
        externalEventId: input.externalEventId,
        externalReferenceId: input.externalReferenceId,
        metadata: input.metadata,
        error: normalizedError,
        occurredAt: input.occurredAt,
        sourceSystem: input.adapterId,
        evidenceCandidateId,
      }, provenance);

      this.deps.audit.log({
        userId: provenance.actorId,
        userName: provenance.actorName,
        userRole: "integration",
        eventType: "prescription_transaction_event_ingested",
        patientId: next.patientId,
        description: `Normalized external prescription event ${input.eventType} for transaction ${next.id}.`,
        metadata: {
          transactionId: next.id,
          orderId: next.orderId,
          adapterId: input.adapterId,
          externalEventId: input.externalEventId,
          transportState: next.state,
          error: normalizedError?.message,
          evidenceCandidateId: event.evidenceCandidateId,
          medicationTruthChanged: false,
        },
      });
      db.exec("COMMIT");
      return { transaction: next, event, idempotent: false };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export const prescriptionTransactionService = new PrescriptionTransactionService();
