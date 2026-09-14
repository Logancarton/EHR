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
import { resetPatientRoster } from "../../lib/patient-roster";
import {
  installAuthenticationFailureObserver,
  subscribeToAuthenticationFailure,
  validateSessionRecoveryMatch,
} from "../../lib/session-expiry";
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
  /**
   * The session went away while the workspace was open.
   *
   * Deliberately not "set session to null". The workspace holds unsaved clinical
   * work — drafts, open charts, scroll positions — and dropping to the sign-in page
   * unmounts all of it, so an expired cookie would destroy a half-written note. The
   * workspace stays mounted and inert behind a challenge instead.
   */
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mismatch, setMismatch] = useState<{
    previousUser: CurrentUser;
    newUser: CurrentUser;
    newSession: CurrentAuthSession;
  } | null>(null);
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
      const current = await loadCurrentSession();
      if (current) {
        setSession(current);
        setExpired(false);
      } else {
        // Nothing on the server. If a workspace is open, challenge over it rather
        // than unmounting it; only someone who never had a session sees the page.
        setSession((previous) => {
          if (previous) setExpired(true);
          return previous;
        });
      }
    } catch (cause) {
      // A transport failure is not an expired session, and must not be treated as
      // one: the clinician is offline or the server restarted, and throwing them
      // at a sign-in form they cannot reach helps nobody.
      setError(cause instanceof Error ? cause.message : "Could not verify this session.");
    } finally {
      setChecking(false);
    }
  }, []);

  /**
   * A refused request asks the server whether the session is really gone.
   *
   * The 401 itself is only a suspicion — one refused route, or a race against a
   * sign-in, must not eject anyone. `reportAuthenticationFailure` has already
   * collapsed the burst of simultaneous failures into this single question.
   */
  useEffect(() => {
    // Installed here because the gate is the one component mounted for every
    // authenticated surface, and it is the thing that acts on the answer.
    installAuthenticationFailureObserver();
    return subscribeToAuthenticationFailure(() => {
      void refreshUser();
    });
  }, [refreshUser]);

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
      const newSession = await loginWithPassword(username.trim(), password);
      // Identity boundary: resuming an expired workspace is only safe for the clinician
      // who owns the mounted charts and drafts. Another account requires an explicit transition.
      if (expired && session && !validateSessionRecoveryMatch(session.user.userId, newSession.user.userId).matches) {
        setMismatch({
          previousUser: session.user,
          newUser: newSession.user,
          newSession,
        });
        return;
      }
      setSession(newSession);
      setPassword("");
      setExpired(false);
      setMismatch(null);
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
      const newSession = await loginAsDevelopmentUser(userId);
      if (expired && session && !validateSessionRecoveryMatch(session.user.userId, newSession.user.userId).matches) {
        setMismatch({
          previousUser: session.user,
          newUser: newSession.user,
          newSession,
        });
        return;
      }
      setSession(newSession);
      setExpired(false);
      setMismatch(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Development login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function confirmAccountSwitch(newSession: CurrentAuthSession) {
    // A clean transition between clinicians: drop previous user's roster,
    // clear mismatch, and switch identity. The key on authenticated-app
    // remounts the workspace so no patient charts bleed over.
    resetPatientRoster();
    setMismatch(null);
    setExpired(false);
    setPassword("");
    setSession(newSession);
  }

  async function cancelAccountSwitch() {
    setSubmitting(true);
    try {
      await logoutCurrentUser();
    } finally {
      setMismatch(null);
      setPassword("");
      setSubmitting(false);
    }
  }

  async function handleSwitchUserDirectly() {
    setSubmitting(true);
    setExpired(false);
    setMismatch(null);
    setSession(null);
    resetPatientRoster();
    try {
      await logoutCurrentUser();
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
          // The roster is access-filtered for the person who was signed in. Dropping
          // it here means the next sign-in loads its own rather than briefly showing
          // the previous clinician's patients.
          resetPatientRoster();
          setExpired(false);
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

  // An expired session keeps its workspace: the challenge renders over it below.
  if ((!session || !contextValue) && !expired) {
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
                <button type="button" disabled={submitting} onClick={() => developmentLogin("team-pmhnp")}>Alex Rivera · PMHNP</button>
                <button type="button" disabled={submitting} onClick={() => developmentLogin("team-morgan")}>Morgan Reed · Practice Manager & Biller</button>
                <button type="button" disabled={submitting} onClick={() => developmentLogin("team-casey")}>Casey · Clinical assistant</button>
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  // Unreachable in practice — `expired` is only set while a session exists — but the
  // gate must never render a workspace with no identity behind it.
  if (!session || !contextValue) return null;

  const { user, permissions } = session;
  return (
    <AuthSessionContext.Provider value={contextValue}>
      <div
        key={user.userId}
        className={`authenticated-app role-${user.role}`}
        data-ehr-role={user.role}
        data-session-expired={expired ? "true" : undefined}
        data-can-sign-encounter={permissions.includes("sign_encounter") ? "true" : "false"}
        data-can-authorize-order={permissions.includes("authorize_order") ? "true" : "false"}
        data-can-transmit-order={permissions.includes("transmit_order") ? "true" : "false"}
        /* Everything beneath the challenge stops taking focus and clicks. The
           permissions in this render are the ones that just stopped being valid,
           so the controls they drew must not be reachable while it is up. */
        inert={expired || undefined}
      >
        <span className="sr-only">Signed in as {user.displayName}, {userRoleLabel(user.role)}</span>
        {children}
      </div>

      {expired && (
        <div className="auth-challenge" role="dialog" aria-modal="true" aria-labelledby="ehr-session-expired-title">
          <section className="auth-card auth-challenge-card">
            <div className="auth-brand-row">
              <div className="auth-brand-mark"><Icon name="lock" /></div>
              <div>
                <strong>Clinical Bond</strong>
                <span>Session ended</span>
              </div>
            </div>

            {mismatch ? (
              <div className="auth-mismatch-panel">
                <div className="auth-heading">
                  <h1 id="ehr-session-expired-title">Account mismatch</h1>
                  <p>
                    You authenticated as <strong>{mismatch.newUser.displayName}</strong>, but this
                    workspace belongs to <strong>{mismatch.previousUser.displayName}</strong> and currently holds
                    their open patient charts and unsaved drafts.
                  </p>
                </div>

                <div className="auth-mismatch-warning" role="alert">
                  Resuming this workspace is only permitted for {mismatch.previousUser.displayName}.
                  Switching accounts will discard the previous workspace to protect patient record boundaries.
                </div>

                <div className="auth-mismatch-actions">
                  <button
                    type="button"
                    className="auth-primary"
                    disabled={submitting}
                    onClick={() => confirmAccountSwitch(mismatch.newSession)}
                  >
                    Switch to {mismatch.newUser.displayName} (discards workspace)
                  </button>
                  <button
                    type="button"
                    className="auth-secondary-btn"
                    disabled={submitting}
                    onClick={cancelAccountSwitch}
                  >
                    Cancel and sign in as {mismatch.previousUser.displayName}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="auth-heading">
                  <h1 id="ehr-session-expired-title">Your session expired</h1>
                  <p>
                    Sign in to continue as <strong>{user.displayName}</strong>. Your open charts and unsaved drafts are still here —
                    nothing was closed, and nothing was sent while the session was gone.
                  </p>
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

                <p className="auth-hint">
                  Anything that failed while the session was gone shows its own error and a way to
                  try again; re-signing in does not retry it for you.
                </p>

                {process.env.NODE_ENV !== "production" && (
                  <div className="auth-development">
                    <div className="auth-divider"><span>Local prototype</span></div>
                    <div className="auth-development-users">
                      <button type="button" disabled={submitting} onClick={() => developmentLogin(user.userId)}>
                        Sign back in as {user.displayName}
                      </button>
                    </div>
                  </div>
                )}

                <div className="auth-challenge-footer">
                  <button
                    type="button"
                    className="auth-link-button"
                    disabled={submitting}
                    onClick={handleSwitchUserDirectly}
                  >
                    Switch account (discards workspace)
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </AuthSessionContext.Provider>
  );
}
