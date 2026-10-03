import type { DatabaseMigration } from "./types";

export const migration: DatabaseMigration = {
  id: "2026-10-02-001-encounter-guidance",
  description:
    "Separate append-only provider guidance and coverage attestations from transcript and note prose",
  apply(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS encounter_provider_guidance (
        encounter_id TEXT NOT NULL REFERENCES encounters(id), id TEXT NOT NULL,
        kind TEXT NOT NULL, target TEXT NOT NULL, text TEXT NOT NULL,
        needs_clarification INTEGER NOT NULL, replaces_text TEXT, created_at TEXT NOT NULL,
        actor_id TEXT NOT NULL, PRIMARY KEY (encounter_id, id)
      );
      CREATE TABLE IF NOT EXISTS encounter_coverage_attestations (
        encounter_id TEXT NOT NULL REFERENCES encounters(id), id TEXT NOT NULL,
        target TEXT NOT NULL, evidence TEXT NOT NULL, safety_explicitly_assessed INTEGER NOT NULL,
        created_at TEXT NOT NULL, actor_id TEXT NOT NULL, PRIMARY KEY (encounter_id, id)
      );
    `);
  },
};
