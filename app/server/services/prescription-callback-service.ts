import { createHash } from "node:crypto";
import {
  PRESCRIPTION_CHANGE_REQUEST_CATEGORIES,
  type PrescriptionChangeRequestCategory,
  type PrescriptionRequestedChanges,
} from "../../domain/prescription-changes";
import {
  PRESCRIPTION_CALLBACK_TYPES,
  type PrescriptionCallbackAssertions,
  type PrescriptionCallbackReceipt,
  type PrescriptionCallbackType,
  type VerifiedPrescriptionCallback,
} from "../../domain/prescription-callbacks";
import {
  sanitizePrescriptionTransactionErrorMessage,
  type ExternalMedicationEvidence,
  type PrescriptionTransaction,
  type PrescriptionTransactionState,
} from "../../domain/prescription-transactions";
import { getDatabase } from "../db/connection";
import { AuditRepository } from "../repositories/audit-repository";
import { OrderRepository } from "../repositories/order-repository";
import { PrescriptionCallbackRepository } from "../repositories/prescription-callback-repository";
import {
  PrescriptionRefillRepository,
  type RefillRequestProvenance,
} from "../repositories/prescription-refill-repository";
import { PrescriptionTransactionRepository } from "../repositories/prescription-transaction-repository";
import { prescriptionChangeRequestService } from "./prescription-change-request-service";
import { prescriptionTransactionService } from "./prescription-transaction-service";

const CALLBACK_TYPES = new Set<string>(PRESCRIPTION_CALLBACK_TYPES);
const CHANGE_CATEGORIES = new Set<string>(PRESCRIPTION_CHANGE_REQUEST_CATEGORIES);
const TRANSACTION_STATES = new Set<PrescriptionTransactionState>([
  "prepared",
  "submitted",
  "acknowledged",
  "accepted",
  "rejected",
  "failed",
  "cancellation_requested",
  "cancellation_acknowledged",
  "canceled",
  "change_requested",
]);

export class PrescriptionCallbackError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "PrescriptionCallbackError";
  }
}

function safeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return sanitizePrescriptionTransactionErrorMessage(value.trim()).slice(0, maxLength);
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  const text = safeText(value, maxLength);
  if (!text) throw new PrescriptionCallbackError("malformed_callback", 400, `${field} is required.`);
  return text;
}

function safeTimestamp(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new PrescriptionCallbackError("malformed_callback", 400, "Callback timestamp is invalid.");
  }
  return new Date(value).toISOString();
}

function safeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeAssertions(value: unknown): PrescriptionCallbackAssertions | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const assertions: PrescriptionCallbackAssertions = {};
  const patientId = safeText(raw.patientId, 200);
  const orderId = safeText(raw.orderId, 200);
  const transactionId = safeText(raw.transactionId, 200);
  if (patientId) assertions.patientId = patientId;
  if (orderId) assertions.orderId = orderId;
  if (transactionId) assertions.transactionId = transactionId;
  return Object.keys(assertions).length ? assertions : undefined;
}

function normalizeMedicationEvidence(value: unknown): ExternalMedicationEvidence | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const evidenceType = requiredText(raw.evidenceType, "medicationEvidence.evidenceType", 120);
  const displayText = requiredText(raw.displayText, "medicationEvidence.displayText", 500);
  return {
    evidenceType,
    displayText,
    medicationName: safeText(raw.medicationName, 240),
    genericName: safeText(raw.genericName, 240),
    strength: safeText(raw.strength, 120),
    dose: safeText(raw.dose, 120),
    route: safeText(raw.route, 120),
    frequency: safeText(raw.frequency, 160),
    startDate: safeText(raw.startDate, 80),
    endDate: safeText(raw.endDate, 80),
    prescriber: safeText(raw.prescriber, 240),
    observedAt: safeTimestamp(raw.observedAt),
  };
}

