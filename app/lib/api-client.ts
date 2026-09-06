import type { Patient } from "../domain/patient";
import type { PatientRecord } from "../server/repositories/patient-repository";
import type { EncounterRecord } from "../server/repositories/encounter-repository";
import type { OrderRecord } from "../server/repositories/order-repository";
import type { PatientMessageThread, PatientMessage } from "../domain/messages";
import type { ClinicalTask, ScratchNote } from "../domain/tasks";
import type { ProviderPreferences } from "./preference-engine";
import type { AuditLogEntry } from "../server/repositories/audit-repository";

// Generic API response type
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `HTTP error ${res.status}: Failed to fetch ${endpoint}`);
  }

  return json;
}

export const api = {
  // 1. Health & Home-Base Database Stats
  health: {
    async check(): Promise<{
      status: string;
      database: string;
      counts: {
        patients: number;
        encounters: number;
        orders: number;
        messages: number;
        tasks: number;
        auditLogs: number;
      };
      timestamp: string;
    }> {
      return request("/api/health");
    },
  },

  // 2. Patients
  patients: {
    async list(): Promise<PatientRecord[]> {
      const res = await request<{ success: boolean; patients: PatientRecord[] }>("/api/patients");
      return res.patients;
    },

    async get(id: string): Promise<PatientRecord> {
      const res = await request<{ success: boolean; patient: PatientRecord }>(`/api/patients/${id}`);
      return res.patient;
    },

    async create(patient: Partial<PatientRecord> & { name: string; dob: string; mrn: string }): Promise<PatientRecord> {
      const res = await request<{ success: boolean; patient: PatientRecord }>("/api/patients", {
        method: "POST",
        body: JSON.stringify(patient),
      });
      return res.patient;
    },
  },

  // 3. Encounters & Note Drafting
  encounters: {
    async list(patientId?: string): Promise<EncounterRecord[]> {
      const url = patientId ? `/api/encounters?patientId=${encodeURIComponent(patientId)}` : "/api/encounters";
      const res = await request<{ success: boolean; encounters: EncounterRecord[] }>(url);
      return res.encounters;
    },

    async get(id: string): Promise<EncounterRecord> {
      const res = await request<{ success: boolean; encounter: EncounterRecord }>(`/api/encounters/${id}`);
      return res.encounter;
    },

    async saveDraft(encounter: Partial<EncounterRecord> & { patientId: string }): Promise<EncounterRecord> {
      const res = await request<{ success: boolean; encounter: EncounterRecord }>("/api/encounters", {
        method: "POST",
        body: JSON.stringify(encounter),
      });
      return res.encounter;
    },

    async sign(id: string, signedBy: string = "Dr. Logan Carton, MD"): Promise<EncounterRecord> {
      const res = await request<{ success: boolean; encounter: EncounterRecord }>(`/api/encounters/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ signedBy }),
      });
      return res.encounter;
    },
  },

  // 4. Clinical Orders (DrFirst Prescriptions & Quest Labs)
  orders: {
    async list(patientId: string, status?: "staged" | "authorized" | "transmitted"): Promise<OrderRecord[]> {
      let url = `/api/orders?patientId=${encodeURIComponent(patientId)}`;
      if (status) url += `&status=${status}`;
      const res = await request<{ success: boolean; orders: OrderRecord[] }>(url);
      return res.orders;
    },

    async stage(order: {
      id?: string;
      patientId: string;
      type: "medication" | "lab";
      name: string;
      details?: Record<string, any>;
      orderedBy?: string;
    }): Promise<OrderRecord> {
      const res = await request<{ success: boolean; order: OrderRecord }>("/api/orders", {
        method: "POST",
        body: JSON.stringify(order),
      });
      return res.order;
    },

    async authorize(id: string, authorizedBy?: string, authMetadata?: Record<string, any>): Promise<OrderRecord> {
      const res = await request<{ success: boolean; order: OrderRecord }>("/api/orders", {
        method: "PATCH",
        body: JSON.stringify({ id, authorizedBy, authMetadata }),
      });
      return res.order;
    },

    async delete(id: string): Promise<boolean> {
      const res = await request<{ success: boolean; deletedId: string }>(`/api/orders?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      return Boolean(res.deletedId);
    },
  },

  // 5. Messages & Triage
  messages: {
    async list(patientId: string): Promise<PatientMessageThread[]> {
      const res = await request<{ success: boolean; threads: PatientMessageThread[] }>(
        `/api/messages?patientId=${encodeURIComponent(patientId)}`
      );
      return res.threads;
    },

    async sendReply(
      threadId: string,
      content: string,
      senderName: string = "Dr. Logan Carton, MD",
      senderRole: "physician" | "nurse" | "admin" = "physician"
    ): Promise<PatientMessage> {
      const res = await request<{ success: boolean; message: PatientMessage }>("/api/messages", {
        method: "POST",
        body: JSON.stringify({ threadId, content, senderName, senderRole }),
      });
      return res.message;
    },
  },

  // 6. Tasks & Scratchpad
  tasks: {
    async list(patientId?: string): Promise<ClinicalTask[]> {
      const url = patientId ? `/api/tasks?type=task&patientId=${encodeURIComponent(patientId)}` : "/api/tasks?type=task";
      const res = await request<{ success: boolean; tasks: ClinicalTask[] }>(url);
      return res.tasks;
    },

    async create(text: string, patientId?: string, due?: string): Promise<ClinicalTask> {
      const res = await request<{ success: boolean; task: ClinicalTask }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ type: "task", text, patientId, due }),
      });
      return res.task;
    },

    async toggle(id: string): Promise<ClinicalTask> {
      const res = await request<{ success: boolean; task: ClinicalTask }>("/api/tasks", {
        method: "PATCH",
        body: JSON.stringify({ id }),
      });
      return res.task;
    },

    async delete(id: string): Promise<boolean> {
      const res = await request<{ success: boolean; deletedId: string }>(
        `/api/tasks?type=task&id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        }
      );
      return Boolean(res.deletedId);
    },

    async getScratchNotes(): Promise<ScratchNote[]> {
      const res = await request<{ success: boolean; scratchNotes: ScratchNote[] }>("/api/tasks?type=scratchpad");
      return res.scratchNotes;
    },

    async createScratchNote(text: string, color?: string, patientId?: string): Promise<ScratchNote> {
      const res = await request<{ success: boolean; scratchNote: ScratchNote }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ type: "scratchpad", text, color, patientId }),
      });
      return res.scratchNote;
    },

    async deleteScratchNote(id: string): Promise<boolean> {
      const res = await request<{ success: boolean; deletedId: string }>(
        `/api/tasks?type=scratchpad&id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        }
      );
      return Boolean(res.deletedId);
    },
  },

  // 7. Workspace Provider Preferences
  preferences: {
    async get(providerId?: string): Promise<ProviderPreferences> {
      const url = providerId ? `/api/preferences?providerId=${encodeURIComponent(providerId)}` : "/api/preferences";
      const res = await request<{ success: boolean; preferences: ProviderPreferences }>(url);
      return res.preferences;
    },

    async save(preferences: ProviderPreferences, providerId?: string): Promise<ProviderPreferences> {
      const res = await request<{ success: boolean; preferences: ProviderPreferences }>("/api/preferences", {
        method: "PUT",
        body: JSON.stringify({ preferences, providerId }),
      });
      return res.preferences;
    },
  },

  // 8. HIPAA Audit Logs
  audit: {
    async list(limit: number = 100, patientId?: string): Promise<AuditLogEntry[]> {
      let url = `/api/audit?limit=${limit}`;
      if (patientId) url += `&patientId=${encodeURIComponent(patientId)}`;
      const res = await request<{ success: boolean; logs: AuditLogEntry[] }>(url);
      return res.logs;
    },

    async log(event: {
      eventType: AuditLogEntry["eventType"];
      description: string;
      patientId?: string;
      userId?: string;
      userName?: string;
      userRole?: string;
      metadata?: Record<string, any>;
    }): Promise<AuditLogEntry> {
      const res = await request<{ success: boolean; log: AuditLogEntry }>("/api/audit", {
        method: "POST",
        body: JSON.stringify(event),
      });
      return res.log;
    },
  },
};
