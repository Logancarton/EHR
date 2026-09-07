import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
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
    if (input.password.length < 12) throw new Error("Password must be at least 12 characters.");

    return AuthRepository.upsertIdentity({
      userId: user.id,
      username,
      passwordHash: passwordHash(input.password),
    });
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
