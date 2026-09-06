import type { ProviderContext } from "../auth/provider-context";
import type { EncounterRecord } from "../repositories/encounter-repository";
import type { AppointmentStatus } from "../../lib/schedule-data";
import type { TeamTaskStatus } from "../../domain/team-collaboration";
import { clinicalService, type ClinicalExecutionContext } from "../services/clinical-service";
import { patientRecordService, type CreatePatientInput, type UpdatePatientInput } from "../services/patient-record-service";
import { workflowService, type CreateAppointmentInput } from "../services/workflow-service";
import { orderControlService } from "../services/order-control-service";
import { collaborationService } from "../services/collaboration-service";
import { clinicalRecordService } from "../services/clinical-record-service";
import type { RecordSource } from "../repositories/clinical-record-repository";
import { assertClinicalActionPatientBinding } from "./patient-action-binding";

export type ClinicalAction =
  | { type: "open_patient_chart"; payload: { patientId: string } }
  | { type: "create_patient"; payload: CreatePatientInput }
  | { type: "update_patient"; payload: { patientId: string; updates: UpdatePatientInput } }
  | { type: "add_allergy"; payload: { patientId: string; substance: string; reaction?: string; severity?: string; source?: RecordSource } }
  | { type: "update_allergy"; payload: { recordId: string; patch: { reaction?: string | null; severity?: string | null; status?: "active" | "inactive" | "entered-in-error" }; source?: RecordSource } }
  | { type: "add_problem"; payload: { patientId: string; displayText: string; code?: string; codingSystem?: string; onsetDate?: string; source?: RecordSource } }
  | { type: "update_problem"; payload: { recordId: string; patch: { displayText?: string; code?: string | null; codingSystem?: string | null; status?: "active" | "resolved" | "inactive" | "entered-in-error"; resolvedDate?: string | null }; source?: RecordSource } }
  | { type: "add_medication"; payload: { patientId: string; displayText: string; medicationName?: string; genericName?: string; strength?: string; dose?: string; route?: string; frequency?: string; startDate?: string; prescriber?: string; source?: RecordSource } }
  | { type: "update_medication"; payload: { recordId: string; patch: { displayText?: string; medicationName?: string; genericName?: string | null; strength?: string | null; dose?: string | null; route?: string | null; frequency?: string | null; status?: "active" | "discontinued" | "completed" | "entered-in-error"; endDate?: string | null }; source?: RecordSource } }
  | { type: "add_observation"; payload: { patientId: string; category: string; testName: string; code?: string; codingSystem?: string; effectiveAt?: string; valueText: string; valueNum?: number; unit?: string; referenceRange?: string; interpretation?: string; status?: string; orderId?: string; documentId?: string; observedBy?: string; source?: RecordSource } }
  | { type: "add_insurance"; payload: { patientId: string; payerName: string; planName?: string; memberId?: string; groupNumber?: string; subscriberName?: string; relationship?: string; effectiveDate?: string; source?: RecordSource } }
  | { type: "update_insurance"; payload: { recordId: string; patch: { planName?: string | null; memberId?: string | null; groupNumber?: string | null; subscriberName?: string | null; relationship?: string | null; status?: "active" | "inactive" | "terminated" | "entered-in-error"; terminationDate?: string | null }; source?: RecordSource } }
  | { type: "add_pharmacy"; payload: { patientId: string; name: string; ncpdpId?: string; phone?: string; fax?: string; addressLine1?: string; city?: string; state?: string; postalCode?: string; priority?: number; source?: RecordSource } }
  | { type: "update_patient_pharmacy"; payload: { patientId: string; pharmacyId: string; patch: { priority?: number; status?: "active" | "inactive" }; source?: RecordSource } }
  | { type: "create_document"; payload: { patientId: string; documentType: string; title: string; mimeType?: string; contentText?: string; storageKey?: string; source?: RecordSource } }
  | { type: "revise_document"; payload: { documentId: string; contentText?: string; storageKey?: string; mimeType?: string; source?: RecordSource } }
  | { type: "acknowledge_result"; payload: { observationId: string; disposition: string; note?: string } }
  | { type: "add_encounter_addendum"; payload: { encounterId: string; body: string; reason?: string; addendumType?: "addendum" | "amendment" } }
  | { type: "stage_order"; payload: { id?: string; patientId: string; orderType: "medication" | "lab"; name: string; details?: Record<string, any> } }
  | { type: "remove_staged_order"; payload: { orderId: string } }
  | { type: "authorize_order"; payload: { orderId: string; authMetadata?: Record<string, any> } }
  | { type: "save_encounter_draft"; payload: Partial<EncounterRecord> & { patientId: string } }
  | { type: "sign_encounter"; payload: { encounterId: string } }
  | { type: "send_message"; payload: { patientId: string; threadId: string; content: string; channel?: "portal" | "sms" } }
  | { type: "mark_message_read"; payload: { threadId: string } }
  | { type: "create_task"; payload: { text: string; patientId?: string; due?: string } }
  | { type: "toggle_task"; payload: { taskId: string } }
  | { type: "delete_task"; payload: { taskId: string } }
  | { type: "create_scratch_note"; payload: { text: string; color?: string; patientId?: string } }
  | { type: "delete_scratch_note"; payload: { noteId: string } }
  | { type: "create_appointment"; payload: CreateAppointmentInput }
  | { type: "update_appointment_status"; payload: { appointmentId: string; status: AppointmentStatus } }
  | { type: "delete_appointment"; payload: { appointmentId: string } }
  | { type: "team_send_message"; payload: { partnerId: string; content: string; patientId?: string } }
  | { type: "team_request_task_agreement"; payload: { partnerId: string } }
  | { type: "team_accept_task_agreement"; payload: { partnerId: string } }
  | { type: "team_revoke_task_agreement"; payload: { partnerId: string } }
  | { type: "team_assign_task"; payload: { assigneeId: string; text: string; patientId?: string; dueDate?: string } }
  | { type: "team_update_task_status"; payload: { taskId: string; status: TeamTaskStatus } };

