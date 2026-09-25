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
  orderId: string | null;
  sourceSystem: string | null;
  sourceRef: string | null;
  documentId: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  disposition: string | null;
  acknowledgementNote: string | null;
};

/**
 * One lab order is one unit of clinical work. Individual analytes are children
 * of that order, not separate tasks. Groups unacknowledged results by the order
 * id they carry, falling back to the source document for an imported panel;
 * an unlinked result stands alone rather than being guessed into a same-day
 * group. The dashboard queue and the rail badge both count these groups, so the
 * two numbers a clinician sees for "labs" are the same number.
 */
export function groupUnacknowledgedLabsByOrder(
  rows: readonly PracticeLabQueueRow[],
): Array<[key: string, results: PracticeLabQueueRow[]]> {
  const groups = new Map<string, PracticeLabQueueRow[]>();
  for (const lab of rows.filter((row) => !row.acknowledgedAt)) {
    const sourceKey = lab.orderId
      ? `order:${lab.orderId}`
      : lab.documentId
        ? `document:${lab.documentId}`
        : `observation:${lab.observationId}`;
    const key = `${lab.patientId}:${sourceKey}`;
    const group = groups.get(key);
    if (group) group.push(lab);
    else groups.set(key, [lab]);
  }
  return Array.from(groups.entries());
}


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

export type PracticeUnsignedEncounterRow = {
  encounterId: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  patientInitials: string;
  encounterType: string;
  date: string;
  chiefComplaint: string;
  appointmentId: string | null;
  updatedAt: string;
};

export type PracticeRefillQueueRow = {
  requestId: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  patientInitials: string;
  medicationName: string;
  requestSource: string;
  sourceSystem: string;
  sourceReference: string | null;
  status: string;
  requestedAt: string;
  note: string | null;
  priorOrderId: string;
};

export type PracticeHandoffQueueRow = {
  handoffId: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  patientInitials: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  reason: string;
  clinicalSummary: string;
  status: string;
  createdAt: string;
};

export type PracticeVisitPrepSummary = {
  appointmentId: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  patientInitials: string;
  time: string;
  duration: string;
  visitType: string;
  chiefComplaint: string;
  room: string | null;
  providerId: string | null;
  providerName: string | null;
  lastVisitDate: string | null;
  activeDiagnosesCount: number;
  topDiagnoses: string[];
  activeMedicationsCount: number;
  vitals: {
    bp?: string;
    hr?: number;
    wt?: string;
    recordedAt?: string;
  };
  hasUnsignedDraft: boolean;
  unacknowledgedLabsCount: number;
};

export type PracticeQueueCounts = {
  unsigned: number;
  labs: number;
  documents: number;
  refills: number;
  handoffs: number;
};

async function readQueue<T>(queue: string, params?: Record<string, string>): Promise<T[]> {
  const query = new URLSearchParams({ queue, ...(params || {}) }).toString();
  const response = await fetch(`/api/practice-queues?${query}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `Unable to load ${queue} queue`);
  }
  return Array.isArray(payload.rows) ? (payload.rows as T[]) : [];
}

export const practiceQueueApi = {
  labs: () => readQueue<PracticeLabQueueRow>("labs"),
  documents: () => readQueue<PracticeDocumentQueueRow>("documents"),
  unsigned: () => readQueue<PracticeUnsignedEncounterRow>("unsigned"),
  refills: () => readQueue<PracticeRefillQueueRow>("refills"),
  handoffs: () => readQueue<PracticeHandoffQueueRow>("handoffs"),
  visitPrep: (date?: string) =>
    readQueue<PracticeVisitPrepSummary>("visit-prep", date ? { date } : undefined),
  async counts(): Promise<PracticeQueueCounts> {
    const response = await fetch("/api/practice-queues?queue=counts", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || "Unable to load queue counts");
    }
    return payload.counts as PracticeQueueCounts;
  },
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

