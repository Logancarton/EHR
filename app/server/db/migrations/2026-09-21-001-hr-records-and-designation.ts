import type { DatabaseMigration } from "./types";
import { addColumnIfMissing } from "./historical-support";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration = {
  id: "2026-09-21-001-hr-records-and-designation",
  description: "Add the HR access designation and per-member HR records (D-086)",
  apply(db) {
    // D-086: owners and managers hold HR access inherently, decided in code from
    // membership_role. This column records only the *additional* designation an owner
    // or manager grants to a specific member, so an HR administrator who is not a
    // practice manager can read employee records without also being handed
    // organization administration. Clinical role never appears here.
    addColumnIfMissing(db, "organization_memberships", "hr_access", "TEXT NOT NULL DEFAULT 'none'");

    db.exec(`
      CREATE TABLE IF NOT EXISTS hr_records (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        -- Employment facts the practice tracks about the person. Nothing here is
        -- authored by the person it describes; assignment is an owner/manager action.
        employment_type TEXT NOT NULL DEFAULT '',
        started_on TEXT,
        assigned_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (organization_id, user_id),
        FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES team_members (id) ON DELETE CASCADE
      );

      -- One table rather than four. Insurance, licensing deadlines, coachings and
      -- goals differ in what they mean to the practice, not in what the record has to
      -- store: a title, some detail, a state, and usually a date something is due.
      -- The owner named "etc." explicitly, so the category stays open rather than
      -- forcing a schema change for the next kind of thing HR tracks.
      CREATE TABLE IF NOT EXISTS hr_record_items (
        id TEXT PRIMARY KEY,
        record_id TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        due_on TEXT,
        assigned_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (record_id) REFERENCES hr_records (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_hr_records_user
        ON hr_records (organization_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_hr_record_items_record
        ON hr_record_items (record_id, category, due_on);
    `);
  },
};
