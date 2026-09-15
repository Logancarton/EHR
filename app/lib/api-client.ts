import type { Patient } from "../domain/patient";
import type {
  CareNetworkMember,
  PatientAdministrativeRecord,
  RelatedPerson,
} from "../domain/patient-administration";
import type { PatientRecord } from "../server/repositories/patient-repository";
import type { EncounterRecord } from "../server/repositories/encounter-repository";
import type { OrderRecord } from "../server/repositories/order-repository";
import type { NoteReferenceRecord } from "../server/repositories/note-reference-repository";
import type { PatientMessageThread, PatientMessage } from "../domain/messages";
import type { ClinicalTask, ScratchNote } from "../domain/tasks";
import type { ProviderPreferences } from "./preference-engine";
import type { AuditLogEntry } from "../server/repositories/audit-repository";
import type { AppointmentRecord } from "../server/repositories/appointment-repository";
import type { AppointmentStatus, VisitHandoff, HandoffStatus, VisitType } from "./schedule-data";
import type { TeamPresence } from "../domain/team-collaboration";
import type { AssembledClinicalContext, ClinicalSurface, UserRole } from "../server/context/context-assembler";
import type { ExtractedCandidateAction } from "./entity-extraction";
import type { TranscriptUtterance } from "./encounter-engine";
import type { SearchResultItem } from "../server/repositories/clinical-search-repository";
import { ApiError } from "./api-error";
import { reportAuthenticationFailure } from "./session-expiry";

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
    // The status travels with the failure. Without it every caller could show the
    // server's sentence and none could tell a refused session from a bad request,
    // which is how an expired session came to render as an error card inside a
    // workspace that still looked signed in.
    if (res.status === 401) reportAuthenticationFailure();
    throw new ApiError(
      json.error || `HTTP error ${res.status}: Failed to fetch ${endpoint}`,
      res.status,
      json,
    );
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

    async update(id: string, updates: Record<string, unknown>): Promise<PatientRecord> {
      const res = await request<{ success: boolean; patient: PatientRecord }>(
        `/api/patients/${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify(updates) },
        id,
      );
      return res.patient;
    },
  },

  /** Identity, contact, related people and the outside care network for one chart. */
  patientAdministration: {
    async get(patientId: string): Promise<PatientAdministrativeRecord> {
      const res = await request<{ success: boolean; record: PatientAdministrativeRecord }>(
        `/api/patients/${encodeURIComponent(patientId)}/administration`,
        {},
        patientId,
      );
      return res.record;
    },

    async saveRelatedPerson(
      patientId: string,
      values: Record<string, unknown>,
      recordId?: string,
    ): Promise<RelatedPerson> {
      const res = await request<{ success: boolean; record: RelatedPerson }>(
        `/api/patients/${encodeURIComponent(patientId)}/administration`,
        { method: "POST", body: JSON.stringify({ kind: "related-person", recordId, values }) },
        patientId,
      );
      return res.record;
    },

    async saveCareNetworkMember(
      patientId: string,
      values: Record<string, unknown>,
      recordId?: string,
    ): Promise<CareNetworkMember> {
      const res = await request<{ success: boolean; record: CareNetworkMember }>(
        `/api/patients/${encodeURIComponent(patientId)}/administration`,
        { method: "POST", body: JSON.stringify({ kind: "care-network", recordId, values }) },
        patientId,
      );
      return res.record;
    },

    async saveCoverage(
      patientId: string,
      values: Record<string, unknown>,
      recordId?: string,
    ): Promise<unknown> {
      const res = await request<{ success: boolean; record: unknown }>(
        `/api/patients/${encodeURIComponent(patientId)}/administration`,
        { method: "POST", body: JSON.stringify({ kind: "coverage", recordId, values }) },
        patientId,
      );
      return res.record;
    },

    /** `pharmacyId` re-prioritises or retires an existing link; omit it to add one. */
    async savePharmacy(
      patientId: string,
      values: Record<string, unknown>,
      pharmacyId?: string,
    ): Promise<unknown> {
      const res = await request<{ success: boolean; record: unknown }>(
        `/api/patients/${encodeURIComponent(patientId)}/administration`,
        { method: "POST", body: JSON.stringify({ kind: "pharmacy", recordId: pharmacyId, values }) },
        patientId,
      );
      return res.record;
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

    /**
     * The clinical records this encounter's note references.
     *
     * Patient-scoped like every other clinical read: the header is what the server
     * checks the caller's access against.
     */
    async references(id: string, patientId: string): Promise<NoteReferenceRecord[]> {
      const res = await request<{ success: boolean; references: NoteReferenceRecord[] }>(
        `/api/encounters/${encodeURIComponent(id)}/references`,
        {},
        patientId,
      );
      return res.references;
    },

    /**
     * Ask the server to propose references for one section of the draft note.
     *
     * Safe to call on a debounce: unchanged text is a no-op server-side, and
     * everything it produces is a proposal awaiting confirmation at signing.
     */
    async extractReferences(
      id: string,
      patientId: string,
      section: string,
      text: string,
    ): Promise<NoteReferenceRecord[]> {
      const res = await request<{ success: boolean; references: NoteReferenceRecord[] }>(
        `/api/encounters/${encodeURIComponent(id)}/references`,
        { method: "POST", body: JSON.stringify({ section, text }) },
        patientId,
      );
      return res.references;
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

    async save(
      preferences: ProviderPreferences,
      providerId?: string,
      expectedRevision?: number,
    ): Promise<ProviderPreferences> {
      const res = await request<{ success: boolean; preferences: ProviderPreferences }>("/api/preferences", {
        method: "PUT",
        body: JSON.stringify({ preferences, providerId, expectedRevision }),
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
    async list(filter?: { date?: string; patientId?: string; status?: AppointmentStatus; providerId?: string }): Promise<AppointmentRecord[]> {
      const params = new URLSearchParams();
      if (filter?.date) params.set("date", filter.date);
      if (filter?.patientId) params.set("patientId", filter.patientId);
      if (filter?.status) params.set("status", filter.status);
      if (filter?.providerId) params.set("providerId", filter.providerId);
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

    async scheduleFollowUp(input: {
      originAppointmentId?: string;
      interval: string;
      patientId?: string;
      baseDate?: string;
      date?: string;
      time?: string;
      type?: VisitType;
      duration?: string;
      providerId?: string;
      room?: string;
    }): Promise<AppointmentRecord> {
      const res = await request<{ success: boolean; appointment: AppointmentRecord }>("/api/appointments", {
        method: "POST",
        body: JSON.stringify({ action: "schedule_follow_up", ...input }),
      }, input.patientId);
      rememberBinding(appointmentPatientBindings, res.appointment.id, res.appointment.patientId);
      return res.appointment;
    },

    async checkIn(id: string, expectedVersion?: number): Promise<AppointmentRecord> {
      return this.updateStatus(id, "waiting", undefined, expectedVersion);
    },

    async startVisit(id: string, expectedVersion?: number): Promise<AppointmentRecord> {
      return this.updateStatus(id, "in-visit", undefined, expectedVersion);
    },

    async complete(id: string, expectedVersion?: number): Promise<AppointmentRecord> {
      return this.updateStatus(id, "completed", undefined, expectedVersion);
    },

    async markNoShow(id: string, expectedVersion?: number): Promise<AppointmentRecord> {
      return this.updateStatus(id, "no-show", undefined, expectedVersion);
    },

    async updateStatus(
      id: string,
      status: AppointmentStatus,
      patientIdOrExpectedVersion?: string | number,
      expectedVersion?: number,
    ): Promise<AppointmentRecord> {
      let patientId: string | undefined = undefined;
      let version: number | undefined = expectedVersion;
      if (typeof patientIdOrExpectedVersion === "number") {
        version = patientIdOrExpectedVersion;
      } else if (typeof patientIdOrExpectedVersion === "string") {
        patientId = patientIdOrExpectedVersion;
      }
      const boundPatientId = requireBinding(appointmentPatientBindings, id, "Appointment", patientId);
      const res = await request<{ success: boolean; appointment: AppointmentRecord }>("/api/appointments", {
        method: "PATCH",
        body: JSON.stringify({ id, status, expectedVersion: version }),
      }, boundPatientId);
      rememberBinding(appointmentPatientBindings, res.appointment.id, res.appointment.patientId);
      return res.appointment;
    },

    async update(
      id: string,
      updates: Partial<AppointmentRecord>,
      patientIdOrExpectedVersion?: string | number,
      expectedVersion?: number,
    ): Promise<AppointmentRecord> {
      let patientId: string | undefined = undefined;
      let version: number | undefined = expectedVersion;
      if (typeof patientIdOrExpectedVersion === "number") {
        version = patientIdOrExpectedVersion;
      } else if (typeof patientIdOrExpectedVersion === "string") {
        patientId = patientIdOrExpectedVersion;
      }
      const boundPatientId = requireBinding(appointmentPatientBindings, id, "Appointment", patientId);
      const res = await request<{ success: boolean; appointment: AppointmentRecord }>("/api/appointments", {
        method: "PUT",
        body: JSON.stringify({ id, expectedVersion: version, ...updates }),
      }, boundPatientId);
      rememberBinding(appointmentPatientBindings, res.appointment.id, res.appointment.patientId);
      return res.appointment;
    },

    async cancel(
      id: string,
      cancellationReason: string,
      cancellationNote?: string,
      patientIdOrExpectedVersion?: string | number,
      expectedVersion?: number,
    ): Promise<AppointmentRecord> {
      let patientId: string | undefined = undefined;
      let version: number | undefined = expectedVersion;
      if (typeof patientIdOrExpectedVersion === "number") {
        version = patientIdOrExpectedVersion;
      } else if (typeof patientIdOrExpectedVersion === "string") {
        patientId = patientIdOrExpectedVersion;
      }
      const boundPatientId = requireBinding(appointmentPatientBindings, id, "Appointment", patientId);
      const res = await request<{ success: boolean; appointment: AppointmentRecord }>("/api/appointments", {
        method: "PATCH",
        body: JSON.stringify({ id, action: "cancel", cancellationReason, cancellationNote, expectedVersion: version }),
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

  handoffs: {
    async list(filter?: {
      appointmentId?: string;
      patientId?: string;
      toUserId?: string;
      fromUserId?: string;
      status?: HandoffStatus;
    }): Promise<VisitHandoff[]> {
      const params = new URLSearchParams();
      if (filter?.appointmentId) params.set("appointmentId", filter.appointmentId);
      if (filter?.patientId) params.set("patientId", filter.patientId);
      if (filter?.toUserId) params.set("toUserId", filter.toUserId);
      if (filter?.fromUserId) params.set("fromUserId", filter.fromUserId);
      if (filter?.status) params.set("status", filter.status);
      const url = params.toString() ? `/api/appointments/handoffs?${params.toString()}` : "/api/appointments/handoffs";
      const res = await request<{ success: boolean; handoffs: VisitHandoff[] }>(url);
      return res.handoffs;
    },

    async initiate(input: {
      appointmentId: string;
      patientId: string;
      toUserId: string;
      toUserName?: string;
      reason: string;
      clinicalSummary?: string;
    }): Promise<VisitHandoff> {
      const res = await request<{ success: boolean; handoff: VisitHandoff }>("/api/appointments/handoffs", {
        method: "POST",
        body: JSON.stringify({ action: "initiate", ...input }),
      }, input.patientId);
      return res.handoff;
    },

    async accept(handoffId: string, note?: string): Promise<VisitHandoff> {
      const res = await request<{ success: boolean; handoff: VisitHandoff }>("/api/appointments/handoffs", {
        method: "POST",
        body: JSON.stringify({ action: "accept", handoffId, note }),
      });
      return res.handoff;
    },

    async decline(handoffId: string, declineReason: string): Promise<VisitHandoff> {
      const res = await request<{ success: boolean; handoff: VisitHandoff }>("/api/appointments/handoffs", {
        method: "POST",
        body: JSON.stringify({ action: "decline", handoffId, declineReason }),
      });
      return res.handoff;
    },

    async cancel(handoffId: string, note?: string): Promise<VisitHandoff> {
      const res = await request<{ success: boolean; handoff: VisitHandoff }>("/api/appointments/handoffs", {
        method: "POST",
        body: JSON.stringify({ action: "cancel", handoffId, note }),
      });
      return res.handoff;
    },
  },

  presence: {
    async list(): Promise<Array<{ userId: string; presence: TeamPresence; lastActiveAt: string }>> {
      const res = await request<{ success: boolean; presence: Array<{ userId: string; presence: TeamPresence; lastActiveAt: string }> }>("/api/team/presence");
      return res.presence;
    },

    async heartbeat(location?: string, status?: TeamPresence): Promise<{ userId: string; presence: TeamPresence; lastActiveAt: string }> {
      const res = await request<{ success: boolean; presence: { userId: string; presence: TeamPresence; lastActiveAt: string } }>("/api/team/presence", {
        method: "POST",
        body: JSON.stringify({ location, status }),
      });
      return res.presence;
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
      const res = await request<{ success: boolean; context: AssembledClinicalContext }>(
        "/api/context",
        {
          method: "POST",
          body: JSON.stringify(options),
        },
        options.patientId,
      );
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
      const res = await request<{ success: boolean; results: SearchResultItem[] }>(
        `/api/ai/search?${params.toString()}`,
        {},
        patientId,
      );
      return res.results;
    },
  },
};
