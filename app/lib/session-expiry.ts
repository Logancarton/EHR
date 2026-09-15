"use client";

/**
 * The signal that says a request was refused for want of a session.
 *
 * Every clinical surface fetches independently, so an expired session does not
 * arrive as one event — it arrives as five or ten simultaneous 401s from whatever
 * the workspace happened to be loading, and then as a steady trickle from the
 * pollers that keep running while the challenge is on screen. This hub collapses
 * all of it into one challenge: a refusal is reported only when the hub does not
 * already know the answer, and the listener re-verifies once rather than once per
 * refused surface.
 *
 * A 401 is a *suspicion*, never a verdict. Whether the session is actually gone is
 * decided by asking the server, which is the listener's job (`AuthSessionGate`), not
 * this module's. Signing someone out of a workspace holding unsaved clinical work on
 * the strength of one refused request would be the worse defect.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * What the hub currently believes, and therefore whether a refusal is news.
 *
 * - `idle` — nothing known to be wrong. A refusal is worth asking about.
 * - `verifying` — a check is in flight. The burst of simultaneous 401s that
 *   arrives with an expiry lands here and is swallowed.
 * - `challenged` — the check came back and there is no session; the overlay is up.
 *   Further refusals teach nobody anything, so they are swallowed too.
 */
type ReportingState = "idle" | "verifying" | "challenged";

let state: ReportingState = "idle";
let stateEnteredAt = 0;

/**
 * How the verification that a report triggered turned out.
 *
 * `unknown` is a transport failure rather than an answer — the server did not say
 * the session was gone, it did not say anything — so the hub returns to `idle` and
 * the next refusal is allowed to ask again.
 */
export type AuthenticationVerificationOutcome = "session-valid" | "session-gone" | "unknown";

/**
 * A latch that has been held this long without settling is assumed stuck.
 *
 * Purely a safety valve, not the mechanism. The hub cannot see its listener, so a
 * gate that unmounts mid-verification — or any path that fails to settle — would
 * otherwise hold the latch forever and a genuine later expiry would never
 * challenge. Silence about an expired session is the worse failure, so after this
 * long the hub lets a refusal through again.
 */
export const STALE_VERIFICATION_CEILING_MS = 30_000;

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
 *
 * This used to coalesce on a 1,500 ms window, which made "one expiry is one
 * question" true only for refusals that happened to arrive close together. The
 * workspace stays mounted while the challenge is up and its pollers keep running,
 * so a session that stayed expired asked the server again every 1.5 seconds, for
 * as long as the overlay was on screen. The question is now latched to the state of
 * the enquiry rather than to the clock: it is asked when something is not known,
 * and not asked again until the answer changes.
 */
export function reportAuthenticationFailure(now: number = Date.now()): boolean {
  if (state !== "idle" && now - stateEnteredAt < STALE_VERIFICATION_CEILING_MS) return false;

  state = "verifying";
  stateEnteredAt = now;
  for (const listener of listeners) listener();
  return true;
}

/**
 * Records how the verification turned out, which is what releases the latch.
 *
 * Called for every check the gate performs, not only the ones a refusal triggered:
 * a focus re-check that finds a healthy session is just as good a reason to stop
 * suppressing, and one that finds nothing is just as good a reason to keep
 * suppressing.
 */
export function settleAuthenticationVerification(
  outcome: AuthenticationVerificationOutcome,
  now: number = Date.now(),
): void {
  state = outcome === "session-gone" ? "challenged" : "idle";
  stateEnteredAt = now;
}

/**
 * The challenge is over — someone signed in, or switched account.
 *
 * Distinct from settling a verification: this is the human resolving it rather
 * than the server answering, and it is what lets the *next* expiry be reported.
 */
export function clearAuthenticationChallenge(now: number = Date.now()): void {
  state = "idle";
  stateEnteredAt = now;
}

/** Test seam, and a readable name for "what does the hub think right now". */
export function authenticationReportingState(): ReportingState {
  return state;
}

/** Test seam: forgets the latch and every listener. */
export function resetAuthenticationFailureReporting(): void {
  listeners.clear();
  state = "idle";
  stateEnteredAt = 0;
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

/**
 * Verifies that a re-authentication credential belongs to the workspace owner.
 *
 * Logan's DB-1 review: "Session recovery needs an identity boundary. Keeping drafts
 * mounted during expiration is valuable, but the login handler accepts another
 * account without first checking that it matches the workspace owner. That risks
 * retaining the previous user’s charts and state. Resume should verify identity
 * and access; account switching needs a separate, safe transition."
 */
export function validateSessionRecoveryMatch(
  currentOwnerId: string,
  authenticatedUserId: string,
): { matches: boolean; reason?: string } {
  if (currentOwnerId === authenticatedUserId) {
    return { matches: true };
  }
  return {
    matches: false,
    reason: "Authenticated user does not match the active workspace owner.",
  };
}

