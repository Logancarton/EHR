import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { AuditRepository } from "../repositories/audit-repository";
import { AuthRepository } from "../repositories/auth-repository";
import { UserRepository } from "../repositories/user-repository";
import {
  AuthenticationError,
  DEFAULT_SESSION_TTL_MS,
  createProviderSessionToken,
  type ProviderContext,
} from "./provider-context";

const PASSWORD_SCHEME = "scrypt-v1";
const MINIMUM_PASSWORD_LENGTH = 12;
const ACTIVATION_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

/** Tokens are matched by hash so a database row is never itself redeemable. */
function activationTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function assertPasswordAcceptable(password: string) {
  if (typeof password !== "string" || password.length < MINIMUM_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > 512) throw new Error("Password is too long.");
}

function passwordHash(password: string, salt = randomBytes(16).toString("base64url")): string {
  const derived = scryptSync(password, salt, 64).toString("base64url");
  return `${PASSWORD_SCHEME}$${salt}$${derived}`;
}

function passwordMatches(password: string, stored: string): boolean {
  const [scheme, salt, encoded] = stored.split("$");
  if (scheme !== PASSWORD_SCHEME || !salt || !encoded) return false;
  try {
    const expected = Buffer.from(encoded, "base64url");
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function contextForUser(userId: string): ProviderContext {
  const user = UserRepository.getActiveById(userId);
  if (!user) throw new AuthenticationError("Invalid credentials.");
  return {
    userId: user.id,
    displayName: user.displayName,
    credentials: user.credentials,
    role: user.role,
  };
}

function logFailedLogin(username?: string) {
  AuditRepository.log({
    userId: "anonymous",
    userName: "Unauthenticated user",
    userRole: "unauthenticated",
    eventType: "auth_login_failed",
    description: "Failed EHR login attempt.",
    metadata: username ? { username: username.trim().toLowerCase() } : {},
  });
}

export type LoginInput = {
  username?: string;
  password?: string;
  devUserId?: string;
};

export type LoginResult = {
  actor: ProviderContext;
  sessionId: string;
  token: string;
  expiresAt: number;
};

export const AuthService = {
  /**
   * Provision or rotate a first-party password credential. This is intentionally
   * a server-side primitive; no public self-registration/admin UI is created here.
   */
  configurePasswordCredential(input: { userId: string; username: string; password: string }) {
    const user = UserRepository.getById(input.userId);
    if (!user) throw new Error("User not found.");
    const username = input.username.trim();
    if (!username) throw new Error("Username is required.");
    assertPasswordAcceptable(input.password);

    return AuthRepository.upsertIdentity({
      userId: user.id,
      username,
      passwordHash: passwordHash(input.password),
    });
  },

  /**
   * Issues a single-use activation token for a provisioned user.
   *
   * The administrator never learns the password: they hand over this token
   * out-of-band, and the person themselves chooses a password when redeeming it.
   * An administrator who set the initial password would know a working credential
   * for someone else's clinical account, which is exactly what an audit trail
   * attributing actions to that person is supposed to rule out.
   *
   * The plaintext token is returned once, here, and never stored.
   */
  issueActivationToken(
    input: { userId: string; issuedBy: string; ttlMs?: number },
  ): { token: string; expiresAt: string } {
    const user = UserRepository.getById(input.userId);
    if (!user) throw new Error("User not found.");
    if (!user.active) throw new Error("Cannot activate an inactive user.");

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + (input.ttlMs ?? ACTIVATION_TOKEN_TTL_MS)).toISOString();
    AuthRepository.createActivationToken({
      tokenHash: activationTokenHash(token),
      userId: user.id,
      issuedBy: input.issuedBy,
      expiresAt,
    });
    return { token, expiresAt };
  },

  /**
   * Redeems an activation token, setting the account's username and password.
   * Every failure reports the same message: an unauthenticated caller must not be
   * able to distinguish an unknown token from an expired or already-spent one.
   */
  activateAccount(input: { token: string; username: string; password: string }): ProviderContext {
    const invalid = () => new AuthenticationError("Activation link is invalid or has expired.");
    if (typeof input.token !== "string" || !input.token) throw invalid();

    const record = AuthRepository.getActivationToken(activationTokenHash(input.token));
    if (!record || record.redeemedAt) throw invalid();
    if (Date.parse(record.expiresAt) <= Date.now()) throw invalid();

    const username = input.username?.trim();
    if (!username) throw new Error("Username is required.");
    if (username.length > 160) throw new Error("Username is too long.");
    assertPasswordAcceptable(input.password);

    const existing = AuthRepository.getIdentityByUsername(username);
    if (existing && existing.userId !== record.userId) throw new Error("That username is already taken.");

    const actor = contextForUser(record.userId);
    // Reserve the token before writing the credential, so a concurrent redemption
    // cannot set the password twice from one hand-off.
    if (!AuthRepository.redeemActivationToken(record.tokenHash)) throw invalid();

    AuthRepository.upsertIdentity({
      userId: record.userId,
      username,
      passwordHash: passwordHash(input.password),
    });

    AuditRepository.log({
      userId: actor.userId,
      userName: actor.displayName,
      userRole: actor.role,
      eventType: "auth_account_activated",
      description: `${actor.displayName} activated their EHR account and set a password.`,
      metadata: { issuedBy: record.issuedBy },
    });

    return actor;
  },

  /**
   * Changes the signed-in user's own password. The current password is required —
   * a live session alone must not be enough to replace the credential, or an
   * unattended workstation becomes a permanent account takeover.
   *
   * Every other session for that user is revoked: if the reason for changing was
   * that someone else had the old password, leaving their session alive defeats it.
   */
  changeOwnPassword(
    input: { currentPassword: string; nextPassword: string },
    actor: ProviderContext,
    keepSessionId?: string,
  ): { revokedSessions: number } {
    const identity = AuthRepository.getIdentityByUserId(actor.userId);
    if (!identity) throw new Error("This account has no password credential to change.");
    if (!passwordMatches(input.currentPassword ?? "", identity.passwordHash)) {
      AuditRepository.log({
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        eventType: "auth_password_change_failed",
        description: `${actor.displayName} failed a password change: current password did not match.`,
        metadata: {},
      });
      throw new AuthenticationError("Current password is incorrect.");
    }
    assertPasswordAcceptable(input.nextPassword);
    if (input.nextPassword === input.currentPassword) {
      throw new Error("The new password must differ from the current one.");
    }

    AuthRepository.upsertIdentity({
      userId: actor.userId,
      username: identity.username,
      passwordHash: passwordHash(input.nextPassword),
    });

    const revokedSessions = AuthRepository.revokeSessionsForUser(actor.userId, keepSessionId);
    AuditRepository.log({
      userId: actor.userId,
      userName: actor.displayName,
      userRole: actor.role,
      eventType: "auth_password_changed",
      description: `${actor.displayName} changed their EHR password.`,
      metadata: { revokedSessions },
    });

    return { revokedSessions };
  },

  login(input: LoginInput, ttlMs = DEFAULT_SESSION_TTL_MS): LoginResult {
    let actor: ProviderContext | null = null;

    if (input.username || input.password) {
      if (!input.username || !input.password) {
        logFailedLogin(input.username);
        throw new AuthenticationError("Invalid credentials.");
      }
      const identity = AuthRepository.getIdentityByUsername(input.username);
      if (!identity || !passwordMatches(input.password, identity.passwordHash)) {
        logFailedLogin(input.username);
        throw new AuthenticationError("Invalid credentials.");
      }
      actor = contextForUser(identity.userId);
    } else if (process.env.NODE_ENV !== "production" && input.devUserId) {
      // Explicit local-development convenience: choose an authoritative synthetic
      // team member, then issue the same server-side revocable session used by
      // password login. This branch is impossible in production.
      actor = contextForUser(input.devUserId);
    } else {
      logFailedLogin(input.username);
      throw new AuthenticationError("Invalid credentials.");
    }

    const sessionId = randomUUID();
    const issuedAt = Date.now();
    const expiresAt = issuedAt + ttlMs;
    AuthRepository.createSession({
      id: sessionId,
      userId: actor.userId,
      expiresAt: new Date(expiresAt).toISOString(),
    });
    const token = createProviderSessionToken(sessionId, expiresAt, issuedAt);

    AuditRepository.log({
      userId: actor.userId,
      userName: actor.displayName,
      userRole: actor.role,
      eventType: "auth_login_succeeded",
      description: `${actor.displayName} established an EHR session.`,
      metadata: { sessionId },
    });

    return { actor, sessionId, token, expiresAt };
  },

  logout(sessionId: string, actor: ProviderContext): boolean {
    const session = AuthRepository.getSession(sessionId);
    if (!session || session.revokedAt) return false;

    AuthRepository.revokeSession(sessionId);
    AuditRepository.log({
      userId: actor.userId,
      userName: actor.displayName,
      userRole: actor.role,
      eventType: "auth_logout",
      description: `${actor.displayName} ended an EHR session.`,
      metadata: { sessionId },
    });
    return true;
  },
};
