export const PRESCRIPTION_CHANGE_REQUEST_CATEGORIES = [
  "product-substitution",
  "strength",
  "dose-directions",
  "quantity-day-supply",
  "formulary-alternative",
  "pharmacy-alternative",
  "other",
] as const;

export type PrescriptionChangeRequestCategory =
  (typeof PRESCRIPTION_CHANGE_REQUEST_CATEGORIES)[number];

export type PrescriptionChangeRequestStatus = "pending" | "accepted" | "declined";
export type PrescriptionChangeResolutionDecision = "accepted" | "declined";

/**
 * Vendor-neutral, bounded prescription fields that a pharmacy/network may ask the
 * clinician to change. This is request evidence only; values do not become a
 * prescription until a clinician explicitly stages a new order.
 */
export type PrescriptionRequestedChanges = {
  medicationName?: string;
  genericName?: string;
  strength?: string;
  dose?: string;
  form?: string;
  route?: string;
  frequency?: string;
  quantity?: number;
  daysSupply?: number;
  refills?: number;
  substitutionAllowed?: boolean;
  sig?: string;
  indication?: string;
};

export interface PrescriptionChangeRequest {
  id: string;
  patientId: string;
  sourceOrderId: string;
  sourceTransactionId: string;
  adapterId: string;
  vendorName: string;
  externalRequestId: string;
  category: PrescriptionChangeRequestCategory;
  requestedChanges: PrescriptionRequestedChanges;
  summary?: string;
  sourceReference?: string;
  status: PrescriptionChangeRequestStatus;
  resultingOrderId?: string;
  resolutionDecision?: PrescriptionChangeResolutionDecision;
  resolvedById?: string;
  resolvedByName?: string;
  resolvedAt?: string;
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Permission-aware reusable projection for future inbox/UI/AI readers. It exposes
 * normalized requested changes and stable references, never raw vendor payloads,
 * credentials, arbitrary metadata, or transport secrets.
 */
export interface PrescriptionChangeRequestStatusView {
  changeRequestId: string;
  patientId: string;
  sourceOrderId: string;
  sourceTransactionId: string;
  adapterId: string;
  vendorName: string;
  externalRequestId: string;
  category: PrescriptionChangeRequestCategory;
  requestedChanges: PrescriptionRequestedChanges;
  summary?: string;
  sourceReference?: string;
  status: PrescriptionChangeRequestStatus;
  resultingOrderId?: string;
  resolutionDecision?: PrescriptionChangeResolutionDecision;
  resolvedById?: string;
  resolvedByName?: string;
  resolvedAt?: string;
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
  source: {
    changeRequestRef: string;
    sourceOrderRef: string;
    sourceTransactionRef: string;
    resultingOrderRef?: string;
  };
  medicationTruthChanged: false;
}
