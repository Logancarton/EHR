import type { MedicationTruthImpactKind } from "./medication-prescription-intent";
import type { PrescriptionChangeRequestCategory, PrescriptionChangeRequestStatus, PrescriptionRequestedChanges } from "./prescription-changes";
import type { PrescriptionRefillRequestSource, PrescriptionRefillRequestStatus } from "./prescription-refills";
import type { PrescriptionTransactionState, PrescriptionTransactionType } from "./prescription-transactions";

export type PatientPrescriptionOrderStatus =
  | "staged"
  | "authorized"
  | "transmitted"
  | "transmission_failed"
  | "transmission_uncertain";

export type PatientPrescribingWorkflowGroup =
  | "needs_provider_action"
  | "ready_to_authorize"
  | "ready_to_send"
  | "awaiting_external_outcome"
  | "needs_operational_review"
  | "completed_historical";

export type PatientPrescribingActionId =
  | "authorize"
  | "transmit"
  | "retry_transmission"
  | "confirm_medication_truth"
  | "renew_refill"
  | "accept_change"
  | "decline_change"
  | "cancel_prescription"
  | "record_recovery_evidence";

export type PatientPrescribingActionProjection = {
  id: PatientPrescribingActionId;
  allowed: boolean;
  reason: string;
  targetId?: string;
};

export type PatientPrescriptionTransportProjection = {
  transactionId: string;
  transactionType: PrescriptionTransactionType;
  state: PrescriptionTransactionState;
  attemptCount: number;
  relatedTransactionId?: string;
  pharmacyName?: string;
  updatedAt: string;
};

export type PatientPrescriptionRefillLineage = {
  refillRequestId: string;
  status: PrescriptionRefillRequestStatus;
  requestSource: PrescriptionRefillRequestSource;
  priorOrderId: string;
  priorTransactionId: string;
  renewalOrderId?: string;
  updatedAt: string;
};

export type PatientPrescriptionChangeLineage = {
  changeRequestId: string;
  status: PrescriptionChangeRequestStatus;
  category: PrescriptionChangeRequestCategory;
  requestedChanges: PrescriptionRequestedChanges;
  sourceOrderId: string;
  sourceTransactionId: string;
  resultingOrderId?: string;
  updatedAt: string;
};

export type PatientPrescriptionCancellationLineage = {
  cancellationTransactionId: string;
  targetTransactionId: string;
  state: PrescriptionTransactionState;
  updatedAt: string;
};

export type PatientPrescriptionRecoveryProjection = {
  transactionId: string;
  status:
    | "not_applicable"
    | "requires_review"
    | "investigated_unresolved"
    | "retry_unlocked"
    | "superseded"
    | "resolved_by_external_evidence"
    | "evidence_conflict"
    | "recovered_retry_progressed";
  requiresAttention: boolean;
  retryAllowed: boolean;
  reason: string;
};

export type PatientMedicationTruthRelationship = {
  confirmed: boolean;
  medicationRecordId?: string;
  confirmationOperation?: "add" | "update";
  advisoryImpact: MedicationTruthImpactKind;
  advisorySummary: string;
  suggestedOperation?: "add" | "update";
  suggestedMedicationRecordId?: string;
  changedByPrescriptionActivity: false;
};

export type PatientPrescribingLineageEvent = {
  id: string;
  kind: "order" | "transport" | "refill" | "change_request" | "cancellation" | "recovery";
  label: string;
  at: string;
};

export type PatientPrescriptionWorkItem = {
  id: string;
  patientId: string;
  orderId: string;
  medicationName: string;
  displayStatus: string;
  group: PatientPrescribingWorkflowGroup;
  orderStatus: PatientPrescriptionOrderStatus;
  historical: boolean;
  pharmacyName?: string;
  prescription: {
    strength?: string;
    dose?: string;
    route?: string;
    frequency?: string;
    sig?: string;
    quantity?: number;
    daysSupply?: number;
    refills?: number;
  };
  medicationTruth: PatientMedicationTruthRelationship;
  latestTransport?: PatientPrescriptionTransportProjection;
  transports: PatientPrescriptionTransportProjection[];
  refillLineage: PatientPrescriptionRefillLineage[];
  changeLineage: PatientPrescriptionChangeLineage[];
  cancellationLineage: PatientPrescriptionCancellationLineage[];
  recovery?: PatientPrescriptionRecoveryProjection;
  actions: PatientPrescribingActionProjection[];
  lineage: PatientPrescribingLineageEvent[];
  updatedAt: string;
};

export type PatientPrescribingWorkflowSection = {
  group: PatientPrescribingWorkflowGroup;
  label: string;
  items: PatientPrescriptionWorkItem[];
};

export type PatientPrescribingWorkspaceProjection = {
  patientId: string;
  generatedAt: string;
  sections: PatientPrescribingWorkflowSection[];
  medicationTruthBoundary: "Prescription activity never changes the clinical medication record without explicit confirmation.";
};
