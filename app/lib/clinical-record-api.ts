import type {
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

const ACTIVE_PATIENT_HEADER = "x-ehr-patient-id";

async function clinicalRequest<T>(url: string, patientId: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      [ACTIVE_PATIENT_HEADER]: patientId,
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok || body.success === false) {
    throw new Error(body.error || `Clinical record request failed (${response.status}).`);
  }
  return body as T;
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
    startDate?: string | null;
    prescriber?: string | null;
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
};
