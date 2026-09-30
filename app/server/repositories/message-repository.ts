import { getDatabase } from "../db/connection";
import { type PatientMessageThread, type PatientMessage } from "../../domain/messages";
import { isProspectivePersonId } from "../../lib/schedule-data";

/**
 * A thread belongs to a chart or, before one exists, to an intake contact
 * (migration 2026-09-29-001). `subjectId` is whichever of the two it is; a
 * prospect id is recognised by its prefix, as everywhere else (D-076).
 */
function subjectColumns(subjectId: string): { patientId: string | null; prospectivePersonId: string | null } {
  return isProspectivePersonId(subjectId)
    ? { patientId: null, prospectivePersonId: subjectId }
    : { patientId: subjectId, prospectivePersonId: null };
}

/**
 * What a message from this sender is, in the record. No portal or SMS transport
 * is connected, so a message the practice writes is recorded in the thread and
 * queued, never "delivered" — that word needs transport evidence.
 */
function initialStatus(senderRole: "patient" | "provider" | "assistant"): "delivered" | "queued" {
  return senderRole === "patient" ? "delivered" : "queued";
}

export const MessageRepository = {
  /** Threads for a chart, or for an intake contact when given a prospect id. */
  getThreadsByPatient(patientId: string): PatientMessageThread[] {
    const db = getDatabase();
    const column = isProspectivePersonId(patientId) ? "prospective_person_id" : "patient_id";
    const rows = db
      .prepare(`SELECT * FROM messages WHERE ${column} = ? ORDER BY timestamp ASC`)
      .all(patientId) as any[];

    // Group messages by thread_id
    const threadMap: Record<string, { meta: any; messages: PatientMessage[] }> = {};

    for (const r of rows) {
      if (!threadMap[r.thread_id]) {
        threadMap[r.thread_id] = {
          meta: r,
          messages: [],
        };
      }

      threadMap[r.thread_id].messages.push({
        id: r.id,
        threadId: r.thread_id,
        senderRole: r.sender_role as any,
        senderName: r.sender_name,
        content: r.content,
        timestamp: r.timestamp,
        channel: r.channel as any,
        status: r.status as any,
      });
    }

    return Object.entries(threadMap).map(([threadId, { meta, messages }]) => ({
      id: threadId,
      patientId: meta.patient_id ?? meta.prospective_person_id,
      subject: meta.subject,
      category: meta.category,
      urgency: meta.urgency,
      lastMessageAt: messages[messages.length - 1]?.timestamp || meta.timestamp,
      unreadCount: messages.filter((m) => m.senderRole === "patient" && m.status === "delivered").length,
      aiTriageSummary: meta.ai_triage_summary || "",
      clinicalIntent: meta.clinical_intent || "",
      suggestedActions: JSON.parse(meta.suggested_actions_json || "[]"),
      smartReplies: JSON.parse(meta.smart_replies_json || "[]"),
      messages,
    }));
  },

  /**
   * Threads for exactly these charts. The ids are required and an empty list
   * returns nothing: this used to treat "no ids" as "every thread in the
   * database", so a caller that passed an empty access scope — or none at all —
   * read every practice's conversations.
   */
  getAllThreads(patientIds: readonly string[]): Array<{
    patientId: string;
    patientName: string;
    patientMrn: string;
    thread: PatientMessageThread;
  }> {
    const db = getDatabase();
    let query = `
      SELECT m.*, p.name AS patient_name, p.mrn AS patient_mrn
      FROM messages m
      JOIN patients p ON p.id = m.patient_id
    `;
    if (patientIds.length === 0) return [];
    const params: any[] = [...patientIds];
    query += ` WHERE m.patient_id IN (${patientIds.map(() => "?").join(", ")})`;
    query += " ORDER BY m.created_at ASC, m.timestamp ASC";

    const rows = db.prepare(query).all(...params) as any[];

    const threadMap: Record<
      string,
      { meta: any; patientName: string; patientMrn: string; messages: PatientMessage[] }
    > = {};

    for (const r of rows) {
      if (!threadMap[r.thread_id]) {
        threadMap[r.thread_id] = {
          meta: r,
          patientName: r.patient_name,
          patientMrn: r.patient_mrn,
          messages: [],
        };
      }

      threadMap[r.thread_id].messages.push({
        id: r.id,
        threadId: r.thread_id,
        senderRole: r.sender_role as any,
        senderName: r.sender_name,
        content: r.content,
        timestamp: r.timestamp,
        channel: r.channel as any,
        status: r.status as any,
      });
    }

    return Object.entries(threadMap).map(([threadId, { meta, patientName, patientMrn, messages }]) => ({
      patientId: meta.patient_id,
      patientName,
      patientMrn,
      thread: {
        id: threadId,
        patientId: meta.patient_id,
        subject: meta.subject,
        category: meta.category,
        urgency: meta.urgency,
        lastMessageAt: messages[messages.length - 1]?.timestamp || meta.timestamp,
        unreadCount: messages.filter((m) => m.senderRole === "patient" && m.status === "delivered").length,
        aiTriageSummary: meta.ai_triage_summary || "",
        clinicalIntent: meta.clinical_intent || "",
        suggestedActions: JSON.parse(meta.suggested_actions_json || "[]"),
        smartReplies: JSON.parse(meta.smart_replies_json || "[]"),
        messages,
      },
    }));
  },

  createThread(params: {
    patientId: string;
    subject: string;
    category?: string;
    urgency?: string;
    channel?: "portal" | "sms";
    senderRole: "patient" | "provider" | "assistant";
    senderName: string;
    content: string;
  }): PatientMessageThread {
    const db = getDatabase();
    const threadId = `th-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const msgId = `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const createdAt = new Date().toISOString();
    const subject = (params.subject || "").trim() || "Clinical Inquiry";
    const content = (params.content || "").trim();
    const category = params.category || "general";
    const urgency = params.urgency || "routine";
    const channel = params.channel || "portal";
    const subjectIds = subjectColumns(params.patientId);
    const status = initialStatus(params.senderRole);

    db.prepare(`
      INSERT INTO messages (
        id, patient_id, prospective_person_id, thread_id, subject, category, urgency, channel,
        sender_role, sender_name, content, ai_triage_summary, clinical_intent,
        suggested_actions_json, smart_replies_json, status, timestamp, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, null, '[]', '[]', ?, ?, ?)
    `).run(
      msgId,
      subjectIds.patientId,
      subjectIds.prospectivePersonId,
      threadId,
      subject,
      category,
      urgency,
      channel,
      params.senderRole,
      params.senderName,
      content,
      status,
      timestamp,
      createdAt,
    );

    return {
      id: threadId,
      patientId: params.patientId,
      subject,
      category: category as any,
      urgency: urgency as any,
      lastMessageAt: timestamp,
      unreadCount: 0,
      aiTriageSummary: "",
      clinicalIntent: "",
      suggestedActions: [],
      smartReplies: [],
      messages: [
        {
          id: msgId,
          threadId,
          senderRole: params.senderRole,
          senderName: params.senderName,
          content: params.content,
          timestamp,
          channel: channel as any,
          status,
        },
      ],
    };
  },

  addMessage(msg: {
    patientId: string;
    threadId: string;
    senderRole: "patient" | "provider" | "assistant";
    senderName: string;
    content: string;
    channel?: "portal" | "sms";
  }): PatientMessage {
    const db = getDatabase();
    const id = `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    // `timestamp` is a locale clock string for display and cannot be ordered or
    // windowed. `created_at` is the instant, kept beside it so a projection can
    // ask when a message was actually sent. See migration 2026-09-15-004.
    const createdAt = new Date().toISOString();

    // Lookup existing thread meta
    const existingThreadMeta = db
      .prepare("SELECT * FROM messages WHERE thread_id = ? LIMIT 1")
      .get(msg.threadId) as any;

    const subject = existingThreadMeta?.subject || "Clinical Inquiry";
    const category = existingThreadMeta?.category || "general";
    const urgency = existingThreadMeta?.urgency || "routine";
    const channel = msg.channel || existingThreadMeta?.channel || "portal";

    // The row carries the thread's own owner(s), so a promoted intake thread keeps
    // both ids on every message, not only on the ones written before promotion.
    const owner = existingThreadMeta
      ? { patientId: existingThreadMeta.patient_id ?? null, prospectivePersonId: existingThreadMeta.prospective_person_id ?? null }
      : subjectColumns(msg.patientId);
    const status = initialStatus(msg.senderRole);

    db.prepare(`
      INSERT INTO messages (
        id, patient_id, prospective_person_id, thread_id, subject, category, urgency, channel,
        sender_role, sender_name, content, ai_triage_summary, clinical_intent,
        suggested_actions_json, smart_replies_json, status, timestamp, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      owner.patientId,
      owner.prospectivePersonId,
      msg.threadId,
      subject,
      category,
      urgency,
      channel,
      msg.senderRole,
      msg.senderName,
      msg.content,
      existingThreadMeta?.ai_triage_summary || null,
      existingThreadMeta?.clinical_intent || null,
      existingThreadMeta?.suggested_actions_json || "[]",
      existingThreadMeta?.smart_replies_json || "[]",
      status,
      timestamp,
      createdAt,
    );

    return {
      id,
      threadId: msg.threadId,
      senderRole: msg.senderRole,
      senderName: msg.senderName,
      content: msg.content,
      timestamp,
      channel,
      status,
    };
  },

  /**
   * Who a thread belongs to: its chart once there is one, otherwise its intake
   * contact. Null for an unknown thread. A thread whose rows disagree is an
   * integrity violation, never resolved by picking one.
   */
  threadSubject(threadId: string): string | null {
    const rows = getDatabase()
      .prepare(`SELECT DISTINCT COALESCE(patient_id, prospective_person_id) AS subject_id FROM messages WHERE thread_id = ?`)
      .all(threadId) as Array<{ subject_id: string | null }>;
    if (rows.length === 0) return null;
    if (rows.length !== 1 || !rows[0].subject_id) {
      throw new Error(`Patient binding integrity violation: message thread ${threadId} spans multiple subjects.`);
    }
    return rows[0].subject_id;
  },

  /**
   * Promotion (D-077): an intake contact's threads become the chart's own. The
   * same rows gain `patient_id` and keep `prospective_person_id` for provenance.
   * Idempotent by the `patient_id IS NULL` guard.
   */
  linkProspectThreadsToPatient(prospectiveId: string, patientId: string): number {
    const result = getDatabase()
      .prepare(`UPDATE messages SET patient_id = ? WHERE prospective_person_id = ? AND patient_id IS NULL`)
      .run(patientId, prospectiveId);
    return Number(result.changes || 0);
  },

  markRead(threadId: string): void {
    const db = getDatabase();
    db.prepare("UPDATE messages SET status = 'read' WHERE thread_id = ? AND sender_role = 'patient'").run(threadId);
  },
};
