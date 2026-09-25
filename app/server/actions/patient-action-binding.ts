import { getDatabase } from "../db/connection";
import type { ClinicalAction } from "./clinical-action-gateway";
import { isNonPatientEvent } from "../../lib/schedule-data";

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

function appointmentPatientRow(appointmentId: string, target: string): PatientBinding | null {
  const db = getDatabase();
  const row = db
    .prepare("SELECT patient_id, type FROM appointments WHERE id = ?")
    .get(appointmentId) as { patient_id?: string | null; type?: string | null } | undefined;
  if (!row) throw new Error(`${target} not found: ${appointmentId}`);
  if (!row.patient_id) return null;
  if (isNonPatientEvent(row.patient_id, row.type)) return null;
  return { patientId: row.patient_id, target: `${target} ${appointmentId}` };
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
    case "record_medication_candidate":
    case "add_observation":
    case "add_related_person":
    case "add_care_network_member":
    case "add_insurance":
    case "add_pharmacy":
    case "update_patient_pharmacy":
    case "create_document":
    case "record_vitals":
    case "add_psychiatric_history_item":
    case "record_assessment":
    case "stage_order":
    case "save_encounter_draft":
    case "send_message":
    case "save_message_to_chart":
      return directPatient(action.payload.patientId, action.type);

    case "create_appointment":
      if (isNonPatientEvent(action.payload.patientId, action.payload.type)) {
        return null;
      }
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
    case "reconcile_medication_candidate":
      return requirePatientRow(
        "medication_reconciliation_candidates",
        "id",
        action.payload.candidateId,
        "Medication candidate",
      );
    case "update_insurance":
      return requirePatientRow("insurance_policies", "id", action.payload.recordId, "Insurance record");
    case "update_related_person":
      return requirePatientRow("patient_related_people", "id", action.payload.recordId, "Related person");
    case "update_care_network_member":
      return requirePatientRow("patient_care_network", "id", action.payload.recordId, "Care network member");
    case "revise_document":
    case "transition_document_workflow":
      return requirePatientRow("documents", "id", action.payload.documentId, "Document");
    case "acknowledge_result":
      return requirePatientRow("observations", "id", action.payload.observationId, "Observation");
    case "prepare_billing_charge":
      // The encounter is the binding, not the request: a charge may only be
      // prepared for the patient whose signed note it is derived from.
      return requirePatientRow("encounters", "id", action.payload.encounterId, "Encounter");
    case "review_billing_charge":
    case "void_billing_charge":
      return requirePatientRow("billing_charges", "id", action.payload.chargeId, "Billing charge");
    case "add_encounter_addendum":
      return requirePatientRow("encounters", "id", action.payload.encounterId, "Encounter");
    case "update_psychiatric_history_item":
      return requirePatientRow("psychiatric_history_items", "id", action.payload.recordId, "Psychiatric history item");
    case "review_assessment":
      return requirePatientRow("clinical_assessments", "id", action.payload.assessmentId, "Clinical assessment");
    case "remove_staged_order":
    case "authorize_order":
    case "confirm_prescription_medication_truth":
    case "transmit_order":
      return requirePatientRow("orders", "id", action.payload.orderId, "Order");
    case "cancel_prescription":
    case "record_prescription_recovery_evidence":
    case "request_prescription_refill":
      return requirePatientRow(
        "prescription_transactions",
        "id",
        action.payload.transactionId,
        "Prescription transaction",
      );
    case "renew_prescription":
      return requirePatientRow(
        "prescription_refill_requests",
        "id",
        action.payload.refillRequestId,
        "Prescription refill request",
      );
    case "respond_to_prescription_change_request":
      return requirePatientRow(
        "prescription_change_requests",
        "id",
        action.payload.changeRequestId,
        "Prescription change request",
      );
    case "sign_encounter":
      return requirePatientRow("encounters", "id", action.payload.encounterId, "Encounter");
    case "mark_message_read":
      return patientForMessageThread(action.payload.threadId);
    case "toggle_task":
    case "delete_task":
      return optionalPatientRow("tasks", "id", action.payload.taskId, "Task");
    case "delete_scratch_note":
      return optionalPatientRow("scratch_notes", "id", action.payload.noteId, "Scratch note");
    case "update_appointment":
    case "cancel_appointment":
    case "update_appointment_status":
    case "delete_appointment":
    case "check_in_appointment":
    case "start_visit_appointment":
    case "complete_appointment":
    case "mark_no_show_appointment":
      return appointmentPatientRow(action.payload.appointmentId, "Appointment");
    case "schedule_follow_up":
      return requirePatientRow("appointments", "id", action.payload.originAppointmentId, "Origin appointment");
    case "initiate_appointment_handoff":
      return requirePatientRow("appointments", "id", action.payload.appointmentId, "Appointment");
    case "accept_appointment_handoff":
    case "decline_appointment_handoff":
    case "cancel_appointment_handoff":
      return requirePatientRow("appointment_handoffs", "id", action.payload.handoffId, "Appointment handoff");
    case "team_update_task_status":
      return optionalPatientRow("team_task_assignments", "id", action.payload.taskId, "Team task");
    default: {
      const exhaustive: never = action;
      throw new Error(`Unsupported clinical action binding: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function assertSamePatient(binding: PatientBinding, linked: PatientBinding, actionType: string) {
  if (linked.patientId !== binding.patientId) {
    throw new Error(
      `Patient binding mismatch: ${actionType} expects patient ${binding.patientId}, but ${linked.target} belongs to ${linked.patientId}.`,
    );
  }
}

function assertLinkedTargetConsistency(action: ClinicalAction, binding: PatientBinding | null) {
  if (!binding) return;

  if (action.type === "send_message" || action.type === "save_message_to_chart") {
    assertSamePatient(binding, patientForMessageThread(action.payload.threadId), action.type);
  }

  if (action.type === "record_medication_candidate" && action.payload.linkedMedicationId) {
    assertSamePatient(
      binding,
      requirePatientRow("patient_medications", "id", action.payload.linkedMedicationId, "Medication record"),
      action.type,
    );
  }

  if (action.type === "reconcile_medication_candidate" && action.payload.medicationId) {
    assertSamePatient(
      binding,
      requirePatientRow("patient_medications", "id", action.payload.medicationId, "Medication record"),
      action.type,
    );
  }

  if (action.type === "confirm_prescription_medication_truth" && action.payload.medicationId) {
    assertSamePatient(
      binding,
      requirePatientRow("patient_medications", "id", action.payload.medicationId, "Medication record"),
      action.type,
    );
  }

  if (action.type === "record_prescription_recovery_evidence" && action.payload.supersedingTransactionId) {
    assertSamePatient(
      binding,
      requirePatientRow(
        "prescription_transactions",
        "id",
        action.payload.supersedingTransactionId,
        "Superseding prescription transaction",
      ),
      action.type,
    );
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

/**
 * Returns the patient this action actually resolves to, so the caller can apply
 * patient-access authorization to the durable binding rather than to whatever the
 * request claimed. Returns null for genuinely patient-independent actions.
 */
export function assertClinicalActionPatientBinding(
  action: ClinicalAction,
  expectedPatientId?: string,
): string | null {
  const binding = resolveBinding(action);
  assertLinkedTargetConsistency(action, binding);
  if (!binding) return null;

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

  return binding.patientId;
}