function normalizeRequestedChanges(value: unknown): PrescriptionRequestedChanges {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const result: PrescriptionRequestedChanges = {};
  const stringFields: Array<[keyof PrescriptionRequestedChanges, number]> = [
    ["medicationName", 240], ["genericName", 240], ["strength", 120],
    ["dose", 120], ["form", 120], ["route", 120], ["frequency", 160],
    ["sig", 500], ["indication", 240],
  ];
  for (const [key, maxLength] of stringFields) {
    const normalized = safeText(raw[key], maxLength);
    if (normalized !== undefined) (result as Record<string, unknown>)[key] = normalized;
  }
  for (const key of ["quantity", "daysSupply", "refills"] as const) {
    const normalized = safeNumber(raw[key]);
    if (normalized !== undefined) result[key] = normalized;
  }
  if (typeof raw.substitutionAllowed === "boolean") result.substitutionAllowed = raw.substitutionAllowed;
  return result;
}

function normalizeVerifiedCallback(input: VerifiedPrescriptionCallback): VerifiedPrescriptionCallback {
  const raw = input as unknown as Record<string, unknown>;
  const adapterId = requiredText(raw.adapterId, "adapterId", 120);
  const externalMessageId = requiredText(raw.externalMessageId, "externalMessageId", 200);
  const correlationId = requiredText(raw.correlationId, "correlationId", 200);
  const callbackType = requiredText(raw.callbackType, "callbackType", 80);
  if (!CALLBACK_TYPES.has(callbackType)) {
    throw new PrescriptionCallbackError("unsupported_callback_type", 422, `Unsupported callback type: ${callbackType}.`);
  }
  const occurredAt = safeTimestamp(raw.occurredAt);
  const externalReferenceId = safeText(raw.externalReferenceId, 240);
  const assertions = normalizeAssertions(raw.assertions);
  const payloadRaw = raw.payload;
  if (!payloadRaw || typeof payloadRaw !== "object" || Array.isArray(payloadRaw)) {
    throw new PrescriptionCallbackError("malformed_callback", 400, "Callback payload must be a normalized object.");
  }
  const payload = payloadRaw as Record<string, unknown>;
  const base = { adapterId, externalMessageId, correlationId, externalReferenceId, occurredAt, assertions };

  if (callbackType === "transaction-event") {
    const eventType = requiredText(payload.eventType, "payload.eventType", 160);
    const state = requiredText(payload.state, "payload.state", 80) as PrescriptionTransactionState;
    if (!TRANSACTION_STATES.has(state)) {
      throw new PrescriptionCallbackError("unsupported_transaction_state", 422, `Unsupported prescription transaction state: ${state}.`);
    }
    const errorRaw = payload.error;
    const error = errorRaw && typeof errorRaw === "object" && !Array.isArray(errorRaw)
      ? {
          code: safeText((errorRaw as Record<string, unknown>).code, 120),
          message: requiredText((errorRaw as Record<string, unknown>).message, "payload.error.message", 500),
        }
      : undefined;
    return {
      ...base,
      callbackType: "transaction-event",
      payload: {
        eventType,
        state,
        error,
        medicationEvidence: normalizeMedicationEvidence(payload.medicationEvidence),
      },
    };
  }

  if (callbackType === "refill-request") {
    return {
      ...base,
      callbackType: "refill-request",
      payload: {
        externalRequestId: safeText(payload.externalRequestId, 200),
        sourceReference: safeText(payload.sourceReference, 240),
        note: safeText(payload.note, 500),
      },
    };
  }

  const category = requiredText(payload.category, "payload.category", 120) as PrescriptionChangeRequestCategory;
  if (!CHANGE_CATEGORIES.has(category)) {
    throw new PrescriptionCallbackError("unsupported_change_category", 422, `Unsupported prescription change category: ${category}.`);
  }
  return {
    ...base,
    callbackType: "change-request",
    payload: {
      externalRequestId: requiredText(payload.externalRequestId, "payload.externalRequestId", 200),
      category,
      requestedChanges: normalizeRequestedChanges(payload.requestedChanges),
      summary: safeText(payload.summary, 800),
      sourceReference: safeText(payload.sourceReference, 240),
    },
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stableValue(value)), "utf8").digest("hex");
}

