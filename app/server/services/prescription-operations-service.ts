import {
  sanitizePrescriptionTransactionErrorMessage,
  type PrescriptionTransaction,
  type PrescriptionTransactionEvent,
  type PrescriptionTransactionState,
} from "../../domain/prescription-transactions";
import type {
  PrescriptionAttentionClassification,
  PrescriptionIntegrationReadinessProjection,
  PrescriptionOperationsDetail,
  PrescriptionOperationsQueue,
  PrescriptionOperationsQueueItem,
  PrescriptionOperationsTimelineItem,
  PrescriptionRecoveryActionProjection,
  PrescriptionRetryProjection,
  PrescriptionSupersedingCandidate,
} from "../../domain/prescription-operations";
import { hasPermission, type ProviderContext } from "../auth/provider-context";
import { getDatabase } from "../db/connection";
import type { IntegrationOperationalStatus } from "../integrations/types";
import { OrderRepository, type OrderRecord } from "../repositories/order-repository";
import { PatientRepository } from "../repositories/patient-repository";
import { PrescriptionTransactionRepository } from "../repositories/prescription-transaction-repository";
import { integrationHealthService } from "./integration-health-service";
import {
  prescriptionRecoveryService,
  type PrescriptionRecoveryStatus,
} from "./prescription-recovery-service";

const VERIFIED_POSITIVE_STATES = new Set<PrescriptionTransactionState>([
  "submitted",
  "acknowledged",
  "accepted",
  "cancellation_acknowledged",
  "canceled",
]);

function statusLabel(classification: PrescriptionAttentionClassification): string {
  return {
    outcome_unknown: "Outcome unknown",
    interrupted_attempt: "Needs review",
    transmission_failed: "Transmission failed",
    evidence_conflict: "Evidence conflict",
    callback_processing_stale: "Callback needs review",
  }[classification];
}

function classificationReason(
  classification: PrescriptionAttentionClassification,
  recovery?: PrescriptionRecoveryStatus,
): string {
  if (classification === "outcome_unknown") {
    return recovery?.retryAllowed
      ? "The transmission outcome is unknown, but clinician-recorded evidence now supports one controlled retry."
      : "The transmission outcome is unknown. The system will not infer success, failure, or retry permission from elapsed time.";
  }
  if (classification === "interrupted_attempt") {
    return recovery?.retryAllowed
      ? "A prior attempt may have been interrupted, and clinician-recorded evidence now supports one controlled retry."
      : "A durable attempt was prepared but no transport result was recorded. The system will not retransmit it automatically.";
  }
  if (classification === "transmission_failed") {
    return "The adapter recorded a confirmed transmission failure. The existing controlled retry path may be used when authorization and integration readiness still pass.";
  }
  if (classification === "evidence_conflict") {
    return recovery?.conflict?.description || "Verified vendor evidence conflicts with earlier manual recovery evidence. Both remain part of the durable record.";
  }
  return "Callback processing did not complete. The receipt remains durable and unresolved; it is not silently marked processed or rejected.";
}

function integrationProjection(status: IntegrationOperationalStatus): PrescriptionIntegrationReadinessProjection {
  if (status.readiness === "ready") {
    return {
      adapterId: status.adapterId,
      readiness: "ready",
      statusLabel: "Integration ready",
      reason: "The configured prescribing integration is enabled and its required secret material is available.",
      lastSuccessfulInteractionAt: status.lastSuccessfulInteractionAt,
    };
  }
  if (status.readiness === "disabled") {
    return {
      adapterId: status.adapterId,
      readiness: "disabled",
      statusLabel: "Integration unavailable",
      reason: "The configured prescribing integration is disabled.",
      lastSuccessfulInteractionAt: status.lastSuccessfulInteractionAt,
    };
  }
  if (status.readiness === "missing_secret") {
    return {
      adapterId: status.adapterId,
      readiness: "missing_secret",
      statusLabel: "Integration unavailable",
      reason: "Required secret material for the prescribing integration is unavailable.",
      lastSuccessfulInteractionAt: status.lastSuccessfulInteractionAt,
    };
  }
  return {
    adapterId: status.adapterId,
    readiness: "missing_configuration",
    statusLabel: "Integration unavailable",
    reason: "Required prescribing integration configuration is unavailable.",
    lastSuccessfulInteractionAt: status.lastSuccessfulInteractionAt,
  };
}

