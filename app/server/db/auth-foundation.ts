import type { DatabaseSync } from "node:sqlite";

/**
 * First-party authentication persistence for the prototype architecture.
 * Team members remain the authoritative human/user records; authentication
 * identities and revocable sessions are kept in a separate security boundary.
 */
export function ensureAuthFoundation(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_identities (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES team_members (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES team_members (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
      ON auth_sessions (user_id, expires_at);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry
      ON auth_sessions (expires_at);
  `);
}
