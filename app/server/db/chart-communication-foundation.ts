import type { DatabaseSync } from "node:sqlite";

export function ensureChartCommunicationFoundation(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chart_communications (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      communication_type TEXT NOT NULL CHECK (communication_type IN ('message', 'conversation', 'summary')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      channel TEXT,
      source_thread_id TEXT NOT NULL,
      source_message_id TEXT,
      source_message_ids_json TEXT NOT NULL DEFAULT '[]',
      source_system TEXT NOT NULL DEFAULT 'ehr-messaging',
      source_ref TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(patient_id, communication_type, source_ref, content_sha256),
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chart_communications_patient_created
      ON chart_communications(patient_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chart_communications_thread
      ON chart_communications(source_thread_id, created_at DESC);

    CREATE TRIGGER IF NOT EXISTS chart_communications_immutable_update
    BEFORE UPDATE ON chart_communications
    BEGIN
      SELECT RAISE(ABORT, 'Chart communication entries are immutable; create a new chart entry for corrections.');
    END;

    CREATE TRIGGER IF NOT EXISTS chart_communications_immutable_delete
    BEFORE DELETE ON chart_communications
    BEGIN
      SELECT RAISE(ABORT, 'Chart communication entries are immutable; create a new chart entry for corrections.');
    END;
  `);
}
