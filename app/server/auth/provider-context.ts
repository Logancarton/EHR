import { createHmac, timingSafeEqual } from "node:crypto";

export type ProviderRole = "provider" | "staff" | "clinical_assistant";

export type ClinicalPermission =
  | "read_clinical"
  | "edit_draft"
  | "sign_encounter"
  | "stage_order"
  | "authorize_order"
  | "send_message"
  | "manage_tasks"
  | "manage_appointments"
  | "edit_patient"
  | "manage_clinical_record"
  | "acknowledge_result"
  | "amend_signed_record"
  | "collaborate_team"
  | "manage_team_tasks";

export type ProviderContext = {
  userId: string;
  displayName: string;
  credentials?: string;
  role: ProviderRole;
};

type ProviderSession = ProviderContext & { issuedAt: number; expiresAt: number };
export const EHR_SESSION_COOKIE = "ehr_session";

const prototypeProvider: ProviderContext = {
  userId: "prototype-provider",
  displayName: "Prototype Provider",
  role: "provider",
};

const rolePermissions: Record<ProviderRole, ReadonlySet<ClinicalPermission>> = {
  provider: new Set<ClinicalPermission>([
    "read_clinical", "edit_draft", "sign_encounter", "stage_order", "authorize_order",
    "send_message", "manage_tasks", "manage_appointments", "edit_patient",
    "manage_clinical_record", "acknowledge_result", "amend_signed_record",
    "collaborate_team", "manage_team_tasks",
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

function sessionSecret(): string | null {
  const secret = process.env.EHR_SESSION_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeSignatureEqual(left: string, right: string): boolean {
  try {
    const a = Buffer.from(left, "base64url");
    const b = Buffer.from(right, "base64url");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}

function cookieValue(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}

function validRole(value: unknown): value is ProviderRole {
  return value === "provider" || value === "staff" || value === "clinical_assistant";
}

function decodeSession(token: string): ProviderContext | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  if (!safeSignatureEqual(signature, signPayload(encoded, secret))) return null;
  try {
    const session = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ProviderSession;
    if (!session.userId || !session.displayName || !validRole(session.role) ||
        !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) return null;
    return { userId: session.userId, displayName: session.displayName, credentials: session.credentials, role: session.role };
  } catch { return null; }
}

export function createProviderSessionToken(actor: ProviderContext, ttlMs = 8 * 60 * 60 * 1000): string {
  const secret = sessionSecret();
  if (!secret) throw new Error("EHR_SESSION_SECRET must be configured before issuing sessions.");
  const issuedAt = Date.now();
  const session: ProviderSession = { ...actor, issuedAt, expiresAt: issuedAt + ttlMs };
  const encoded = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${encoded}.${signPayload(encoded, secret)}`;
}

export function getProviderContext(request?: Request): ProviderContext {
  if (request) {
    const token = cookieValue(request, EHR_SESSION_COOKIE);
    if (token) {
      const actor = decodeSession(token);
      if (actor) return actor;
    }
  }
  if (process.env.NODE_ENV !== "production") return prototypeProvider;
  throw new Error("Authentication required: valid EHR session not found.");
}

export function providerLabel(actor: ProviderContext): string {
  return actor.credentials ? `${actor.displayName}, ${actor.credentials}` : actor.displayName;
}

export function hasPermission(actor: ProviderContext, permission: ClinicalPermission): boolean {
  return rolePermissions[actor.role].has(permission);
}

export function assertPermission(actor: ProviderContext, permission: ClinicalPermission): void {
  if (!hasPermission(actor, permission)) {
    throw new Error(`User ${actor.userId} (${actor.role}) lacks permission: ${permission}`);
  }
}