function missingIntegrationProjection(adapterId?: string): PrescriptionIntegrationReadinessProjection {
  return {
    adapterId,
    readiness: "missing_configuration",
    statusLabel: "Integration unavailable",
    reason: "No enabled prescribing integration configuration is available for this adapter.",
  };
}

function retryProjection(input: {
  classification: PrescriptionAttentionClassification;
  recovery?: PrescriptionRecoveryStatus;
  order: OrderRecord | null;
  integration?: PrescriptionIntegrationReadinessProjection;
  actor: ProviderContext;
}): PrescriptionRetryProjection {
  const { classification, recovery, order, integration, actor } = input;

  if (classification === "callback_processing_stale") {
    return { allowed: false, code: "not_applicable", reason: "Callback recovery does not retransmit the prescription." };
  }
  if (classification === "evidence_conflict") {
    return { allowed: false, code: "evidence_conflict", reason: "Retry is blocked because later verified vendor evidence conflicts with manual recovery evidence." };
  }

  if (classification === "outcome_unknown" || classification === "interrupted_attempt") {
    if (recovery?.externalResolution) {
      return { allowed: false, code: "verified_evidence_exists", reason: "Retry is blocked because verified external evidence now exists for this ambiguity episode." };
    }
    if (recovery?.latestManualEvidence?.disposition === "investigated_unresolved") {
      return { allowed: false, code: "investigation_unresolved", reason: "Investigation remains unresolved; no evidence currently confirms that the prescription was not received." };
    }
    if (!recovery?.retryAllowed) {
      return { allowed: false, code: "no_confirming_evidence", reason: "Retry is blocked until clinician-recorded evidence confirms the prescription was not received." };
    }
  }

  if (!hasPermission(actor, "transmit_order")) {
    return { allowed: false, code: "permission_required", reason: "Retry requires prescribing transmission authority." };
  }
  if (!order || order.type !== "medication") {
    return { allowed: false, code: "transaction_not_recoverable", reason: "The prescription order is no longer available for the established transmission path." };
  }
  if (!order.authorizedAt || !["authorized", "transmission_failed", "transmission_uncertain"].includes(order.status)) {
    return { allowed: false, code: "authorization_required", reason: "Retry is blocked because the prescription is not currently authorized for transmission." };
  }
  if (!integration || integration.readiness === "missing_configuration") {
    return { allowed: false, code: "integration_missing_configuration", reason: "Retry is blocked because prescribing integration configuration is unavailable." };
  }
  if (integration.readiness === "disabled") {
    return { allowed: false, code: "integration_disabled", reason: "Retry is blocked because the prescribing integration is disabled." };
  }
  if (integration.readiness === "missing_secret") {
    return { allowed: false, code: "integration_missing_secret", reason: "Retry is blocked because required prescribing integration secret material is unavailable." };
  }

  return {
    allowed: true,
    code: "none",
    reason: classification === "transmission_failed"
      ? "Confirmed failure, authorization, permission, and integration readiness all permit the existing controlled retry path."
      : "Qualifying manual evidence, authorization, permission, and integration readiness all permit one controlled retry of the existing transaction.",
  };
}

