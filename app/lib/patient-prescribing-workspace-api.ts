import type { PatientPrescribingWorkspaceProjection } from "../domain/patient-prescribing-workspace";

const ACTIVE_PATIENT_HEADER = "x-ehr-patient-id";

type RecoveryDisposition = "investigated_unresolved" | "confirmed_not_received";

async function request<T>(patientId: string, endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      [ACTIVE_PATIENT_HEADER]: patientId,
      ...(options.headers || {}),
    },
  });
  const json = await response.json();
  if (!response.ok || json.success === false) {
    throw new Error(json.error || `Unable to complete prescribing request (${response.status}).`);
  }
  return json as T;
}

export const patientPrescribingWorkspaceApi = {
  async get(patientId: string): Promise<PatientPrescribingWorkspaceProjection> {
    const result = await request<{ success: true; workspace: PatientPrescribingWorkspaceProjection }>(
      patientId,
      `/api/patient-prescribing-workspace?patientId=${encodeURIComponent(patientId)}`,
    );
    return result.workspace;
  },

  async authorize(patientId: string, orderId: string): Promise<void> {
    await request(patientId, "/api/orders", {
      method: "PATCH",
      body: JSON.stringify({ id: orderId }),
    });
  },

  async transmit(patientId: string, orderId: string): Promise<void> {
    await request(patientId, "/api/orders", {
      method: "PATCH",
      body: JSON.stringify({ id: orderId, operation: "transmit" }),
    });
  },

  async confirmMedicationTruth(
    patientId: string,
    orderId: string,
    operation: "add" | "update",
    medicationId?: string,
  ): Promise<void> {
    await request(patientId, "/api/orders", {
      method: "PATCH",
      body: JSON.stringify({
        id: orderId,
        operation: "confirm_medication_truth",
        truthOperation: operation,
        medicationId,
      }),
    });
  },

  async renewRefill(patientId: string, refillRequestId: string): Promise<void> {
    await request(patientId, "/api/prescription-transactions", {
      method: "PATCH",
      body: JSON.stringify({ operation: "renew", refillRequestId }),
    });
  },

  async respondToChange(patientId: string, changeRequestId: string, decision: "accept" | "decline"): Promise<void> {
    await request(patientId, "/api/prescription-change-requests", {
      method: "PATCH",
      body: JSON.stringify({ changeRequestId, decision }),
    });
  },

  async cancel(patientId: string, transactionId: string, reason: string): Promise<void> {
    await request(patientId, "/api/prescription-transactions", {
      method: "PATCH",
      body: JSON.stringify({ operation: "cancel", transactionId, reason }),
    });
  },

  async recordRecoveryEvidence(
    patientId: string,
    transactionId: string,
    disposition: RecoveryDisposition,
    evidenceSource: string,
    note: string,
  ): Promise<void> {
    await request(patientId, "/api/prescription-transactions", {
      method: "PATCH",
      body: JSON.stringify({
        operation: "record_recovery_evidence",
        transactionId,
        disposition,
        evidenceSource,
        note,
      }),
    });
  },
};
