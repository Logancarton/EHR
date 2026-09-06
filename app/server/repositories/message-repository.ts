import { getDatabase } from "../db/connection";
import { type PatientMessageThread, type PatientMessage } from "../../domain/messages";

export const MessageRepository = {
  getThreadsByPatient(patientId: string): PatientMessageThread[] {
    const db = getDatabase();
    const rows = db
      .prepare("SELECT * FROM messages WHERE patient_id = ? ORDER BY timestamp ASC")
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
    }));
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

    // Lookup existing thread meta
    const existingThreadMeta = db
      .prepare("SELECT * FROM messages WHERE thread_id = ? LIMIT 1")
      .get(msg.threadId) as any;

    const subject = existingThreadMeta?.subject || "Clinical Inquiry";
    const category = existingThreadMeta?.category || "general";
    const urgency = existingThreadMeta?.urgency || "routine";
    const channel = msg.channel || existingThreadMeta?.channel || "portal";

    db.prepare(`
      INSERT INTO messages (
        id, patient_id, thread_id, subject, category, urgency, channel,
        sender_role, sender_name, content, ai_triage_summary, clinical_intent,
        suggested_actions_json, smart_replies_json, status, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'delivered', ?)
    `).run(
      id,
      msg.patientId,
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
      timestamp
    );

    return {
      id,
      threadId: msg.threadId,
      senderRole: msg.senderRole,
      senderName: msg.senderName,
      content: msg.content,
      timestamp,
      channel,
      status: "delivered",
    };
  },

  markRead(threadId: string): void {
    const db = getDatabase();
    db.prepare("UPDATE messages SET status = 'read' WHERE thread_id = ? AND sender_role = 'patient'").run(threadId);
  },
};
