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

export type AllergyCategory = "medication" | "food" | "environment" | "biologic" | "other";

export interface AllergyRecord {
  id: string;
  patient_id: string;
  substance: string;
  reaction: string | null;
  severity: AllergySeverity;
  status: AllergyStatus;
  category?: AllergyCategory;
  is_nkda?: boolean;
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

import type {
  VitalSignSummary,
  PsychiatricHistoryItem,
  AssessmentRecord,
} from "./clinical-measurements";

export interface PatientEncounterSummary {
  id: string;
  patientId: string;
  appointmentId?: string;
  date: string;
  type: string;
  status: "draft" | "signed";
  chiefComplaint: string;
  hpi?: string;
  intervalHistory?: string;
  assessment: string;
  plan: string;
  cptCode?: string;
  emLevel?: string;
  signedBy?: string;
  signedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpcomingAppointmentSummary {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  time: string;
  duration: number;
  type: string;
  provider: string;
  status: string;
  room?: string;
}

export interface ClinicalDocumentSummary {
  id: string;
  patientId: string;
  documentType: string;
  title: string;
  status: string;
  currentVersion: number;
  mimeType: string;
  sourceSystem: string;
  sourceRef?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type TimelineEventType =
  | "encounter"
  | "medication"
  | "diagnosis"
  | "lab"
  | "assessment"
  | "vitals"
  | "document"
  | "communication";

export interface UnifiedTimelineEvent {
  id: string;
  type: TimelineEventType;
  date: string;
  title: string;
  summary: string;
  badge?: string;
  badgeTone?: "info" | "success" | "warning" | "danger" | "neutral";
  details?: Record<string, unknown>;
  author?: string;
  sourceRef?: string;
  actionTarget?: {
    section?: "Encounter" | "Meds" | "Labs" | "Documents" | "Messages" | "History";
    modal?: "vitals" | "assessments" | "admin";
    entityId?: string;
  };
}

export interface OverviewAttentionItem {
  id: string;
  category: "safety" | "metabolic" | "surveillance" | "unsigned" | "unreviewed" | "allergy";
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  actionLabel: string;
  targetSection?: "Encounter" | "Meds" | "Labs" | "Documents" | "Messages" | "History";
  targetModal?: "vitals" | "assessments" | "admin";
}

export interface ClinicalRecordSnapshot {
  problems: ProblemRecord[];
  allergies: AllergyRecord[];
  medications: MedicationRecord[];
  vitals?: VitalSignSummary[];
  psychiatricHistory?: PsychiatricHistoryItem[];
  assessments?: AssessmentRecord[];
  encounters?: PatientEncounterSummary[];
  upcomingAppointments?: UpcomingAppointmentSummary[];
  documents?: ClinicalDocumentSummary[];
}

export type ProblemAllergySnapshot = Pick<ClinicalRecordSnapshot, "problems" | "allergies">;

export interface ClinicalRecordHistory<TSnapshot = Record<string, unknown>> {
  versions: Array<ClinicalRecordVersion<TSnapshot>>;
  provenance: ClinicalProvenanceEvent[];
}

