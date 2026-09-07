import type { DatabaseSync } from "node:sqlite";

function hasColumn(db: DatabaseSync, table: string, column: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((row) => row.name === column);
}

function addColumn(db: DatabaseSync, table: string, columnSql: string, columnName: string) {
  if (!hasColumn(db, table, columnName)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`);
}

export function ensureDocumentWorkflowFoundation(db: DatabaseSync) {
  addColumn(db, "documents", "workflow_status TEXT NOT NULL DEFAULT 'received'", "workflow_status");
  addColumn(db, "documents", "workflow_updated_at TEXT", "workflow_updated_at");
  addColumn(db, "documents", "reviewed_by TEXT", "reviewed_by");
  addColumn(db, "documents", "reviewed_at TEXT", "reviewed_at");
  addColumn(db, "documents", "filed_by TEXT", "filed_by");
  addColumn(db, "documents", "filed_at TEXT", "filed_at");
  addColumn(db, "documents", "superseded_by_document_id TEXT", "superseded_by_document_id");

  db.exec(`
    UPDATE documents
    SET workflow_status = 'received', workflow_updated_at = COALESCE(workflow_updated_at, updated_at)
    WHERE workflow_status IS NULL OR workflow_status = '';

    CREATE TABLE IF NOT EXISTS document_workflow_events (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      from_status TEXT NOT NULL,
      to_status TEXT NOT NULL,
      note TEXT,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE RESTRICT,
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_document_workflow_status
      ON documents(workflow_status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_document_workflow_events
      ON document_workflow_events(document_id, created_at DESC);

    CREATE TRIGGER IF NOT EXISTS trg_document_workflow_events_no_update
      BEFORE UPDATE ON document_workflow_events
      BEGIN
        SELECT RAISE(ABORT, 'Document workflow events are immutable');
      END;

    CREATE TRIGGER IF NOT EXISTS trg_document_workflow_events_no_delete
      BEFORE DELETE ON document_workflow_events
      BEGIN
        SELECT RAISE(ABORT, 'Document workflow events are immutable');
      END;
  `);
}
