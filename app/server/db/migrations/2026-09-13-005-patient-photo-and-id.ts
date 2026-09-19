import type { DatabaseMigration } from "./types";
import { addColumnIfMissing } from "./historical-support";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-13-005-patient-photo-and-id",
    description: "Add patient photo, photo type, and government ID card fields",
    apply(db) {
      addColumnIfMissing(db, "patients", "photo_url", "TEXT");
      addColumnIfMissing(db, "patients", "photo_type", "TEXT DEFAULT 'license'");
      addColumnIfMissing(db, "patients", "id_card_json", "TEXT DEFAULT '{}'");
    },
  };
