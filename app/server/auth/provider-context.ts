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
  | "edit_patient";

export type ProviderContext = {
  userId: string;
  displayName: string;
  credentials?: string;
  role: ProviderRole;
};

const prototypeProvider: ProviderContext = {
  userId: "prototype-provider",
  displayName: "Prototype Provider",
  role: "provider",
};

const rolePermissions: Record<ProviderRole, ReadonlySet<ClinicalPermission>> = {
  provider: new Set<ClinicalPermission>([
    "read_clinical",
    "edit_draft",
    "sign_encounter",
    "stage_order",
    "authorize_order",
    "send_message",
    "manage_tasks",
    "manage_appointments",
    "edit_patient",
  ]),
  staff: new Set<ClinicalPermission>([
    "read_clinical",
    "edit_draft",
    "stage_order",
    "send_message",
    "manage_tasks",
    "manage_appointments",
  ]),
  clinical_assistant: new Set<ClinicalPermission>([
    "read_clinical",
    "edit_draft",
    "stage_order",
    "manage_tasks",
  ]),
};

function parseRole(value: string | null): ProviderRole {
  if (value === "staff" || value === "clinical_assistant" || value === "provider") {
    return value;
  }
  return prototypeProvider.role;
}

/**
 * Prototype request-scoped identity resolver.
 *
 * Production authentication can replace this function without changing services or
 * action handlers. Until then, callers may supply identity through trusted server-side
 * headers. Never treat browser-supplied identity headers as production authentication.
 */
export function getProviderContext(request?: Request): ProviderContext {
  if (!request) return prototypeProvider;

  return {
    userId: request.headers.get("x-ehr-user-id")?.trim() || prototypeProvider.userId,
    displayName:
      request.headers.get("x-ehr-user-name")?.trim() || prototypeProvider.displayName,
    credentials: request.headers.get("x-ehr-user-credentials")?.trim() || undefined,
    role: parseRole(request.headers.get("x-ehr-user-role")),
  };
}

export function providerLabel(actor: ProviderContext): string {
  return actor.credentials
    ? `${actor.displayName}, ${actor.credentials}`
    : actor.displayName;
}

export function hasPermission(
  actor: ProviderContext,
  permission: ClinicalPermission,
): boolean {
  return rolePermissions[actor.role].has(permission);
}

export function assertPermission(
  actor: ProviderContext,
  permission: ClinicalPermission,
): void {
  if (!hasPermission(actor, permission)) {
    throw new Error(
      `User ${actor.userId} (${actor.role}) lacks permission: ${permission}`,
    );
  }
}
