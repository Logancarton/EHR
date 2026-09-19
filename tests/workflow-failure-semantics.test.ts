import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("calendar companion labels stale availability and refuses booking without confirmed selected-date data", () => {
  const text = read("app/components/companion/CalendarCompanionPanel.tsx");
  assert.match(text, /dayScheduleDate/);
  assert.match(text, /Previously loaded appointments, if shown, may be stale/);
  assert.match(text, /Current availability could not be confirmed for this date/);
  assert.match(text, /dayScheduleDate === selectedDate/);
});

test("intake template failure is distinct from a successfully empty template", () => {
  const text = read("app/components/workspaces/intake/IntakeDetailPanel.tsx");
  assert.doesNotMatch(text, /catch \{\s*if \(!cancelled\) setSections\(\[\]\)/);
  assert.match(text, /The intake form template could not be loaded/);
  assert.match(text, /InlineError message=\{templateError\}/);
});

test("server-backed staged orders remain visible when deletion fails", () => {
  const text = read("app/components/orders/OrderCartModal.tsx");
  const deleteAt = text.indexOf("await api.orders.delete");
  const localRemoveAt = text.indexOf("onUpdateStagedOrders(stagedOrders.filter", deleteAt);
  assert.ok(deleteAt >= 0 && localRemoveAt > deleteAt);
  assert.match(text, /It remains in the cart/);
});

test("handoff recipient UI distinguishes unavailable team directory from no eligible members", () => {
  const text = read("app/components/schedule/VisitHandoffModal.tsx");
  assert.match(text, /teamDirectoryError/);
  assert.match(text, /The team directory is unavailable/);
  assert.match(text, /No eligible team members available/);
});