export type ClinicalActionEnvelope = {
  action: ClinicalAction;
  actor: ProviderContext;
  context: ClinicalExecutionContext;
  expectedPatientId?: string;
};

export async function executeClinicalAction(envelope: ClinicalActionEnvelope) {
  const { action, actor, context, expectedPatientId } = envelope;
  assertClinicalActionPatientBinding(action, expectedPatientId);

  switch (action.type) {
    case "open_patient_chart": return patientRecordService.open(action.payload.patientId, actor, context);
    case "create_patient": return patientRecordService.create(action.payload, actor, context);
    case "update_patient": return patientRecordService.update(action.payload.patientId, action.payload.updates, actor, context);
    case "add_allergy": { const { source, ...input } = action.payload; return clinicalRecordService.addAllergy(input, actor, context, source); }
    case "update_allergy": { const { recordId, patch, source } = action.payload; return clinicalRecordService.updateAllergy(recordId, patch, actor, context, source); }
    case "add_problem": { const { source, ...input } = action.payload; return clinicalRecordService.addProblem(input, actor, context, source); }
    case "update_problem": { const { recordId, patch, source } = action.payload; return clinicalRecordService.updateProblem(recordId, patch, actor, context, source); }
    case "add_medication": { const { source, ...input } = action.payload; return clinicalRecordService.addMedication(input, actor, context, source); }
    case "update_medication": { const { recordId, patch, source } = action.payload; return clinicalRecordService.updateMedication(recordId, patch, actor, context, source); }
    case "add_observation": { const { source, ...input } = action.payload; return clinicalRecordService.addObservation(input, actor, context, source); }
    case "add_insurance": { const { source, ...input } = action.payload; return clinicalRecordService.addInsurance(input, actor, context, source); }
    case "update_insurance": { const { recordId, patch, source } = action.payload; return clinicalRecordService.updateInsurance(recordId, patch, actor, context, source); }
    case "add_pharmacy": { const { source, ...input } = action.payload; return clinicalRecordService.addPharmacy(input, actor, context, source); }
    case "update_patient_pharmacy": { const { patientId, pharmacyId, patch, source } = action.payload; return clinicalRecordService.updatePatientPharmacy(patientId, pharmacyId, patch, actor, context, source); }
    case "create_document": { const { source, ...input } = action.payload; return clinicalRecordService.createDocument(input, actor, context, source); }
    case "revise_document": {
      const { documentId, source, ...input } = action.payload;
      return clinicalRecordService.reviseDocument(documentId, input, actor, context, source);
    }
    case "acknowledge_result": {
      const { observationId, ...input } = action.payload;
      return clinicalRecordService.acknowledgeResult(observationId, input, actor, context);
    }
    case "add_encounter_addendum": {
      const { encounterId, ...input } = action.payload;
      return clinicalRecordService.addEncounterAddendum(encounterId, input, actor, context);
    }
    case "stage_order": return clinicalService.stageOrder({ id:action.payload.id, patientId:action.payload.patientId, type:action.payload.orderType, name:action.payload.name, details:action.payload.details }, actor, context);
    case "remove_staged_order": return orderControlService.removeStaged(action.payload.orderId, actor, context);
    case "authorize_order": return clinicalService.authorizeOrder(action.payload.orderId, action.payload.authMetadata || {}, actor, context);
    case "save_encounter_draft": return clinicalService.saveEncounterDraft(action.payload, actor, context);
    case "sign_encounter": return clinicalService.signEncounter(action.payload.encounterId, actor, context);
    case "send_message": return workflowService.sendMessage(action.payload, actor, context);
    case "mark_message_read": return workflowService.markMessageRead(action.payload.threadId, actor, context);
    case "create_task": return workflowService.createTask(action.payload, actor, context);
    case "toggle_task": return workflowService.toggleTask(action.payload.taskId, actor, context);
    case "delete_task": return workflowService.deleteTask(action.payload.taskId, actor, context);
    case "create_scratch_note": return workflowService.createScratchNote(action.payload, actor, context);
    case "delete_scratch_note": return workflowService.deleteScratchNote(action.payload.noteId, actor, context);
    case "create_appointment": return workflowService.createAppointment(action.payload, actor, context);
    case "update_appointment_status": return workflowService.updateAppointmentStatus(action.payload.appointmentId, action.payload.status, actor, context);
    case "delete_appointment": return workflowService.deleteAppointment(action.payload.appointmentId, actor, context);
    case "team_send_message": return collaborationService.sendMessage(action.payload, actor, context);
    case "team_request_task_agreement": return collaborationService.requestTaskAgreement(action.payload.partnerId, actor, context);
    case "team_accept_task_agreement": return collaborationService.acceptTaskAgreement(action.payload.partnerId, actor, context);
    case "team_revoke_task_agreement": return collaborationService.revokeTaskAgreement(action.payload.partnerId, actor, context);
    case "team_assign_task": return collaborationService.assignTask(action.payload, actor, context);
    case "team_update_task_status": return collaborationService.updateTaskStatus(action.payload.taskId, action.payload.status, actor, context);
    default: { const exhaustive: never = action; throw new Error(`Unsupported clinical action: ${JSON.stringify(exhaustive)}`); }
  }
}

export const ClinicalActionGateway = { execute: executeClinicalAction };
