import type {
  AllergyCategory,
  AllergyRecord,
  AllergySeverity,
  AllergyStatus,
  ClinicalRecordHistory,
  ClinicalRecordSnapshot,
  MedicationRecord,
  MedicationStatus,
  ProblemRecord,
  ProblemStatus,
} from "../domain/clinical-records";
import { request } from "./api-client";
import type {
  VitalMeasurementInput,
  VitalSignSummary,
  PsychiatricHistoryItem,
  PsychiatricHistoryInput,
  PsychiatricHistoryPatch,
  AssessmentRecord,
  AssessmentInput,
} from "../domain/clinical-measurements";

export type EncounterAddendumRecord = {
  id: string;
  encounterId: string;
  patientId: string;
  addendumType: "addendum" | "amendment";
  body: string;
  reason?: string;
  createdBy: string;
  createdAt: string;
};

function mapEncounterAddendum(row: Record<string, unknown>): EncounterAddendumRecord {
  return {
    id: String(row.id || ""),
    encounterId: String(row.encounter_id || row.encounterId || ""),
    patientId: String(row.patient_id || row.patientId || ""),
    addendumType: row.addendum_type === "amendment" || row.addendumType === "amendment" ? "amendment" : "addendum",
    body: String(row.body || ""),
    reason: typeof (row.reason) === "string" && row.reason ? row.reason : undefined,
    createdBy: String(row.created_by || row.createdBy || ""),
    createdAt: String(row.created_at || row.createdAt || ""),
  };
}

async function clinicalRequest<T>(url: string, patientId: string, options: RequestInit = {}): Promise<T> {
  return request<T>(url, options, patientId);
}

