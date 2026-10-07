import type { DatabaseMigration } from "./types";

/**
 * A message can carry chart records: a signed note, a rating scale, a chart
 * document (including a file the clinician attached, which is filed as a
 * document first) or a lab result.
 *
 * An attachment is a reference, not a copy: `record_id` names the chart row
 * and the server checks, when the message is written, that the row is this
 * patient's. `title` and `detail` are what the record said at that moment,
 * resolved by the server, so the thread shows what was attached even if the
 * record is later revised.
 */
export const migration: DatabaseMigration = {
  id: "2026-10-06-001-message-attachments",
  description: "Message attachments: references to chart records sent with a message",
  apply(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS message_attachments (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('document', 'encounter', 'assessment', 'lab')),
        record_id TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_message_attachments_message
        ON message_attachments (message_id);
    `);
  },
};
