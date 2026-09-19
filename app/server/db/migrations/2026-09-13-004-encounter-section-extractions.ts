import type { DatabaseMigration } from "./types";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-13-004-encounter-section-extractions",
    description: "Record which note section text an extraction pass has already seen",
    apply(db) {
      // Extraction is debounced per section and must be free in the steady state:
      // re-reading text that has not changed costs money and latency and can only
      // return the same answer. The content hash is what makes a no-op a no-op.
      //
      // The model identity is part of the key in spirit: a different extractor may
      // legitimately reach a different answer about identical text, so a change of
      // implementation invalidates the skip.
      db.exec(`
        CREATE TABLE IF NOT EXISTS encounter_section_extractions (
          encounter_id TEXT NOT NULL,
          section TEXT NOT NULL,
          content_sha TEXT NOT NULL,
          model_id TEXT NOT NULL,
          extracted_at TEXT NOT NULL,
          PRIMARY KEY (encounter_id, section),
          FOREIGN KEY (encounter_id) REFERENCES encounters (id) ON DELETE CASCADE
        );
      `);
    },
  };
