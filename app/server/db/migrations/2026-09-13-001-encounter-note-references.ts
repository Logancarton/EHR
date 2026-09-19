import type { DatabaseMigration } from "./types";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-13-001-encounter-note-references",
    description: "Add out-of-band references linking encounter note sections to clinical records",
    apply(db) {
      // A note references clinical records; it does not embed copies of them.
      // Earlier prototyping put markup tokens inside the narrative itself, which
      // made the note text and the structured record the same field: the tokens
      // leaked into every export, and the label carried a code that no record had
      // authorized. The reference lives beside the prose instead.
      //
      // The durable key is (encounter, section, entity). Character spans are a
      // presentation hint for underlining the referenced phrase and are
      // invalidated by the next edit anywhere earlier in the section; nothing
      // clinical or financial may depend on an offset.
      db.exec(`
        CREATE TABLE IF NOT EXISTS encounter_note_references (
          id TEXT PRIMARY KEY,
          encounter_id TEXT NOT NULL,
          patient_id TEXT NOT NULL,
          section TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          version_num INTEGER,
          span_start INTEGER,
          span_end INTEGER,
          -- Evidence class. 'action-derived' is the strongest: a staged order or a
          -- reconciliation performed in this encounter is structurally known and
          -- needs no language understanding. 'clinician-authored' is an explicit
          -- link. 'ai-extracted' is a proposal and nothing more.
          source TEXT NOT NULL DEFAULT 'ai-extracted',
          confidence REAL,
          -- Evidence becomes truth only by an explicit clinician act at signing,
          -- the same boundary medication reconciliation already draws (D-020).
          -- A rejected reference is retained rather than deleted: the fact that a
          -- proposal was declined is audit-relevant.
          status TEXT NOT NULL DEFAULT 'proposed',
          model_id TEXT,
          extracted_at TEXT,
          confirmed_by TEXT,
          confirmed_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (encounter_id, section, entity_type, entity_id),
          FOREIGN KEY (encounter_id) REFERENCES encounters (id) ON DELETE CASCADE,
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
        );

        -- The coding engine reads by encounter and status; the longitudinal
        -- timeline reads by entity ("which encounters addressed this problem?").
        CREATE INDEX IF NOT EXISTS idx_encounter_note_references_encounter
          ON encounter_note_references (encounter_id, status, section);
        CREATE INDEX IF NOT EXISTS idx_encounter_note_references_entity
          ON encounter_note_references (entity_type, entity_id, status);
        CREATE INDEX IF NOT EXISTS idx_encounter_note_references_patient
          ON encounter_note_references (patient_id, status);
      `);
    },
  };
