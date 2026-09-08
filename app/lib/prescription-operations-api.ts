import type {
  PrescriptionOperationsDetail,
  PrescriptionOperationsQueue,
  PrescriptionRecoveryActionId,
} from "../domain/prescription-operations";

const ACTIVE_PATIENT_HEADER = "x-ehr-patient-id";

async function jsonRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return payload as T;
}

export const prescriptionOperationsApi = {
  async queue(): Promise<PrescriptionOperationsQueue> {
    const payload = await jsonRequest<{ success: true; queue: PrescriptionOperationsQueue }>("/api/prescription-operations");
    return payload.queue;
  },

  async detail(itemId: string): Promise<PrescriptionOperationsDetail> {
    const payload = await jsonRequest<{ success: true; detail: PrescriptionOperationsDetail }>(
      `/api/prescription-operations?itemId=${encodeURIComponent(itemId)}`,
    );
    return payload.detail;
  },

  async recordEvidence(input: {
    activePatientId: string;
    transactionId: string;
    disposition: Exclude<PrescriptionRecoveryActionId, "retry_transmission">;
    evidenceSource: string;
    note: string;
    supersedingTransactionId?: string;
  }): Promise<void> {
    await jsonRequest("/api/prescription-transactions", {
      method: "PATCH",
      headers: { [ACTIVE_PATIENT_HEADER]: input.activePatientId },
      body: JSON.stringify({
        operation: "record_recovery_evidence",
        transactionId: input.transactionId,
        disposition: input.disposition,
        evidenceSource: input.evidenceSource,
        note: input.note,
        supersedingTransactionId: input.supersedingTransactionId,
      }),
    });
  },

  async retry(input: { activePatientId: string; orderId: string }): Promise<void> {
    await jsonRequest("/api/orders", {
      method: "PATCH",
      headers: { [ACTIVE_PATIENT_HEADER]: input.activePatientId },
      body: JSON.stringify({ id: input.orderId, operation: "transmit" }),
    });
  },
};
