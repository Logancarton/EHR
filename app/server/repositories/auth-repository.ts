import { getDatabase } from "../db/connection";
import type { LoginAttemptRecord } from "../../lib/login-throttle-policy";

export type AuthIdentity = {
  userId: string;
  username: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

export type AuthActivationToken = {
  tokenHash: string;
  userId: string;
  issuedBy: string;
  createdAt: string;
  expiresAt: string;
  redeemedAt?: string;
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

  getIdentityByUserId(userId: string): AuthIdentity | null {
    const row = getDatabase()
      .prepare("SELECT * FROM auth_identities WHERE user_id = ?")
      .get(userId) as any;
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

  /**
   * Ends every live session a user holds. Deactivating a user or revoking their
   * membership already fails their next request, but leaving the sessions open
   * relies on that check being reached everywhere; revoking them is the explicit,
   * auditable act an administrator is performing.
   */
  revokeSessionsForUser(userId: string, keepSessionId?: string): number {
    const db = getDatabase();
    const now = new Date().toISOString();
    // `keepSessionId` lets a user change their own password without signing
    // themselves out of the session they are doing it from.
    const result = keepSessionId
      ? db.prepare(`
          UPDATE auth_sessions SET revoked_at = ?
          WHERE user_id = ? AND revoked_at IS NULL AND id <> ?
        `).run(now, userId, keepSessionId)
      : db.prepare(`
          UPDATE auth_sessions SET revoked_at = ?
          WHERE user_id = ? AND revoked_at IS NULL
        `).run(now, userId);
    return Number(result.changes ?? 0);
  },

  /** Failed-login counters, keyed on the lowercased username being attempted. */
  getLoginAttempts(usernameKey: string): LoginAttemptRecord | null {
    const row = getDatabase()
      .prepare("SELECT * FROM auth_login_attempts WHERE username_key = ?")
      .get(usernameKey.trim().toLowerCase()) as any;
    if (!row) return null;
    return {
      failedAttempts: Number(row.failed_attempts),
      firstFailureAt: Date.parse(row.first_failure_at),
      lastFailureAt: Date.parse(row.last_failure_at),
      lockedUntil: row.locked_until ? Date.parse(row.locked_until) : undefined,
    };
  },

  saveLoginAttempts(usernameKey: string, record: LoginAttemptRecord): void {
    getDatabase().prepare(`
      INSERT INTO auth_login_attempts (
        username_key, failed_attempts, first_failure_at, last_failure_at, locked_until
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(username_key) DO UPDATE SET
        failed_attempts = excluded.failed_attempts,
        first_failure_at = excluded.first_failure_at,
        last_failure_at = excluded.last_failure_at,
        locked_until = excluded.locked_until
    `).run(
      usernameKey.trim().toLowerCase(),
      record.failedAttempts,
      new Date(record.firstFailureAt).toISOString(),
      new Date(record.lastFailureAt).toISOString(),
      record.lockedUntil ? new Date(record.lockedUntil).toISOString() : null,
    );
  },

  clearLoginAttempts(usernameKey: string): void {
    getDatabase()
      .prepare("DELETE FROM auth_login_attempts WHERE username_key = ?")
      .run(usernameKey.trim().toLowerCase());
  },

  /**
   * Activation tokens are stored as a hash, never in the clear. A leaked database
   * row must not be redeemable; only the holder of the value handed over
   * out-of-band can activate the account.
   */
  createActivationToken(input: {
    tokenHash: string;
    userId: string;
    issuedBy: string;
    expiresAt: string;
  }): void {
    const db = getDatabase();
    // A newly issued token supersedes any outstanding one for that user, so an
    // earlier hand-off cannot be redeemed after the administrator reissued.
    db.prepare("DELETE FROM auth_activation_tokens WHERE user_id = ? AND redeemed_at IS NULL")
      .run(input.userId);
    db.prepare(`
      INSERT INTO auth_activation_tokens (token_hash, user_id, issued_by, created_at, expires_at, redeemed_at)
      VALUES (?, ?, ?, ?, ?, NULL)
    `).run(input.tokenHash, input.userId, input.issuedBy, new Date().toISOString(), input.expiresAt);
  },

  getActivationToken(tokenHash: string): AuthActivationToken | null {
    const row = getDatabase()
      .prepare("SELECT * FROM auth_activation_tokens WHERE token_hash = ?")
      .get(tokenHash) as any;
    if (!row) return null;
    return {
      tokenHash: row.token_hash,
      userId: row.user_id,
      issuedBy: row.issued_by,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      redeemedAt: row.redeemed_at || undefined,
    };
  },

  /** Marks a token redeemed, returning false when it was already spent. */
  redeemActivationToken(tokenHash: string): boolean {
    const result = getDatabase().prepare(`
      UPDATE auth_activation_tokens SET redeemed_at = ?
      WHERE token_hash = ? AND redeemed_at IS NULL
    `).run(new Date().toISOString(), tokenHash);
    return Number(result.changes ?? 0) > 0;
  },

  revokeSession(id: string): boolean {
    const result = getDatabase()
      .prepare("UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?")
      .run(new Date().toISOString(), id);
    return Number(result.changes) > 0;
  },
};
