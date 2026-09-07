import type {
  ClinicalPermission,
  ProviderContext,
} from "../server/auth/provider-context";

export type CurrentUser = ProviderContext;

export type CurrentAuthSession = {
  user: CurrentUser;
  permissions: ClinicalPermission[];
};

type AuthResponse = {
  success: boolean;
  user?: CurrentUser;
  permissions?: ClinicalPermission[];
  error?: string;
};

async function parseAuthResponse(response: Response): Promise<AuthResponse> {
  const body = await response.json().catch(() => ({})) as AuthResponse;
  if (!response.ok || body.success === false) {
    throw new Error(body.error || `Authentication request failed (${response.status}).`);
  }
  return body;
}

function sessionFromBody(body: AuthResponse): CurrentAuthSession {
  if (!body.user) throw new Error("Authentication succeeded without a current user.");
  return {
    user: body.user,
    permissions: body.permissions || [],
  };
}

export async function loadCurrentSession(): Promise<CurrentAuthSession | null> {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });
  if (response.status === 401) return null;
  return sessionFromBody(await parseAuthResponse(response));
}

export async function loginWithPassword(username: string, password: string): Promise<CurrentAuthSession> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ username, password }),
  });
  return sessionFromBody(await parseAuthResponse(response));
}

export async function loginAsDevelopmentUser(userId: string): Promise<CurrentAuthSession> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ userId }),
  });
  return sessionFromBody(await parseAuthResponse(response));
}

export async function logoutCurrentUser(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
  });
  await parseAuthResponse(response);
}

export function userInitials(user: Pick<CurrentUser, "displayName">): string {
  return user.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "U";
}

export function userRoleLabel(role: CurrentUser["role"]): string {
  if (role === "clinical_assistant") return "Clinical assistant";
  if (role === "staff") return "Staff";
  return "Provider";
}
