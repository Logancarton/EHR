import test from "node:test";
import assert from "node:assert/strict";
import { activeVisitsOn, timeStringToMinutes } from "../app/lib/schedule-data";

test("the schedule glance counts only the day's visits that still stand", () => {
  const items = [
    { id: "a", date: "2026-10-06", status: "scheduled" },
    { id: "b", date: "2026-10-06", status: "cancelled" },
    { id: "c", date: "2026-10-05", status: "scheduled" },
    { id: "d", date: "2026-10-06", status: "tentative" },
  ] as const;
  assert.deepEqual(activeVisitsOn(items, "2026-10-06").map((item) => item.id), ["a", "d"]);
  assert.deepEqual(activeVisitsOn(items, "2026-10-07"), []);
});

test("12-hour visit times order by clock, not by text", () => {
  const times = ["01:30 PM", "10:00 AM", "09:00 AM", "12:15 PM"];
  const sorted = [...times].sort((a, b) => timeStringToMinutes(a) - timeStringToMinutes(b));
  assert.deepEqual(sorted, ["09:00 AM", "10:00 AM", "12:15 PM", "01:30 PM"]);
});
