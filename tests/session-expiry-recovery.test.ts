import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_FAILURE_COALESCE_MS,
  reportAuthenticationFailure,
  resetAuthenticationFailureReporting,
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
  assert.equal(reportAuthenticationFailure(start + 5), false);
  assert.equal(reportAuthenticationFailure(start + 40), false);
  assert.equal(reportAuthenticationFailure(start + AUTH_FAILURE_COALESCE_MS - 1), false);

  assert.equal(challenges, 1, "one expiry is one question to the server, not one per surface");

  // A later, separate failure is its own event.
  assert.equal(reportAuthenticationFailure(start + AUTH_FAILURE_COALESCE_MS), true);
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