function queueClassification(
  transaction: PrescriptionTransaction,
  recovery: PrescriptionRecoveryStatus,
): PrescriptionAttentionClassification | null {
  if (recovery.conflict) return "evidence_conflict";
  if (transaction.state === "outcome_uncertain" && recovery.requiresAttention) return "outcome_unknown";
  if (transaction.state === "prepared" && transaction.attemptCount > 0 && recovery.requiresAttention) {
    return "interrupted_attempt";
  }
  if (transaction.state === "failed") return "transmission_failed";
  return null;
}

function buildTransactionQueueItem(
  transaction: PrescriptionTransaction,
  recovery: PrescriptionRecoveryStatus,
  integration: PrescriptionIntegrationReadinessProjection | undefined,
  actor: ProviderContext,
): PrescriptionOperationsQueueItem | null {
  const classification = queueClassification(transaction, recovery);
  if (!classification) return null;

  const patient = PatientRepository.getById(transaction.patientId);
  const order = OrderRepository.getById(transaction.orderId);
  if (!patient || !order) return null;

  return {
    id: `transaction:${transaction.id}:${classification}`,
    classification,
    statusLabel: statusLabel(classification),
    patient: { id: patient.id, name: patient.name, mrn: patient.mrn },
    prescription: {
      orderId: transaction.orderId,
      transactionId: transaction.id,
      medicationName: order.name,
      transactionType: transaction.transactionType,
      transportState: transaction.state,
      attemptCount: transaction.attemptCount,
      adapterId: transaction.adapterId,
      pharmacyName: transaction.destination?.pharmacyName,
    },
    reason: classificationReason(classification, recovery),
    retry: retryProjection({ classification, recovery, order, integration, actor }),
    evidenceConflict: Boolean(recovery.conflict),
    updatedAt: transaction.updatedAt,
  };
}

function eventCategory(event: PrescriptionTransactionEvent): PrescriptionOperationsTimelineItem["category"] {
  if (event.eventType === "manual_recovery_evidence") return "manual_evidence";
  if (event.direction === "inbound") return "verified_vendor";
  if (event.direction === "outbound" || event.eventType.includes("attempt")) return "outbound_attempt";
  return "local_system";
}

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function eventTimelineItem(event: PrescriptionTransactionEvent): PrescriptionOperationsTimelineItem {
  const category = eventCategory(event);
  let label = humanize(event.eventType);
  let detail: string | undefined;
  let sourceLabel: string | undefined;

  if (category === "manual_evidence") {
    const disposition = typeof event.metadata?.disposition === "string" ? event.metadata.disposition : "manual evidence";
    const source = typeof event.metadata?.evidenceSource === "string" ? event.metadata.evidenceSource : "manual investigation";
    const note = typeof event.metadata?.note === "string" ? event.metadata.note : "";
    const actorName = typeof event.metadata?.actorName === "string" ? event.metadata.actorName : "Clinician";
    label = `Manual evidence: ${humanize(disposition)}`;
    sourceLabel = sanitizePrescriptionTransactionErrorMessage(actorName).slice(0, 120);
    const safeSource = sanitizePrescriptionTransactionErrorMessage(source).slice(0, 120);
    const safeNote = sanitizePrescriptionTransactionErrorMessage(note).slice(0, 500);
    detail = safeNote ? `${safeSource} — ${safeNote}` : safeSource;
  } else if (category === "verified_vendor") {
    label = `Verified vendor evidence: ${humanize(event.state)}`;
    sourceLabel = sanitizePrescriptionTransactionErrorMessage(event.sourceSystem).slice(0, 120);
    detail = "Received through the verified prescribing callback boundary.";
  } else if (category === "outbound_attempt") {
    label = event.eventType.includes("recovered_retry")
      ? "Recovered retry attempt prepared"
      : event.eventType.includes("attempt")
        ? "Outbound attempt prepared"
        : humanize(event.eventType);
    sourceLabel = "EHR transport boundary";
  } else if (event.state === "outcome_uncertain") {
    label = "Transmission outcome became unknown";
  } else if (event.state === "failed") {
    label = "Transmission failure recorded";
  }

  if (!detail && event.error?.message) {
    detail = sanitizePrescriptionTransactionErrorMessage(event.error.message).slice(0, 500);
  }

  return {
    id: event.id,
    category,
    at: event.receivedAt || event.occurredAt,
    label,
    detail,
    state: event.state,
    sourceLabel,
  };
}

