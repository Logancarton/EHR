import assert from "node:assert/strict";
import test from "node:test";
import { createDeferredGestureGuard, createWindowGestureOwnership } from "../app/lib/window-gesture";

test("owning pointer can move and unrelated pointer cannot complete movement", () => {
  const ownership = createWindowGestureOwnership();
  const move = ownership.begin("move", 11);

  assert.deepEqual(move, { kind: "move", pointerId: 11, token: 1 });
  assert.equal(ownership.owns(11, "move"), true);
  assert.equal(ownership.complete(22), null);
  assert.equal(ownership.current(), move);
  assert.deepEqual(ownership.complete(11), move);
  assert.equal(ownership.current(), null);
});

test("owning pointer can resize and non-owning cancellation is ignored", () => {
  const ownership = createWindowGestureOwnership();
  const resize = ownership.begin("resize", 31);

  assert.equal(ownership.owns(31, "resize"), true);
  assert.equal(ownership.cancel(32), null);
  assert.equal(ownership.current(), resize);
  assert.deepEqual(ownership.complete(31), resize);
});

test("pointercancel clears movement ownership", () => {
  const ownership = createWindowGestureOwnership();
  ownership.begin("move", 41);

  assert.equal(ownership.cancel(41)?.kind, "move");
  assert.equal(ownership.current(), null);
  assert.equal(ownership.complete(41), null);
});

test("pointercancel clears resize ownership", () => {
  const ownership = createWindowGestureOwnership();
  ownership.begin("resize", 51);

  assert.equal(ownership.cancel(51)?.kind, "resize");
  assert.equal(ownership.current(), null);
  assert.equal(ownership.complete(51), null);
});

test("Escape and blur share the same cancellation outcome", () => {
  const escapeOwnership = createWindowGestureOwnership();
  escapeOwnership.begin("move", 61);
  assert.equal(escapeOwnership.cancel()?.pointerId, 61);
  assert.equal(escapeOwnership.current(), null);

  const blurOwnership = createWindowGestureOwnership();
  blurOwnership.begin("resize", 62);
  assert.equal(blurOwnership.cancel()?.pointerId, 62);
  assert.equal(blurOwnership.current(), null);
});

test("canceled move cannot later complete docking or snapping", () => {
  const ownership = createWindowGestureOwnership();
  ownership.begin("move", 71);
  ownership.cancel();

  assert.equal(ownership.complete(71), null);
  assert.equal(ownership.owns(71), false);
});

test("pane removal and controller cleanup can clear gesture ownership without a pointer event", () => {
  const ownership = createWindowGestureOwnership();
  const first = ownership.begin("move", 81);
  assert.equal(ownership.cancel(), first);
  assert.equal(ownership.current(), null);

  const second = ownership.begin("resize", 82);
  assert.equal(second?.token, 2);
  assert.equal(ownership.cancel(), second);
});

test("stale deferred snap callback is ignored after cancellation", () => {
  const guard = createDeferredGestureGuard();
  const released = guard.issue();
  assert.equal(guard.isCurrent(released), true);

  guard.invalidate();
  assert.equal(guard.isCurrent(released), false);
});

test("new gesture invalidates an older deferred snap release", () => {
  const guard = createDeferredGestureGuard();
  const olderRelease = guard.issue();

  guard.invalidate();
  const newerRelease = guard.issue();

  assert.equal(guard.isCurrent(olderRelease), false);
  assert.equal(guard.isCurrent(newerRelease), true);
});

test("legitimate owning release remains eligible for deferred snap completion", () => {
  const ownership = createWindowGestureOwnership();
  const guard = createDeferredGestureGuard();
  const gesture = ownership.begin("move", 91);

  assert.deepEqual(ownership.complete(91), gesture);
  const release = guard.issue();
  assert.equal(guard.isCurrent(release), true);
});
