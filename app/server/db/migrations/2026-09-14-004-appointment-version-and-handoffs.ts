import type { DatabaseMigration } from "./types";
import { addColumnIfMissing } from "./historical-support";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-14-004-appointment-version-and-handoffs",
    description: "Add appointment version for optimistic concurrency and create appointment handoffs table",
    apply(db) {
      addColumnIfMissing(db, "appointments", "version", "INTEGER NOT NULL DEFAULT 1");

      db.exec(`
        CREATE TABLE IF NOT EXISTS appointment_handoffs (
          id TEXT PRIMARY KEY,
          appointment_id TEXT NOT NULL,
          patient_id TEXT NOT NULL,
          from_user_id TEXT NOT NULL,
          from_user_name TEXT NOT NULL,
          to_user_id TEXT NOT NULL,
          to_user_name TEXT NOT NULL,
          reason TEXT NOT NULL,
          clinical_summary TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          decline_reason TEXT,
          history_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE CASCADE,
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_appointment_handoffs_apt
          ON appointment_handoffs (appointment_id, status);
        CREATE INDEX IF NOT EXISTS idx_appointment_handoffs_to_user
          ON appointment_handoffs (to_user_id, status);
        CREATE INDEX IF NOT EXISTS idx_appointment_handoffs_from_user
          ON appointment_handoffs (from_user_id, status);
      `);
    },
  };
