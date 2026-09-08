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
  medicationEvidence?: ExternalMedicationEvidence;
};

const ALLOWED_TRANSITIONS: Record<PrescriptionTransactionState, ReadonlySet<PrescriptionTransactionState>> = {
  prepared: new Set(["submitted", "failed"]),
  submitted: new Set(["acknowledged", "accepted", "rejected", "failed", "cancellation_requested", "change_requested"]),
  acknowledged: new Set(["accepted", "rejected", "failed", "cancellation_requested", "change_requested"]),
  accepted: new Set(["cancellation_requested", "change_requested", "canceled"]),
  rejected: new Set(["prepared"]),
  failed: new Set(["prepared"]),
  cancellation_requested: new Set(["cancellation_acknowledged", "failed"]),
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

/** Keep persisted transaction/event metadata useful without turning it into a credential store. */
export function sanitizePrescriptionTransactionMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizePrescriptionTransactionMetadata);
  if (!value || typeof value !== "object") return value;

  const safe: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_METADATA_KEY.test(key)) continue;
    safe[key] = sanitizePrescriptionTransactionMetadata(nestedValue);
  }
  return safe;
}
