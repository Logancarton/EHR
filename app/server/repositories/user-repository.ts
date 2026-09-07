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

  listActive(): AppUser[] {
    const rows = getDatabase()
      .prepare("SELECT * FROM team_members WHERE active = 1 ORDER BY display_name")
      .all() as any[];
    return rows.map(mapUser);
  },
};
