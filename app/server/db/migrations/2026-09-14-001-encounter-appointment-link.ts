import type { DatabaseMigration } from "./types";
import { addColumnIfMissing } from "./historical-support";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-14-001-encounter-appointment-link",
    description: "Associate an encounter with the appointment the visit was started from",
    apply(db) {
      // The dashboard closed appointments by matching the signed encounter's
      // patient, so signing one note marked every visit that patient had that day
      // completed — a second appointment, a cancelled one, a follow-up next week.
      // A visit is a specific appointment, and only the record can say which.
      //
      // Nullable and deliberately not backfilled, for the same reason as
      // `orders.encounter_id` (2026-09-13-003): an encounter written before this
      // column existed genuinely has no recorded appointment, and inferring one
      // from same-day proximity would manufacture the association the column is
      // meant to make trustworthy. An unlinked encounter closes nothing.
      addColumnIfMissing(db, "encounters", "appointment_id", "TEXT");
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_encounters_appointment
          ON encounters (appointment_id);
      `);
    },
  };
