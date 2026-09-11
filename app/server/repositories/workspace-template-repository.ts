import { getDatabase } from "../db/connection";
import { type ProviderPreferences } from "../../lib/preference-engine";

/**
 * Organization-owned workspace layouts.
 *
 * These are the practice's defaults — the arrangements a clinician can always
 * return to. They are deliberately separate from a clinician's own saved
 * layouts, which live in that person's preference record: a shared default that
 * lived in one user's row could not be offered to anyone else, and a personal
 * layout stored here would be visible to the whole practice.
 *
 * The stored config is a partial preference record. Adopting a template copies
 * it into the clinician's own preferences, so editing a template later never
 * rearranges a screen someone is in the middle of using.
 */

export type WorkspaceTemplateConfig = Partial<Omit<ProviderPreferences, "customPresets">>;

export type WorkspaceTemplate = {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  icon: string;
  /** Empty string means the template is offered to every role. */
  appliesToRole: string;
  sortOrder: number;
  config: WorkspaceTemplateConfig;
  updatedAt: string;
};

type TemplateRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  icon: string;
  applies_to_role: string;
  sort_order: number;
  config_json: string;
  updated_at: string;
};

function toTemplate(row: TemplateRow): WorkspaceTemplate | null {
  try {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      appliesToRole: row.applies_to_role,
      sortOrder: row.sort_order,
      config: JSON.parse(row.config_json) as WorkspaceTemplateConfig,
      updatedAt: row.updated_at,
    };
  } catch {
    // A template whose config no longer parses is dropped rather than thrown:
    // one bad row must not empty the whole practice's defaults list.
    return null;
  }
}

export const WorkspaceTemplateRepository = {
  list(organizationId: string): WorkspaceTemplate[] {
    const db = getDatabase();
    const rows = db
      .prepare(
        `SELECT * FROM workspace_templates
         WHERE organization_id = ?
         ORDER BY sort_order ASC, name ASC`,
      )
      .all(organizationId) as TemplateRow[];
    return rows.map(toTemplate).filter((entry): entry is WorkspaceTemplate => entry !== null);
  },

  get(organizationId: string, id: string): WorkspaceTemplate | null {
    const db = getDatabase();
    const row = db
      .prepare(`SELECT * FROM workspace_templates WHERE organization_id = ? AND id = ?`)
      .get(organizationId, id) as TemplateRow | undefined;
    return row ? toTemplate(row) : null;
  },

  upsert(input: {
    id: string;
    organizationId: string;
    name: string;
    description: string;
    icon: string;
    appliesToRole: string;
    sortOrder: number;
    config: WorkspaceTemplateConfig;
    actorId: string;
  }): WorkspaceTemplate {
    const db = getDatabase();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO workspace_templates (
         id, organization_id, name, description, icon, applies_to_role,
         sort_order, config_json, created_by, updated_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         icon = excluded.icon,
         applies_to_role = excluded.applies_to_role,
         sort_order = excluded.sort_order,
         config_json = excluded.config_json,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
    ).run(
      input.id,
      input.organizationId,
      input.name,
      input.description,
      input.icon,
      input.appliesToRole,
      input.sortOrder,
      JSON.stringify(input.config),
      input.actorId,
      input.actorId,
      now,
      now,
    );

    const saved = this.get(input.organizationId, input.id);
    if (!saved) throw new Error("Workspace template could not be read back after saving.");
    return saved;
  },

  remove(organizationId: string, id: string): boolean {
    const db = getDatabase();
    const result = db
      .prepare(`DELETE FROM workspace_templates WHERE organization_id = ? AND id = ?`)
      .run(organizationId, id);
    return Number(result.changes) > 0;
  },

  /** The membership role this user holds in the organization, if any. */
  membershipRole(organizationId: string, userId: string): string | null {
    const db = getDatabase();
    const row = db
      .prepare(
        `SELECT membership_role FROM organization_memberships
         WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
      )
      .get(organizationId, userId) as { membership_role?: string } | undefined;
    return row?.membership_role ?? null;
  },
};
