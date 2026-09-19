import type { DatabaseMigration } from "./types";
import { addColumnIfMissing } from "./historical-support";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-15-003-medication-indication",
    description: "Carry the prescribing indication onto the authoritative medication record (P3-C)",
    apply(db) {
      // P3-C asks for indication to be exposed "where useful". The prescription
      // intent has carried one all along (`MedicationPrescriptionIntent.indication`)
      // and the confirmation step dropped it on the floor, so the reason a
      // medication is being taken existed at the moment of prescribing and was
      // absent from the chart a minute later.
      addColumnIfMissing(db, "patient_medications", "indication", "TEXT");
    },
  };
