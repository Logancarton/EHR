import { getDatabase } from "../db/connection";
import type { ProviderRole } from "../auth/provider-context";

export type AppUser = {
  id: string;
  displayName: string;
  credentials?: string;
  role: ProviderRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function isProviderRole(value: unknown): value is ProviderRole {
  return value === "provider" || value === "staff" || value === "clinical_assistant";
}

function mapUser(row: any): AppUser {
  if (!isProviderRole(row.role)) {
    throw new Error(`Invalid stored user role for ${row.id}.`);
  }
  return {
    id: row.id,
    displayName: row.display_name,
    credentials: row.credentials || undefined,
    role: row.role,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const UserRepository = {
  getById(id: string): AppUser | null {
    const row = getDatabase().prepare("SELECT * FROM team_members WHERE id = ?").get(id) as any;
    return row ? mapUser(row) : null;
  },

  getActiveById(id: string): AppUser | null {
    const row = getDatabase()
      .prepare("SELECT * FROM team_members WHERE id = ? AND active = 1")
      .get(id) as any;
    return row ? mapUser(row) : null;
  },

  create(input: {
    id: string;
    displayName: string;
    credentials?: string;
    role: ProviderRole;
    initials?: string;
  }): AppUser {
    const db = getDatabase();
    const now = new Date().toISOString();
    const initials = input.initials || input.displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");

    db.prepare(`
      INSERT INTO team_members (
        id, display_name, credentials, role, initials, presence, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'offline', 1, ?, ?)
    `).run(input.id, input.displayName, input.credentials || null, input.role, initials, now, now);

    const created = this.getById(input.id);
    if (!created) throw new Error(`User ${input.id} could not be created.`);
    return created;
  },

  setActive(id: string, active: boolean): AppUser | null {
    getDatabase()
      .prepare("UPDATE team_members SET active = ?, updated_at = ? WHERE id = ?")
      .run(active ? 1 : 0, new Date().toISOString(), id);
    return this.getById(id);
  },

  listActive(): AppUser[] {
    const rows = getDatabase()
      .prepare("SELECT * FROM team_members WHERE active = 1 ORDER BY display_name")
      .all() as any[];
    return rows.map(mapUser);
  },
};
