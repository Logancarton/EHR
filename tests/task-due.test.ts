import assert from "node:assert/strict";
import test from "node:test";
import { addCalendarDays, describeTaskDue, resolveTaskDue, storedTaskDue } from "../app/domain/task-due";

test("a task due date is resolved to a calendar date once, when the task is made", () => {
  assert.equal(resolveTaskDue("Today", "2026-10-06"), "2026-10-06");
  assert.equal(resolveTaskDue("Tomorrow", "2026-10-06"), "2026-10-07");
  assert.equal(resolveTaskDue("In 2 weeks", "2026-10-06"), "2026-10-20");
  assert.equal(resolveTaskDue("1 week", "2026-12-28"), "2027-01-04");
  assert.equal(resolveTaskDue("2026-11-01", "2026-10-06"), "2026-11-01");
  assert.equal(resolveTaskDue("No due date", "2026-10-06"), null);
  // 2026-10-06 is a Tuesday: "Thursday" is two days on, "Tuesday" is today.
  assert.equal(resolveTaskDue("Thursday", "2026-10-06"), "2026-10-08");
  assert.equal(resolveTaskDue("tuesday", "2026-10-06"), "2026-10-06");
  // Absent keeps the long-standing default of today.
  assert.equal(resolveTaskDue(undefined, "2026-10-06"), "2026-10-06");
  assert.throws(() => resolveTaskDue("whenever", "2026-10-06"), /Unrecognised task due date/);
});

test("legacy word due dates are read against the day the task was created, never today", () => {
  assert.equal(storedTaskDue("Today", "2026-10-06"), "2026-10-06");
  assert.equal(storedTaskDue("Tomorrow", "2026-10-06"), "2026-10-07");
  assert.equal(storedTaskDue("Done", "2026-10-06"), null);
  assert.equal(storedTaskDue(null, "2026-10-06"), null);
  assert.equal(storedTaskDue("2026-10-09", "2026-10-06"), "2026-10-09");
});

test("yesterday's 'due today' task reads as overdue on the practice clock", () => {
  const today = "2026-10-07";
  assert.deepEqual(describeTaskDue("2026-10-06", today), { label: "Overdue · Oct 6", overdue: true });
  assert.deepEqual(describeTaskDue("2026-10-06", today, true), { label: "Was due Oct 6", overdue: false });
  assert.equal(describeTaskDue("2026-10-07", today).label, "Due today");
  assert.equal(describeTaskDue("2026-10-08", today).label, "Due tomorrow");
  assert.equal(describeTaskDue("2027-01-04", today).label, "Due Jan 4, 2027");
  assert.equal(describeTaskDue(null, today).label, "No due date");
  assert.equal(addCalendarDays("2026-03-07", 1), "2026-03-08");
});
