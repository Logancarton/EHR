import type { DatabaseMigration } from "./types";
import { recreateTable, relaxIntakeEpisodeAppointment } from "./historical-support";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-19-001-intake-episode-standalone",
    description:
      "An intake episode can now exist before any visit is scheduled: relaxes " +
      "intake_episodes.appointment_id to optional (a prospect or patient can start " +
      "intake work — identity, coverage, documents, consents — with no tentative " +
      "hold yet) and adds partial unique indexes so at most one appointment-less " +
      "episode exists per subject. Coordinated with intake_notes, which has a " +
      "foreign key to intake_episodes. Also restores idx_identity_document_reviews_document " +
      "and intake_episodes/intake_notes' own indexes, silently dropped by the prior two " +
      "relax migrations' rename step (a table rename does not free an index name it " +
      "already holds, so the replacement table's same-named CREATE INDEX IF NOT EXISTS " +
      "was a no-op) — recreateTable now drops those stale names first so this cannot recur.",
    apply(db) {
      relaxIntakeEpisodeAppointment(db);
    },
  };
