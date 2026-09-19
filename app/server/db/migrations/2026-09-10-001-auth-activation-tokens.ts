import type { DatabaseMigration } from "./types";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-10-001-auth-activation-tokens",
    description: "Single-use activation tokens so a provisioned user sets their own password",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS auth_activation_tokens (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          issued_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          redeemed_at TEXT,
          FOREIGN KEY (user_id) REFERENCES team_members (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_auth_activation_tokens_user
          ON auth_activation_tokens (user_id, redeemed_at);
      `);
    },
  };
