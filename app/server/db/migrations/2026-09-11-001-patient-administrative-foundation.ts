import type { DatabaseMigration } from "./types";
import { addColumnIfMissing } from "./historical-support";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-11-001-patient-administrative-foundation",
    description: "Add patient identity, contact, related-person and care-network records",
    apply(db) {
      // Identity. `status` already existed but holds the clinical relationship
      // ("Established", "New Patient"); where the *record* stands is a separate
      // question, so it gets its own column rather than overloading that one.
      addColumnIfMissing(db, "patients", "preferred_name", "TEXT");
      addColumnIfMissing(db, "patients", "sex_at_birth", "TEXT");
      addColumnIfMissing(db, "patients", "gender_identity", "TEXT");
      addColumnIfMissing(db, "patients", "preferred_language", "TEXT");
      addColumnIfMissing(db, "patients", "time_zone", "TEXT");
      addColumnIfMissing(db, "patients", "record_status", "TEXT NOT NULL DEFAULT 'active'");
      addColumnIfMissing(db, "patients", "deceased_date", "TEXT");

      // Contact.
      addColumnIfMissing(db, "patients", "mobile_phone", "TEXT");
      addColumnIfMissing(db, "patients", "alternate_phone", "TEXT");
      addColumnIfMissing(db, "patients", "email", "TEXT");
      addColumnIfMissing(db, "patients", "address_line1", "TEXT");
      addColumnIfMissing(db, "patients", "address_line2", "TEXT");
      addColumnIfMissing(db, "patients", "city", "TEXT");
      addColumnIfMissing(db, "patients", "state", "TEXT");
      addColumnIfMissing(db, "patients", "postal_code", "TEXT");
      addColumnIfMissing(db, "patients", "country", "TEXT");
      addColumnIfMissing(db, "patients", "preferred_contact_method", "TEXT");
      addColumnIfMissing(db, "patients", "contact_notes", "TEXT");

      // Permission to use a channel is tri-state: 1 yes, 0 no, NULL nobody asked.
      // Leaving a voicemail about a psychiatric appointment is a disclosure, so
      // "not asked yet" must stay distinguishable from "no".
      addColumnIfMissing(db, "patients", "allow_voicemail", "INTEGER");
      addColumnIfMissing(db, "patients", "allow_sms", "INTEGER");
      addColumnIfMissing(db, "patients", "allow_email", "INTEGER");

      db.exec(`
        CREATE TABLE IF NOT EXISTS patient_related_people (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL,
          role TEXT NOT NULL,
          relationship TEXT,
          name TEXT NOT NULL,
          phone TEXT,
          alternate_phone TEXT,
          email TEXT,
          address_line1 TEXT,
          city TEXT,
          state TEXT,
          postal_code TEXT,
          -- How much may be discussed with this person. Being the right person to
          -- call about a missed appointment does not make someone the right person
          -- to discuss a diagnosis with.
          consent_scope TEXT NOT NULL DEFAULT 'none',
          priority INTEGER NOT NULL DEFAULT 1,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_patient_related_people_patient
          ON patient_related_people (patient_id, status, role, priority);

        CREATE TABLE IF NOT EXISTS patient_care_network (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL,
          role TEXT NOT NULL,
          name TEXT NOT NULL,
          organization TEXT,
          phone TEXT,
          fax TEXT,
          email TEXT,
          address_line1 TEXT,
          city TEXT,
          state TEXT,
          postal_code TEXT,
          npi TEXT,
          relationship_note TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_patient_care_network_patient
          ON patient_care_network (patient_id, status, role);
      `);

      // Coverage gains the fields a front office actually needs to file a claim
      // against the right policy in the right order.
      addColumnIfMissing(db, "insurance_policies", "subscriber_dob", "TEXT");
      addColumnIfMissing(db, "insurance_policies", "coverage_priority", "INTEGER NOT NULL DEFAULT 1");
      addColumnIfMissing(db, "insurance_policies", "coverage_type", "TEXT NOT NULL DEFAULT 'commercial'");
      addColumnIfMissing(db, "insurance_policies", "is_self_pay", "INTEGER NOT NULL DEFAULT 0");

      // Age was a stored column, so every chart aged out of date between writes and
      // a birthday silently made the record wrong. Date of birth is the fact; age is
      // derived from it at read time. SQLite can drop the column outright, and the
      // projection stops consulting it either way.
      const patientColumns = db.prepare(`PRAGMA table_info(patients)`).all() as Array<{ name?: unknown }>;
      if (patientColumns.some((entry) => entry.name === "age")) {
        try {
          db.exec(`ALTER TABLE patients DROP COLUMN age`);
        } catch {
          // An older SQLite cannot drop a column. Leaving it in place is harmless:
          // nothing reads it any more, and the projection derives age from dob.
        }
      }
    },
  };
