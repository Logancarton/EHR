import { getDatabase } from "../db/connection";

export type AuditLogEntry = {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  eventType:
    | "workspace_template_saved"
    | "workspace_template_deleted"
    | "auth_login_succeeded"
    | "auth_login_failed"
    | "auth_logout"
    | "chart_opened"
    | "patient_created"
    | "patient_updated"
    | "clinical_fact_created"
    | "clinical_fact_updated"
    | "medication_candidate_recorded"
    | "medication_candidate_interpretation_edited"
    | "medication_reconciled"
    | "prescription_medication_truth_confirmed"
    | "prescription_transaction_prepared"
    | "prescription_transaction_submitted"
    | "prescription_transaction_failed"
    | "prescription_transaction_outcome_uncertain"
    | "prescription_transaction_event_ingested"
    | "prescription_cancellation_requested"
    | "prescription_cancellation_submitted"
    | "prescription_cancellation_failed"
    | "prescription_refill_requested"
    | "prescription_renewal_staged"
    | "prescription_change_request_recorded"
    | "prescription_change_request_accepted"
    | "prescription_change_request_declined"
    | "prescription_callback_processed"
    | "prescription_callback_replayed"
    | "prescription_callback_rejected"
    | "prescription_uncertainty_review_recorded"
    | "prescription_uncertainty_retry_unlocked"
    | "prescription_uncertainty_operationally_superseded"
    | "prescription_uncertainty_recovered_retry_prepared"
    | "prescription_uncertainty_resolved_by_external_evidence"
    | "integration_configuration_created"
    | "integration_configuration_updated"
    | "result_recorded"
    | "result_acknowledged"
    | "document_created"
    | "document_revised"
    | "document_workflow_changed"
    | "encounter_addendum_created"
    | "note_drafted"
    | "note_signed"
    | "order_staged"
    | "order_unstaged"
    | "order_authorized"
    | "order_transmitted"
    | "order_transmission_failed"
    | "order_transmission_uncertain"
    | "epcs_2fa_verified"
    | "message_sent"
    | "message_read"
    | "message_charted"
    | "task_created"
    | "task_updated"
    | "task_deleted"
    | "scratchpad_created"
    | "scratchpad_deleted"
    | "preference_updated"
    | "appointment_scheduled"
    | "appointment_updated"
    | "team_message_sent"
    | "team_task_agreement_changed"
    | "team_task_assigned"
    | "team_task_updated"
    // Organization administration: who may reach which patients, and who is a user
    // at all. These are access-control decisions, so they are audited as first-class
    // events rather than folded into generic preference or team activity.
    | "organization_user_provisioned"
    | "organization_membership_updated"
    | "organization_user_activated"
    | "organization_user_deactivated"
    | "auth_account_activated"
    | "auth_password_changed"
    | "auth_password_change_failed"
    | "auth_login_locked"
    | "auth_login_unlocked"
    | "system_init";
  patientId?: string;
  description: string;
  metadata?: Record<string, any>;
};

export const AuditRepository = {
  log(event: {
    userId?: string;
    userName?: string;
    userRole?: string;
    eventType: AuditLogEntry["eventType"];
    patientId?: string;
    description: string;
    metadata?: Record<string, any>;
  }): AuditLogEntry {
    const db = getDatabase();
    const id = `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const timestamp = new Date().toISOString();
    const record: AuditLogEntry = {
      id, timestamp,
      userId: event.userId || "prototype-provider",
      userName: event.userName || "Prototype Provider",
      userRole: event.userRole || "provider",
      eventType: event.eventType,
      patientId: event.patientId,
      description: event.description,
      metadata: event.metadata || {},
    };
    db.prepare(`INSERT INTO audit_logs (
      id,timestamp,user_id,user_name,user_role,event_type,patient_id,description,metadata_json
    ) VALUES (?,?,?,?,?,?,?,?,?)`).run(
      record.id, record.timestamp, record.userId, record.userName, record.userRole,
      record.eventType, record.patientId || null, record.description, JSON.stringify(record.metadata || {}),
    );
    return record;
  },

  getRecent(limit: number = 100, patientId?: string): AuditLogEntry[] {
    const db = getDatabase();
    let query = "SELECT * FROM audit_logs"; const params: any[] = [];
    if (patientId) { query += " WHERE patient_id = ?"; params.push(patientId); }
    query += " ORDER BY timestamp DESC LIMIT ?"; params.push(limit);
    return (db.prepare(query).all(...params) as any[]).map(r => ({
      id:r.id, timestamp:r.timestamp, userId:r.user_id, userName:r.user_name,
      userRole:r.user_role, eventType:r.event_type as AuditLogEntry["eventType"],
      patientId:r.patient_id || undefined, description:r.description,
      metadata:JSON.parse(r.metadata_json || "{}"),
    }));
  },
};
