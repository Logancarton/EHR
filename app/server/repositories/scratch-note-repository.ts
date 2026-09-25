import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/connection";
import type { ScratchNote } from "../../domain/tasks";

type ScratchNoteRow = {
  id: string;
  organization_id: string;
  author_user_id: string | null;
  patient_id: string | null;
  text: string;
  color: string;
  created_at: string;
  updated_at: string;
};

export type StoredScratchNote = ScratchNote & {
  organizationId: string;
  authorUserId: string | null;
};

function toNote(row: ScratchNoteRow): StoredScratchNote {
  return {
    id: row.id,
    organizationId: row.organization_id,
    authorUserId: row.author_user_id,
    patientId: row.patient_id || undefined,
    text: row.text,
    createdAt: row.created_at,
    color: row.color || "note-yellow",
    ...(row.author_user_id ? {} : { unattributed: true }),
  };
}

/**
 * Storage for `scratch_notes` (migration 2026-09-25-002). Scoping decisions —
 * whose notes, which practice, which patients — belong to the service; this
 * layer only reads and writes the rows it is asked for.
 */
export const ScratchNoteRepository = {
  /** Notes the author wrote in these practices, plus the practices' unattributed legacy notes. */
  listVisible(input: { organizationIds: readonly string[]; authorUserId: string }): StoredScratchNote[] {
    if (input.organizationIds.length === 0) return [];
    const placeholders = input.organizationIds.map(() => "?").join(", ");
    const rows = getDatabase()
      .prepare(`SELECT * FROM scratch_notes
                WHERE organization_id IN (${placeholders})
                  AND (author_user_id = ? OR author_user_id IS NULL)
                ORDER BY created_at DESC`)
      .all(...input.organizationIds, input.authorUserId) as ScratchNoteRow[];
    return rows.map(toNote);
  },

  get(id: string): StoredScratchNote | null {
    const row = getDatabase().prepare(`SELECT * FROM scratch_notes WHERE id = ?`).get(id) as
      | ScratchNoteRow
      | undefined;
    return row ? toNote(row) : null;
  },

  create(input: {
    organizationId: string;
    authorUserId: string;
    patientId?: string;
    text: string;
    color?: string;
  }): StoredScratchNote {
    const id = `sn-${randomUUID()}`;
    const now = new Date().toISOString();
    getDatabase()
      .prepare(`INSERT INTO scratch_notes
        (id, organization_id, author_user_id, patient_id, text, color, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, input.organizationId, input.authorUserId, input.patientId || null, input.text,
        input.color || "note-yellow", now, now);
    return this.get(id)!;
  },

  delete(id: string): boolean {
    return getDatabase().prepare(`DELETE FROM scratch_notes WHERE id = ?`).run(id).changes > 0;
  },
};
