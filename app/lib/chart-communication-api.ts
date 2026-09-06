export type ChartCommunicationType = "message" | "conversation" | "summary";

export type ChartCommunication = {
  id: string;
  patientId: string;
  communicationType: ChartCommunicationType;
  title: string;
  body: string;
  channel?: string;
  sourceThreadId: string;
  sourceMessageId?: string;
  sourceMessageIds: string[];
  sourceSystem: string;
  sourceRef: string;
  contentSha256: string;
  occurredAt: string;
  createdBy: string;
  createdAt: string;
};

const ACTIVE_PATIENT_HEADER = "x-ehr-patient-id";
export const CHART_COMMUNICATIONS_UPDATED_EVENT = "ehr:chart-communications-updated";

async function chartRequest<T>(url: string, patientId: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      [ACTIVE_PATIENT_HEADER]: patientId,
      ...(options.headers || {}),
    },
  });
  const json = await response.json();
  if (!response.ok || json.success === false) {
    throw new Error(json.error || `Chart communication request failed (${response.status})`);
  }
  return json;
}

function notifyChartCommunicationUpdated(patientId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CHART_COMMUNICATIONS_UPDATED_EVENT, {
      detail: { patientId },
    }),
  );
}

export const chartCommunicationApi = {
  async list(patientId: string): Promise<ChartCommunication[]> {
    const result = await chartRequest<{ success: true; communications: ChartCommunication[] }>(
      `/api/messages/chart?patientId=${encodeURIComponent(patientId)}`,
      patientId,
    );
    return result.communications;
  },

  async save(input: {
    patientId: string;
    threadId: string;
    mode: ChartCommunicationType;
    messageId?: string;
    summaryText?: string;
  }): Promise<ChartCommunication> {
    const result = await chartRequest<{ success: true; communication: ChartCommunication }>(
      "/api/messages/chart",
      input.patientId,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
    notifyChartCommunicationUpdated(input.patientId);
    return result.communication;
  },
};
