import type { DatabaseMigration } from "./types";
import { addColumnIfMissing } from "./historical-support";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-15-004-care-completion-worklist",
    description: "Provider patient pins and care-completion deferrals (DB-10)",
    apply(db) {
      db.exec(`
        -- A pin is a personal view preference, not an access grant. It records
        -- that this user wants this patient on their own board and nothing else:
        -- no care-team membership, no clinical responsibility, no widened reach.
        -- Patient access is re-checked on every read and every write, so a pin
        -- that outlives access resolves to nothing rather than to a name.
        CREATE TABLE IF NOT EXISTS provider_patient_worklist_pins (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          patient_id TEXT NOT NULL,
          pinned_by TEXT NOT NULL,
          pinned_at TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'manual',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (user_id, patient_id),
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_worklist_pins_user
          ON provider_patient_worklist_pins (user_id, pinned_at DESC);
        CREATE INDEX IF NOT EXISTS idx_worklist_pins_patient
          ON provider_patient_worklist_pins (patient_id);

        -- Deferral is the one piece of care-completion state that has nowhere
        -- else to live: "I know, and here is why it is waiting" is not recorded
        -- by any clinical record. It is deliberately NOT a completion flag —
        -- there is no 'complete' status here, because completion is always read
        -- from the authoritative workflow the item projects.
        --
        -- item_key is rule identity plus the authoritative row the item is
        -- about, never display text, so relabelling a rule cannot orphan a
        -- recorded reason.
        CREATE TABLE IF NOT EXISTS care_completion_deferrals (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          patient_id TEXT NOT NULL,
          rule_id TEXT NOT NULL,
          item_key TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'deferred',
          reason_code TEXT NOT NULL,
          reason_text TEXT,
          deferred_by TEXT NOT NULL,
          deferred_by_name TEXT NOT NULL,
          deferred_at TEXT NOT NULL,
          resume_at TEXT,
          encounter_id TEXT,
          resolved_at TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (user_id, patient_id, item_key),
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_care_completion_deferrals_scope
          ON care_completion_deferrals (user_id, patient_id, status);
      `);

      // Messages carried only a locale clock string ("11:42 AM"), which cannot be
      // ordered or windowed. The care-completion projection has to answer "was a
      // message sent to this patient *after* the note was signed", so it needs an
      // instant. Existing rows keep a null: a message that cannot be placed in
      // time is reported as unusable evidence rather than guessed at.
      addColumnIfMissing(db, "messages", "created_at", "TEXT");
    },
  };
