import type { AuditLogEntry } from "./audit-repository";
import type { EncounterRecord } from "./encounter-repository";
import type { OrderRecord } from "./order-repository";
import type { PatientRecord } from "./patient-repository";

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
  getById(id: string): PatientRecord | null;
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

export interface AuditRepositoryPort {
  log(event: AuditEventInput): AuditLogEntry;
}
