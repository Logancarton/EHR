import test from "node:test";
import assert from "node:assert/strict";
import { activeVisitsOn } from "../app/lib/schedule-data";

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
