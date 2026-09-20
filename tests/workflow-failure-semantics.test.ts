import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("companion and full calendar share honest schedule failure semantics before booking", () => {
  const companion = read("app/components/companion/CalendarCompanionPanel.tsx");
  const workspace = read("app/components/workspaces/CalendarWorkspace.tsx");
  const header = read("app/components/workspaces/calendar/CalendarHeader.tsx");

  // The companion must use the same scheduling engine as the full Calendar,
  // otherwise failure semantics can drift between two booking implementations.
  assert.match(companion, /CalendarWorkspace/);
  assert.match(companion, /presentation="companion"/);

  // A failed or not-yet-confirmed schedule is not an empty schedule. Both the
  // New Event button and grid slots route through this shared availability guard.
  assert.match(workspace, /status: scheduleStatus/);
  assert.match(workspace, /scheduleStatus !== "ready"/);
  assert.match(workspace, /Current availability could not be confirmed\. Refresh the schedule before booking/);
  assert.match(workspace, /onNewEvent=\{\(\) => handleOpenAppointmentBooking/);
  assert.match(workspace, /onSlotClick=\{\(date, time\) => handleOpenAppointmentBooking/);

  // Previously confirmed data may also be visibly stale/offline; the Calendar
  // continues to say so rather than presenting those states as synchronized.
  assert.match(header, /stale: "Schedule may be stale"/);
  assert.match(header, /offline: "Schedule offline"/);
  assert.match(header, /error: "Schedule sync failed"/);
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
