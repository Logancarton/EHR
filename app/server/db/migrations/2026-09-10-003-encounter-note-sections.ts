import type { DatabaseMigration } from "./types";
import { addColumnIfMissing } from "./historical-support";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-10-003-encounter-note-sections",
    description: "Persist review of symptoms, risk assessment, and follow-up as note columns",
    apply(db) {
      // Risk assessment and follow-up were draft-only fields: the client held them
      // but the save payload never carried them, so they lived in one browser and
      // were absent from the signed legal record. They become columns here alongside
      // the new review-of-symptoms section.
      addColumnIfMissing(db, "encounters", "review_of_symptoms", "TEXT NOT NULL DEFAULT ''");
      addColumnIfMissing(db, "encounters", "risk_assessment", "TEXT NOT NULL DEFAULT ''");
      addColumnIfMissing(db, "encounters", "follow_up", "TEXT NOT NULL DEFAULT ''");
    },
  };
