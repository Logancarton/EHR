import type { ProviderContext } from "../server/auth/provider-context";

export type CurrentUser = ProviderContext;

type AuthResponse = {
  success: boolean;
  user?: CurrentUser;
  error?: string;
};

async function parseAuthResponse(response: Response): Promise<AuthResponse> {
  const body = await response.json().catch(() => ({})) as AuthResponse;
  if (!response.ok || body.success === false) {
    throw new Error(body.error || `Authentication request failed (${response.status}).`);
  }
  return body;
}

export async function loadCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });
  if (response.status === 401) return null;
  const body = await parseAuthResponse(response);
  return body.user || null;
}

export async function loginWithPassword(username: string, password: string): Promise<CurrentUser> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ username, password }),
  });
  const body = await parseAuthResponse(response);
  if (!body.user) throw new Error("Login succeeded without a current user.");
  return body.user;
}

export async function loginAsDevelopmentUser(userId: string): Promise<CurrentUser> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ userId }),
  });
  const body = await parseAuthResponse(response);
  if (!body.user) throw new Error("Login succeeded without a current user.");
  return body.user;
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
