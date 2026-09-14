"use client";

/**
 * The signal that says a request was refused for want of a session.
 *
 * Every clinical surface fetches independently, so an expired session does not
 * arrive as one event — it arrives as five or ten simultaneous 401s from whatever
 * the workspace happened to be loading. This hub collapses them into one challenge:
 * the first refusal in a window is reported, the rest are swallowed, and the
 * listener re-verifies once rather than once per surface.
 *
 * A 401 is a *suspicion*, never a verdict. Whether the session is actually gone is
 * decided by asking the server, which is the listener's job (`AuthSessionGate`), not
 * this module's. Signing someone out of a workspace holding unsaved clinical work on
 * the strength of one refused request would be the worse defect.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** How long after one report further reports are treated as the same event. */
export const AUTH_FAILURE_COALESCE_MS = 1_500;

let lastReportedAt = 0;

export function subscribeToAuthenticationFailure(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Reports a refused request. Returns whether this one was passed on, which is what
 * the tests assert against — a burst of simultaneous failures must produce one
 * challenge, not one per surface.
 */
export function reportAuthenticationFailure(now: number = Date.now()): boolean {
  if (now - lastReportedAt < AUTH_FAILURE_COALESCE_MS) return false;
  lastReportedAt = now;
  for (const listener of listeners) listener();
  return true;
}

/** Test seam: forgets the coalescing window and every listener. */
export function resetAuthenticationFailureReporting(): void {
  listeners.clear();
  lastReportedAt = 0;
}

/**
 * Endpoints whose own 401 is an answer rather than a symptom.
 *
 * `/api/auth/me` returning 401 *is* the session check; reporting it would ask the
 * question that produced it. A refused sign-in is a wrong password, not a lapsed
 * session.
 */
const NOT_A_SYMPTOM = ["/api/auth/me", "/api/auth/login", "/api/auth/logout", "/api/auth/activate"];

let observerInstalled = false;

/**
 * Watches every response the page gets for a refused session.
 *
 * Thirteen modules in `app/lib` have their own small fetch helper, and only one of
 * them is `api-client`. Hooking each would work today and be wrong tomorrow, when
 * the fourteenth is written without the hook and its expired-session failure goes
 * back to rendering as an error card inside a workspace that still looks signed in.
 *
 * So this observes at the one place every one of them passes through. It reads
 * `response.status` and nothing else: it does not alter the request, consume the
 * body, change the response, or swallow a rejection. Reporting is idempotent, so a
 * helper that also reports for itself costs nothing.
 *
 * The durable fix is one shared client for all thirteen; this is deliberately not
 * that, and should be removed when that exists.
 */
export function installAuthenticationFailureObserver(): void {
  if (observerInstalled || typeof window === "undefined") return;
  observerInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await nativeFetch(input, init);
    try {
      if (response.status === 401) {
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
          window.location.origin,
        );
        if (
          url.origin === window.location.origin &&
          url.pathname.startsWith("/api/") &&
          !NOT_A_SYMPTOM.includes(url.pathname)
        ) {
          reportAuthenticationFailure();
        }
      }
    } catch {
      // Observing must never be able to break the request it is watching.
    }
    return response;
  };
}

/** Whether the request at this path should raise a session challenge on a 401. */
export function isSessionSymptom(pathname: string): boolean {
  return pathname.startsWith("/api/") && !NOT_A_SYMPTOM.includes(pathname);
}
