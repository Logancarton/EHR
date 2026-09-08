import { createHash } from "node:crypto";
import {
  sanitizePrescriptionTransactionErrorMessage,
  type PrescriptionTransaction,
  type PrescriptionTransactionEvent,
} from "../../domain/prescription-transactions";
import {
  assertPermission,
  providerLabel,
  type ProviderContext,
} from "../auth/provider-context";
import { getDatabase } from "../db/connection";
import { AuditRepository } from "../repositories/audit-repository";
import {
  PrescriptionTransactionRepository,
  type TransactionProvenance,
} from "../repositories/prescription-transaction-repository";
import type { ClinicalExecutionContext } from "./clinical-service";

export const PRESCRIPTION_RECOVERY_DISPOSITIONS = [
  "investigated_unresolved",
  "confirmed_not_received",
  "superseded_by_verified_transaction",
] as const;

export type PrescriptionRecoveryDisposition =
  (typeof PRESCRIPTION_RECOVERY_DISPOSITIONS)[number];

export type PrescriptionRecoveryOperationalStatus =
  | "not_applicable"
  | "requires_review"
  | "investigated_unresolved"
  | "retry_unlocked"
  | "superseded"
  | "resolved_by_external_evidence"
  | "evidence_conflict"
  | "recovered_retry_progressed";

export type PrescriptionManualRecoveryEvidence = {
  eventId: string;
  disposition: PrescriptionRecoveryDisposition;
  evidenceSource: string;
  note: string;
  actorId: string;
  actorName: string;
  recordedAt: string;
  supersedingTransactionId?: string;
  retryUnlocked: boolean;
};

export type PrescriptionExternalResolutionEvidence = {
  eventId: string;
  state: PrescriptionTransaction["state"];
  eventType: string;
  sourceSystem: string;
  externalEventId?: string;
  receivedAt: string;
};

export type PrescriptionRecoveryStatus = {
  transactionId: string;
  orderId: string;
  patientId: string;
  transactionType: PrescriptionTransaction["transactionType"];
  transportState: PrescriptionTransaction["state"];
  attemptCount: number;
  ambiguityDetected: boolean;
  operationalStatus: PrescriptionRecoveryOperationalStatus;
  retryAllowed: boolean;
  requiresAttention: boolean;
  latestManualEvidence?: PrescriptionManualRecoveryEvidence;
  externalResolution?: PrescriptionExternalResolutionEvidence;
  conflict?: {
    manualEventId: string;
    externalEventId: string;
    description: string;
  };
  medicationTruthChanged: false;
};

export type PrescriptionRecoveryWorkItem = {
  kind:
    | "ambiguous_prescription_transaction"
    | "failed_prescription_transaction"
    | "prepared_prescription_transaction"
    | "submitted_prescription_transaction"
    | "stale_callback_processing";
  patientId: string;
  orderId: string;
  transactionId: string;
  adapterId: string;
  transportState?: PrescriptionTransaction["state"];
  recovery?: PrescriptionRecoveryStatus;
  callbackReceiptId?: string;
  callbackType?: string;
  externalMessageId?: string;
  receivedAt?: string;
  updatedAt?: string;
  retryAvailable: boolean;
  requiresAttention: boolean;
  reason: string;
};

const EXTERNAL_RESOLUTION_STATES = new Set<PrescriptionTransaction["state"]>([
  "submitted",
  "acknowledged",
  "accepted",
  "rejected",
  "failed",
  "cancellation_acknowledged",
  "canceled",
]);

const EXTERNAL_POSITIVE_STATES = new Set<PrescriptionTransaction["state"]>([
  "submitted",
  "acknowledged",
  "accepted",
  "cancellation_acknowledged",
  "canceled",
]);

const MANUAL_EVENT_TYPE = "manual_recovery_evidence";
const STALE_CALLBACK_MINUTES = 5;