function resolveTransaction(callback: VerifiedPrescriptionCallback): PrescriptionTransaction {
  const transaction = PrescriptionTransactionRepository.getByCorrelationId(callback.correlationId);
  if (!transaction) {
    throw new PrescriptionCallbackError("correlation_not_found", 422, "Prescription callback correlation was not found.");
  }
  if (transaction.adapterId !== callback.adapterId) {
    throw new PrescriptionCallbackError("adapter_mismatch", 409, "Prescription callback adapter does not match the correlated transaction.");
  }
  const assertions = callback.assertions;
  if (assertions?.transactionId && assertions.transactionId !== transaction.id) {
    throw new PrescriptionCallbackError("transaction_assertion_mismatch", 409, "Prescription callback transaction assertion does not match EHR correlation.");
  }
  if (assertions?.orderId && assertions.orderId !== transaction.orderId) {
    throw new PrescriptionCallbackError("order_assertion_mismatch", 409, "Prescription callback order assertion does not match EHR correlation.");
  }
  if (assertions?.patientId && assertions.patientId !== transaction.patientId) {
    throw new PrescriptionCallbackError("patient_assertion_mismatch", 409, "Prescription callback patient assertion does not match EHR correlation.");
  }
  return transaction;
}

function integrationProvenance(adapterId: string, externalMessageId: string): RefillRequestProvenance {
  return {
    actorId: `integration:${adapterId}`,
    actorName: `External prescribing adapter (${adapterId})`,
    sourceType: "external-vendor",
    sourceSystem: adapterId,
    sourceRef: externalMessageId,
  };
}

