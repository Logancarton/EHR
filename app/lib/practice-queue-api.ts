export type PracticeLabQueueRow = {
  observationId: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  patientInitials: string;
  category: string;
  testName: string;
  effectiveAt: string;
  valueText: string;
  valueNum: number | null;
  unit: string | null;
  referenceRange: string | null;
  interpretation: string | null;
  status: string;
  sourceSystem: string | null;
  sourceRef: string | null;
  documentId: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  disposition: string | null;
  acknowledgementNote: string | null;
};

export type PracticeDocumentQueueRow = {
  documentId: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  patientInitials: string;
  documentType: string;
  title: string;
  status: string;
  workflowStatus: string;
  workflowUpdatedAt: string | null;
  currentVersion: number;
  mimeType: string | null;
  storageKey: string | null;
  sourceSystem: string | null;
  sourceRef: string | null;
  createdBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  filedBy: string | null;
  filedAt: string | null;
  supersededByDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
};

async function readQueue<T>(queue: "labs" | "documents"): Promise<T[]> {
  const response = await fetch(`/api/practice-queues?queue=${queue}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `Unable to load ${queue} queue`);
  }
  return Array.isArray(payload.rows) ? payload.rows as T[] : [];
}

export const practiceQueueApi = {
  labs: () => readQueue<PracticeLabQueueRow>("labs"),
  documents: () => readQueue<PracticeDocumentQueueRow>("documents"),
  async acknowledgeLab(input: { patientId: string; observationId: string; disposition: string; note?: string }) {
    const response = await fetch("/api/clinical-records", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ehr-patient-id": input.patientId,
      },
      body: JSON.stringify({
        type: "acknowledge_result",
        payload: {
          observationId: input.observationId,
          disposition: input.disposition,
          note: input.note,
        },
      }),
    });
    const payload = await response.json();
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || "Unable to acknowledge result");
    }
    return payload.result;
  },
};
