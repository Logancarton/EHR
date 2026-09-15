import test from "node:test";
import assert from "node:assert/strict";
import {
  STALE_VERIFICATION_CEILING_MS,
  authenticationReportingState,
  clearAuthenticationChallenge,
  reportAuthenticationFailure,
  resetAuthenticationFailureReporting,
  settleAuthenticationVerification,
  subscribeToAuthenticationFailure,
  validateSessionRecoveryMatch,
} from "../app/lib/session-expiry";
import { ApiError, isAuthenticationFailure, isAuthorizationFailure } from "../app/lib/api-error";
import { placeViewportMenu } from "../app/lib/viewport-menu";

/**
 * What happens when a session ends underneath an open workspace.
 *
 * The defect this covers was visible on the dashboard: the roster rendered
 * "Authentication required: session is invalid or expired." inside a shell that
 * still looked signed in, with no way back except knowing to refocus the window.
 * Two things were wrong — the failure did not carry its status, so nothing could
 * tell a dead session from a bad request; and the one path that did notice
 * responded by unmounting the workspace, which would have taken any unsaved note
 * with it.
 */

test("an API failure carries the server's status, not just its sentence", () => {
  const refused = new ApiError("Authentication required: session is invalid or expired.", 401);
  assert.equal(isAuthenticationFailure(refused), true);

  // A 403 is an authenticated person reaching for something that is not theirs.
  // Prompting them to sign in again would be both useless and misleading.
  const forbidden = new ApiError("Patient access denied.", 403);
  assert.equal(isAuthenticationFailure(forbidden), false);
  assert.equal(isAuthorizationFailure(forbidden), true);

  assert.equal(isAuthenticationFailure(new ApiError("Bad request.", 400)), false);
  assert.equal(isAuthenticationFailure(new Error("Authentication required")), false,
    "message text is not evidence of a status");
});

test("a burst of refused requests asks the server once", (t) => {
  t.after(() => resetAuthenticationFailureReporting());
  resetAuthenticationFailureReporting();

  let challenges = 0;
  subscribeToAuthenticationFailure(() => { challenges += 1; });

  const start = 1_000_000;
  // An expired session arrives as every open surface failing at once.
  assert.equal(reportAuthenticationFailure(start), true);
  assert.equal(authenticationReportingState(), "verifying");
  assert.equal(reportAuthenticationFailure(start + 5), false);
  assert.equal(reportAuthenticationFailure(start + 40), false);
  assert.equal(reportAuthenticationFailure(start + 1_400), false);

  assert.equal(challenges, 1, "one expiry is one question to the server, not one per surface");
});

test("a session that stays expired is not re-asked about while the challenge is up", (t) => {
  t.after(() => resetAuthenticationFailureReporting());
  resetAuthenticationFailureReporting();

  let challenges = 0;
  subscribeToAuthenticationFailure(() => { challenges += 1; });

  /**
   * The defect this replaced: coalescing was a 1,500 ms window, so "one expiry is
   * one question" held only for refusals that arrived close together. The workspace
   * stays mounted behind the challenge and its pollers keep running — the presence
   * heartbeat, the schedule sync — so every one of those refusals landed outside
   * the window and asked the server again. An expired session left on screen
   * re-verified every 1.5 seconds for as long as it was there, and the browser test
   * asserting "asks the server once" only passed because it happened to finish
   * inside the window. It failed intermittently under a full suite run, which is
   * how this was found.
   */
  const start = 1_000_000;
  assert.equal(reportAuthenticationFailure(start), true);
  settleAuthenticationVerification("session-gone", start + 200);
  assert.equal(authenticationReportingState(), "challenged");

  // Pollers keep firing for as long as the clinician leaves the overlay up.
  for (const elapsed of [1_500, 3_000, 10_000, 25_000]) {
    assert.equal(
      reportAuthenticationFailure(start + elapsed),
      false,
      `a refusal ${elapsed}ms in must not re-ask a question already answered`,
    );
  }
  assert.equal(challenges, 1, "the answer has not changed, so neither has the question");

  // Signing back in is the human resolving it, and the next expiry is news again.
  clearAuthenticationChallenge(start + 26_000);
  assert.equal(authenticationReportingState(), "idle");
  assert.equal(reportAuthenticationFailure(start + 26_100), true);
  assert.equal(challenges, 2);
});

test("a verification that answers 'still signed in' releases the latch", (t) => {
  t.after(() => resetAuthenticationFailureReporting());
  resetAuthenticationFailureReporting();

  let challenges = 0;
  subscribeToAuthenticationFailure(() => { challenges += 1; });

  // A single refused route against a live session — a race with a sign-in, say.
  // The check says the session is fine, so a later refusal is a fresh suspicion
  // rather than a repeat of one already answered.
  assert.equal(reportAuthenticationFailure(1_000_000), true);
  settleAuthenticationVerification("session-valid", 1_000_100);
  assert.equal(authenticationReportingState(), "idle");
  assert.equal(reportAuthenticationFailure(1_000_200), true);
  assert.equal(challenges, 2);

  // A transport failure is not an answer either way, so it must not latch: the
  // server never said the session was gone, it said nothing at all.
  settleAuthenticationVerification("unknown", 1_000_300);
  assert.equal(authenticationReportingState(), "idle");
  assert.equal(reportAuthenticationFailure(1_000_400), true);
  assert.equal(challenges, 3);
});

