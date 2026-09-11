import {
  assertPermission,
  providerLabel,
  type ProviderContext,
} from "../auth/provider-context";
import { AuditRepository } from "../repositories/audit-repository";
import { PatientRepository, type PatientRecord, type PatientWriteInput } from "../repositories/patient-repository";
import { ClinicalRecordRepository } from "../repositories/clinical-record-repository";
import { PatientAdministrationRepository } from "../repositories/patient-administration-repository";
import type { AuditRepositoryPort, PatientRepositoryPort } from "../repositories/ports";
import type { ClinicalExecutionContext } from "./clinical-service";

export type CreatePatientInput = PatientWriteInput;
export type UpdatePatientInput = Partial<Omit<PatientWriteInput, "id">>;

type Dependencies = { patients: PatientRepositoryPort; audit: AuditRepositoryPort };
const defaultDependencies: Dependencies = { patients: PatientRepository, audit: AuditRepository };

function auditActor(actor: ProviderContext) {
  return { userId:actor.userId, userName:providerLabel(actor), userRole:actor.role };
}
function meta(context: ClinicalExecutionContext) { return { source:context.source, requestId:context.requestId }; }
function recordActor(actor: ProviderContext) { return { userId:actor.userId, displayName:providerLabel(actor) }; }

export class PatientRecordService {
  constructor(private readonly deps: Dependencies = defaultDependencies) {}

  open(patientId: string, actor: ProviderContext, context: ClinicalExecutionContext): PatientRecord {
    assertPermission(actor, "read_clinical");
    const patient = this.deps.patients.getById(patientId);
    if (!patient) throw new Error(`Patient not found: ${patientId}`);
    this.deps.audit.log({ ...auditActor(actor), eventType:"chart_opened", patientId,
      description:`Opened patient chart for ${patient.name}.`, metadata:meta(context) });
    return patient;
  }

  create(
    input: CreatePatientInput,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    organizationId?: string,
  ): PatientRecord {
    assertPermission(actor, "edit_patient");
    assertUsableIdentity(input.name, input.dob, input.mrn);
    // Two charts under one MRN is two charts nobody can safely merge later, so the
    // collision is refused at creation rather than reconciled afterwards.
    if (PatientAdministrationRepository.mrnTakenByAnotherPatient(input.mrn)) {
      throw new Error(`MRN ${input.mrn} already belongs to another patient.`);
    }
    const patient = this.deps.patients.create(input, organizationId);
    const source = { type:"patient-create", system:"ehr-local", ref:`patients/${patient.id}` };
    const rActor = recordActor(actor);

    for (const allergy of input.allergies || []) {
      ClinicalRecordRepository.addAllergy({ patientId:patient.id, substance:allergy }, rActor, source);
    }
    for (const diagnosis of input.diagnoses || []) {
      ClinicalRecordRepository.addProblem({ patientId:patient.id, displayText:diagnosis }, rActor, source);
    }
    for (const medication of input.meds || []) {
      ClinicalRecordRepository.addMedication({ patientId:patient.id, displayText:medication }, rActor, source);
    }
    const vitalMap: Array<[keyof PatientRecord["vitals"], string, string]> = [
      ["bp", "BP", "Blood Pressure"],
      ["hr", "HR", "Heart Rate"],
      ["wt", "WT", "Weight"],
      ["bmi", "BMI", "BMI"],
    ];
    for (const [key, code, name] of vitalMap) {
      const value = input.vitals?.[key];
      if (value === undefined || value === null || value === "") continue;
      ClinicalRecordRepository.addObservation({
        patientId:patient.id,
        category:"vital-signs",
        testName:name,
        code,
        codingSystem:"ehr-local",
        valueText:String(value),
        valueNum:typeof value === "number" ? value : undefined,
        observedBy:providerLabel(actor),
      }, rActor, source);
    }

    this.deps.audit.log({ ...auditActor(actor), eventType:"patient_created", patientId:patient.id,
      description:`Created patient chart for ${patient.name}.`, metadata:{ mrn:patient.mrn, ...meta(context) } });
    return this.deps.patients.getById(patient.id) || patient;
  }

  update(patientId: string, updates: UpdatePatientInput, actor: ProviderContext, context: ClinicalExecutionContext): PatientRecord {
    assertPermission(actor, "edit_patient");
    if (!this.deps.patients.getById(patientId)) throw new Error(`Patient not found: ${patientId}`);

    // Clinical arrays are no longer mutated through the patient demographic shell.
    // They must use typed clinical-record actions so history/provenance cannot be bypassed.
    if (updates.allergies || updates.diagnoses || updates.meds || updates.vitals) {
      throw new Error("Medications, allergies, diagnoses, and vitals must be updated through authoritative clinical record actions.");
    }
    if (updates.mrn && PatientAdministrationRepository.mrnTakenByAnotherPatient(updates.mrn, patientId)) {
      throw new Error(`MRN ${updates.mrn} already belongs to another patient.`);
    }
    if (updates.name !== undefined && !String(updates.name).trim()) {
      throw new Error("A patient chart needs a legal name.");
    }

    const updated = this.deps.patients.update(patientId, updates);
    if (!updated) throw new Error(`Patient not found: ${patientId}`);
    this.deps.audit.log({ ...auditActor(actor), eventType:"patient_updated", patientId,
      description:`Updated patient chart for ${updated.name}.`, metadata:{ fields:Object.keys(updates), ...meta(context) } });
    return updated;
  }
}

/**
 * The minimum a chart needs to be safely identifiable. Anything less is a record
 * nobody can match to a person — the failure mode a duplicate MRN check exists for.
 */
function assertUsableIdentity(name: string, dob: string, mrn: string): void {
  if (!name?.trim()) throw new Error("A patient chart needs a legal name.");
  if (!dob?.trim()) throw new Error("A patient chart needs a date of birth.");
  if (!mrn?.trim()) throw new Error("A patient chart needs an MRN.");
}

export const patientRecordService = new PatientRecordService();