function callbackTimeline(transactionId: string): PrescriptionOperationsTimelineItem[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, callback_type, status, failure_code, received_at, processed_at, updated_at
    FROM prescription_callback_receipts
    WHERE transaction_id = ?
    ORDER BY received_at ASC
  `).all(transactionId) as Array<{
    id: string;
    callback_type: string;
    status: "processing" | "processed" | "rejected";
    failure_code?: string | null;
    received_at: string;
    processed_at?: string | null;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: `callback:${row.id}`,
    category: "callback_processing",
    at: row.processed_at || row.updated_at || row.received_at,
    label: row.status === "processing"
      ? "Verified callback processing remains incomplete"
      : row.status === "processed"
        ? "Verified callback processing completed"
        : "Verified callback was rejected",
    detail: row.failure_code
      ? `Bounded failure code: ${sanitizePrescriptionTransactionErrorMessage(row.failure_code).slice(0, 160)}`
      : `${humanize(row.callback_type)} callback receipt`,
    sourceLabel: "Verified callback boundary",
  }));
}

function supersedingCandidates(transaction: PrescriptionTransaction): PrescriptionSupersedingCandidate[] {
  const candidates: PrescriptionSupersedingCandidate[] = [];
  for (const candidate of PrescriptionTransactionRepository.listByPatient(transaction.patientId)) {
    if (candidate.id === transaction.id) continue;
    const verified = PrescriptionTransactionRepository.listEvents(candidate.id)
      .filter((event) => event.direction === "inbound" && VERIFIED_POSITIVE_STATES.has(event.state))
      .at(-1);
    if (!verified) continue;
    const order = OrderRepository.getById(candidate.orderId);
    if (!order) continue;
    candidates.push({
      transactionId: candidate.id,
      orderId: candidate.orderId,
      medicationName: order.name,
      verifiedState: verified.state,
      verifiedAt: verified.receivedAt,
    });
  }
  return candidates.sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt)).slice(0, 12);
}

function recoveryActions(
  item: PrescriptionOperationsQueueItem,
  recovery: PrescriptionRecoveryStatus,
  candidates: PrescriptionSupersedingCandidate[],
): PrescriptionRecoveryActionProjection[] {
  const ambiguous = (item.classification === "outcome_unknown" || item.classification === "interrupted_attempt") &&
    !recovery.externalResolution && !recovery.conflict;
  const manualReason = ambiguous
    ? "Available while the current transport episode remains ambiguous."
    : "Manual recovery evidence is unavailable because this item is not a current unresolved ambiguity.";

  return [
    { id: "investigated_unresolved", allowed: ambiguous, reason: manualReason },
    { id: "confirmed_not_received", allowed: ambiguous, reason: manualReason },
    {
      id: "superseded_by_verified_transaction",
      allowed: ambiguous && candidates.length > 0,
      reason: !ambiguous
        ? manualReason
        : candidates.length > 0
          ? "A same-patient transaction with retained positive verified external evidence is available."
          : "No same-patient verified transaction is currently available to use as a superseding reference.",
    },
    { id: "retry_transmission", allowed: item.retry.allowed, reason: item.retry.reason },
  ];
}

export class PrescriptionOperationsService {
  async list(actor: ProviderContext): Promise<PrescriptionOperationsQueue> {
    const [health, recoveryWork] = await Promise.all([
      integrationHealthService.list(actor),
      Promise.resolve(prescriptionRecoveryService.listOperationalWork(actor)),
    ]);
    const prescribingHealth = health.filter((status) => status.purpose === "prescribing");
    const integrations = prescribingHealth.length
      ? prescribingHealth.map(integrationProjection)
      : [missingIntegrationProjection()];
    const integrationByAdapter = new Map(integrations.filter((item) => item.adapterId).map((item) => [item.adapterId!, item]));

    const db = getDatabase();
    const rows = db.prepare(`
      SELECT id FROM prescription_transactions
      ORDER BY updated_at DESC
    `).all() as Array<{ id: string }>;
    const items: PrescriptionOperationsQueueItem[] = [];

    for (const row of rows) {
      const transaction = PrescriptionTransactionRepository.getById(row.id);
      if (!transaction) continue;
      const recovery = prescriptionRecoveryService.inspect(transaction.id);
      const integration = integrationByAdapter.get(transaction.adapterId) || missingIntegrationProjection(transaction.adapterId);
      const item = buildTransactionQueueItem(transaction, recovery, integration, actor);
      if (item) items.push(item);
    }

    for (const work of recoveryWork.items.filter((item) => item.kind === "stale_callback_processing" && item.requiresAttention)) {
      const transaction = PrescriptionTransactionRepository.getById(work.transactionId);
      const patient = PatientRepository.getById(work.patientId);
      const order = OrderRepository.getById(work.orderId);
      if (!transaction || !patient || !order || !work.callbackReceiptId) continue;
      items.push({
        id: `callback:${work.callbackReceiptId}`,
        classification: "callback_processing_stale",
        statusLabel: statusLabel("callback_processing_stale"),
        patient: { id: patient.id, name: patient.name, mrn: patient.mrn },
        prescription: {
          orderId: transaction.orderId,
          transactionId: transaction.id,
          medicationName: order.name,
          transactionType: transaction.transactionType,
          transportState: transaction.state,
          attemptCount: transaction.attemptCount,
          adapterId: transaction.adapterId,
          pharmacyName: transaction.destination?.pharmacyName,
        },
        reason: classificationReason("callback_processing_stale"),
        retry: retryProjection({
          classification: "callback_processing_stale",
          order,
          integration: integrationByAdapter.get(transaction.adapterId),
          actor,
        }),
        evidenceConflict: false,
        updatedAt: work.updatedAt || work.receivedAt || transaction.updatedAt,
        callbackReceiptId: work.callbackReceiptId,
      });
    }

    const priority: Record<PrescriptionAttentionClassification, number> = {
      evidence_conflict: 0,
      outcome_unknown: 1,
      interrupted_attempt: 2,
      callback_processing_stale: 3,
      transmission_failed: 4,
    };
    items.sort((left, right) => priority[left.classification] - priority[right.classification] || right.updatedAt.localeCompare(left.updatedAt));

    return {
      generatedAt: new Date().toISOString(),
      staleCallbackThresholdMinutes: recoveryWork.staleCallbackThresholdMinutes,
      items,
      integrations,
    };
  }

  async detail(itemId: string, actor: ProviderContext): Promise<PrescriptionOperationsDetail> {
    const queue = await this.list(actor);
    const item = queue.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error(`Prescription operations item not found or no longer requires attention: ${itemId}`);

    const transaction = PrescriptionTransactionRepository.getById(item.prescription.transactionId);
    if (!transaction) throw new Error(`Prescription transaction not found: ${item.prescription.transactionId}`);
    const recovery = prescriptionRecoveryService.inspect(transaction.id);
    const candidates = supersedingCandidates(transaction);
    const timeline = [
      ...PrescriptionTransactionRepository.listEvents(transaction.id).map(eventTimelineItem),
      ...callbackTimeline(transaction.id),
    ].sort((left, right) => left.at.localeCompare(right.at)).slice(-40);

    return {
      ...item,
      timeline,
      actions: recoveryActions(item, recovery, candidates),
      supersedingCandidates: candidates,
      medicationTruthChanged: false,
    };
  }
}

export const prescriptionOperationsService = new PrescriptionOperationsService();