export const clinicalRecordApi = {
  async snapshot(patientId: string): Promise<ClinicalRecordSnapshot> {
    const response = await clinicalRequest<{ success: true; record: ClinicalRecordSnapshot }>(
      `/api/clinical-records?patientId=${encodeURIComponent(patientId)}`,
      patientId,
    );
    return {
      problems: response.record.problems || [],
      allergies: response.record.allergies || [],
      medications: response.record.medications || [],
      observations: response.record.observations || [],
      vitals: response.record.vitals || [],
      psychiatricHistory: response.record.psychiatricHistory || [],
      assessments: response.record.assessments || [],
      encounters: response.record.encounters || [],
      upcomingAppointments: response.record.upcomingAppointments || [],
      documents: response.record.documents || [],
    };
  },

  async addProblem(patientId: string, input: {
    displayText: string;
    code?: string;
    codingSystem?: string;
    onsetDate?: string;
  }): Promise<ProblemRecord> {
    const response = await clinicalRequest<{ success: true; result: ProblemRecord }>(
      "/api/clinical-records",
      patientId,
      {
        method: "POST",
        body: JSON.stringify({ type: "add_problem", payload: { patientId, ...input } }),
      },
    );
    return response.result;
  },

  async updateProblem(patientId: string, recordId: string, patch: {
    displayText?: string;
    code?: string | null;
    codingSystem?: string | null;
    onsetDate?: string | null;
    status?: ProblemStatus;
    resolvedDate?: string | null;
  }): Promise<ProblemRecord> {
    const response = await clinicalRequest<{ success: true; result: ProblemRecord }>(
      "/api/clinical-records",
      patientId,
      {
        method: "POST",
        body: JSON.stringify({ type: "update_problem", payload: { recordId, patch } }),
      },
    );
    return response.result;
  },

  async addAllergy(patientId: string, input: {
    substance: string;
    reaction?: string;
    severity?: AllergySeverity;
    category?: AllergyCategory;
    isNkda?: boolean;
  }): Promise<AllergyRecord> {
    const response = await clinicalRequest<{ success: true; result: AllergyRecord }>(
      "/api/clinical-records",
      patientId,
      {
        method: "POST",
        body: JSON.stringify({ type: "add_allergy", payload: { patientId, ...input } }),
      },
    );
    return response.result;
  },

  async updateAllergy(patientId: string, recordId: string, patch: {
    reaction?: string | null;
    severity?: AllergySeverity;
    status?: AllergyStatus;
  }): Promise<AllergyRecord> {
    const response = await clinicalRequest<{ success: true; result: AllergyRecord }>(
      "/api/clinical-records",
      patientId,
      {
        method: "POST",
        body: JSON.stringify({ type: "update_allergy", payload: { recordId, patch } }),
      },
    );
    return response.result;
  },

  async addMedication(patientId: string, input: {
    displayText: string;
    medicationName?: string;
    genericName?: string;
    strength?: string;
    dose?: string;
    route?: string;
    frequency?: string;
    indication?: string;
    startDate?: string;
    prescriber?: string;
  }): Promise<MedicationRecord> {
    const response = await clinicalRequest<{ success: true; result: MedicationRecord }>(
      "/api/clinical-records",
      patientId,
      {
        method: "POST",
        body: JSON.stringify({ type: "add_medication", payload: { patientId, ...input } }),
      },
    );
    return response.result;
  },

  async updateMedication(patientId: string, recordId: string, patch: {
    displayText?: string;
    medicationName?: string;
    genericName?: string | null;
    strength?: string | null;
    dose?: string | null;
    route?: string | null;
    frequency?: string | null;
    indication?: string | null;
    status?: MedicationStatus;
    endDate?: string | null;
  }): Promise<MedicationRecord> {
    const response = await clinicalRequest<{ success: true; result: MedicationRecord }>(
      "/api/clinical-records",
      patientId,
      {
        method: "POST",
        body: JSON.stringify({ type: "update_medication", payload: { recordId, patch } }),
      },
    );
    return response.result;
  },

  async history(
    patientId: string,
    entityType: "problem" | "allergy" | "medication",
    entityId: string,
  ): Promise<ClinicalRecordHistory> {
    const params = new URLSearchParams({ patientId, entityType, entityId });
    const response = await clinicalRequest<{ success: true } & ClinicalRecordHistory>(
      `/api/clinical-records?${params.toString()}`,
      patientId,
    );
    return { versions: response.versions, provenance: response.provenance };
  },

  async encounterAddenda(patientId: string, encounterId: string): Promise<EncounterAddendumRecord[]> {
    const params = new URLSearchParams({ patientId, encounterId });
    const response = await clinicalRequest<{ success: true; addenda: Array<Record<string, unknown>> }>(
      `/api/clinical-records?${params.toString()}`,
      patientId,
    );
    return (response.addenda || []).map(mapEncounterAddendum);
  },

  async addEncounterAddendum(
    patientId: string,
    encounterId: string,
    input: {
      body: string;
      reason?: string;
      addendumType?: "addendum" | "amendment";
    },
  ): Promise<EncounterAddendumRecord> {
    const response = await clinicalRequest<{ success: true; result: Record<string, unknown> }>(
      "/api/clinical-records",
      patientId,
      {
        method: "POST",
        body: JSON.stringify({
          type: "add_encounter_addendum",
          payload: { encounterId, ...input },
        }),
      },
    );
    return mapEncounterAddendum(response.result);
  },

  async recordVitals(
    patientId: string,
    input: Omit<VitalMeasurementInput, "patientId">,
  ): Promise<VitalSignSummary> {
    const response = await clinicalRequest<{ success: true; result: VitalSignSummary }>(
      "/api/clinical-records",
      patientId,
      {
        method: "POST",
        body: JSON.stringify({ type: "record_vitals", payload: { patientId, ...input } }),
      },
    );
    return response.result;
  },

  async addPsychiatricHistory(
    patientId: string,
    input: Omit<PsychiatricHistoryInput, "patientId">,
  ): Promise<PsychiatricHistoryItem> {
    const response = await clinicalRequest<{ success: true; result: PsychiatricHistoryItem }>(
      "/api/clinical-records",
      patientId,
      {
        method: "POST",
        body: JSON.stringify({ type: "add_psychiatric_history_item", payload: { patientId, ...input } }),
      },
    );
    return response.result;
  },

  async updatePsychiatricHistory(
    patientId: string,
    recordId: string,
    patch: PsychiatricHistoryPatch,
  ): Promise<PsychiatricHistoryItem> {
    const response = await clinicalRequest<{ success: true; result: PsychiatricHistoryItem }>(
      "/api/clinical-records",
      patientId,
      {
        method: "POST",
        body: JSON.stringify({ type: "update_psychiatric_history_item", payload: { recordId, patch } }),
      },
    );
    return response.result;
  },

  async recordAssessment(
    patientId: string,
    input: Omit<AssessmentInput, "patientId">,
  ): Promise<AssessmentRecord> {
    const response = await clinicalRequest<{ success: true; result: AssessmentRecord }>(
      "/api/clinical-records",
      patientId,
      {
        method: "POST",
        body: JSON.stringify({ type: "record_assessment", payload: { patientId, ...input } }),
      },
    );
    return response.result;
  },

  async reviewAssessment(
    patientId: string,
    assessmentId: string,
    notes?: string,
  ): Promise<AssessmentRecord> {
    const response = await clinicalRequest<{ success: true; result: AssessmentRecord }>(
      "/api/clinical-records",
      patientId,
      {
        method: "POST",
        body: JSON.stringify({ type: "review_assessment", payload: { assessmentId, notes } }),
      },
    );
    return response.result;
  },
};
