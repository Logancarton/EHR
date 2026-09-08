export type ProblemStatus = "active" | "resolved" | "inactive" | "entered-in-error";
export type AllergyStatus = "active" | "inactive" | "entered-in-error";
export type AllergySeverity = "mild" | "moderate" | "severe" | "unknown";
export type MedicationStatus = "active" | "discontinued" | "completed" | "entered-in-error";

export interface ProblemRecord {
  id: string;
  patient_id: string;
  code: string | null;
  coding_system: string | null;
  display_text: string;
  status: ProblemStatus;
  onset_date: string | null;
  resolved_date: string | null;
  source_type: string;
  source_system: string;
  source_ref: string | null;
  recorded_by: string;
  recorded_at: string;
  updated_at: string;
}

export interface AllergyRecord {
  id: string;
  patient_id: string;
  substance: string;
  reaction: string | null;
  severity: AllergySeverity;
  status: AllergyStatus;
  source_type: string;
  source_system: string;
  source_ref: string | null;
  recorded_by: string;
  recorded_at: string;
  updated_at: string;
}

export interface MedicationRecord {
  id: string;
  patient_id: string;
  display_text: string;
  medication_name: string;
  generic_name: string | null;
  strength: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  status: MedicationStatus;
  start_date: string | null;
  end_date: string | null;
  prescriber: string | null;
  source_type: string;
  source_system: string;
  source_ref: string | null;
  recorded_by: string;
  recorded_at: string;
  updated_at: string;
}

export interface ClinicalRecordVersion<TSnapshot = Record<string, unknown>> {
  id: string;
  patient_id: string | null;
  entity_type: string;
  entity_id: string;
  version_number: number;
  operation: string;
  snapshot_json: string;
  snapshot: TSnapshot;
  actor_id: string;
  actor_name: string;
  source_type: string;
  source_ref: string | null;
  created_at: string;
}

export interface ClinicalProvenanceEvent {
  id: string;
  patient_id: string | null;
  entity_type: string;
  entity_id: string;
  activity: string;
  source_type: string;
  source_system: string;
  source_ref: string | null;
  actor_id: string | null;
  actor_name: string | null;
  payload_sha256: string | null;
  metadata_json: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ClinicalRecordSnapshot {
  problems: ProblemRecord[];
  allergies: AllergyRecord[];
  medications: MedicationRecord[];
}

export type ProblemAllergySnapshot = Pick<ClinicalRecordSnapshot, "problems" | "allergies">;

export interface ClinicalRecordHistory<TSnapshot = Record<string, unknown>> {
  versions: Array<ClinicalRecordVersion<TSnapshot>>;
  provenance: ClinicalProvenanceEvent[];
}
