import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AuthRepository } from "../repositories/auth-repository";
import { OrganizationRepository } from "../repositories/organization-repository";
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
  | "read_schedule"
  | "manage_appointments"
  | "edit_patient"
  | "manage_clinical_record"
  | "acknowledge_result"
  | "amend_signed_record"
  | "collaborate_team"
  | "manage_team_tasks"
  | "manage_integrations"
  /**
   * Administering the organization's own users and memberships.
   * Gated strictly to organization owners and managers — never granted
   * simply due to clinical role.
   */
  | "manage_organization"
  /**
   * Reading and assigning another member's HR record (D-086).
   *
   * Held inherently by organization owners and managers, and grantable by them to a
   * specific member so an HR administrator who is not a practice manager can reach
   * employee records without also receiving organization administration. Never
   * implied by clinical role: personnel data is not clinical data, and being a
   * physician is not being an HR administrator.
   *
   * A member's own record needs no permission at all — see `HRService`.
   */
  | "manage_hr"
  | "manage_templates"
  | "view_financial";

export type ProviderContext = {
  userId: string;
  displayName: string;
  credentials?: string;
  role: ProviderRole;
  membershipRole?: "owner" | "manager" | "member";
  organizationId?: string;
  capabilities?: ClinicalPermission[];
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
  membershipRole: "owner",
};

const rolePermissions: Record<ProviderRole, ReadonlySet<ClinicalPermission>> = {
  provider: new Set<ClinicalPermission>([
    "read_clinical", "edit_draft", "sign_encounter", "stage_order", "authorize_order", "transmit_order",
    "send_message", "manage_tasks", "read_schedule", "manage_appointments", "edit_patient",
    "manage_clinical_record", "acknowledge_result", "amend_signed_record",
    "collaborate_team", "manage_team_tasks", "manage_integrations",
  ]),
  staff: new Set<ClinicalPermission>([
    "read_schedule", "manage_appointments", "edit_patient", "send_message", "manage_tasks",
    "collaborate_team", "manage_team_tasks",
  ]),
  clinical_assistant: new Set<ClinicalPermission>([
    "read_clinical", "edit_draft", "stage_order", "manage_tasks", "manage_clinical_record",
    "collaborate_team", "manage_team_tasks", "read_schedule",
  ]),
};

// Local development can issue process-lifetime sessions without committing a secret.
// Production never falls back to this value.
//
// Held on globalThis rather than in a module constant: the dev server re-evaluates
// this module per route bundle and on hot reload, and each copy minting its own
// secret meant a session signed by /api/auth/login verified on /api/auth/me but was
// refused on a freshly recompiled route such as /api/intake. One secret per process.
const developmentSecretKey = Symbol.for("ehr.developmentSessionSecret");
const developmentSecretHolder = globalThis as { [developmentSecretKey]?: string };
const developmentSessionSecret = (developmentSecretHolder[developmentSecretKey] ??=
  randomBytes(32).toString("base64url"));

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
  let membershipRole: "owner" | "manager" | "member" = "member";
  let organizationId: string | undefined;
  try {
    const memberships = OrganizationRepository.membershipsForUser(user.id);
    const hasOwner = memberships.some((m) => m.membershipRole === "owner");
    const hasManager = memberships.some((m) => m.membershipRole === "manager");
    membershipRole = hasOwner ? "owner" : hasManager ? "manager" : "member";
    organizationId = memberships[0]?.organizationId;
  } catch {
    // Database or membership record lookup may fail during isolated setup
  }
  return {
    userId: user.id,
    displayName: user.displayName,
    credentials: user.credentials,
    role: user.role,
    membershipRole,
    organizationId,
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

/**
 * Whether an owner or manager has additionally designated this member as HR personnel.
 * Read from the membership row rather than inferred, so revoking it is one write.
 */
function hasHrDesignation(actor: ProviderContext): boolean {
  try {
    return OrganizationRepository.membershipsForUser(actor.userId).some(
      (membership) => membership.hrAccess === "designated",
    );
  } catch {
    // A lookup that cannot run is not a grant.
    return false;
  }
}

function resolveGovernanceRole(actor: ProviderContext): "owner" | "manager" | "member" {
  if (actor.membershipRole) return actor.membershipRole;
  try {
    const memberships = OrganizationRepository.membershipsForUser(actor.userId);
    if (memberships.some((m) => m.membershipRole === "owner")) return "owner";
    if (memberships.some((m) => m.membershipRole === "manager")) return "manager";
  } catch {
    // Lookup unavailable
  }
  return "member";
}

export function hasPermission(actor: ProviderContext, permission: ClinicalPermission): boolean {
  if (actor.capabilities) {
    return actor.capabilities.includes(permission);
  }
  const permissions = rolePermissions[actor.role];
  if (permissions && permissions.has(permission)) return true;

  const govRole = resolveGovernanceRole(actor);
  if (govRole === "owner" || govRole === "manager") {
    if (
      permission === "manage_organization" ||
      permission === "manage_templates" ||
      permission === "view_financial" ||
      permission === "manage_integrations" ||
      permission === "manage_hr"
    ) {
      return true;
    }
  }

  // A designated HR administrator reaches employee records and nothing else.
  if (permission === "manage_hr" && hasHrDesignation(actor)) return true;

  return false;
}

export function permissionsForActor(actor: ProviderContext): ClinicalPermission[] {
  if (actor.capabilities) return [...actor.capabilities];
  const base = new Set<ClinicalPermission>(rolePermissions[actor.role] ?? []);
  const govRole = resolveGovernanceRole(actor);
  if (govRole === "owner" || govRole === "manager") {
    base.add("manage_organization");
    base.add("manage_templates");
    base.add("view_financial");
    base.add("manage_integrations");
    base.add("manage_hr");
  } else if (hasHrDesignation(actor)) {
    base.add("manage_hr");
  }
  return [...base];
}

export function assertPermission(actor: ProviderContext, permission: ClinicalPermission): void {
  if (!hasPermission(actor, permission)) {
    throw new Error(`User ${actor.userId} (${actor.role}) lacks permission: ${permission}`);
  }
}
