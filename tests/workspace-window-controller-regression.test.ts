import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const floatingPaneSource = readFileSync(new URL("../app/components/FloatingPaneController.tsx", import.meta.url), "utf8");
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

test("tab pointer DOM normalization is frame-coalesced and avoids redundant drag writes", () => {
  assert.match(tabPointerSource, /function scheduleDisableNativeTabDragging\(\)/);
  assert.match(tabPointerSource, /new MutationObserver\(scheduleDisableNativeTabDragging\)/);
  assert.match(tabPointerSource, /window\.cancelAnimationFrame\(disableDragFrame\)/);
  assert.doesNotMatch(tabPointerSource, /new MutationObserver\(disableNativeTabDragging\)/);
  assert.match(tabPointerSource, /if \(tab\.draggable\) tab\.draggable = false;/);
  assert.match(tabPointerSource, /if \(tab\.getAttribute\("draggable"\) !== "false"\) tab\.setAttribute\("draggable", "false"\);/);
});
