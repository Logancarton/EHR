export type PrescriptionTransactionType =
  | "new_rx"
  | "cancel_rx"
  | "change_rx"
  | "refill"
  | "medication_history"
  | "formulary_benefit"
  | "prior_authorization";

export type PrescriptionTransactionState =
  | "prepared"
  | "submitted"
  | "acknowledged"
  | "accepted"
  | "rejected"
  | "failed"
  | "outcome_uncertain"
  | "cancellation_requested"
  | "cancellation_acknowledged"
  | "canceled"
  | "change_requested";

export type PrescriptionTransactionDirection = "internal" | "outbound" | "inbound";

export type PrescriptionDestination = {
  pharmacyName?: string;
  ncpdpId?: string;
};

export type PrescriptionTransactionError = {
  code?: string;
  message: string;
};

export interface PrescriptionTransaction {
  id: string;
  orderId: string;
  patientId: string;
  adapterId: string;
  vendorName: string;
  transactionType: PrescriptionTransactionType;
  state: PrescriptionTransactionState;
  destination?: PrescriptionDestination;
  externalReferenceId?: string;
  relatedTransactionId?: string;
  correlationId: string;
  idempotencyKey: string;
  attemptCount: number;
  submittedAt?: string;
  acknowledgedAt?: string;
  failedAt?: string;
  canceledAt?: string;
  lastError?: PrescriptionTransactionError;
  createdBy: string;
  sourceType: string;
  sourceRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrescriptionTransactionEvent {
  id: string;
  transactionId: string;
  orderId: string;
  patientId: string;
  eventKey: string;
  direction: PrescriptionTransactionDirection;
  eventType: string;
  state: PrescriptionTransactionState;
  externalEventId?: string;
  externalReferenceId?: string;
  metadata: Record<string, unknown>;
  error?: PrescriptionTransactionError;
  occurredAt: string;
  receivedAt: string;
  sourceSystem: string;
  evidenceCandidateId?: string;
}

export type PrescriptionTransactionRelationshipSummary = {
  transactionId: string;
  orderId: string;
  transactionType: PrescriptionTransactionType;
  state: PrescriptionTransactionState;
};

export type PrescriptionTransactionStatusEvent = {
  eventId: string;
  eventRef: string;
  direction: PrescriptionTransactionDirection;
  eventType: string;
  state: PrescriptionTransactionState;
  externalEventId?: string;
  externalReferenceId?: string;
  occurredAt: string;
  receivedAt: string;
  sourceSystem: string;
  evidenceCandidateId?: string;
};

/**
 * Permission-aware reusable read projection. It intentionally excludes arbitrary event metadata
 * and raw adapter payloads so UI/AI consumers do not become alternate transport-data stores.
 */
export type PrescriptionTransactionStatusView = {
  transactionId: string;
  patientId: string;
  orderId: string;
  transactionType: PrescriptionTransactionType;
  state: PrescriptionTransactionState;
  attemptCount: number;
  relatedTransactionId?: string;
  relatedTransaction?: PrescriptionTransactionRelationshipSummary;
  linkedTransactions: PrescriptionTransactionRelationshipSummary[];
  externalReferenceId?: string;
  submittedAt?: string;
  acknowledgedAt?: string;
  failedAt?: string;
  canceledAt?: string;
  lastError?: PrescriptionTransactionError;
  createdAt: string;
  updatedAt: string;
  source: {
    transactionRef: string;
    sourceType: string;
    sourceRef?: string;
  };
  recentEvents: PrescriptionTransactionStatusEvent[];
  medicationTruthChanged: false;
};

export type ExternalMedicationEvidence = {
  evidenceType: string;
  displayText: string;
  medicationName?: string;
  genericName?: string;
  strength?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  startDate?: string;
  endDate?: string;
  prescriber?: string;
  observedAt?: string;
};

/**
 * Adapter-normalized inbound event. correlationId is the routing authority.
 * Optional patient/order/transaction identifiers are consistency assertions only.
 */
export type NormalizedPrescriptionVendorEvent = {
  adapterId: string;
  correlationId: string;
  externalEventId: string;
  eventType: string;
  state: PrescriptionTransactionState;
  occurredAt?: string;
  transactionId?: string;
  orderId?: string;
  patientId?: string;
  externalReferenceId?: string;
  metadata?: Record<string, unknown>;
  error?: PrescriptionTransactionError;
  medicationEvidence?: ExternalMedicationEvidence;
};

const ALLOWED_TRANSITIONS: Record<PrescriptionTransactionState, ReadonlySet<PrescriptionTransactionState>> = {
  prepared: new Set([
    "submitted",
    "acknowledged",
    "accepted",
    "rejected",
    "failed",
    "outcome_uncertain",
    "cancellation_acknowledged",
    "canceled",
  ]),
  submitted: new Set(["acknowledged", "accepted", "rejected", "failed", "cancellation_requested", "cancellation_acknowledged", "change_requested"]),
  acknowledged: new Set(["accepted", "rejected", "failed", "cancellation_requested", "change_requested"]),
  accepted: new Set(["cancellation_requested", "change_requested", "canceled"]),
  rejected: new Set(["prepared"]),
  failed: new Set(["prepared"]),
  outcome_uncertain: new Set([
    "submitted",
    "acknowledged",
    "accepted",
    "rejected",
    "failed",
    "cancellation_acknowledged",
    "canceled",
  ]),
  cancellation_requested: new Set(["prepared", "cancellation_acknowledged", "failed"]),
  cancellation_acknowledged: new Set(["canceled"]),
  canceled: new Set(),
  change_requested: new Set(["prepared", "cancellation_requested"]),
};

export function canTransitionPrescriptionTransaction(
  from: PrescriptionTransactionState,
  to: PrescriptionTransactionState,
): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].has(to);
}