function recoveryProvenance(actor: ProviderContext, context: ClinicalExecutionContext): TransactionProvenance {
  return {
    actorId: actor.userId,
    actorName: providerLabel(actor),
    sourceType: "manual-prescription-recovery",
    sourceSystem: "ehr-local",
    sourceRef: context.requestId,
  };
}

function safeText(value: string, max: number): string {
  return sanitizePrescriptionTransactionErrorMessage(value).trim().slice(0, max);
}

function parseManualEvidence(event: PrescriptionTransactionEvent): PrescriptionManualRecoveryEvidence | undefined {
  if (event.eventType !== MANUAL_EVENT_TYPE || event.direction !== "internal") return undefined;
  const metadata = event.metadata || {};
  const disposition = metadata.disposition;
  if (typeof disposition !== "string" || !(PRESCRIPTION_RECOVERY_DISPOSITIONS as readonly string[]).includes(disposition)) {
    return undefined;
  }
  return {
    eventId: event.id,
    disposition: disposition as PrescriptionRecoveryDisposition,
    evidenceSource: typeof metadata.evidenceSource === "string" ? metadata.evidenceSource : "manual",
    note: typeof metadata.note === "string" ? metadata.note : "",
    actorId: typeof metadata.actorId === "string" ? metadata.actorId : "unknown",
    actorName: typeof metadata.actorName === "string" ? metadata.actorName : "Unknown actor",
    recordedAt: event.receivedAt,
    supersedingTransactionId:
      typeof metadata.supersedingTransactionId === "string" ? metadata.supersedingTransactionId : undefined,
    retryUnlocked: metadata.retryUnlocked === true,
  };
}

function latestAmbiguityAnchor(
  transaction: PrescriptionTransaction,
  events: PrescriptionTransactionEvent[],
): PrescriptionTransactionEvent | undefined {
  const uncertain = events.filter((event) =>
    event.state === "outcome_uncertain" ||
    event.eventType === "outcome_uncertain" ||
    event.eventType === "cancellation_outcome_uncertain"
  );
  if (transaction.state === "outcome_uncertain") return uncertain.at(-1);

  if (transaction.state === "prepared" && transaction.attemptCount > 0) {
    const prepared = events.filter((event) =>
      event.state === "prepared" &&
      ["attempt_prepared", "cancellation_attempt_prepared", "recovered_retry_prepared"].includes(event.eventType)
    );
    return prepared.at(-1) || uncertain.at(-1);
  }

  return uncertain.at(-1);
}

