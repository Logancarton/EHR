import type { DatabaseMigration } from "./types";
import { DEFAULT_ORGANIZATION_ID } from "./constants";

/**
 * Scratchpad notes get their own table, owned by an author inside a practice.
 *
 * They were rows in `tasks` with `type = 'scratchpad'` and no author or
 * practice, and every signed-in user of every practice was served all of them.
 * A scratchpad is a clinician's own jotting space, so each note now belongs to
 * the user who wrote it, in the practice it was written for.
 *
 * Existing notes are attributed from the `scratchpad_created` audit event that
 * recorded who created them. The synthetic seed notes belong to the synthetic
 * prototype provider, and its two clinical memos (a guanfacine titration and a
 * GAD/ADHD differential) are about Maya Chen. A note nobody can be credited
 * with stays visible to its practice, marked unattributed, rather than being
 * hidden from everyone.
 */
const SEED_NOTE_AUTHOR = "prototype-provider";
const SEED_NOTE_PATIENTS: Record<string, string | null> = {
  "note-1": "maya-chen",
  "note-2": "maya-chen",
  "note-3": null,
};

export const migration: DatabaseMigration = {
  id: "2026-09-25-002-personal-scratch-notes",
  description: "Move scratchpad notes out of tasks into author- and practice-scoped scratch_notes",
  apply(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS scratch_notes (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        author_user_id TEXT,
        patient_id TEXT,
        text TEXT NOT NULL CHECK (length(trim(text)) > 0),
        color TEXT NOT NULL DEFAULT 'note-yellow',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_scratch_notes_author
        ON scratch_notes (organization_id, author_user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_scratch_notes_patient
        ON scratch_notes (patient_id);
    `);

    const hasTasks = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'`)
      .get();
    if (!hasTasks) return;

    const hasAudit = Boolean(
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audit_logs'`).get(),
    );
    const hasPatientOrgs = Boolean(
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'patient_organizations'`).get(),
    );

    const legacy = db
      .prepare(`SELECT id, patient_id, text, color, created_at, updated_at FROM tasks WHERE type = 'scratchpad'`)
      .all() as Array<{
        id: string;
        patient_id: string | null;
        text: string;
        color: string | null;
        created_at: string;
        updated_at: string;
      }>;

    const insert = db.prepare(`INSERT OR IGNORE INTO scratch_notes
      (id, organization_id, author_user_id, patient_id, text, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

    for (const note of legacy) {
      if (!note.text || !note.text.trim()) continue;

      let author: string | null = null;
      if (hasAudit) {
        const event = db
          .prepare(`SELECT user_id FROM audit_logs
                    WHERE event_type = 'scratchpad_created'
                      AND json_extract(metadata_json, '$.noteId') = ?
                    ORDER BY timestamp ASC LIMIT 1`)
          .get(note.id) as { user_id: string } | undefined;
        author = event?.user_id ?? null;
      }

      let patientId = note.patient_id;
      if (note.id in SEED_NOTE_PATIENTS) {
        author = author ?? SEED_NOTE_AUTHOR;
        if (!patientId) patientId = SEED_NOTE_PATIENTS[note.id];
      }
      if (patientId && !db.prepare(`SELECT 1 FROM patients WHERE id = ?`).get(patientId)) {
        patientId = null;
      }

      let organizationId = DEFAULT_ORGANIZATION_ID;
      if (patientId && hasPatientOrgs) {
        const owner = db
          .prepare(`SELECT organization_id FROM patient_organizations WHERE patient_id = ?`)
          .get(patientId) as { organization_id: string | null } | undefined;
        if (owner?.organization_id) organizationId = owner.organization_id;
      }

      insert.run(note.id, organizationId, author, patientId, note.text, note.color || "note-yellow",
        note.created_at, note.updated_at);
    }

    db.prepare(`DELETE FROM tasks WHERE type = 'scratchpad'`).run();
  },
};
