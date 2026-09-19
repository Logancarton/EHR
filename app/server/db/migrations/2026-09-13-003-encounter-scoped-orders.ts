import type { DatabaseMigration } from "./types";
import { addColumnIfMissing } from "./historical-support";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-13-003-encounter-scoped-orders",
    description: "Associate clinical orders with the encounter that produced them",
    apply(db) {
      // Orders were patient-scoped and time-ordered, never encounter-scoped, so
      // "what was ordered during this visit" could only be answered by guessing at
      // a time window. Prescription drug management is the Moderate-risk pillar of
      // a 99214; deriving it from a guess is the failure this reference layer
      // exists to remove.
      //
      // Nullable, and deliberately not backfilled. An order placed before this
      // column existed genuinely has no recorded encounter, and inferring one from
      // proximity would manufacture exactly the association the column is meant to
      // make trustworthy. Absence stays visible.
      addColumnIfMissing(db, "orders", "encounter_id", "TEXT");
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_orders_encounter
          ON orders (encounter_id, status);
      `);
    },
  };