function deriveRecoveryStatus(
  transaction: PrescriptionTransaction,
  events: PrescriptionTransactionEvent[],
): PrescriptionRecoveryStatus {
  const anchor = latestAmbiguityAnchor(transaction, events);
  const ambiguousNow =
    transaction.state === "outcome_uncertain" ||
    (transaction.state === "prepared" && transaction.attemptCount > 0);
  const ambiguityDetected = Boolean(anchor) || transaction.state === "outcome_uncertain";
  const anchorAt = anchor?.receivedAt || (ambiguousNow ? transaction.updatedAt : undefined);
  const episodeEvents = anchorAt
    ? events.filter((event) => event.receivedAt >= anchorAt)
    : [];
  const manualEvents = episodeEvents
    .map(parseManualEvidence)
    .filter((event): event is PrescriptionManualRecoveryEvidence => Boolean(event));
  const latestManualEvidence = manualEvents.at(-1);
  const externalEvents = episodeEvents.filter((event) =>
    event.direction === "inbound" && EXTERNAL_RESOLUTION_STATES.has(event.state)
  );
  const externalEvent = externalEvents.at(-1);
  const externalResolution: PrescriptionExternalResolutionEvidence | undefined = externalEvent
    ? {
        eventId: externalEvent.id,
        state: externalEvent.state,
        eventType: externalEvent.eventType,
        sourceSystem: externalEvent.sourceSystem,
        externalEventId: externalEvent.externalEventId,
        receivedAt: externalEvent.receivedAt,
      }
    : undefined;

  const laterPositiveExternal = latestManualEvidence
    ? externalEvents.find((event) =>
        event.receivedAt >= latestManualEvidence.recordedAt && EXTERNAL_POSITIVE_STATES.has(event.state)
      )
    : undefined;
  const manualCouldConflict =
    latestManualEvidence?.disposition === "confirmed_not_received" ||
    latestManualEvidence?.disposition === "superseded_by_verified_transaction";
  const conflict = manualCouldConflict && laterPositiveExternal
    ? {
        manualEventId: latestManualEvidence!.eventId,
        externalEventId: laterPositiveExternal.id,
        description: "Later verified external evidence indicates transmission progress after a manual operational disposition that assumed the original attempt should not be treated as successful.",
      }
    : undefined;

  const retryAllowed = Boolean(
    ambiguousNow &&
    latestManualEvidence?.disposition === "confirmed_not_received" &&
    latestManualEvidence.retryUnlocked &&
    !externalResolution,
  );

  let operationalStatus: PrescriptionRecoveryOperationalStatus = "not_applicable";
  let requiresAttention = false;

  if (conflict) {
    operationalStatus = "evidence_conflict";
    requiresAttention = true;
  } else if (externalResolution && ambiguityDetected) {
    operationalStatus = "resolved_by_external_evidence";
  } else if (ambiguousNow) {
    if (!latestManualEvidence) {
      operationalStatus = "requires_review";
      requiresAttention = true;
    } else if (latestManualEvidence.disposition === "investigated_unresolved") {
      operationalStatus = "investigated_unresolved";
      requiresAttention = true;
    } else if (latestManualEvidence.disposition === "confirmed_not_received") {
      operationalStatus = "retry_unlocked";
      requiresAttention = true;
    } else {
      operationalStatus = "superseded";
    }
  } else if (ambiguityDetected) {
    operationalStatus = "recovered_retry_progressed";
  }

  return {
    transactionId: transaction.id,
    orderId: transaction.orderId,
    patientId: transaction.patientId,
    transactionType: transaction.transactionType,
    transportState: transaction.state,
    attemptCount: transaction.attemptCount,
    ambiguityDetected,
    operationalStatus,
    retryAllowed,
    requiresAttention,
    latestManualEvidence,
    externalResolution,
    conflict,
    medicationTruthChanged: false,
  };
}

function assertManualDisposition(value: string): asserts value is PrescriptionRecoveryDisposition {
  if (!(PRESCRIPTION_RECOVERY_DISPOSITIONS as readonly string[]).includes(value)) {
    throw new Error(`Unsupported prescription recovery disposition: ${value}`);
  }
}

function eventKeyForManualEvidence(input: {
  transactionId: string;
  actorId: string;
  disposition: PrescriptionRecoveryDisposition;
  evidenceSource: string;
  note: string;
  supersedingTransactionId?: string;
}): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 24);
  return `manual-recovery:${input.transactionId}:${digest}`;
}

export class PrescriptionRecoveryService {
  inspect(transactionId: string): PrescriptionRecoveryStatus {
    const transaction = PrescriptionTransactionRepository.getById(transactionId);
    if (!transaction) throw new Error(`Prescription transaction not found: ${transactionId}`);
    return deriveRecoveryStatus(transaction, PrescriptionTransactionRepository.listEvents(transactionId));
  }

  status(transactionId: string, patientId: string, actor: ProviderContext): PrescriptionRecoveryStatus {
    assertPermission(actor, "read_clinical");
    const status = this.inspect(transactionId);
    if (status.patientId !== patientId) {
      throw new Error(`Patient binding mismatch: transaction ${transactionId} belongs to ${status.patientId}, not ${patientId}.`);
    }
    return status;
  }

  listByPatient(patientId: string, actor: ProviderContext): PrescriptionRecoveryStatus[] {
    assertPermission(actor, "read_clinical");
    return PrescriptionTransactionRepository.listByPatient(patientId)
      .map((transaction) => deriveRecoveryStatus(
        transaction,
        PrescriptionTransactionRepository.listEvents(transaction.id),
      ))
      .filter((status) => status.ambiguityDetected);
  }

