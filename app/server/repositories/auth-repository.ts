import { getDatabase } from "../db/connection";

export type AuthIdentity = {
  userId: string;
  username: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

export type AuthSessionRecord = {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
};

function mapIdentity(row: any): AuthIdentity {
  return {
    userId: row.user_id,
    username: row.username,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSession(row: any): AuthSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at || undefined,
  };
}

export const AuthRepository = {
  getIdentityByUsername(username: string): AuthIdentity | null {
    const row = getDatabase()
      .prepare("SELECT * FROM auth_identities WHERE username = ? COLLATE NOCASE")
      .get(username.trim()) as any;
    return row ? mapIdentity(row) : null;
  },

  upsertIdentity(input: { userId: string; username: string; passwordHash: string }): AuthIdentity {
    const db = getDatabase();
    const now = new Date().toISOString();
    const username = input.username.trim();
    if (!username) throw new Error("Username is required.");

    db.prepare(`
      INSERT INTO auth_identities (user_id, username, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        username = excluded.username,
        password_hash = excluded.password_hash,
        updated_at = excluded.updated_at
    `).run(input.userId, username, input.passwordHash, now, now);

    return this.getIdentityByUsername(username)!;
  },

  createSession(input: { id: string; userId: string; expiresAt: string }): AuthSessionRecord {
    const now = new Date().toISOString();
    getDatabase().prepare(`
      INSERT INTO auth_sessions (id, user_id, created_at, expires_at, revoked_at)
      VALUES (?, ?, ?, ?, NULL)
    `).run(input.id, input.userId, now, input.expiresAt);
    return this.getSession(input.id)!;
  },

  getSession(id: string): AuthSessionRecord | null {
    const row = getDatabase().prepare("SELECT * FROM auth_sessions WHERE id = ?").get(id) as any;
    return row ? mapSession(row) : null;
  },

  revokeSession(id: string): boolean {
    const result = getDatabase()
      .prepare("UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?")
      .run(new Date().toISOString(), id);
    return Number(result.changes) > 0;
  },
};