const SECRET_METADATA_KEY =
  /password|passcode|\bpin\b|otp|token|secret|credential|api[_-]?key|authorization|cookie|session|private[_-]?key|client[_-]?secret/i;
const AUTH_SCHEME_IN_MESSAGE =
  /authorization\s*[:=]\s*(?:bearer|basic)\s+[^\s,;]+/gi;
const SECRET_IN_MESSAGE =
  /(password|passcode|pin|otp|token|secret|credential|api[_-]?key|authorization|cookie|session)\s*[:=]\s*[^\s,;]+/gi;
const SECRET_WORD_VALUE_IN_MESSAGE =
  /\b(pin|otp|password|passcode|token|secret|api[_-]?key)\s+[^\s,;]+/gi;
const BEARER_IN_MESSAGE = /bearer\s+[A-Za-z0-9._~+/=-]+/gi;

export function sanitizePrescriptionTransactionErrorMessage(message: string): string {
  return message
    .replace(AUTH_SCHEME_IN_MESSAGE, "authorization=[REDACTED]")
    .replace(BEARER_IN_MESSAGE, "Bearer [REDACTED]")
    .replace(SECRET_IN_MESSAGE, (match) => `${match.split(/[:=]/, 1)[0]}=[REDACTED]`)
    .replace(SECRET_WORD_VALUE_IN_MESSAGE, (match) => `${match.split(/\s+/, 1)[0]}=[REDACTED]`);
}

/** Keep persisted transaction/event metadata useful without turning it into a credential store. */
export function sanitizePrescriptionTransactionMetadata(value: unknown): unknown {
  if (typeof value === "string") return sanitizePrescriptionTransactionErrorMessage(value);
  if (Array.isArray(value)) return value.map(sanitizePrescriptionTransactionMetadata);
  if (!value || typeof value !== "object") return value;

  const safe: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_METADATA_KEY.test(key)) continue;
    safe[key] = sanitizePrescriptionTransactionMetadata(nestedValue);
  }
  return safe;
}