test("a latch that never settles gives way rather than silencing a real expiry", (t) => {
  t.after(() => resetAuthenticationFailureReporting());
  resetAuthenticationFailureReporting();

  let challenges = 0;
  subscribeToAuthenticationFailure(() => { challenges += 1; });

  // The hub cannot see its listener. A gate that unmounts mid-verification would
  // hold the latch forever, and silence about an expired session is the worse
  // failure — so the latch expires even though nothing settled it.
  const start = 1_000_000;
  assert.equal(reportAuthenticationFailure(start), true);
  assert.equal(reportAuthenticationFailure(start + STALE_VERIFICATION_CEILING_MS - 1), false);
  assert.equal(
    reportAuthenticationFailure(start + STALE_VERIFICATION_CEILING_MS),
    true,
    "an unsettled latch is a stuck latch, not a permanent one",
  );
  assert.equal(challenges, 2);
});

test("unsubscribing stops the challenge", () => {
  resetAuthenticationFailureReporting();
  let challenges = 0;
  const stop = subscribeToAuthenticationFailure(() => { challenges += 1; });
  stop();
  reportAuthenticationFailure(2_000_000);
  assert.equal(challenges, 0);
  resetAuthenticationFailureReporting();
});

test("session recovery strictly requires identity matching the workspace owner", () => {
  const matching = validateSessionRecoveryMatch("provider-1", "provider-1");
  assert.equal(matching.matches, true);
  assert.equal(matching.reason, undefined);

  const mismatched = validateSessionRecoveryMatch("provider-1", "provider-2");
  assert.equal(mismatched.matches, false);
  assert.ok(mismatched.reason && mismatched.reason.includes("does not match"));
});


/**
 * The other defect in the same screenshots: the daily-metrics menu opened past the
 * bottom of the screen and its last counters could not be reached.
 */

const VIEWPORT = { width: 1440, height: 900 };
const MENU_WIDTH = 312;

test("a menu opened low on the page is capped to the room below it", () => {
  const placement = placeViewportMenu({
    anchor: { top: 700, bottom: 724, left: 1000, right: 1040 },
    menuWidth: MENU_WIDTH,
    viewport: VIEWPORT,
  });

  assert.equal(placement.side, "below");
  assert.ok(
    placement.top + placement.maxHeight <= VIEWPORT.height,
    "the menu must end inside the viewport, not past the bottom edge",
  );
  assert.ok(placement.maxHeight > 0);
});

test("a menu with no room below opens above instead", () => {
  const placement = placeViewportMenu({
    anchor: { top: 840, bottom: 864, left: 1000, right: 1040 },
    menuWidth: MENU_WIDTH,
    viewport: VIEWPORT,
  });

  assert.equal(placement.side, "above");
  assert.ok(placement.top >= 8, "it must not start off the top of the screen either");
  assert.ok(
    placement.top + placement.maxHeight <= 864,
    "an above-opening menu must not cover the button it came from",
  );
});

test("a menu never opens off either side", () => {
  // Anchored at the right edge: right-aligning would push it past the edge.
  const atRight = placeViewportMenu({
    anchor: { top: 100, bottom: 124, left: 1400, right: 1436 },
    menuWidth: MENU_WIDTH,
    viewport: VIEWPORT,
  });
  assert.ok(atRight.left >= 8);
  assert.ok(atRight.left + MENU_WIDTH <= VIEWPORT.width - 8);

  // Anchored at the left edge: right-aligning would give a negative coordinate.
  const atLeft = placeViewportMenu({
    anchor: { top: 100, bottom: 124, left: 4, right: 40 },
    menuWidth: MENU_WIDTH,
    viewport: VIEWPORT,
  });
  assert.ok(atLeft.left >= 8, "a left-edge anchor must not produce a negative position");

  // Narrower than the menu: it starts at the margin rather than off-screen left.
  const narrow = placeViewportMenu({
    anchor: { top: 100, bottom: 124, left: 40, right: 80 },
    menuWidth: MENU_WIDTH,
    viewport: { width: 240, height: 600 },
  });
  assert.equal(narrow.left, 8);
});

test("a cap is never negative, even for a button already off the bottom", () => {
  const placement = placeViewportMenu({
    anchor: { top: 1200, bottom: 1224, left: 100, right: 140 },
    menuWidth: MENU_WIDTH,
    viewport: VIEWPORT,
  });
  assert.ok(placement.maxHeight >= 0, "a nonsensical cap is worse than a small one");
});
