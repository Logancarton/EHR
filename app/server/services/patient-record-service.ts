import {
  assertPermission,
  providerLabel,
  type ProviderContext,
} from "../auth/provider-context";
import { AuditRepository } from "../repositories/audit-repository";
import { PatientRepository, type PatientRecord } from "../repositories/patient-repository";
import type { AuditRepositoryPort, PatientRepositoryPort } from "../repositories/ports";
import type { ClinicalExecutionContext } from "./clinical-service";

export type CreatePatientInput = Omit<PatientRecord, "createdAt" | "updatedAt">;
export type UpdatePatientInput = Partial<
  Omit<PatientRecord, "id" | "createdAt" | "updatedAt">
>;

type Dependencies = {
  patients: PatientRepositoryPort;
  audit: AuditRepositoryPort;
};

const defaultDependencies: Dependencies = {
  patients: PatientRepository,
  audit: AuditRepository,
};

function auditActor(actor: ProviderContext) {
  return {
    userId: actor.userId,
    userName: providerLabel(actor),
    userRole: actor.role,
  };
}

function meta(context: ClinicalExecutionContext) {
  return { source: context.source, requestId: context.requestId };
}

export class PatientRecordService {
  constructor(private readonly deps: Dependencies = defaultDependencies) {}

  open(
    patientId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): PatientRecord {
    assertPermission(actor, "read_clinical");
    const patient = this.deps.patients.getById(patientId);
    if (!patient) throw new Error(`Patient not found: ${patientId}`);

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "chart_opened",
      patientId,
      description: `Opened patient chart for ${patient.name}.`,
      metadata: meta(context),
    });
    return patient;
  }

  create(
    input: CreatePatientInput,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): PatientRecord {
    assertPermission(actor, "edit_patient");
    const patient = this.deps.patients.create(input);

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "patient_created",
      patientId: patient.id,
      description: `Created patient chart for ${patient.name}.`,
      metadata: { mrn: patient.mrn, ...meta(context) },
    });
    return patient;
  }

  update(
    patientId: string,
    updates: UpdatePatientInput,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): PatientRecord {
    assertPermission(actor, "edit_patient");
    if (!this.deps.patients.getById(patientId)) {
      throw new Error(`Patient not found: ${patientId}`);
    }

    const updated = this.deps.patients.update(patientId, updates);
    if (!updated) throw new Error(`Patient not found: ${patientId}`);

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "patient_updated",
      patientId,
      description: `Updated patient chart for ${updated.name}.`,
      metadata: { fields: Object.keys(updates), ...meta(context) },
    });
    return updated;
  }
}

export const patientRecordService = new PatientRecordService();
