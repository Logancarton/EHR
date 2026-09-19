import type { DatabaseMigration } from "./types";
import { addColumnIfMissing } from "./historical-support";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-10-004-workspace-templates",
    description: "Add membership roles and organization-owned workspace layout templates",
    apply(db) {
      // Memberships previously recorded only status and patient-access scope, so
      // there was nobody the system could authorise to administer shared settings.
      // Every existing member starts as 'member'; the backfill below promotes one.
      addColumnIfMissing(db, "organization_memberships", "membership_role", "TEXT NOT NULL DEFAULT 'member'");

      db.exec(`
        CREATE TABLE IF NOT EXISTS workspace_templates (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          icon TEXT NOT NULL DEFAULT 'dashboard',
          -- Empty means the template is offered to every role in the practice.
          applies_to_role TEXT NOT NULL DEFAULT '',
          sort_order INTEGER NOT NULL DEFAULT 0,
          config_json TEXT NOT NULL,
          created_by TEXT NOT NULL,
          updated_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (organization_id, name),
          FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_workspace_templates_org
          ON workspace_templates (organization_id, sort_order);
      `);

      // Every organization needs someone who can edit its templates, or the
      // feature ships unreachable. The earliest active membership is the closest
      // thing to "whoever set the practice up"; ties break on id so the choice is
      // deterministic rather than dependent on row order.
      const organizations = db.prepare(`SELECT id FROM organizations`).all() as Array<{ id: string }>;
      const firstMember = db.prepare(`
        SELECT user_id FROM organization_memberships
        WHERE organization_id = ? AND status = 'active'
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      `);
      const promote = db.prepare(`
        UPDATE organization_memberships
        SET membership_role = 'owner', updated_at = ?
        WHERE organization_id = ? AND user_id = ?
      `);
      const now = new Date().toISOString();
      for (const organization of organizations) {
        const owner = firstMember.get(organization.id) as { user_id?: string } | undefined;
        if (owner?.user_id) promote.run(now, organization.id, owner.user_id);
      }
    },
  };
