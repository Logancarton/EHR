import type {
  TeamMessage,
  TeamTaskAgreement,
  TeamTaskAssignment,
  TeamTaskStatus,
  TeamWorkspaceSnapshot,
} from "../domain/team-collaboration";

const ACTIVE_PATIENT_HEADER = "x-ehr-patient-id";

async function teamRequest<T>(
  url: string,
  options: RequestInit = {},
  expectedPatientId?: string,
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(expectedPatientId ? { [ACTIVE_PATIENT_HEADER]: expectedPatientId } : {}),
      ...(options.headers || {}),
    },
  });
  const json = await response.json();
  if (!response.ok || json.success === false) {
    throw new Error(json.error || `Team API request failed (${response.status})`);
  }
  return json;
}

export const teamApi = {
  async snapshot(): Promise<TeamWorkspaceSnapshot> {
    const result = await teamRequest<{ success: true; team: TeamWorkspaceSnapshot }>("/api/team");
    return result.team;
  },

  async conversation(partnerId: string): Promise<TeamMessage[]> {
    const result = await teamRequest<{ success: true; messages: TeamMessage[] }>(
      `/api/team/messages?partnerId=${encodeURIComponent(partnerId)}`,
    );
    return result.messages;
  },

  async sendMessage(input: {
    partnerId: string;
    content: string;
    patientId?: string;
  }): Promise<TeamMessage> {
    const result = await teamRequest<{ success: true; message: TeamMessage }>("/api/team/messages", {
      method: "POST",
      body: JSON.stringify(input),
    }, input.patientId);
    return result.message;
  },

  async requestAgreement(partnerId: string): Promise<TeamTaskAgreement> {
    const result = await teamRequest<{ success: true; agreement: TeamTaskAgreement }>("/api/team/agreements", {
      method: "POST",
      body: JSON.stringify({ partnerId }),
    });
    return result.agreement;
  },

  async updateAgreement(partnerId: string, action: "accept" | "revoke"): Promise<TeamTaskAgreement> {
    const result = await teamRequest<{ success: true; agreement: TeamTaskAgreement }>("/api/team/agreements", {
      method: "PATCH",
      body: JSON.stringify({ partnerId, action }),
    });
    return result.agreement;
  },

  async assignTask(input: {
    assigneeId: string;
    text: string;
    patientId?: string;
    dueDate?: string;
  }): Promise<TeamTaskAssignment> {
    const result = await teamRequest<{ success: true; task: TeamTaskAssignment }>("/api/team/tasks", {
      method: "POST",
      body: JSON.stringify(input),
    }, input.patientId);
    return result.task;
  },

  async updateTaskStatus(
    taskId: string,
    status: TeamTaskStatus,
    patientId?: string,
  ): Promise<TeamTaskAssignment> {
    const result = await teamRequest<{ success: true; task: TeamTaskAssignment }>("/api/team/tasks", {
      method: "PATCH",
      body: JSON.stringify({ taskId, status }),
    }, patientId);
    return result.task;
  },
};