  recordManualEvidence(
    transactionId: string,
    input: {
      disposition: PrescriptionRecoveryDisposition;
      evidenceSource: string;
      note: string;
      supersedingTransactionId?: string;
    },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): { status: PrescriptionRecoveryStatus; event: PrescriptionTransactionEvent; idempotent: boolean } {
    if (context.source === "ai") {
      throw new Error("AI may summarize prescription uncertainty but cannot record recovery evidence or resolve transport ambiguity.");
    }
    assertPermission(actor, "transmit_order");
    assertManualDisposition(input.disposition);

    const evidenceSource = safeText(input.evidenceSource, 120);
    const note = safeText(input.note, 500);
    if (!evidenceSource) throw new Error("A bounded manual evidence source is required.");
    if (!note) throw new Error("A bounded manual recovery note is required.");

    const initial = PrescriptionTransactionRepository.getById(transactionId);
    if (!initial) throw new Error(`Prescription transaction not found: ${transactionId}`);
    const recoverableInitial =
      initial.state === "outcome_uncertain" ||
      (initial.state === "prepared" && initial.attemptCount > 0);
    if (!recoverableInitial) {
      throw new Error(`Prescription transaction ${transactionId} is no longer in an ambiguous recoverable transport state; this recovery action is stale.`);
    }

    if (input.disposition === "superseded_by_verified_transaction") {
      if (!input.supersedingTransactionId || input.supersedingTransactionId === transactionId) {
        throw new Error("A different supersedingTransactionId is required for a superseded recovery disposition.");
      }
      const superseding = PrescriptionTransactionRepository.getById(input.supersedingTransactionId);
      if (!superseding) throw new Error(`Superseding prescription transaction not found: ${input.supersedingTransactionId}`);
      if (superseding.patientId !== initial.patientId) {
        throw new Error(
          `Patient binding mismatch: superseding transaction ${superseding.id} belongs to ${superseding.patientId}, not ${initial.patientId}.`,
        );
      }
      const verifiedPositive = PrescriptionTransactionRepository.listEvents(superseding.id).some((event) =>
        event.direction === "inbound" && EXTERNAL_POSITIVE_STATES.has(event.state)
      );
      if (!verifiedPositive) {
        throw new Error("Superseding recovery requires a transaction with retained verified positive external evidence.");
      }
    }

    const key = eventKeyForManualEvidence({
      transactionId,
      actorId: actor.userId,
      disposition: input.disposition,
      evidenceSource,
      note,
      supersedingTransactionId: input.supersedingTransactionId,
    });
    const existing = PrescriptionTransactionRepository.getEventByKey(key);
    if (existing) {
      return {
        status: this.inspect(transactionId),
        event: existing,
        idempotent: true,
      };
    }

    const provenance = recoveryProvenance(actor, context);
    const db = getDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const current = PrescriptionTransactionRepository.getById(transactionId);
      if (!current) throw new Error(`Prescription transaction not found: ${transactionId}`);
      const recoverable =
        current.state === "outcome_uncertain" ||
        (current.state === "prepared" && current.attemptCount > 0);
      if (!recoverable) {
        throw new Error(`Prescription transaction ${transactionId} is no longer in an ambiguous recoverable transport state; this recovery action is stale.`);
      }

      const replay = PrescriptionTransactionRepository.getEventByKey(key);
      if (replay) {
        db.exec("COMMIT");
        return { status: this.inspect(transactionId), event: replay, idempotent: true };
      }

      const recorded = PrescriptionTransactionRepository.recordEvent({
        transaction: current,
        eventKey: key,
        direction: "internal",
        eventType: MANUAL_EVENT_TYPE,
        state: current.state,
        metadata: {
          disposition: input.disposition,
          evidenceSource,
          note,
          actorId: actor.userId,
          actorName: providerLabel(actor),
          supersedingTransactionId: input.supersedingTransactionId,
          retryUnlocked: input.disposition === "confirmed_not_received",
          networkTruthChanged: false,
          medicationTruthChanged: false,
        },
        sourceSystem: "ehr-local",
      }, provenance);

      AuditRepository.log({
        userId: actor.userId,
        userName: providerLabel(actor),
        userRole: actor.role,
        eventType: input.disposition === "confirmed_not_received"
          ? "prescription_uncertainty_retry_unlocked"
          : input.disposition === "superseded_by_verified_transaction"
            ? "prescription_uncertainty_operationally_superseded"
            : "prescription_uncertainty_review_recorded",
        patientId: current.patientId,
        description: `Recorded manual prescription recovery evidence for transaction ${current.id}.`,
        metadata: {
          transactionId: current.id,
          orderId: current.orderId,
          adapterId: current.adapterId,
          disposition: input.disposition,
          evidenceSource,
          supersedingTransactionId: input.supersedingTransactionId,
          retryUnlocked: input.disposition === "confirmed_not_received",
          source: context.source,
          requestId: context.requestId,
          networkTruthChanged: false,
          medicationTruthChanged: false,
        },
      });
      db.exec("COMMIT");
      return {
        status: this.inspect(transactionId),
        event: recorded.event,
        idempotent: !recorded.created,
      };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  prepareRecoveredAttempt(
    transactionId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): PrescriptionTransaction {
    if (context.source === "ai") {
      throw new Error("AI cannot retry or retransmit an ambiguous prescription transaction.");
    }
    assertPermission(actor, "transmit_order");
    const initialStatus = this.inspect(transactionId);
    if (!initialStatus.retryAllowed || !initialStatus.latestManualEvidence) {
      throw new Error(`Prescription transaction ${transactionId} cannot be retried until current ambiguity is reconciled with evidence that unlocks retry.`);
    }

    const provenance = recoveryProvenance(actor, context);
    const db = getDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const status = this.inspect(transactionId);
      if (!status.retryAllowed || !status.latestManualEvidence) {
        throw new Error(`Prescription transaction ${transactionId} cannot be retried until current ambiguity is reconciled with evidence that unlocks retry.`);
      }
      const attempt = PrescriptionTransactionRepository.startAttempt(
        transactionId,
        provenance,
        status.latestManualEvidence.eventId,
      );
      PrescriptionTransactionRepository.recordEvent({
        transaction: attempt,
        eventKey: `local:${attempt.id}:attempt:${attempt.attemptCount}:recovered-retry-prepared`,
        direction: "internal",
        eventType: "recovered_retry_prepared",
        state: "prepared",
        metadata: {
          attempt: attempt.attemptCount,
          recoveryEvidenceEventId: status.latestManualEvidence.eventId,
          explicitHumanRecovery: true,
          medicationTruthChanged: false,
        },
        sourceSystem: "ehr-local",
      }, provenance);
      AuditRepository.log({
        userId: actor.userId,
        userName: providerLabel(actor),
        userRole: actor.role,
        eventType: "prescription_uncertainty_recovered_retry_prepared",
        patientId: attempt.patientId,
        description: `Prepared evidence-unlocked retry for prescription transaction ${attempt.id}.`,
        metadata: {
          transactionId: attempt.id,
          orderId: attempt.orderId,
          adapterId: attempt.adapterId,
          attempt: attempt.attemptCount,
          recoveryEvidenceEventId: status.latestManualEvidence.eventId,
          requestId: context.requestId,
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

  listOperationalWork(actor: ProviderContext): {
    generatedAt: string;
    staleCallbackThresholdMinutes: number;
    items: PrescriptionRecoveryWorkItem[];
  } {
    assertPermission(actor, "manage_integrations");
    const db = getDatabase();
    const transactionRows = db.prepare(`
      SELECT id FROM prescription_transactions
      WHERE state IN ('prepared','submitted','failed','outcome_uncertain')
      ORDER BY updated_at ASC
    `).all() as Array<{ id: string }>;
    const items: PrescriptionRecoveryWorkItem[] = [];

    for (const row of transactionRows) {
      const transaction = PrescriptionTransactionRepository.getById(row.id);
      if (!transaction) continue;
      const recovery = deriveRecoveryStatus(
        transaction,
        PrescriptionTransactionRepository.listEvents(transaction.id),
      );
      if (recovery.ambiguityDetected && (
        transaction.state === "outcome_uncertain" ||
        (transaction.state === "prepared" && transaction.attemptCount > 0)
      )) {
        if (recovery.operationalStatus !== "superseded") {
          items.push({
            kind: "ambiguous_prescription_transaction",
            patientId: transaction.patientId,
            orderId: transaction.orderId,
            transactionId: transaction.id,
            adapterId: transaction.adapterId,
            transportState: transaction.state,
            recovery,
            retryAvailable: recovery.retryAllowed,
            requiresAttention: true,
            reason: recovery.retryAllowed
              ? "Manual evidence for the current ambiguous attempt permits an explicit controlled retry; no automatic retry will occur."
              : "External outcome is unresolved or the durable prepared attempt may have been interrupted; review is required before any retry.",
          });
        }
        continue;
      }

      if (transaction.state === "failed") {
        items.push({
          kind: "failed_prescription_transaction",
          patientId: transaction.patientId,
          orderId: transaction.orderId,
          transactionId: transaction.id,
          adapterId: transaction.adapterId,
          transportState: transaction.state,
          retryAvailable: true,
          requiresAttention: true,
          reason: "The adapter failure is confirmed, so the existing controlled retry path remains available.",
        });
      } else if (transaction.state === "prepared") {
        items.push({
          kind: "prepared_prescription_transaction",
          patientId: transaction.patientId,
          orderId: transaction.orderId,
          transactionId: transaction.id,
          adapterId: transaction.adapterId,
          transportState: transaction.state,
          retryAvailable: false,
          requiresAttention: transaction.attemptCount > 0,
          reason: transaction.attemptCount > 0
            ? "A durable attempt was prepared but no terminal transport result is recorded; it will not be retransmitted automatically."
            : "The transaction exists but no transport attempt has begun.",
        });
      } else if (transaction.state === "submitted") {
        items.push({
          kind: "submitted_prescription_transaction",
          patientId: transaction.patientId,
          orderId: transaction.orderId,
          transactionId: transaction.id,
          adapterId: transaction.adapterId,
          transportState: transaction.state,
          retryAvailable: false,
          requiresAttention: false,
          reason: "The transaction has been submitted and remains visible while awaiting later verified external evidence.",
        });
      }
    }

    const cutoff = new Date(Date.now() - STALE_CALLBACK_MINUTES * 60_000).toISOString();
    const staleCallbacks = db.prepare(`
      SELECT id, patient_id, order_id, transaction_id, adapter_id, callback_type,
             external_message_id, received_at, updated_at
      FROM prescription_callback_receipts
      WHERE status = 'processing' AND updated_at <= ?
      ORDER BY updated_at ASC
    `).all(cutoff) as Array<{
      id: string;
      patient_id: string;
      order_id: string;
      transaction_id: string;
      adapter_id: string;
      callback_type: string;
      external_message_id: string;
      received_at: string;
      updated_at: string;
    }>;

    for (const receipt of staleCallbacks) {
      items.push({
        kind: "stale_callback_processing",
        patientId: receipt.patient_id,
        orderId: receipt.order_id,
        transactionId: receipt.transaction_id,
        adapterId: receipt.adapter_id,
        callbackReceiptId: receipt.id,
        callbackType: receipt.callback_type,
        externalMessageId: receipt.external_message_id,
        receivedAt: receipt.received_at,
        updatedAt: receipt.updated_at,
        retryAvailable: false,
        requiresAttention: true,
        reason: "Callback reservation is stale. Exact verified callback replay may safely resume idempotent routing; the EHR will not mark it successful automatically.",
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      staleCallbackThresholdMinutes: STALE_CALLBACK_MINUTES,
      items,
    };
  }
}

export const prescriptionRecoveryService = new PrescriptionRecoveryService();
