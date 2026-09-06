import type { Patient } from "../domain/patient";
import type { PatientRecord } from "../server/repositories/patient-repository";
import type { EncounterRecord } from "../server/repositories/encounter-repository";
import type { OrderRecord } from "../server/repositories/order-repository";
import type { PatientMessageThread, PatientMessage } from "../domain/messages";
import type { ClinicalTask, ScratchNote } from "../domain/tasks";
import type { ProviderPreferences } from "./preference-engine";
import type { AuditLogEntry } from "../server/repositories/audit-repository";
import type { AppointmentRecord } from "../server/repositories/appointment-repository";
import type { AppointmentStatus } from "./schedule-data";
import type { AssembledClinicalContext, ClinicalSurface, UserRole } from "../server/context/context-assembler";
import type { ExtractedCandidateAction } from "./entity-extraction";
import type { TranscriptUtterance } from "./encounter-engine";
import type { SearchResultItem } from "../server/repositories/clinical-search-repository";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

const ACTIVE_PATIENT_HEADER = "x-ehr-patient-id";

// These bindings are learned only from an explicitly patient-scoped request or from a
// server response that already contains the authoritative patient id. They let legacy
// UI call sites continue to work while every mutation still sends x-ehr-patient-id.
const encounterPatientBindings = new Map<string, string>();
const orderPatientBindings = new Map<string, string>();
const appointmentPatientBindings = new Map<string, string>();
const taskPatientBindings = new Map<string, string>();
const scratchPatientBindings = new Map<string, string>();

function rememberBinding(map: Map<string, string>, id?: string, patientId?: string) {
  if (id && patientId) map.set(id, patientId);
}

