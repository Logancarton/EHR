import type { DatabaseSync } from "node:sqlite";

export function ensureMedicationReconciliationFoundation(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS medication_reconciliation_candidates (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_system TEXT NOT NULL DEFAULT 'ehr-local',
      source_ref TEXT,
      evidence_type TEXT NOT NULL DEFAULT 'other',
      raw_evidence_text TEXT,
      display_text TEXT NOT NULL,
      medication_name TEXT NOT NULL,
      generic_name TEXT,
      strength TEXT,
      dose TEXT,
      route TEXT,
      frequency TEXT,
      start_date TEXT,
      end_date TEXT,
      prescriber TEXT,
      observed_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      linked_medication_id TEXT,
      decision TEXT,
      resolved_by TEXT,
      resolved_at TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (linked_medication_id) REFERENCES patient_medications(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_med_recon_patient_status
      ON medication_reconciliation_candidates(patient_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_med_recon_linked_medication
      ON medication_reconciliation_candidates(linked_medication_id);
  `);

  const columns = new Set(
    (db.prepare("PRAGMA table_info(medication_reconciliation_candidates)").all() as Array<{ name: string }>)
      .map((column) => column.name),
  );
  if (!columns.has("raw_evidence_text")) {
    db.exec("ALTER TABLE medication_reconciliation_candidates ADD COLUMN raw_evidence_text TEXT");
  }

  db.exec(`
    UPDATE medication_reconciliation_candidates
    SET raw_evidence_text = display_text
    WHERE raw_evidence_text IS NULL OR TRIM(raw_evidence_text) = ''
  `);
}
