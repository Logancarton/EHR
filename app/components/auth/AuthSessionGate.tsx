"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { ClinicalPermission } from "../../server/auth/provider-context";
import {
  type CurrentAuthSession,
  type CurrentUser,
  activateAccount,
  loadCurrentSession,
  loginAsDevelopmentUser,
  loginWithPassword,
  logoutCurrentUser,
  userRoleLabel,
} from "../../lib/auth-client";
import Icon from "../ui/Icon";

type AuthSessionContextValue = {
  user: CurrentUser;
  permissions: ClinicalPermission[];
  hasPermission: (permission: ClinicalPermission) => boolean;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function useAuthSession(): AuthSessionContextValue {
  const value = useContext(AuthSessionContext);
  if (!value) throw new Error("useAuthSession must be used inside AuthSessionGate.");
  return value;
}

export default function AuthSessionGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CurrentAuthSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Activation is part of the sign-in card rather than its own route: the person
  // redeeming a token has no session, so this is the only surface they can reach.
  const [mode, setMode] = useState<"signin" | "activate">("signin");
  const [activationToken, setActivationToken] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    // The launcher opens `/?activate=<token>` on first run, so the token is filled
    // in for the holder rather than pasted by hand.
    if (typeof window === "undefined") return;
    const fromLink = new URLSearchParams(window.location.search).get("activate");
    if (!fromLink) return;
    setActivationToken(fromLink);
    setMode("activate");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  async function submitActivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("The two passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const activated = await activateAccount(activationToken.trim(), username.trim(), password);
      setMode("signin");
      setPassword("");
      setConfirmPassword("");
      setActivationToken("");
      setNotice(`Account activated for ${activated.displayName}. Sign in with your new password.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Activation failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const refreshUser = useCallback(async () => {
    try {
      setSession(await loadCurrentSession());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify this session.");
      setSession(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
    const handleFocus = () => void refreshUser();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshUser]);

  async function submitPasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    setError("");
    try {
      setSession(await loginWithPassword(username.trim(), password));
      setPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function developmentLogin(userId: string) {
    setSubmitting(true);
    setError("");
    try {
      setSession(await loginAsDevelopmentUser(userId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Development login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const contextValue = useMemo<AuthSessionContextValue | null>(() => {
    if (!session) return null;
    const permissionSet = new Set(session.permissions);
    return {
      user: session.user,
      permissions: session.permissions,
      hasPermission: (permission) => permissionSet.has(permission),
      refreshUser,
      logout: async () => {
        try {
          await logoutCurrentUser();
        } finally {
          setSession(null);
        }
      },
    };
  }, [session, refreshUser]);

  if (checking) {
    return (
      <main className="auth-shell" aria-busy="true">
        <section className="auth-card auth-checking">
          <div className="auth-brand-mark"><Icon name="auto_awesome" /></div>
          <strong>Opening your clinical workspace…</strong>
          <span>Verifying the current EHR session</span>
        </section>
      </main>
    );
  }

  if (!session || !contextValue) {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="ehr-sign-in-title">
          <div className="auth-brand-row">
            <div className="auth-brand-mark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/clinical-bond-mark.png" alt="" width={30} height={30} />
            </div>
            <div>
              <strong>Clinical Bond</strong>
              <span>Clinical operating system</span>
            </div>
          </div>

          <div className="auth-heading">
            <h1 id="ehr-sign-in-title">{mode === "activate" ? "Activate your account" : "Sign in"}</h1>
            <p>
              {mode === "activate"
                ? "Choose the username and password you will use from now on. Nobody else sees them."
                : "Your identity follows every clinical action, note, order, and audit event."}
            </p>
          </div>

          {notice && <div className="auth-notice" role="status">{notice}</div>}

          {mode === "activate" ? (
          <form className="auth-form" onSubmit={submitActivation}>
            <label>
              Activation token
              <input
                value={activationToken}
                onChange={(event) => setActivationToken(event.target.value)}
                disabled={submitting}
                placeholder="Paste the token from your activation link"
              />
            </label>
            <label>
              Choose a username
              <input
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={submitting}
              />
            </label>
            <label>
              Choose a password
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={submitting}
              />
            </label>
            <p className="auth-hint">At least 12 characters.</p>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button
              className="auth-primary"
              type="submit"
              disabled={submitting || !activationToken.trim() || !username.trim() || password.length < 12}
            >
              {submitting ? "Activating…" : "Activate account"}
            </button>
            <button
              className="auth-secondary"
              type="button"
              disabled={submitting}
              onClick={() => { setMode("signin"); setError(""); }}
            >
              Back to sign in
            </button>
          </form>
          ) : (
          <>
          <form className="auth-form" onSubmit={submitPasswordLogin}>
            <label>
              Username
              <input
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={submitting}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
              />
            </label>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="auth-primary" type="submit" disabled={submitting || !username.trim() || !password}>
              {submitting ? "Signing in…" : "Continue"}
            </button>
            <button
              className="auth-secondary"
              type="button"
              disabled={submitting}
              onClick={() => { setMode("activate"); setError(""); setNotice(""); }}
            >
              I have an activation link
            </button>
          </form>
          </>
          )}

          {process.env.NODE_ENV !== "production" && (
            <div className="auth-development">
              <div className="auth-divider"><span>Local prototype</span></div>
              <p>Use an authoritative synthetic team member without storing a development password.</p>
              <div className="auth-development-users">
                <button type="button" disabled={submitting} onClick={() => developmentLogin("prototype-provider")}>Prototype provider</button>
                <button type="button" disabled={submitting} onClick={() => developmentLogin("team-taylor")}>Taylor · Provider</button>
                <button type="button" disabled={submitting} onClick={() => developmentLogin("team-casey")}>Casey · Clinical assistant</button>
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  const { user, permissions } = session;
  return (
    <AuthSessionContext.Provider value={contextValue}>
      <div
        className={`authenticated-app role-${user.role}`}
        data-ehr-role={user.role}
        data-can-sign-encounter={permissions.includes("sign_encounter") ? "true" : "false"}
        data-can-authorize-order={permissions.includes("authorize_order") ? "true" : "false"}
        data-can-transmit-order={permissions.includes("transmit_order") ? "true" : "false"}
      >
        <span className="sr-only">Signed in as {user.displayName}, {userRoleLabel(user.role)}</span>
        {children}
      </div>
    </AuthSessionContext.Provider>
  );
}
