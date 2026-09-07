import { getDatabase } from "../db/connection";
import type { ClinicalAction } from "./clinical-action-gateway";

type PatientBinding = {
  patientId: string;
  target: string;
};

function requirePatientRow(
  table: string,
  idColumn: string,
  idValue: string,
  target: string,
): PatientBinding {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT patient_id FROM ${table} WHERE ${idColumn} = ?`)
    .get(idValue) as { patient_id?: string | null } | undefined;

  if (!row) throw new Error(`${target} not found: ${idValue}`);
  if (!row.patient_id) throw new Error(`${target} is not bound to a patient: ${idValue}`);
  return { patientId: row.patient_id, target: `${target} ${idValue}` };
}

function patientForMessageThread(threadId: string): PatientBinding {
  const db = getDatabase();
  const rows = db
    .prepare(`SELECT DISTINCT patient_id FROM messages WHERE thread_id = ?`)
    .all(threadId) as Array<{ patient_id: string }>;
  if (rows.length === 0) throw new Error(`Message thread not found: ${threadId}`);
  if (rows.length !== 1) {
    throw new Error(`Patient binding integrity violation: message thread ${threadId} spans multiple patients.`);
  }
  return { patientId: rows[0].patient_id, target: `message thread ${threadId}` };
}

function optionalPatientRow(
  table: string,
  idColumn: string,
  idValue: string,
  target: string,
): PatientBinding | null {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT patient_id FROM ${table} WHERE ${idColumn} = ?`)
    .get(idValue) as { patient_id?: string | null } | undefined;
  if (!row) throw new Error(`${target} not found: ${idValue}`);
  if (!row.patient_id) return null;
  return { patientId: row.patient_id, target: `${target} ${idValue}` };
}

function directPatient(patientId: string | undefined, target: string): PatientBinding | null {
  return patientId ? { patientId, target } : null;
}

function resolveBinding(action: ClinicalAction): PatientBinding | null {
  switch (action.type) {
    case "create_patient":
    case "open_patient_chart":
    case "team_request_task_agreement":
    case "team_accept_task_agreement":
    case "team_revoke_task_agreement":
      return null;

    case "update_patient":
    case "add_allergy":
    case "add_problem":
    case "add_medication":
    case "add_observation":
    case "add_insurance":
    case "add_pharmacy":
    case "update_patient_pharmacy":
    case "create_document":
    case "stage_order":
    case "save_encounter_draft":
    case "send_message":
    case "save_message_to_chart":
    case "create_appointment":
      return directPatient(action.payload.patientId, action.type);

    case "create_task":
    case "create_scratch_note":
    case "team_send_message":
    case "team_assign_task":
      return directPatient(action.payload.patientId, action.type);

    case "update_allergy":
      return requirePatientRow("patient_allergies", "id", action.payload.recordId, "Allergy record");
    case "update_problem":
      return requirePatientRow("patient_problems", "id", action.payload.recordId, "Problem record");
    case "update_medication":
      return requirePatientRow("patient_medications", "id", action.payload.recordId, "Medication record");
    case "update_insurance":
      return requirePatientRow("insurance_policies", "id", action.payload.recordId, "Insurance record");
    case "revise_document":
    case "transition_document_workflow":
      return requirePatientRow("documents", "id", action.payload.documentId, "Document");
    case "acknowledge_result":
      return requirePatientRow("observations", "id", action.payload.observationId, "Observation");
    case "add_encounter_addendum":
      return requirePatientRow("encounters", "id", action.payload.encounterId, "Encounter");
    case "remove_staged_order":
    case "authorize_order":
      return requirePatientRow("orders", "id", action.payload.orderId, "Order");
    case "sign_encounter":
      return requirePatientRow("encounters", "id", action.payload.encounterId, "Encounter");
    case "mark_message_read":
      return patientForMessageThread(action.payload.threadId);
    case "toggle_task":
    case "delete_task":
      return optionalPatientRow("tasks", "id", action.payload.taskId, "Task");
    case "delete_scratch_note":
      return optionalPatientRow("tasks", "id", action.payload.noteId, "Scratch note");
    case "update_appointment_status":
    case "delete_appointment":
      return requirePatientRow("appointments", "id", action.payload.appointmentId, "Appointment");
    case "team_update_task_status":
      return optionalPatientRow("team_task_assignments", "id", action.payload.taskId, "Team task");
    default: {
      const exhaustive: never = action;
      throw new Error(`Unsupported clinical action binding: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function assertLinkedTargetConsistency(action: ClinicalAction, binding: PatientBinding | null) {
  if (!binding) return;

  if (action.type === "send_message" || action.type === "save_message_to_chart") {
    const thread = patientForMessageThread(action.payload.threadId);
    if (thread.patientId !== binding.patientId) {
      throw new Error(
        `Patient binding mismatch: ${action.type} expects patient ${binding.patientId}, but ${thread.target} belongs to ${thread.patientId}.`,
      );
    }
  }

  if (action.type === "save_encounter_draft" && action.payload.id) {
    const db = getDatabase();
    const existing = db
      .prepare("SELECT patient_id FROM encounters WHERE id = ?")
      .get(action.payload.id) as { patient_id: string } | undefined;
    if (existing && existing.patient_id !== binding.patientId) {
      throw new Error(
        `Patient binding mismatch: encounter ${action.payload.id} belongs to ${existing.patient_id}, not ${binding.patientId}.`,
      );
    }
  }
}

export function assertClinicalActionPatientBinding(
  action: ClinicalAction,
  expectedPatientId?: string,
): void {
  const binding = resolveBinding(action);
  assertLinkedTargetConsistency(action, binding);
  if (!binding) return;

  if (!expectedPatientId) {
    throw new Error(
      `Patient-bound action ${action.type} requires expectedPatientId from the active chart context.`,
    );
  }

  if (binding.patientId !== expectedPatientId) {
    throw new Error(
      `Patient binding mismatch: active chart expects ${expectedPatientId}, but ${binding.target} belongs to ${binding.patientId}.`,
    );
  }
}
