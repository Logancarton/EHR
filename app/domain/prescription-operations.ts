import type {
  PrescriptionTransactionState,
  PrescriptionTransactionType,
} from "./prescription-transactions";

export type PrescriptionAttentionClassification =
  | "outcome_unknown"
  | "interrupted_attempt"
  | "transmission_failed"
  | "evidence_conflict"
  | "callback_processing_stale";

export type PrescriptionRetryBlockCode =
  | "none"
  | "not_applicable"
  | "no_confirming_evidence"
  | "investigation_unresolved"
  | "verified_evidence_exists"
  | "evidence_conflict"
  | "authorization_required"
  | "integration_disabled"
  | "integration_missing_configuration"
  | "integration_missing_secret"
  | "permission_required"
  | "transaction_not_recoverable";

export type PrescriptionRetryProjection = {
  allowed: boolean;
  code: PrescriptionRetryBlockCode;
  reason: string;
};

export type PrescriptionOperationsPatient = {
  id: string;
  name: string;
  mrn: string;
};

export type PrescriptionOperationsIdentity = {
  orderId: string;
  transactionId: string;
  medicationName: string;
  transactionType: PrescriptionTransactionType;
  transportState: PrescriptionTransactionState;
  attemptCount: number;
  adapterId: string;
  pharmacyName?: string;
};

export type PrescriptionOperationsQueueItem = {
  id: string;
  classification: PrescriptionAttentionClassification;
  statusLabel: string;
  patient: PrescriptionOperationsPatient;
  prescription: PrescriptionOperationsIdentity;
  reason: string;
  retry: PrescriptionRetryProjection;
  evidenceConflict: boolean;
  updatedAt: string;
  callbackReceiptId?: string;
};

export type PrescriptionOperationsTimelineCategory =
  | "local_system"
  | "manual_evidence"
  | "outbound_attempt"
  | "verified_vendor"
  | "callback_processing";

export type PrescriptionOperationsTimelineItem = {
  id: string;
  category: PrescriptionOperationsTimelineCategory;
  at: string;
  label: string;
  detail?: string;
  state?: PrescriptionTransactionState;
  sourceLabel?: string;
};

export type PrescriptionRecoveryActionId =
  | "investigated_unresolved"
  | "confirmed_not_received"
  | "superseded_by_verified_transaction"
  | "retry_transmission";

export type PrescriptionRecoveryActionProjection = {
  id: PrescriptionRecoveryActionId;
  allowed: boolean;
  reason: string;
};

export type PrescriptionSupersedingCandidate = {
  transactionId: string;
  orderId: string;
  medicationName: string;
  verifiedState: PrescriptionTransactionState;
  verifiedAt: string;
};

export type PrescriptionOperationsDetail = PrescriptionOperationsQueueItem & {
  timeline: PrescriptionOperationsTimelineItem[];
  actions: PrescriptionRecoveryActionProjection[];
  supersedingCandidates: PrescriptionSupersedingCandidate[];
  medicationTruthChanged: false;
};

export type PrescriptionIntegrationReadinessProjection = {
  adapterId?: string;
  readiness: "ready" | "disabled" | "missing_configuration" | "missing_secret";
  statusLabel: string;
  reason: string;
  lastSuccessfulInteractionAt?: string;
};

export type PrescriptionOperationsQueue = {
  generatedAt: string;
  staleCallbackThresholdMinutes: number;
  items: PrescriptionOperationsQueueItem[];
  integrations: PrescriptionIntegrationReadinessProjection[];
};
