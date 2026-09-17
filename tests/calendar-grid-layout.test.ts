import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCalendarGridLayout,
  CALENDAR_EVENT_CARD_HEIGHT,
} from "../app/lib/calendar-grid-layout";
import type { ScheduleItem } from "../app/lib/schedule-data";

function appointment(id: string, patientName: string, date: string, time: string): ScheduleItem {
  return {
    id,
    patientId: `patient-${id}`,
    patientName,
    date,
    time,
    duration: "30 min",
    type: "30-min Med Check",
    status: "scheduled",
    dob: "1990-01-01",
    age: 36,
    mrn: `MRN-${id}`,
    chiefComplaint: "",
    insurance: "Not recorded",
  };
}

test("crowded calendar slots show each patient in a full-width row without covering later times", () => {
  const wednesday = "2026-09-16";
  const thursday = "2026-09-17";
  const names = ["Maya Chen", "Elena Rostova", "Grace Lee", "Victor Reed"];
  const grouped = new Map<string, ScheduleItem[]>([
    [wednesday, [
      ...names.map((name, index) => appointment(`overlap-${index}`, name, wednesday, "10:30 AM")),
      appointment("next", "Next Patient", wednesday, "11:00 AM"),
    ]],
    [thursday, [appointment("other-day", "Other Day", thursday, "10:30 AM")]],
  ]);

  const grid = buildCalendarGridLayout([wednesday, thursday], grouped, 7, 20);
  const rows = grid.eventsByDate.get(wednesday)!;
  assert.deepEqual(rows.slice(0, 4).map((row) => row.item.patientName), [...names].sort());
  for (let index = 1; index < 4; index += 1) {
    assert.ok(rows[index].topPx >= rows[index - 1].topPx + CALENDAR_EVENT_CARD_HEIGHT);
  }
  assert.ok(rows[4].topPx >= rows[3].topPx + CALENDAR_EVENT_CARD_HEIGHT);
  assert.equal(grid.eventsByDate.get(thursday)![0].topPx, rows[0].topPx);
  assert.equal(grid.slotOffsets[(11 - 7) * 4], grid.minuteTop(11 * 60));
});

test("quarter-hour slots still place starts and the live time line in chronological order", () => {
  const date = "2026-09-16";
  const grouped = new Map<string, ScheduleItem[]>([[date, [
    appointment("a", "First Patient", date, "10:30 AM"),
    appointment("b", "Second Patient", date, "10:45 AM"),
  ]]]);
  const grid = buildCalendarGridLayout([date], grouped, 7, 20);
  const rows = grid.eventsByDate.get(date)!;
  assert.ok(rows[1].topPx > rows[0].topPx);
  assert.ok(grid.minuteTop(10 * 60 + 45) > grid.minuteTop(10 * 60 + 30));
  assert.ok(grid.minuteTop(10 * 60 + 37) > grid.minuteTop(10 * 60 + 30));
  assert.ok(grid.minuteTop(10 * 60 + 37) < grid.minuteTop(10 * 60 + 45));
});
