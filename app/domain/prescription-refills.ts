export type PrescriptionRefillRequestSource = "patient" | "pharmacy" | "clinician";
export type PrescriptionRefillRequestStatus = "pending" | "renewal_staged";

export interface PrescriptionRefillRequest {
  id: string;
  patientId: string;
  priorOrderId: string;
  priorTransactionId: string;
  status: PrescriptionRefillRequestStatus;
  requestSource: PrescriptionRefillRequestSource;
  sourceSystem: string;
  sourceReference?: string;
  note?: string;
  idempotencyKey: string;
  renewalOrderId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Bounded reusable refill/renewal workflow projection. This is request/workflow state,
 * not prescription transport state and not authoritative medication truth. Free-text
 * request notes and idempotency internals remain outside this projection.
 */
export interface PrescriptionRefillRequestStatusView {
  refillRequestId: string;
  patientId: string;
  priorOrderId: string;
  priorTransactionId: string;
  status: PrescriptionRefillRequestStatus;
  requestSource: PrescriptionRefillRequestSource;
  sourceSystem: string;
  sourceReference?: string;
  renewalOrderId?: string;
  createdAt: string;
  updatedAt: string;
  source: {
    refillRequestRef: string;
    priorOrderRef: string;
    priorTransactionRef: string;
    renewalOrderRef?: string;
  };
  medicationTruthChanged: false;
}
