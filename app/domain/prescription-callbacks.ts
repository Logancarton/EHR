import type {
  PrescriptionChangeRequestCategory,
  PrescriptionRequestedChanges,
} from "./prescription-changes";
import type {
  ExternalMedicationEvidence,
  PrescriptionTransactionError,
  PrescriptionTransactionState,
} from "./prescription-transactions";

export const PRESCRIPTION_CALLBACK_TYPES = [
  "transaction-event",
  "refill-request",
  "change-request",
] as const;

export type PrescriptionCallbackType = (typeof PRESCRIPTION_CALLBACK_TYPES)[number];

export type PrescriptionCallbackAssertions = {
  patientId?: string;
  orderId?: string;
  transactionId?: string;
};

type VerifiedPrescriptionCallbackBase = {
  adapterId: string;
  externalMessageId: string;
  correlationId: string;
  externalReferenceId?: string;
  occurredAt?: string;
  assertions?: PrescriptionCallbackAssertions;
};

export type VerifiedPrescriptionTransactionCallback = VerifiedPrescriptionCallbackBase & {
  callbackType: "transaction-event";
  payload: {
    eventType: string;
    state: PrescriptionTransactionState;
    error?: PrescriptionTransactionError;
    medicationEvidence?: ExternalMedicationEvidence;
  };
};

export type VerifiedPrescriptionRefillCallback = VerifiedPrescriptionCallbackBase & {
  callbackType: "refill-request";
  payload: {
    externalRequestId?: string;
    sourceReference?: string;
    note?: string;
  };
};

export type VerifiedPrescriptionChangeCallback = VerifiedPrescriptionCallbackBase & {
  callbackType: "change-request";
  payload: {
    externalRequestId: string;
    category: PrescriptionChangeRequestCategory;
    requestedChanges: PrescriptionRequestedChanges;
    summary?: string;
    sourceReference?: string;
  };
};

/**
 * Vendor-neutral callback that exists only after a vendor-specific adapter has
 * authenticated the raw HTTP request and translated it into bounded EHR concepts.
 * Raw request bodies, headers, signatures, credentials, and transport artifacts are
 * deliberately absent from this type.
 */
export type VerifiedPrescriptionCallback =
  | VerifiedPrescriptionTransactionCallback
  | VerifiedPrescriptionRefillCallback
  | VerifiedPrescriptionChangeCallback;

export type PrescriptionCallbackReceiptStatus = "processing" | "processed" | "rejected";

/** Durable replay/binding record. It stores identity hashes and resulting EHR IDs, never raw payloads. */
export type PrescriptionCallbackReceipt = {
  id: string;
  adapterId: string;
  externalMessageId: string;
  callbackType: PrescriptionCallbackType;
  correlationId: string;
  normalizedFingerprint: string;
  patientId: string;
  orderId: string;
  transactionId: string;
  transactionEventId?: string;
  refillRequestId?: string;
  changeRequestId?: string;
  status: PrescriptionCallbackReceiptStatus;
  failureCode?: string;
  receivedAt: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
};
