import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const floatingPaneSource = readFileSync(new URL("../app/components/FloatingPaneController.tsx", import.meta.url), "utf8");
const windowManagerSource = readFileSync(new URL("../app/components/WorkspaceWindowManager.tsx", import.meta.url), "utf8");
const tabPointerSource = readFileSync(new URL("../app/components/TabPointerController.tsx", import.meta.url), "utf8");

test("floating pane observer is frame-coalesced and chrome writes are idempotent", () => {
  assert.match(floatingPaneSource, /function scheduleScanForPanes\(\)/);
  assert.match(floatingPaneSource, /new MutationObserver\(scheduleScanForPanes\)/);
  assert.match(floatingPaneSource, /window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(floatingPaneSource, /window\.cancelAnimationFrame\(scanFrame\)/);
  assert.doesNotMatch(floatingPaneSource, /new MutationObserver\(scanForPanes\)/);

  assert.match(floatingPaneSource, /if \(button\.textContent !== text\) button\.textContent = text;/);
  assert.match(floatingPaneSource, /if \(button\.disabled !== disabled\) button\.disabled = disabled;/);
  assert.doesNotMatch(floatingPaneSource, /maximize\.textContent = maximized \?/);
  assert.doesNotMatch(floatingPaneSource, /minimize\.textContent = minimized \?/);
});

test("floating pane gestures use explicit pointer ownership and centralized cancellation", () => {
  assert.match(floatingPaneSource, /createWindowGestureOwnership\(\)/);
  assert.match(floatingPaneSource, /gesture\.pointerId !== event\.pointerId/);
  assert.match(floatingPaneSource, /setPointerCapture\(pointerId\)/);
  assert.match(floatingPaneSource, /releasePointerCapture\(pointerId\)/);
  assert.match(floatingPaneSource, /function cancelActiveGesture\(pointerId\?: number\)/);
  assert.match(floatingPaneSource, /window\.addEventListener\("pointercancel", handlePointerCancel\)/);
  assert.match(floatingPaneSource, /window\.addEventListener\("keydown", handleGestureKeyDown\)/);
  assert.match(floatingPaneSource, /window\.addEventListener\("blur", handleWindowBlur\)/);
  assert.match(floatingPaneSource, /cleanupByPane\.set\(pane, \(\) => \{\s+cancelActiveGesture\(\);/);
  assert.match(floatingPaneSource, /WINDOW_GESTURE_START_EVENT/);
  assert.match(floatingPaneSource, /WINDOW_GESTURE_CANCEL_EVENT/);
});

test("window snap completion is bound to the owning gesture and guarded against stale callbacks", () => {
  assert.match(windowManagerSource, /type ActiveMoveGesture = \{/);
  assert.match(windowManagerSource, /pointerId: number;/);
  assert.match(windowManagerSource, /gestureToken: number;/);
  assert.match(windowManagerSource, /event\.pointerId !== active\.pointerId/);
  assert.match(windowManagerSource, /createDeferredGestureGuard\(\)/);
  assert.match(windowManagerSource, /deferredSnapGuard\.invalidate\(\)/);
  assert.match(windowManagerSource, /deferredSnapGuard\.isCurrent\(releaseToken\)/);
  assert.match(windowManagerSource, /WINDOW_GESTURE_START_EVENT/);
  assert.match(windowManagerSource, /WINDOW_GESTURE_CANCEL_EVENT/);
  assert.match(windowManagerSource, /releasedOnTabs/);
  assert.match(windowManagerSource, /!document\.body\.contains\(pane\)/);
  assert.doesNotMatch(windowManagerSource, /querySelector<HTMLElement>\("\.detached-patient-pane\.moving"\)/);
});

test("tab pointer DOM normalization is frame-coalesced and avoids redundant drag writes", () => {
  assert.match(tabPointerSource, /function scheduleDisableNativeTabDragging\(\)/);
  assert.match(tabPointerSource, /new MutationObserver\(scheduleDisableNativeTabDragging\)/);
  assert.match(tabPointerSource, /window\.cancelAnimationFrame\(disableDragFrame\)/);
  assert.doesNotMatch(tabPointerSource, /new MutationObserver\(disableNativeTabDragging\)/);
  assert.match(tabPointerSource, /if \(tab\.draggable\) tab\.draggable = false;/);
  assert.match(tabPointerSource, /if \(tab\.getAttribute\("draggable"\) !== "false"\) tab\.setAttribute\("draggable", "false"\);/);
});

test("tab pointer waits for drag identity state before synthetic reorder drops", () => {
  assert.match(tabPointerSource, /let startedThisMove = false;/);
  assert.match(tabPointerSource, /beginDrag\(event\);\s+startedThisMove = true;/);
  assert.match(tabPointerSource, /if \(!startedThisMove\) maybeReorder\(event\.clientX, event\.clientY\);/);
});
