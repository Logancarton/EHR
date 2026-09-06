import type { AuditLogEntry } from "./audit-repository";
import type { EncounterRecord } from "./encounter-repository";
import type { OrderRecord } from "./order-repository";
import type { PatientRecord } from "./patient-repository";
import type { AppointmentRecord } from "./appointment-repository";
import type { PatientMessage, PatientMessageThread } from "../../domain/messages";
import type { ClinicalTask, ScratchNote } from "../../domain/tasks";
import type { AppointmentStatus } from "../../lib/schedule-data";

export type AuditEventInput = {
  userId?: string;
  userName?: string;
  userRole?: string;
  eventType: AuditLogEntry["eventType"];
  patientId?: string;
  description: string;
  metadata?: Record<string, any>;
};

/**
 * Small repository contracts keep clinical services independent from SQLite.
 * Future PostgreSQL/FHIR-backed repositories can implement the same ports.
 */
export interface PatientRepositoryPort {
  getAll(): PatientRecord[];
  getById(id: string): PatientRecord | null;
  create(patient: Omit<PatientRecord, "createdAt" | "updatedAt">): PatientRecord;
  update(id: string, updates: Partial<PatientRecord>): PatientRecord | null;
}

export interface EncounterRepositoryPort {
  getById(id: string): EncounterRecord | null;
  saveDraft(encounter: Partial<EncounterRecord> & { patientId: string }): EncounterRecord;
  sign(id: string, signedBy: string): EncounterRecord | null;
}

export interface OrderRepositoryPort {
  getById(id: string): OrderRecord | null;
  stageOrder(order: {
    id?: string;
    patientId: string;
    type: "medication" | "lab";
    name: string;
    details: Record<string, any>;
    orderedBy: string;
  }): OrderRecord;
  authorize(
    id: string,
    authorizedBy: string,
    authMetadata?: Record<string, any>,
  ): OrderRecord | null;
  removeStaged(id: string): boolean;
}

export interface MessageRepositoryPort {
  getThreadsByPatient(patientId: string): PatientMessageThread[];
  addMessage(message: {
    patientId: string;
    threadId: string;
    senderRole: "patient" | "provider" | "assistant";
    senderName: string;
    content: string;
    channel?: "portal" | "sms";
  }): PatientMessage;
  markRead(threadId: string): void;
}

export interface TaskRepositoryPort {
  getTasks(patientId?: string): ClinicalTask[];
  createTask(task: { text: string; patientId?: string; due?: string }): ClinicalTask;
  toggleTask(id: string): ClinicalTask | null;
  deleteTask(id: string): boolean;
  getScratchNotes(): ScratchNote[];
  createScratchNote(note: { text: string; color?: string; patientId?: string }): ScratchNote;
  deleteScratchNote(id: string): boolean;
}

export interface AppointmentRepositoryPort {
  list(filter?: {
    date?: string;
    patientId?: string;
    status?: AppointmentStatus;
  }): AppointmentRecord[];
  getById(id: string): AppointmentRecord | null;
  create(appointment: Omit<AppointmentRecord, "createdAt" | "updatedAt">): AppointmentRecord;
  updateStatus(id: string, status: AppointmentStatus): AppointmentRecord | null;
  delete(id: string): boolean;
}

export interface AuditRepositoryPort {
  log(event: AuditEventInput): AuditLogEntry;
}
