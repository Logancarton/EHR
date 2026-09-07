"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type CurrentUser,
  loadCurrentUser,
  loginAsDevelopmentUser,
  loginWithPassword,
  logoutCurrentUser,
  userRoleLabel,
} from "../../lib/auth-client";

type AuthSessionContextValue = {
  user: CurrentUser;
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
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const refreshUser = useCallback(async () => {
    try {
      const current = await loadCurrentUser();
      setUser(current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify this session.");
      setUser(null);
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

  async function submitPasswordLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    setError("");
    try {
      setUser(await loginWithPassword(username.trim(), password));
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
      setUser(await loginAsDevelopmentUser(userId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Development login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const contextValue = useMemo<AuthSessionContextValue | null>(() => {
    if (!user) return null;
    return {
      user,
      refreshUser,
      logout: async () => {
        try {
          await logoutCurrentUser();
        } finally {
          setUser(null);
        }
      },
    };
  }, [user, refreshUser]);

  if (checking) {
    return (
      <main className="auth-shell" aria-busy="true">
        <section className="auth-card auth-checking">
          <div className="auth-brand-mark">✦</div>
          <strong>Opening your clinical workspace…</strong>
          <span>Verifying the current EHR session</span>
        </section>
      </main>
    );
  }

  if (!user || !contextValue) {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="ehr-sign-in-title">
          <div className="auth-brand-row">
            <div className="auth-brand-mark">✦</div>
            <div>
              <strong>EHR Workspace</strong>
              <span>Clinical operating system</span>
            </div>
          </div>

          <div className="auth-heading">
            <h1 id="ehr-sign-in-title">Sign in</h1>
            <p>Your identity follows every clinical action, note, order, and audit event.</p>
          </div>

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
          </form>

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

  return (
    <AuthSessionContext.Provider value={contextValue}>
      <div className={`authenticated-app role-${user.role}`} data-ehr-role={user.role}>
        <span className="sr-only">Signed in as {user.displayName}, {userRoleLabel(user.role)}</span>
        {children}
      </div>
    </AuthSessionContext.Provider>
  );
}
