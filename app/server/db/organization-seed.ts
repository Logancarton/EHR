import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_ORGANIZATION_ID, DEFAULT_ORGANIZATION_NAME } from "./migrations";

/**
 * Keeps the synthetic development practice coherent across restarts.
 *
 * The organization migration backfills the records that existed when it first ran.
 * This step covers the narrow case of a synthetic team member being added to the
 * seed afterwards, which would otherwise leave that clinician authenticated but
 * unable to reach any chart.
 *
 * It names the synthetic users explicitly rather than adopting every row: a future
 * production user must be provisioned into an organization deliberately, not by a
 * boot-time sweep.
 */
const SYNTHETIC_MEMBER_IDS = ["prototype-provider", "team-taylor", "team-casey"] as const;

export function ensureOrganizationAccessSeed(db: DatabaseSync) {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR IGNORE INTO organizations (id, name, status, created_at, updated_at)
    VALUES (?, ?, 'active', ?, ?)
  `).run(DEFAULT_ORGANIZATION_ID, DEFAULT_ORGANIZATION_NAME, now, now);

  const insertMembership = db.prepare(`
    INSERT OR IGNORE INTO organization_memberships (
      id, organization_id, user_id, status, patient_access_scope, created_at, updated_at
    ) VALUES (?, ?, ?, 'active', 'organization', ?, ?)
  `);

  for (const userId of SYNTHETIC_MEMBER_IDS) {
    const exists = db.prepare("SELECT 1 FROM team_members WHERE id = ?").get(userId);
    if (!exists) continue;
    insertMembership.run(
      `membership-${DEFAULT_ORGANIZATION_ID}-${userId}`,
      DEFAULT_ORGANIZATION_ID,
      userId,
      now,
      now,
    );
  }
}
