import { assertPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import { AuditRepository } from "../repositories/audit-repository";
import { ClinicalRecordRepository, type RecordSource } from "../repositories/clinical-record-repository";
import { ClinicalRecordUpdateRepository } from "../repositories/clinical-record-update-repository";
import type { ClinicalExecutionContext } from "./clinical-service";

function actorRef(actor: ProviderContext) {
  return { userId: actor.userId, displayName: providerLabel(actor) };
}
function auditActor(actor: ProviderContext) {
  return { userId: actor.userId, userName: providerLabel(actor), userRole: actor.role };
}
function metadata(context: ClinicalExecutionContext, extra: Record<string, unknown> = {}) {
  return { source: context.source, requestId: context.requestId, ...extra };
}

export const clinicalRecordService = {
  snapshot(patientId: string, actor: ProviderContext) {
    assertPermission(actor, "read_clinical");
    return {
      allergies: ClinicalRecordRepository.allergies(patientId),
      problems: ClinicalRecordRepository.problems(patientId),
      medications: ClinicalRecordRepository.medications(patientId),
      observations: ClinicalRecordRepository.observations(patientId),
      insurance: ClinicalRecordRepository.insurance(patientId),
      pharmacies: ClinicalRecordRepository.pharmacies(patientId),
      documents: ClinicalRecordRepository.documents(patientId),
    };
  },

  addAllergy(input: Parameters<typeof ClinicalRecordRepository.addAllergy>[0], actor: ProviderContext, context: ClinicalExecutionContext, source?: RecordSource) {
    assertPermission(actor, "manage_clinical_record");
    const record = ClinicalRecordRepository.addAllergy(input, actorRef(actor), source);
    AuditRepository.log({ ...auditActor(actor), eventType:"clinical_fact_created", patientId:input.patientId,
      description:`Recorded allergy ${record.substance}.`, metadata:metadata(context, { entityType:"allergy", entityId:record.id }) });
    return record;
  },

  updateAllergy(recordId: string, patch: Parameters<typeof ClinicalRecordUpdateRepository.updateAllergy>[1], actor: ProviderContext, context: ClinicalExecutionContext, source?: RecordSource) {
    assertPermission(actor, "manage_clinical_record");
    const record = ClinicalRecordUpdateRepository.updateAllergy(recordId, patch, actorRef(actor), source);
    AuditRepository.log({ ...auditActor(actor), eventType:"clinical_fact_updated", patientId:record.patient_id,
      description:`Updated allergy ${record.substance}.`, metadata:metadata(context, { entityType:"allergy", entityId:record.id, status:record.status }) });
    return record;
  },

  addProblem(input: Parameters<typeof ClinicalRecordRepository.addProblem>[0], actor: ProviderContext, context: ClinicalExecutionContext, source?: RecordSource) {
    assertPermission(actor, "manage_clinical_record");
    const record = ClinicalRecordRepository.addProblem(input, actorRef(actor), source);
    AuditRepository.log({ ...auditActor(actor), eventType:"clinical_fact_created", patientId:input.patientId,
      description:`Recorded problem ${record.display_text}.`, metadata:metadata(context, { entityType:"problem", entityId:record.id }) });
    return record;
  },

  updateProblem(recordId: string, patch: Parameters<typeof ClinicalRecordUpdateRepository.updateProblem>[1], actor: ProviderContext, context: ClinicalExecutionContext, source?: RecordSource) {
    assertPermission(actor, "manage_clinical_record");
    const record = ClinicalRecordUpdateRepository.updateProblem(recordId, patch, actorRef(actor), source);
    AuditRepository.log({ ...auditActor(actor), eventType:"clinical_fact_updated", patientId:record.patient_id,
      description:`Updated problem ${record.display_text}.`, metadata:metadata(context, { entityType:"problem", entityId:record.id, status:record.status }) });
    return record;
  },

  addMedication(input: Parameters<typeof ClinicalRecordRepository.addMedication>[0], actor: ProviderContext, context: ClinicalExecutionContext, source?: RecordSource) {
    assertPermission(actor, "manage_clinical_record");
    const record = ClinicalRecordRepository.addMedication(input, actorRef(actor), source);
    AuditRepository.log({ ...auditActor(actor), eventType:"clinical_fact_created", patientId:input.patientId,
      description:`Recorded medication ${record.display_text}.`, metadata:metadata(context, { entityType:"medication", entityId:record.id }) });
    return record;
  },

  updateMedication(recordId: string, patch: Parameters<typeof ClinicalRecordUpdateRepository.updateMedication>[1], actor: ProviderContext, context: ClinicalExecutionContext, source?: RecordSource) {
    assertPermission(actor, "manage_clinical_record");
    const record = ClinicalRecordUpdateRepository.updateMedication(recordId, patch, actorRef(actor), source);
    AuditRepository.log({ ...auditActor(actor), eventType:"clinical_fact_updated", patientId:record.patient_id,
      description:`Updated medication ${record.display_text}.`, metadata:metadata(context, { entityType:"medication", entityId:record.id, status:record.status }) });
    return record;
  },

  addObservation(input: Parameters<typeof ClinicalRecordRepository.addObservation>[0], actor: ProviderContext, context: ClinicalExecutionContext, source?: RecordSource) {
    assertPermission(actor, "manage_clinical_record");
    const record = ClinicalRecordRepository.addObservation(input, actorRef(actor), source);
    AuditRepository.log({ ...auditActor(actor), eventType:"result_recorded", patientId:input.patientId,
      description:`Recorded ${record.category} observation ${record.test_name}.`, metadata:metadata(context, { entityId:record.id }) });
    return record;
  },

  addInsurance(input: Parameters<typeof ClinicalRecordRepository.addInsurance>[0], actor: ProviderContext, context: ClinicalExecutionContext, source?: RecordSource) {
    assertPermission(actor, "manage_clinical_record");
    const record = ClinicalRecordRepository.addInsurance(input, actorRef(actor), source);
    AuditRepository.log({ ...auditActor(actor), eventType:"clinical_fact_created", patientId:input.patientId,
      description:`Recorded insurance policy for ${record.payer_name}.`, metadata:metadata(context, { entityType:"insurance", entityId:record.id }) });
    return record;
  },

  updateInsurance(recordId: string, patch: Parameters<typeof ClinicalRecordUpdateRepository.updateInsurance>[1], actor: ProviderContext, context: ClinicalExecutionContext, source?: RecordSource) {
    assertPermission(actor, "manage_clinical_record");
    const record = ClinicalRecordUpdateRepository.updateInsurance(recordId, patch, actorRef(actor), source);
    AuditRepository.log({ ...auditActor(actor), eventType:"clinical_fact_updated", patientId:record.patient_id,
      description:`Updated insurance policy for ${record.payer_name}.`, metadata:metadata(context, { entityType:"insurance", entityId:record.id, status:record.status }) });
    return record;
  },

  addPharmacy(input: Parameters<typeof ClinicalRecordRepository.addPharmacy>[0], actor: ProviderContext, context: ClinicalExecutionContext, source?: RecordSource) {
    assertPermission(actor, "manage_clinical_record");
    const record = ClinicalRecordRepository.addPharmacy(input, actorRef(actor), source);
    AuditRepository.log({ ...auditActor(actor), eventType:"clinical_fact_created", patientId:input.patientId,
      description:`Linked pharmacy ${record.name}.`, metadata:metadata(context, { entityType:"pharmacy", entityId:record.id }) });
    return record;
  },

  updatePatientPharmacy(patientId: string, pharmacyId: string, patch: Parameters<typeof ClinicalRecordUpdateRepository.updatePatientPharmacy>[2], actor: ProviderContext, context: ClinicalExecutionContext, source?: RecordSource) {
    assertPermission(actor, "manage_clinical_record");
    const record = ClinicalRecordUpdateRepository.updatePatientPharmacy(patientId, pharmacyId, patch, actorRef(actor), source);
    AuditRepository.log({ ...auditActor(actor), eventType:"clinical_fact_updated", patientId,
      description:`Updated patient pharmacy link ${pharmacyId}.`, metadata:metadata(context, { entityType:"pharmacy", entityId:pharmacyId, status:record.status }) });
    return record;
  },

  createDocument(input: Parameters<typeof ClinicalRecordRepository.createDocument>[0], actor: ProviderContext, context: ClinicalExecutionContext, source?: RecordSource) {
    assertPermission(actor, "manage_clinical_record");
    const record = ClinicalRecordRepository.createDocument(input, actorRef(actor), source);
    AuditRepository.log({ ...auditActor(actor), eventType:"document_created", patientId:input.patientId,
      description:`Created document ${record.title}.`, metadata:metadata(context, { documentId:record.id }) });
    return record;
  },

  reviseDocument(documentId: string, input: Parameters<typeof ClinicalRecordRepository.addDocumentVersion>[1], actor: ProviderContext, context: ClinicalExecutionContext, source?: RecordSource) {
    assertPermission(actor, "manage_clinical_record");
    const record = ClinicalRecordRepository.addDocumentVersion(documentId, input, actorRef(actor), source);
    AuditRepository.log({ ...auditActor(actor), eventType:"document_revised", patientId:record.patient_id,
      description:`Created document version ${record.current_version} for ${record.title}.`, metadata:metadata(context, { documentId }) });
    return record;
  },

  acknowledgeResult(observationId: string, input: Parameters<typeof ClinicalRecordRepository.acknowledgeResult>[1], actor: ProviderContext, context: ClinicalExecutionContext) {
    assertPermission(actor, "acknowledge_result");
    const record = ClinicalRecordRepository.acknowledgeResult(observationId, input, actorRef(actor));
    AuditRepository.log({ ...auditActor(actor), eventType:"result_acknowledged", patientId:record.patient_id,
      description:`Acknowledged result ${observationId}.`, metadata:metadata(context, { observationId, disposition:input.disposition }) });
    return record;
  },

  addEncounterAddendum(encounterId: string, input: Parameters<typeof ClinicalRecordRepository.addEncounterAddendum>[1], actor: ProviderContext, context: ClinicalExecutionContext) {
    assertPermission(actor, "amend_signed_record");
    const record = ClinicalRecordRepository.addEncounterAddendum(encounterId, input, actorRef(actor));
    AuditRepository.log({ ...auditActor(actor), eventType:"encounter_addendum_created", patientId:record.patient_id,
      description:`Added ${record.addendum_type} to signed encounter ${encounterId}.`, metadata:metadata(context, { encounterId, addendumId:record.id }) });
    return record;
  },
};