function recordExternalRefillRequest(
  callback: Extract<VerifiedPrescriptionCallback, { callbackType: "refill-request" }>,
  transaction: PrescriptionTransaction,
) {
  if (transaction.transactionType !== "new_rx") {
    throw new PrescriptionCallbackError("invalid_refill_source", 422, "Refill callback must reference a prior new_rx transaction.");
  }
  if (!["submitted", "acknowledged", "accepted"].includes(transaction.state)) {
    throw new PrescriptionCallbackError("invalid_refill_state", 422, "Prior prescription transaction is not eligible for a refill request.");
  }
  const order = OrderRepository.getById(transaction.orderId);
  if (!order || order.patientId !== transaction.patientId || order.type !== "medication" || order.status !== "transmitted") {
    throw new PrescriptionCallbackError("invalid_refill_order", 422, "Prior prescription order is unavailable or inconsistent.");
  }

  const externalRequestId = callback.payload.externalRequestId || callback.externalMessageId;
  const idempotencyKey = `prescription-refill:${transaction.id}:pharmacy:${fingerprint(`${callback.adapterId}:${externalRequestId}`)}`;
  const provenance = integrationProvenance(callback.adapterId, callback.externalMessageId);
  const db = getDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = PrescriptionRefillRepository.getOrCreate({
      patientId: transaction.patientId,
      priorOrderId: transaction.orderId,
      priorTransactionId: transaction.id,
      requestSource: "pharmacy",
      sourceSystem: callback.adapterId,
      sourceReference: callback.payload.sourceReference || externalRequestId,
      note: callback.payload.note,
      idempotencyKey,
      createdBy: provenance.actorName,
    }, provenance);
    if (result.created) {
      AuditRepository.log({
        userId: provenance.actorId,
        userName: provenance.actorName,
        userRole: "external-system",
        eventType: "prescription_refill_requested",
        patientId: transaction.patientId,
        description: `Recorded verified external refill/renewal request for prescription transaction ${transaction.id}.`,
        metadata: {
          refillRequestId: result.request.id,
          priorOrderId: transaction.orderId,
          priorTransactionId: transaction.id,
          adapterId: callback.adapterId,
          externalRequestId,
          medicationTruthChanged: false,
          automaticallyAuthorized: false,
          automaticallyTransmitted: false,
        },
      });
    }
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function auditCallback(
  receipt: PrescriptionCallbackReceipt,
  eventType: "prescription_callback_processed" | "prescription_callback_replayed" | "prescription_callback_rejected",
  extra: Record<string, unknown> = {},
) {
  AuditRepository.log({
    userId: `integration:${receipt.adapterId}`,
    userName: `External prescribing adapter (${receipt.adapterId})`,
    userRole: "external-system",
    eventType,
    patientId: receipt.patientId,
    description: `${eventType.replaceAll("_", " ")} (${receipt.callbackType}).`,
    metadata: {
      callbackReceiptId: receipt.id,
      adapterId: receipt.adapterId,
      externalMessageId: receipt.externalMessageId,
      callbackType: receipt.callbackType,
      correlationId: receipt.correlationId,
      transactionId: receipt.transactionId,
      transactionEventId: receipt.transactionEventId,
      refillRequestId: receipt.refillRequestId,
      changeRequestId: receipt.changeRequestId,
      medicationTruthChanged: false,
      ...extra,
    },
  });
}

export type PrescriptionCallbackProcessingResult = {
  receipt: PrescriptionCallbackReceipt;
  idempotent: boolean;
};

export class PrescriptionCallbackService {
  processVerifiedCallback(input: VerifiedPrescriptionCallback): PrescriptionCallbackProcessingResult {
    const callback = normalizeVerifiedCallback(input);
    const transaction = resolveTransaction(callback);
    let reservation: { receipt: PrescriptionCallbackReceipt; created: boolean };
    try {
      reservation = PrescriptionCallbackRepository.reserve({
        adapterId: callback.adapterId,
        externalMessageId: callback.externalMessageId,
        callbackType: callback.callbackType as PrescriptionCallbackType,
        correlationId: callback.correlationId,
        normalizedFingerprint: fingerprint(callback),
        patientId: transaction.patientId,
        orderId: transaction.orderId,
        transactionId: transaction.id,
        receivedAt: new Date().toISOString(),
      });
    } catch (error) {
      throw new PrescriptionCallbackError(
        "callback_identity_conflict",
        409,
        error instanceof Error ? error.message : "Prescription callback identity conflict.",
      );
    }

    if (!reservation.created && reservation.receipt.status === "processed") {
      auditCallback(reservation.receipt, "prescription_callback_replayed", { idempotent: true });
      return { receipt: reservation.receipt, idempotent: true };
    }
    if (!reservation.created && reservation.receipt.status === "rejected") {
      auditCallback(reservation.receipt, "prescription_callback_replayed", { priorStatus: "rejected" });
      throw new PrescriptionCallbackError("callback_previously_rejected", 422, "Verified callback was previously rejected.");
    }

    try {
      let resultIds: {
        transactionEventId?: string;
        refillRequestId?: string;
        changeRequestId?: string;
      } = {};

      if (callback.callbackType === "transaction-event") {
        const result = prescriptionTransactionService.ingestVendorEvent({
          adapterId: callback.adapterId,
          correlationId: callback.correlationId,
          externalEventId: callback.externalMessageId,
          eventType: callback.payload.eventType,
          state: callback.payload.state,
          occurredAt: callback.occurredAt,
          transactionId: callback.assertions?.transactionId,
          orderId: callback.assertions?.orderId,
          patientId: callback.assertions?.patientId,
          externalReferenceId: callback.externalReferenceId,
          metadata: {
            callbackReceiptId: reservation.receipt.id,
            callbackType: callback.callbackType,
          },
          error: callback.payload.error,
          medicationEvidence: callback.payload.medicationEvidence,
        });
        resultIds = { transactionEventId: result.event.id };
      } else if (callback.callbackType === "refill-request") {
        const result = recordExternalRefillRequest(callback, transaction);
        resultIds = { refillRequestId: result.request.id };
      } else {
        const result = prescriptionChangeRequestService.recordChangeRequest({
          sourceTransactionId: transaction.id,
          adapterId: callback.adapterId,
          externalRequestId: callback.payload.externalRequestId,
          category: callback.payload.category,
          requestedChanges: callback.payload.requestedChanges,
          summary: callback.payload.summary,
          sourceReference: callback.payload.sourceReference,
          receivedAt: callback.occurredAt,
        });
        resultIds = { changeRequestId: result.request.id };
      }

      const receipt = PrescriptionCallbackRepository.markProcessed(reservation.receipt.id, resultIds);
      auditCallback(receipt, reservation.created ? "prescription_callback_processed" : "prescription_callback_replayed", {
        idempotent: !reservation.created,
      });
      return { receipt, idempotent: !reservation.created };
    } catch (error) {
      const rejected = PrescriptionCallbackRepository.markRejected(reservation.receipt.id, "workflow_rejected");
      auditCallback(rejected, "prescription_callback_rejected", { failureCode: "workflow_rejected" });
      if (error instanceof PrescriptionCallbackError) throw error;
      throw new PrescriptionCallbackError(
        "workflow_rejected",
        422,
        error instanceof Error ? error.message : "Verified callback was rejected by the target workflow.",
      );
    }
  }
}

export const prescriptionCallbackService = new PrescriptionCallbackService();
