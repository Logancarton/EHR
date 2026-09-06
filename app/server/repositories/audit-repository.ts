import { getDatabase } from "../db/connection";

export type AuditLogEntry = {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  eventType:
    | "chart_opened"
    | "patient_created"
    | "patient_updated"
    | "clinical_fact_created"
    | "clinical_fact_updated"
    | "result_recorded"
    | "result_acknowledged"
    | "document_created"
    | "document_revised"
    | "encounter_addendum_created"
    | "note_drafted"
    | "note_signed"
    | "order_staged"
    | "order_unstaged"
    | "order_authorized"
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
