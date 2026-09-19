import type { DatabaseMigration } from "./types";
import { addColumnIfMissing } from "./historical-support";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-14-005-appointment-lifecycle-and-followup",
    description: "Add operational and lifecycle timestamps, notes, and follow-up links to appointments",
    apply(db) {
      addColumnIfMissing(db, "appointments", "notes", "TEXT");
      addColumnIfMissing(db, "appointments", "arrived_at", "TEXT");
      addColumnIfMissing(db, "appointments", "started_at", "TEXT");
      addColumnIfMissing(db, "appointments", "completed_at", "TEXT");
      addColumnIfMissing(db, "appointments", "follow_up_interval", "TEXT");
      addColumnIfMissing(db, "appointments", "origin_appointment_id", "TEXT");
    },
  };
