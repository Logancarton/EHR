import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AuthRepository } from "../repositories/auth-repository";
import { UserRepository } from "../repositories/user-repository";

export type ProviderRole = "provider" | "staff" | "clinical_assistant";

export type ClinicalPermission =
  | "read_clinical"
  | "edit_draft"
  | "sign_encounter"
  | "stage_order"
  | "authorize_order"
  | "transmit_order"
  | "send_message"
  | "manage_tasks"
  | "manage_appointments"
  | "edit_patient"
  | "manage_clinical_record"
  | "acknowledge_result"
  | "amend_signed_record"
  | "collaborate_team"
  | "manage_team_tasks"
  | "manage_integrations";

export type ProviderContext = {
  userId: string;
  displayName: string;
  credentials?: string;
  role: ProviderRole;
};

type SignedSessionToken = {
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
};

export type AuthenticatedSession = {
  sessionId: string;
  actor: ProviderContext;
  expiresAt: number;
};

export const EHR_SESSION_COOKIE = "ehr_session";
export const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export class AuthenticationError extends Error {
  constructor(message = "Authentication required: valid EHR session not found.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

const prototypeProvider: ProviderContext = {
  userId: "prototype-provider",
  displayName: "Prototype Provider",
  role: "provider",
};

const rolePermissions: Record<ProviderRole, ReadonlySet<ClinicalPermission>> = {
  provider: new Set<ClinicalPermission>([
    "read_clinical", "edit_draft", "sign_encounter", "stage_order", "authorize_order", "transmit_order",
    "send_message", "manage_tasks", "manage_appointments", "edit_patient",
    "manage_clinical_record", "acknowledge_result", "amend_signed_record",
    "collaborate_team", "manage_team_tasks", "manage_integrations",
  ]),
  staff: new Set<ClinicalPermission>([
    "read_clinical", "edit_draft", "stage_order", "send_message", "manage_tasks",
    "manage_appointments", "manage_clinical_record", "collaborate_team", "manage_team_tasks",
  ]),
  clinical_assistant: new Set<ClinicalPermission>([
    "read_clinical", "edit_draft", "stage_order", "manage_tasks", "manage_clinical_record",
    "collaborate_team", "manage_team_tasks",
  ]),
};

// Local development can issue process-lifetime sessions without committing a secret.
// Production never falls back to this value.
const developmentSessionSecret = randomBytes(32).toString("base64url");

function sessionSecret(): string | null {
  const configured = process.env.EHR_SESSION_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV !== "production") return developmentSessionSecret;
  return null;
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeSignatureEqual(left: string, right: string): boolean {
  try {
    const a = Buffer.from(left, "base64url");
    const b = Buffer.from(right, "base64url");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function cookieValue(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(valueParts.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function decodeSessionToken(token: string): SignedSessionToken | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  if (!safeSignatureEqual(signature, signPayload(encoded, secret))) return null;

  try {
    const session = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SignedSessionToken;
    if (!session.sessionId || !Number.isFinite(session.issuedAt) || !Number.isFinite(session.expiresAt)) return null;
    if (session.issuedAt > session.expiresAt || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function actorFromUser(user: ReturnType<typeof UserRepository.getActiveById>): ProviderContext {
  if (!user) throw new AuthenticationError("Authentication required: session user is inactive or unavailable.");
  return {
    userId: user.id,
    displayName: user.displayName,
    credentials: user.credentials,
    role: user.role,
  };
}

export function createProviderSessionToken(
  sessionId: string,
  expiresAt: number,
  issuedAt = Date.now(),
): string {
  const secret = sessionSecret();
  if (!secret) {
    throw new Error("EHR_SESSION_SECRET must be configured before issuing production sessions.");
  }
  const session: SignedSessionToken = { sessionId, issuedAt, expiresAt };
  const encoded = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${encoded}.${signPayload(encoded, secret)}`;
}

export function getAuthenticatedSession(request: Request): AuthenticatedSession {
  const token = cookieValue(request, EHR_SESSION_COOKIE);
  if (!token) throw new AuthenticationError();

  const signed = decodeSessionToken(token);
  if (!signed) throw new AuthenticationError("Authentication required: session is invalid or expired.");

  const stored = AuthRepository.getSession(signed.sessionId);
  if (!stored || stored.revokedAt) {
    throw new AuthenticationError("Authentication required: session is no longer active.");
  }

  const storedExpiry = Date.parse(stored.expiresAt);
  if (!Number.isFinite(storedExpiry) || storedExpiry <= Date.now() || storedExpiry !== signed.expiresAt) {
    throw new AuthenticationError("Authentication required: session is invalid or expired.");
  }

  return {
    sessionId: stored.id,
    actor: actorFromUser(UserRepository.getActiveById(stored.userId)),
    expiresAt: storedExpiry,
  };
}

export function getAuthenticatedProviderContext(request: Request): ProviderContext {
  return getAuthenticatedSession(request).actor;
}

export function getProviderContext(request?: Request): ProviderContext {
  if (request) {
    const token = cookieValue(request, EHR_SESSION_COOKIE);
    if (token) {
      // An invalid presented credential must never silently downgrade into a
      // development prototype provider.
      return getAuthenticatedProviderContext(request);
    }
  }

  if (process.env.NODE_ENV !== "production") return prototypeProvider;
  throw new AuthenticationError();
}

export function providerLabel(actor: ProviderContext): string {
  return actor.credentials ? `${actor.displayName}, ${actor.credentials}` : actor.displayName;
}

export function hasPermission(actor: ProviderContext, permission: ClinicalPermission): boolean {
  const permissions = rolePermissions[actor.role];
  return permissions ? permissions.has(permission) : false;
}

export function permissionsForActor(actor: ProviderContext): ClinicalPermission[] {
  return [...rolePermissions[actor.role]];
}

export function assertPermission(actor: ProviderContext, permission: ClinicalPermission): void {
  if (!hasPermission(actor, permission)) {
    throw new Error(`User ${actor.userId} (${actor.role}) lacks permission: ${permission}`);
  }
}
