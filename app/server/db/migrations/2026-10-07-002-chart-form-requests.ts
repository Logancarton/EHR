import type { DatabaseSync } from "node:sqlite";
import type { DatabaseMigration } from "./types";
import { recreateTable } from "./historical-support";

const INDEXES = [
  "idx_intake_portal_invitations_token",
  "idx_intake_portal_invitations_episode",
  "idx_intake_portal_invitations_patient",
  "idx_intake_portal_invitations_prospect",
] as const;

const CREATE_SQL = `
  CREATE TABLE intake_portal_invitations (
    id TEXT PRIMARY KEY,
    token_hash TEXT UNIQUE NOT NULL,
    episode_id TEXT,
    patient_id TEXT,
    prospective_person_id TEXT,
    target_email TEXT,
    target_phone TEXT,
    dob_verification_required INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_accessed_at TEXT,
    completed_at TEXT,
    created_by_id TEXT NOT NULL,
    created_by_name TEXT NOT NULL,
    requested_items_json TEXT,
    thread_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_intake_portal_invitations_token ON intake_portal_invitations(token_hash);
  CREATE INDEX IF NOT EXISTS idx_intake_portal_invitations_episode ON intake_portal_invitations(episode_id);
  CREATE INDEX IF NOT EXISTS idx_intake_portal_invitations_patient ON intake_portal_invitations(patient_id);
  CREATE INDEX IF NOT EXISTS idx_intake_portal_invitations_prospect ON intake_portal_invitations(prospective_person_id);
`;

/**
 * Forms requested from the chart (patient-form-requests). A portal invitation no
 * longer has to belong to an intake episode: one sent from an established chart
 * names the forms it asked for (`requested_items_json`) and the message thread
 * that records the request (`thread_id`). NULL `requested_items_json` keeps the
 * intake packet's meaning: every active consent plus PHQ-9 and GAD-7.
 *
 * The table was first created by `ensureIntakeFoundation`, which runs after
 * migrations, so on a fresh database it does not exist yet; this creates it in
 * its new shape and the later CREATE TABLE IF NOT EXISTS is a no-op.
 */
export const migration: DatabaseMigration = {
  id: "2026-10-07-002-chart-form-requests",
  description: "Portal invitations may come from a chart: optional episode, requested items and thread",
  apply(db: DatabaseSync) {
    const exists = db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'intake_portal_invitations'`)
      .get();
    if (!exists) {
      db.exec(CREATE_SQL);
      return;
    }
    recreateTable(db, {
      table: "intake_portal_invitations",
      createSql: CREATE_SQL,
      dropIndexes: INDEXES,
      copyColumns: [
        "id", "token_hash", "episode_id", "patient_id", "prospective_person_id",
        "target_email", "target_phone", "dob_verification_required", "status",
        "created_at", "expires_at", "last_accessed_at", "completed_at",
        "created_by_id", "created_by_name",
      ],
    });
  },
};
