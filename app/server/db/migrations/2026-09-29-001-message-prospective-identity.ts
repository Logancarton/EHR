import type { DatabaseMigration } from "./types";

/**
 * A message thread can belong to an intake contact before a chart exists.
 *
 * Intake is first contact, and first contact is mostly messages ("please bring
 * your insurance card", "which afternoon suits you"), but a thread had to name a
 * `patients` row, so the Messages companion had nothing to offer on the Intake
 * canvas. The same D-077 relaxation already applied to documents and coverage:
 * `patient_id` becomes optional, `prospective_person_id` sits beside it, and
 * every row names at least one. Promotion fills in `patient_id` on the same rows,
 * so the conversation is in the chart the day the chart exists — never copied.
 *
 * Provider-sent messages were also stored as `delivered`, and the chart showed
 * "✓ delivered", although no portal or SMS transport exists. They are `queued`
 * now: recorded in the thread, not delivered anywhere. Patient-sent rows keep
 * their status, which is what unread counts read.
 *
 * Nothing references `messages`, so rebuilding it cannot cascade.
 */
export const migration: DatabaseMigration = {
  id: "2026-09-29-001-message-prospective-identity",
  description:
    "Messages may belong to a prospective person (patient_id optional, prospective_person_id added); " +
    "provider-sent messages are recorded as queued rather than delivered",
  apply(db) {
    const columns = db.prepare(`PRAGMA table_info(messages)`).all() as Array<{ name: string; notnull: number }>;
    if (columns.length === 0) return;

    const hasProspectColumn = columns.some((column) => column.name === "prospective_person_id");
    const patientIdRequired = columns.find((column) => column.name === "patient_id")?.notnull === 1;

    if (!hasProspectColumn || patientIdRequired) {
      const hasCreatedAt = columns.some((column) => column.name === "created_at");
      db.exec(`ALTER TABLE messages RENAME TO messages_legacy_20260929`);
      db.exec(`
        CREATE TABLE messages (
          id TEXT PRIMARY KEY,
          patient_id TEXT,
          prospective_person_id TEXT,
          thread_id TEXT NOT NULL,
          subject TEXT NOT NULL,
          category TEXT NOT NULL,
          urgency TEXT NOT NULL,
          channel TEXT NOT NULL,
          sender_role TEXT NOT NULL,
          sender_name TEXT NOT NULL,
          content TEXT NOT NULL,
          ai_triage_summary TEXT,
          clinical_intent TEXT,
          suggested_actions_json TEXT NOT NULL DEFAULT '[]',
          smart_replies_json TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'delivered',
          timestamp TEXT NOT NULL,
          created_at TEXT,
          CHECK (patient_id IS NOT NULL OR prospective_person_id IS NOT NULL),
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
          FOREIGN KEY (prospective_person_id) REFERENCES prospective_persons (id) ON DELETE CASCADE
        );
      `);
      const copied = [
        "id", "patient_id", "thread_id", "subject", "category", "urgency", "channel",
        "sender_role", "sender_name", "content", "ai_triage_summary", "clinical_intent",
        "suggested_actions_json", "smart_replies_json", "status", "timestamp",
        ...(hasCreatedAt ? ["created_at"] : []),
      ].join(", ");
      db.exec(`INSERT INTO messages (${copied}) SELECT ${copied} FROM messages_legacy_20260929`);
      db.exec(`DROP TABLE messages_legacy_20260929`);
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_patient ON messages (patient_id);
      CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages (thread_id);
      CREATE INDEX IF NOT EXISTS idx_messages_prospect ON messages (prospective_person_id);
    `);

    db.exec(`UPDATE messages SET status = 'queued' WHERE sender_role = 'provider' AND status = 'delivered'`);
  },
};
