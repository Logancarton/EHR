import type { DatabaseMigration } from "./types";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-10-002-auth-login-throttle",
    description: "Durable failed-login counters so password guessing is rate limited",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS auth_login_attempts (
          username_key TEXT PRIMARY KEY,
          failed_attempts INTEGER NOT NULL DEFAULT 0,
          first_failure_at TEXT NOT NULL,
          last_failure_at TEXT NOT NULL,
          locked_until TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_locked
          ON auth_login_attempts (locked_until);
      `);
    },
  };
