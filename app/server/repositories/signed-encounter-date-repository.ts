import { getDatabase } from "../db/connection";
import {
  normalizeClinicalTimestamp,
  type ClinicalTimestampParseStatus,
} from "../../domain/clinical-timestamp";

/**
 * A derived index over `encounters.signed_at` (roadmap P9-0 follow-up).
 *
 * The problem it solves: signed encounters are immutable by database trigger, and
 * their recorded signing timestamp is not uniformly formatted — the signing path
 * writes an ISO instant, while rows seeded before it carry a display date like
 * `"Aug 08, 2026"`. In SQLite, `signed_at BETWEEN '2026-08-15T…' AND '2026-09-14T…'`
 * is a string comparison, and a display date sorts outside every ISO window
 * because digits precede letters. A windowed count therefore dropped those rows
 * without saying so.
 *
 * Three rules follow, and each is load-bearing:
 *
 * 1. **The record is never touched.** This is a projection beside the encounter,
 *    like `encounters_fts` over note content. No `UPDATE` reaches a signed row, and
 *    the immutability triggers stay in force.
 * 2. **Nothing is guessed.** A timestamp in no recognised form is stored with a
 *    null instant and `parse_status = 'unparseable'`, so it is *countable* rather
 *    than missing. A report that cannot place a record must be able to say so.
 * 3. **It is self-healing.** `refresh` is idempotent and reconciles on read, the
 *    same justification the action-derived note-reference view uses: the rows are a
 *    view over authoritative records and create nothing clinical. A projection that
 *    can silently fall behind would reintroduce the defect it exists to remove.
 */

export type SignedEncounterDateRow = {
  encounterId: string;
  patientId: string;
  signedAtRaw: string;
  signedAtIso: string | null;
  parseStatus: ClinicalTimestampParseStatus;
};

function scopeClause(column: string, patientIds: readonly string[] | undefined) {
  if (!patientIds) return { sql: "", params: [] as string[] };
  if (patientIds.length === 0) return { sql: " AND 1 = 0", params: [] as string[] };
  return {
    sql: ` AND ${column} IN (${patientIds.map(() => "?").join(", ")})`,
    params: [...patientIds],
  };
}

export const SignedEncounterDateRepository = {
  /**
   * Brings the projection level with the encounters table.
   *
   * Only signed encounters that are absent, or whose raw value no longer matches
   * what was projected, are written. In practice that means newly signed notes:
   * an already-projected signed encounter cannot change, because it cannot be
   * updated at all.
   */
  refresh(): { inserted: number; updated: number } {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT e.id, e.patient_id, e.signed_at, p.signed_at_raw AS projected_raw
      FROM encounters e
      LEFT JOIN encounter_signed_at_projection p ON p.encounter_id = e.id
      WHERE e.status = 'signed'
        AND (p.encounter_id IS NULL OR p.signed_at_raw IS NOT e.signed_at)
    `).all() as Array<{ id: string; patient_id: string; signed_at: string | null; projected_raw: string | null }>;

    if (rows.length === 0) return { inserted: 0, updated: 0 };

    const at = new Date().toISOString();
    const write = db.prepare(`
      INSERT INTO encounter_signed_at_projection (
        encounter_id, patient_id, signed_at_raw, signed_at_iso, parse_status, projected_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (encounter_id) DO UPDATE SET
        patient_id = excluded.patient_id,
        signed_at_raw = excluded.signed_at_raw,
        signed_at_iso = excluded.signed_at_iso,
        parse_status = excluded.parse_status,
        projected_at = excluded.projected_at
    `);

    let inserted = 0;
    let updated = 0;
    for (const row of rows) {
      const normalized = normalizeClinicalTimestamp(row.signed_at);
      write.run(
        row.id,
        row.patient_id,
        normalized.raw,
        normalized.iso,
        normalized.status,
        at,
      );
      if (row.projected_raw === null) inserted += 1;
      else updated += 1;
    }

    return { inserted, updated };
  },

  get(encounterId: string): SignedEncounterDateRow | null {
    const row = getDatabase()
      .prepare("SELECT * FROM encounter_signed_at_projection WHERE encounter_id = ?")
      .get(encounterId) as any;
    if (!row) return null;
    return {
      encounterId: row.encounter_id,
      patientId: row.patient_id,
      signedAtRaw: row.signed_at_raw,
      signedAtIso: row.signed_at_iso || null,
      parseStatus: row.parse_status as ClinicalTimestampParseStatus,
    };
  },

  /**
   * How many signed encounters could not be placed in time.
   *
   * Reported alongside any windowed figure derived from this projection. A count
   * that excludes records has to disclose how many, or it is a claim about the
   * practice that cannot be checked.
   */
  unplaceableCount(patientIds?: readonly string[]): number {
    const scope = scopeClause("patient_id", patientIds);
    const row = getDatabase().prepare(`
      SELECT COUNT(*) AS total
      FROM encounter_signed_at_projection
      WHERE parse_status = 'unparseable'${scope.sql}
    `).get(...scope.params) as any;
    return Number(row?.total || 0);
  },

  /** The unplaceable rows themselves, so an operator can go and look at them. */
  unplaceable(patientIds?: readonly string[], limit = 200): SignedEncounterDateRow[] {
    const scope = scopeClause("patient_id", patientIds);
    const rows = getDatabase().prepare(`
      SELECT * FROM encounter_signed_at_projection
      WHERE parse_status = 'unparseable'${scope.sql}
      ORDER BY encounter_id
      LIMIT ?
    `).all(...scope.params, Math.max(1, Math.min(limit, 1000))) as any[];
    return rows.map((row) => ({
      encounterId: row.encounter_id,
      patientId: row.patient_id,
      signedAtRaw: row.signed_at_raw,
      signedAtIso: row.signed_at_iso || null,
      parseStatus: row.parse_status as ClinicalTimestampParseStatus,
    }));
  },
};
