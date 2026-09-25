import type { Patient } from "../domain/patient";
import {
  ageFromDateOfBirth,
  type BookingPatientSummary,
  type CareNetworkMember,
  type PatientAdministrativeRecord,
  type RelatedPerson,
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
import { isNonPatientEvent, type AppointmentStatus, type VisitHandoff, type HandoffStatus, type VisitType } from "./schedule-data";
import type { TeamPresence } from "../domain/team-collaboration";
import type { AssembledClinicalContext, ClinicalSurface, UserRole } from "../server/context/context-assembler";
import type { ExtractedCandidateAction } from "./entity-extraction";
import type { TranscriptUtterance } from "./encounter-engine";
import type { SearchResultItem } from "../server/repositories/clinical-search-repository";
import type { BillingWorkspaceView } from "../server/services/billing-service";
import type { BillingChargeRecord } from "../domain/billing";
import type { BillingSetupView } from "../domain/billing-setup";
import type { Superbill } from "../domain/superbill";
import type { VisitReadinessServerView } from "../domain/visit-readiness";
import type { IntakeDetail } from "../server/services/intake-service";
import type { IntakeQueueRow, PayerPlanParticipation } from "../domain/intake";
import type { HrItemCategory, HrRecord, HrRecordItem } from "../server/repositories/hr-repository";
import type { HrDirectoryEntry, HrItemStatus } from "../server/services/hr-service";
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

export async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  expectedPatientId?: string,
): Promise<T> {
  const patientHeader = expectedPatientId && !isNonPatientEvent(expectedPatientId)
    ? expectedPatientId
    : undefined;
  const headers = {
    "Content-Type": "application/json",
    ...(patientHeader ? { [ACTIVE_PATIENT_HEADER]: patientHeader } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  const rawBody = await res.text();
  let json: Record<string, unknown> | null = null;
  if (rawBody.trim()) {
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        json = parsed as Record<string, unknown>;
      }
    } catch {
      // Preserve the HTTP status below. Raw proxy/HTML responses are deliberately
      // not surfaced to the clinician or retained on ApiError.
    }
  }

  const reportedFailure = json?.success === false;
  if (!res.ok || reportedFailure) {
    // A non-JSON 401 still participates in the shared authentication recovery
    // flow. A 403 remains an authorization failure, and transport failures still
    // reject before this point without being misclassified as session expiry.
    if (res.status === 401) reportAuthenticationFailure();
    const serverMessage =
      typeof json?.error === "string" && json.error.trim() ? json.error : null;
    throw new ApiError(
      serverMessage || `Request failed (${res.status}).`,
      res.status,
      json || undefined,
    );
  }

  if (!json) {
    throw new ApiError("The server returned an invalid response.", res.status);
  }

  return json as T;
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
    async bookingRoster(): Promise<BookingPatientSummary[]> {
      const res = await request<{ success: boolean; patients: BookingPatientSummary[] }>("/api/patients?view=booking");
      return res.patients;
    },

    async list(): Promise<PatientRecord[]> {
      const res = await request<{ success: boolean; patients: PatientRecord[] }>("/api/patients");
      return res.patients;
    },

    async get(id: string): Promise<PatientRecord> {
      const res = await request<{ success: boolean; patient: PatientRecord }>(`/api/patients/${id}`);
      return res.patient;
    },

    async create(patient: Omit<Partial<PatientRecord>, "contact"> & {
      name: string;
      dob: string;
      contact?: Partial<PatientRecord["contact"]>;
    }): Promise<PatientRecord> {
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

  /** The Intake queue: readiness projection, staff-workflow state, and its evidence records. */
  intake: {
    async queue(): Promise<IntakeQueueRow[]> {
      const res = await request<{ success: boolean; queue: IntakeQueueRow[] }>("/api/intake");
      return res.queue;
    },

    /** `id` may be a patient id or a prospective-person id (D-076) — the
     * caller already knows which one it has from a queue row. */
    async detail(id: string): Promise<IntakeDetail> {
      const res = await request<{ success: boolean; detail: IntakeDetail }>(
        `/api/intake?patientId=${encodeURIComponent(id)}`,
        {},
        id,
      );
      return res.detail;
    },

    async payerPlanParticipations(): Promise<PayerPlanParticipation[]> {
      const res = await request<{ success: boolean; participations: PayerPlanParticipation[] }>("/api/intake?payerPlans=1");
      return res.participations;
    },

    async action<T = unknown>(payload: Record<string, unknown> & { action: string; patientId?: string; prospectivePersonId?: string }): Promise<T> {
      const res = await request<{ success: boolean } & Record<string, unknown>>(
        "/api/intake",
        { method: "POST", body: JSON.stringify(payload) },
        payload.patientId ?? payload.prospectivePersonId,
      );
      return res as T;
    },
  },

  /** The pre-chart identity stage (D-076). */
  prospectivePersons: {
    async action<T = unknown>(payload: Record<string, unknown> & { action: string; prospectiveId?: string }): Promise<T> {
      const res = await request<{ success: boolean } & Record<string, unknown>>(
        "/api/prospective-persons",
        { method: "POST", body: JSON.stringify(payload) },
        payload.prospectiveId,
      );
      return res as T;
    },

    /** Shaped as a `BookingPatientSummary` so the calendar's tentative-hold
     * flow can hold either a real patient or a fresh prospect with the same
     * downstream code — there is no chart or MRN yet, so `mrn` is empty. */
    async create(input: { name: string; dob: string; mobilePhone?: string; email?: string }): Promise<BookingPatientSummary> {
      const res = await request<{ success: boolean; prospect: { id: string; name: string; dob?: string; mobilePhone?: string; email?: string } }>(
        "/api/prospective-persons",
        { method: "POST", body: JSON.stringify({ name: input.name, dob: input.dob, mobilePhone: input.mobilePhone, email: input.email }) },
      );
      const p = res.prospect;
      return {
        id: p.id,
        name: p.name,
        dob: p.dob || input.dob,
        age: ageFromDateOfBirth(p.dob || input.dob) ?? 0,
        mrn: "PENDING",
        status: "Prospective",
        contact: { mobilePhone: p.mobilePhone, email: p.email },
      };
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
    async reviewReferences(
      id: string,
      patientId: string,
      decisions: { confirmIds: string[]; rejectIds: string[] },
    ): Promise<NoteReferenceRecord[]> {
      const res = await request<{ success: boolean; references: NoteReferenceRecord[] }>(
        `/api/encounters/${encodeURIComponent(id)}/references`,
        { method: "PATCH", body: JSON.stringify(decisions) },
        patientId,
      );
      return res.references;
    },

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
    /** Always the authenticated session's own record — the server, never the browser, decides whose. */
    async get(): Promise<ProviderPreferences> {
      const res = await request<{ success: boolean; preferences: ProviderPreferences }>("/api/preferences");
      return res.preferences;
    },

    async save(
      preferences: ProviderPreferences,
      expectedRevision?: number,
    ): Promise<ProviderPreferences> {
      const res = await request<{ success: boolean; preferences: ProviderPreferences }>("/api/preferences", {
        method: "PUT",
        body: JSON.stringify({ preferences, expectedRevision }),
      });
      return res.preferences;
    },
  },

  /**
   * HR (D-086). `mine` is every member's own record and needs no permission. `directory`
   * is other people's records and throws a 403 ApiError for anyone who is not an owner,
   * manager, or designated HR administrator — callers must surface that refusal rather
   * than fall back to an empty list.
   */
  hr: {
    async mine(): Promise<{
      userId: string;
      record: HrRecord | null;
      canReadOthers: boolean;
      canAssign: boolean;
      canDesignate: boolean;
    }> {
      const res = await request<{
        success: boolean;
        userId: string;
        record: HrRecord | null;
        canReadOthers: boolean;
        canAssign: boolean;
        canDesignate: boolean;
      }>("/api/hr");
      return {
        userId: res.userId,
        record: res.record,
        canReadOthers: res.canReadOthers,
        canAssign: res.canAssign,
        canDesignate: res.canDesignate,
      };
    },

    async directory(): Promise<{
      entries: HrDirectoryEntry[];
      canAssign: boolean;
      canDesignate: boolean;
    }> {
      const res = await request<{
        success: boolean;
        entries: HrDirectoryEntry[];
        canAssign: boolean;
        canDesignate: boolean;
      }>("/api/hr/directory");
      return { entries: res.entries, canAssign: res.canAssign, canDesignate: res.canDesignate };
    },

    /** Set up or correct the employment facts at the head of a member's record. */
    async assignRecord(input: {
      userId: string;
      employmentType?: string;
      startedOn?: string | null;
    }): Promise<HrRecord> {
      const res = await request<{ success: boolean; record: HrRecord }>("/api/hr", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return res.record;
    },

    /** Assign an insurance plan, licensing deadline, coaching, or goal to a member. */
    async assignItem(input: {
      userId: string;
      category: HrItemCategory;
      title: string;
      detail?: string;
      status?: HrItemStatus;
      dueOn?: string | null;
    }): Promise<{ record: HrRecord; item: HrRecordItem }> {
      const res = await request<{ success: boolean; record: HrRecord; item: HrRecordItem }>(
        "/api/hr/items",
        { method: "POST", body: JSON.stringify(input) },
      );
      return { record: res.record, item: res.item };
    },

    /** Grant or revoke the HR designation. Owners and managers only; the server refuses others. */
    async setDesignation(userId: string, designated: boolean): Promise<boolean> {
      const res = await request<{ success: boolean; hrDesignated: boolean }>("/api/hr/designation", {
        method: "PATCH",
        body: JSON.stringify({ userId, designated }),
      });
      return res.hrDesignated;
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
      const isNonPatient = isNonPatientEvent(appointment.patientId, appointment.type);
      const res = await request<{ success: boolean; appointment: AppointmentRecord }>("/api/appointments", {
        method: "POST",
        body: JSON.stringify(appointment),
      }, isNonPatient ? undefined : appointment.patientId);
      if (!isNonPatient) {
        rememberBinding(appointmentPatientBindings, res.appointment.id, appointment.patientId);
      }
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

  /**
   * Billing (roadmap P9-0 / P9-B).
   *
   * There is no client-side claim state: every row, count and transport answer the
   * Billing workspace shows comes from this one authorized read, and a mutation
   * returns the persisted record rather than a locally patched one. That is the
   * difference from the removed prototype, which held its claims in React state and
   * "transmitted" them by calling `setState`.
   */
  billing: {
    async worklist(periodDays?: number): Promise<BillingWorkspaceView> {
      const query = periodDays ? `?periodDays=${encodeURIComponent(String(periodDays))}` : "";
      const res = await request<{ success: boolean } & BillingWorkspaceView>(`/api/billing${query}`);
      return {
        charges: res.charges,
        awaitingCharge: res.awaitingCharge,
        summary: res.summary,
        transport: res.transport,
      };
    },

    async prepare(encounterId: string, patientId: string): Promise<BillingChargeRecord> {
      const res = await request<{ success: boolean; charge: BillingChargeRecord }>(
        "/api/billing",
        { method: "POST", body: JSON.stringify({ operation: "prepare", encounterId, patientId }) },
        patientId,
      );
      return res.charge;
    },

    async review(chargeId: string, patientId: string, options: { note?: string; expectedVersion: number }): Promise<BillingChargeRecord> {
      const res = await request<{ success: boolean; charge: BillingChargeRecord }>(
        "/api/billing",
        {
          method: "POST",
          body: JSON.stringify({ operation: "review", chargeId, ...options }),
        },
        patientId,
      );
      return res.charge;
    },

    async void(chargeId: string, patientId: string, options: { reason: string; expectedVersion: number }): Promise<BillingChargeRecord> {
      const res = await request<{ success: boolean; charge: BillingChargeRecord }>(
        "/api/billing",
        {
          method: "POST",
          body: JSON.stringify({ operation: "void", chargeId, ...options }),
        },
        patientId,
      );
      return res.charge;
    },

    async setup(): Promise<BillingSetupView> {
      const res = await request<{ success: boolean; setup: BillingSetupView }>("/api/billing/setup");
      return res.setup;
    },

    /** One practice-setup write; the server answers with the whole refreshed setup. */
    async saveSetup(operation: string, body: Record<string, unknown> = {}): Promise<BillingSetupView> {
      const res = await request<{ success: boolean; setup: BillingSetupView }>("/api/billing/setup", {
        method: "POST",
        body: JSON.stringify({ ...body, operation }),
      });
      return res.setup;
    },

    async superbill(chargeId: string): Promise<Superbill> {
      const res = await request<{ success: boolean; superbill: Superbill }>(
        `/api/billing/superbill?chargeId=${encodeURIComponent(chargeId)}`,
      );
      return res.superbill;
    },
  },

  visitReadiness: {
    async get(patientId: string, encounterId?: string | null): Promise<VisitReadinessServerView> {
      const query = new URLSearchParams({ patientId });
      if (encounterId) query.set("encounterId", encounterId);
      const res = await request<{ success: boolean; readiness: VisitReadinessServerView }>(
        `/api/visit-readiness?${query.toString()}`,
        undefined,
        patientId,
      );
      return res.readiness;
    },
  },
};
