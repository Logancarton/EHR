export type MedicationCandidateSourceType =
  | "patient-reported"
  | "clinician-entered"
  | "external-vendor"
  | "imported-record"
  | "other";

export type MedicationCandidateStatus = "pending" | "accepted" | "ignored";
export type MedicationReconciliationDecision = "add" | "update" | "discontinue" | "ignore";

export interface MedicationReconciliationCandidate {
  id: string;
  patient_id: string;
  source_type: MedicationCandidateSourceType;
  source_system: string;
  source_ref: string | null;
  evidence_type: string;
  display_text: string;
  medication_name: string;
  generic_name: string | null;
  strength: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  start_date: string | null;
  end_date: string | null;
  prescriber: string | null;
  observed_at: string | null;
  status: MedicationCandidateStatus;
  linked_medication_id: string | null;
  decision: MedicationReconciliationDecision | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RecordMedicationCandidateInput {
  patientId: string;
  sourceType: MedicationCandidateSourceType;
  sourceSystem?: string;
  sourceRef?: string;
  evidenceType?: string;
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
  linkedMedicationId?: string;
}

export interface ReconcileMedicationCandidateInput {
  candidateId: string;
  decision: MedicationReconciliationDecision;
  medicationId?: string;
}
