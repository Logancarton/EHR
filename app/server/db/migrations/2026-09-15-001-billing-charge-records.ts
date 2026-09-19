import type { DatabaseMigration } from "./types";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-15-001-billing-charge-records",
    description: "Add durable billing charge records derived from signed encounters (P9-0 / P9-B)",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS billing_charges (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          patient_id TEXT NOT NULL,
          -- One charge per signed encounter. The uniqueness is enforced here rather
          -- than in a service check so a concurrent second preparation loses at the
          -- database instead of creating a duplicate claimable record.
          encounter_id TEXT NOT NULL UNIQUE,
          encounter_snapshot_sha256 TEXT NOT NULL,
          service_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'prepared',
          procedure_codes_json TEXT NOT NULL DEFAULT '[]',
          diagnosis_codes_json TEXT NOT NULL DEFAULT '[]',
          coverage_basis TEXT NOT NULL DEFAULT 'none-on-file',
          coverage_id TEXT,
          coverage_payer_name TEXT,
          prepared_by TEXT NOT NULL,
          prepared_by_name TEXT NOT NULL,
          prepared_at TEXT NOT NULL,
          reviewed_by TEXT,
          reviewed_by_name TEXT,
          reviewed_at TEXT,
          review_note TEXT,
          voided_by TEXT,
          voided_at TEXT,
          void_reason TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
          FOREIGN KEY (encounter_id) REFERENCES encounters (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_billing_charges_organization
          ON billing_charges (organization_id, status, service_date DESC);
        CREATE INDEX IF NOT EXISTS idx_billing_charges_patient
          ON billing_charges (patient_id, service_date DESC);
      `);
    },
  };
