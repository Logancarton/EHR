import { sanitizePrescriptionTransactionErrorMessage, type PrescriptionTransaction } from "../../domain/prescription-transactions";
import { providerLabel, type ProviderContext } from "../auth/provider-context";
import { getDatabase } from "../db/connection";
import { AuditRepository } from "../repositories/audit-repository";
import { PrescriptionTransactionRepository } from "../repositories/prescription-transaction-repository";
import type { ClinicalExecutionContext } from "./clinical-service";

function provenance(actor: ProviderContext, context: ClinicalExecutionContext) {
  return {
    actorId: actor.userId,
    actorName: providerLabel(actor),
    sourceType: context.source,
    sourceSystem: "ehr-local",
    sourceRef: context.requestId,
  };
}

function auditActor(actor: ProviderContext) {
  return { userId: actor.userId, userName: providerLabel(actor), userRole: actor.role };
}

export class PrescriptionTransportReliabilityService {
  recordOutcomeUncertain(
    transactionId: string,
    error: Error,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): PrescriptionTransaction {
    const current = PrescriptionTransactionRepository.getById(transactionId);
    if (!current) throw new Error(`Prescription transaction not found: ${transactionId}`);
    const safeMessage = sanitizePrescriptionTransactionErrorMessage(error.message);
    const safeError = { code: "outcome_uncertain", message: safeMessage };
    const db = getDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const uncertain = PrescriptionTransactionRepository.transitionState(
        transactionId,
        "outcome_uncertain",
        { error: safeError },
        provenance(actor, context),
      );
      PrescriptionTransactionRepository.recordEvent({
        transaction: uncertain,
        eventKey: `local:${uncertain.id}:attempt:${uncertain.attemptCount}:outcome-uncertain`,
        direction: "outbound",
        eventType: current.transactionType === "cancel_rx" ? "cancellation_outcome_uncertain" : "outcome_uncertain",
        state: "outcome_uncertain",
        error: safeError,
        metadata: {
          attempt: uncertain.attemptCount,
          relatedTransactionId: uncertain.relatedTransactionId,
          medicationTruthChanged: false,
          retryBlocked: true,
        },
        sourceSystem: uncertain.adapterId,
      }, provenance(actor, context));
      AuditRepository.log({
        ...auditActor(actor),
        eventType: "prescription_transaction_outcome_uncertain",
        patientId: uncertain.patientId,
        description: `Prescription transaction ${uncertain.id} has an uncertain external outcome and requires reconciliation before retry.`,
        metadata: {
          transactionId: uncertain.id,
          orderId: uncertain.orderId,
          adapterId: uncertain.adapterId,
          attempt: uncertain.attemptCount,
          transactionType: uncertain.transactionType,
          error: safeMessage,
          retryBlocked: true,
          medicationTruthChanged: false,
        },
      });
      db.exec("COMMIT");
      return uncertain;
    } catch (failure) {
      db.exec("ROLLBACK");
      throw failure;
    }
  }
}

export const prescriptionTransportReliabilityService = new PrescriptionTransportReliabilityService();