function requireBinding(
  map: Map<string, string>,
  id: string,
  label: string,
  explicitPatientId?: string,
): string {
  const patientId = explicitPatientId || map.get(id);
  if (!patientId) {
    throw new Error(
      `${label} ${id} is missing active patient context; reopen it from the patient chart before retrying.`,
    );
  }
  return patientId;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  expectedPatientId?: string,
): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...(expectedPatientId ? { [ACTIVE_PATIENT_HEADER]: expectedPatientId } : {}),
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

  encounters: {
    async list(patientId?: string): Promise<EncounterRecord[]> {
      const url = patientId ? `/api/encounters?patientId=${encodeURIComponent(patientId)}` : "/api/encounters";
      const res = await request<{ success: boolean; encounters: EncounterRecord[] }>(url);
      for (const encounter of res.encounters) {
        rememberBinding(encounterPatientBindings, encounter.id, encounter.patientId);
      }
      return res.encounters;
    },

    async get(id: string): Promise<EncounterRecord> {
      const res = await request<{ success: boolean; encounter: EncounterRecord }>(`/api/encounters/${id}`);
      rememberBinding(encounterPatientBindings, res.encounter.id, res.encounter.patientId);
      return res.encounter;
    },

    async saveDraft(encounter: Partial<EncounterRecord> & { patientId: string }): Promise<EncounterRecord> {
      const res = await request<{ success: boolean; encounter: EncounterRecord }>("/api/encounters", {
        method: "POST",
        body: JSON.stringify(encounter),
      }, encounter.patientId);
      rememberBinding(encounterPatientBindings, res.encounter.id, encounter.patientId);
      return res.encounter;
    },

    async sign(
      id: string,
      patientId?: string,
      signedBy: string = "Dr. Logan Carton, MD",
    ): Promise<EncounterRecord> {
      const boundPatientId = requireBinding(encounterPatientBindings, id, "Encounter", patientId);
      const res = await request<{ success: boolean; encounter: EncounterRecord }>(`/api/encounters/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ signedBy }),
      }, boundPatientId);
      rememberBinding(encounterPatientBindings, res.encounter.id, res.encounter.patientId);
      return res.encounter;
    },
  },

  orders: {
    async list(patientId: string, status?: "staged" | "authorized" | "transmitted"): Promise<OrderRecord[]> {
      let url = `/api/orders?patientId=${encodeURIComponent(patientId)}`;
      if (status) url += `&status=${status}`;
      const res = await request<{ success: boolean; orders: OrderRecord[] }>(url);
      for (const order of res.orders) rememberBinding(orderPatientBindings, order.id, order.patientId);
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
      }, order.patientId);
      rememberBinding(orderPatientBindings, res.order.id, order.patientId);
      return res.order;
    },

    async authorize(
      id: string,
      patientIdOrAuthorizedBy?: string,
      authorizedByOrMetadata?: string | Record<string, any>,
      authMetadata?: Record<string, any>,
    ): Promise<OrderRecord> {
      const knownPatientId = orderPatientBindings.get(id);
      const legacyCall =
        knownPatientId !== undefined &&
        typeof authorizedByOrMetadata === "object" &&
        authMetadata === undefined;

      const patientId = legacyCall
        ? requireBinding(orderPatientBindings, id, "Order")
        : requireBinding(orderPatientBindings, id, "Order", patientIdOrAuthorizedBy);
      const authorizedBy = legacyCall
        ? patientIdOrAuthorizedBy
        : typeof authorizedByOrMetadata === "string"
          ? authorizedByOrMetadata
          : undefined;
      const metadata = legacyCall
        ? authorizedByOrMetadata as Record<string, any>
        : authMetadata;

      const res = await request<{ success: boolean; order: OrderRecord }>("/api/orders", {
        method: "PATCH",
        body: JSON.stringify({ id, authorizedBy, authMetadata: metadata }),
      }, patientId);
      rememberBinding(orderPatientBindings, res.order.id, res.order.patientId);
      return res.order;
    },

    async delete(id: string, patientId?: string): Promise<boolean> {
      const boundPatientId = requireBinding(orderPatientBindings, id, "Order", patientId);
      const res = await request<{ success: boolean; deletedId: string }>(`/api/orders?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      }, boundPatientId);
      orderPatientBindings.delete(id);
      return Boolean(res.deletedId);
    },
  },

  messages: {
    async list(patientId: string): Promise<PatientMessageThread[]> {
      const res = await request<{ success: boolean; threads: PatientMessageThread[] }>(
        `/api/messages?patientId=${encodeURIComponent(patientId)}`
      );
      return res.threads;
    },

    async sendReply(
      patientId: string,
      threadId: string,
      content: string,
      senderName: string = "Dr. Logan Carton, MD",
      senderRole: "physician" | "nurse" | "admin" = "physician"
    ): Promise<PatientMessage> {
      const res = await request<{ success: boolean; message: PatientMessage }>("/api/messages", {
        method: "POST",
        body: JSON.stringify({ patientId, threadId, content, senderName, senderRole }),
      }, patientId);
      return res.message;
    },

    async markRead(threadId: string, patientId: string): Promise<void> {
      await request<{ success: boolean }>("/api/messages", {
        method: "PATCH",
        body: JSON.stringify({ threadId }),
      }, patientId);
    },
  },

  tasks: {
    async list(patientId?: string): Promise<ClinicalTask[]> {
      const url = patientId ? `/api/tasks?type=task&patientId=${encodeURIComponent(patientId)}` : "/api/tasks?type=task";
      const res = await request<{ success: boolean; tasks: ClinicalTask[] }>(url);
      for (const task of res.tasks) rememberBinding(taskPatientBindings, task.id, task.patientId);
      return res.tasks;
    },

    async create(text: string, patientId?: string, due?: string): Promise<ClinicalTask> {
      const res = await request<{ success: boolean; task: ClinicalTask }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ type: "task", text, patientId, due }),
      }, patientId);
      rememberBinding(taskPatientBindings, res.task.id, res.task.patientId || patientId);
      return res.task;
    },

    async toggle(id: string, patientId?: string): Promise<ClinicalTask> {
      const boundPatientId = patientId || taskPatientBindings.get(id);
      const res = await request<{ success: boolean; task: ClinicalTask }>("/api/tasks", {
        method: "PATCH",
        body: JSON.stringify({ id }),
      }, boundPatientId);
      rememberBinding(taskPatientBindings, res.task.id, res.task.patientId || boundPatientId);
      return res.task;
    },

    async delete(id: string, patientId?: string): Promise<boolean> {
      const boundPatientId = patientId || taskPatientBindings.get(id);
      const res = await request<{ success: boolean; deletedId: string }>(
        `/api/tasks?type=task&id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
        boundPatientId,
      );
      taskPatientBindings.delete(id);
      return Boolean(res.deletedId);
    },

    async getScratchNotes(): Promise<ScratchNote[]> {
      const res = await request<{ success: boolean; scratchNotes: ScratchNote[] }>("/api/tasks?type=scratchpad");
      for (const note of res.scratchNotes) rememberBinding(scratchPatientBindings, note.id, note.patientId);
      return res.scratchNotes;
    },

    async createScratchNote(text: string, color?: string, patientId?: string): Promise<ScratchNote> {
      const res = await request<{ success: boolean; scratchNote: ScratchNote }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ type: "scratchpad", text, color, patientId }),
      }, patientId);
      rememberBinding(scratchPatientBindings, res.scratchNote.id, res.scratchNote.patientId || patientId);
      return res.scratchNote;
    },

    async deleteScratchNote(id: string, patientId?: string): Promise<boolean> {
      const boundPatientId = patientId || scratchPatientBindings.get(id);
      const res = await request<{ success: boolean; deletedId: string }>(
        `/api/tasks?type=scratchpad&id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
        boundPatientId,
      );
      scratchPatientBindings.delete(id);
      return Boolean(res.deletedId);
    },
  },

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

  appointments: {
    async list(filter?: { date?: string; patientId?: string; status?: AppointmentStatus }): Promise<AppointmentRecord[]> {
      const params = new URLSearchParams();
      if (filter?.date) params.set("date", filter.date);
      if (filter?.patientId) params.set("patientId", filter.patientId);
      if (filter?.status) params.set("status", filter.status);
      const url = params.toString() ? `/api/appointments?${params.toString()}` : "/api/appointments";
      const res = await request<{ success: boolean; appointments: AppointmentRecord[] }>(url);
      for (const appointment of res.appointments) {
        rememberBinding(appointmentPatientBindings, appointment.id, appointment.patientId);
      }
      return res.appointments;
    },

    async create(appointment: Partial<AppointmentRecord> & {
      patientId: string;
      patientName: string;
      date: string;
      time: string;
    }): Promise<AppointmentRecord> {
      const res = await request<{ success: boolean; appointment: AppointmentRecord }>("/api/appointments", {
        method: "POST",
        body: JSON.stringify(appointment),
      }, appointment.patientId);
      rememberBinding(appointmentPatientBindings, res.appointment.id, appointment.patientId);
      return res.appointment;
    },

    async updateStatus(id: string, status: AppointmentStatus, patientId?: string): Promise<AppointmentRecord> {
      const boundPatientId = requireBinding(appointmentPatientBindings, id, "Appointment", patientId);
      const res = await request<{ success: boolean; appointment: AppointmentRecord }>("/api/appointments", {
        method: "PATCH",
        body: JSON.stringify({ id, status }),
      }, boundPatientId);
      rememberBinding(appointmentPatientBindings, res.appointment.id, res.appointment.patientId);
      return res.appointment;
    },

    async delete(id: string, patientId?: string): Promise<boolean> {
      const boundPatientId = requireBinding(appointmentPatientBindings, id, "Appointment", patientId);
      const res = await request<{ success: boolean; deletedId: string }>(`/api/appointments?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      }, boundPatientId);
      appointmentPatientBindings.delete(id);
      return Boolean(res.deletedId);
    },
  },

  context: {
    async assemble(options: {
      patientId: string;
      surface?: ClinicalSurface;
      userRole?: UserRole;
      tokenBudget?: number;
      searchQuery?: string;
    }): Promise<AssembledClinicalContext> {
      const res = await request<{ success: boolean; context: AssembledClinicalContext }>("/api/context", {
        method: "POST",
        body: JSON.stringify(options),
      });
      return res.context;
    },
  },

  ai: {
    async extractEntities(
      utterances: TranscriptUtterance[],
      activeMedications: string[] = []
    ): Promise<ExtractedCandidateAction[]> {
      const res = await request<{ success: boolean; candidateActions: ExtractedCandidateAction[] }>("/api/ai/extract", {
        method: "POST",
        body: JSON.stringify({ utterances, activeMedications }),
      });
      return res.candidateActions;
    },

    async searchNotes(query: string, patientId?: string, limit: number = 10): Promise<SearchResultItem[]> {
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      if (patientId) params.set("patientId", patientId);
      const res = await request<{ success: boolean; results: SearchResultItem[] }>(`/api/ai/search?${params.toString()}`);
      return res.results;
    },
  },
};
