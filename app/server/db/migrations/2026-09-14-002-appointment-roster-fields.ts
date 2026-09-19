import type { DatabaseMigration } from "./types";
import { addColumnIfMissing } from "./historical-support";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-14-002-appointment-roster-fields",
    description: "Add modality, provider, staff assignment, intake status, and cancellation fields to appointments",
    apply(db) {
      addColumnIfMissing(db, "appointments", "modality", "TEXT DEFAULT 'in-person'");
      addColumnIfMissing(db, "appointments", "provider_id", "TEXT");
      addColumnIfMissing(db, "appointments", "provider_name", "TEXT");
      addColumnIfMissing(db, "appointments", "assigned_staff_id", "TEXT");
      addColumnIfMissing(db, "appointments", "assigned_staff_name", "TEXT");
      addColumnIfMissing(db, "appointments", "intake_status", "TEXT DEFAULT 'completed'");
      addColumnIfMissing(db, "appointments", "cancellation_reason", "TEXT");
      addColumnIfMissing(db, "appointments", "cancellation_note", "TEXT");
      addColumnIfMissing(db, "appointments", "cancelled_at", "TEXT");
      addColumnIfMissing(db, "appointments", "cancelled_by", "TEXT");
    },
  };
