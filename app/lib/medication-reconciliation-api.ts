import type {
  MedicationReconciliationCandidate,
  MedicationReconciliationDecision,
  RecordMedicationCandidateInput,
} from "../domain/medication-reconciliation";
import type { MedicationRecord } from "../domain/clinical-records";

const ACTIVE_PATIENT_HEADER = "x-ehr-patient-id";

async function reconciliationRequest<T>(
  url: string,
  patientId: string,
  options: RequestInit = {},
): Promise<T> {
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
    throw new Error(body.error || `Medication reconciliation request failed (${response.status}).`);
  }
  return body as T;
}

export const medicationReconciliationApi = {
  async list(patientId: string): Promise<MedicationReconciliationCandidate[]> {
    const response = await reconciliationRequest<{
      success: true;
      candidates: MedicationReconciliationCandidate[];
    }>(
      `/api/medication-reconciliation?patientId=${encodeURIComponent(patientId)}`,
      patientId,
    );
    return response.candidates || [];
  },

  async record(
    patientId: string,
    input: Omit<RecordMedicationCandidateInput, "patientId">,
  ): Promise<MedicationReconciliationCandidate> {
    const response = await reconciliationRequest<{
      success: true;
      result: MedicationReconciliationCandidate;
    }>(
      "/api/medication-reconciliation",
      patientId,
      {
        method: "POST",
        body: JSON.stringify({
          type: "record_medication_candidate",
          payload: { patientId, ...input },
        }),
      },
    );
    return response.result;
  },

  async recordPatientReport(
    patientId: string,
    input: {
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
    },
  ) {
    return this.record(patientId, {
      ...input,
      sourceType: "patient-reported",
      sourceSystem: "patient-report",
      evidenceType: "patient-report",
    });
  },

  async reconcile(
    patientId: string,
    candidateId: string,
    decision: MedicationReconciliationDecision,
    medicationId?: string,
  ): Promise<{ candidate: MedicationReconciliationCandidate; medication: MedicationRecord | null }> {
    const response = await reconciliationRequest<{
      success: true;
      result: { candidate: MedicationReconciliationCandidate; medication: MedicationRecord | null };
    }>(
      "/api/medication-reconciliation",
      patientId,
      {
        method: "POST",
        body: JSON.stringify({
          type: "reconcile_medication_candidate",
          payload: { candidateId, decision, ...(medicationId ? { medicationId } : {}) },
        }),
      },
    );
    return response.result;
  },
};
