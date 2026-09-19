import type { DatabaseMigration } from "./types";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-15-002-signed-encounter-date-projection",
    description: "Derived, rebuildable normalization of encounter signing timestamps for windowed reads",
    apply(db) {
      db.exec(`
        -- A projection, not a correction. Signed encounters are immutable by
        -- trigger and their recorded signing timestamp is left exactly as written;
        -- this table holds a derived instant beside it so a date-windowed query can
        -- be correct without rewriting a legal record.
        --
        -- 'unparseable' is a first-class outcome. A row that cannot be placed in
        -- time keeps its raw value, carries no instant, and is countable — so a
        -- windowed report can state how many records it could not place instead of
        -- silently dropping them.
        CREATE TABLE IF NOT EXISTS encounter_signed_at_projection (
          encounter_id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL,
          signed_at_raw TEXT NOT NULL,
          signed_at_iso TEXT,
          parse_status TEXT NOT NULL,
          projected_at TEXT NOT NULL,
          FOREIGN KEY (encounter_id) REFERENCES encounters (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_encounter_signed_projection_iso
          ON encounter_signed_at_projection (signed_at_iso);
        CREATE INDEX IF NOT EXISTS idx_encounter_signed_projection_status
          ON encounter_signed_at_projection (parse_status);
        CREATE INDEX IF NOT EXISTS idx_encounter_signed_projection_patient
          ON encounter_signed_at_projection (patient_id, signed_at_iso);
      `);
    },
  };
