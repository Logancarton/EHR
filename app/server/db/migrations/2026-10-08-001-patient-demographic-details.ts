import type { DatabaseSync } from "node:sqlite";
import type { DatabaseMigration } from "./types";

/**
 * Demographics beyond identity (race/ethnicity, sexual orientation, marital
 * status, previous name, occupation, education, primary provider, referral
 * source) as one typed JSON document on the patient row. Validated by
 * `cleanDemographicDetails`; NULL means nothing has been asked yet.
 */
export const migration: DatabaseMigration = {
  id: "2026-10-08-001-patient-demographic-details",
  description: "Patient demographic details (additional registration information)",
  apply(db: DatabaseSync) {
    const columns = db.prepare(`PRAGMA table_info(patients)`).all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "demographic_details_json")) {
      db.exec(`ALTER TABLE patients ADD COLUMN demographic_details_json TEXT`);
    }
  },
};
