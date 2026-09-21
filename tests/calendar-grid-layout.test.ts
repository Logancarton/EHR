import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCalendarGridLayout,
  CALENDAR_BASE_SLOT_HEIGHT,
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

test("calendar time geometry stays uniform regardless of appointment density", () => {
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

  assert.ok(grid.slotHeights.every((height) => height === CALENDAR_BASE_SLOT_HEIGHT));

  const tenAm = grid.slotOffsets[(10 - 7) * 4];
  const elevenAm = grid.slotOffsets[(11 - 7) * 4];
  assert.equal(elevenAm - tenAm, CALENDAR_BASE_SLOT_HEIGHT * 4);
  assert.equal(grid.minuteTop(11 * 60) - grid.minuteTop(10 * 60), CALENDAR_BASE_SLOT_HEIGHT * 4);

  const overlapping = rows.filter((row) => row.item.time === "10:30 AM");
  assert.deepEqual(overlapping.map((row) => row.item.patientName), [...names].sort());
  assert.equal(new Set(overlapping.map((row) => row.topPx)).size, 1);
  assert.deepEqual(overlapping.map((row) => row.laneIndex), [0, 1, 2, 3]);
  assert.ok(overlapping.every((row) => row.laneCount === 4));

  const next = rows.find((row) => row.item.id === "next")!;
  assert.ok(next.topPx >= overlapping[0].topPx + CALENDAR_EVENT_CARD_HEIGHT);
  assert.equal(next.laneCount, 1);

  const otherDay = grid.eventsByDate.get(thursday)![0];
  assert.equal(otherDay.topPx, overlapping[0].topPx);
  assert.equal(otherDay.laneCount, 1);
});

test("quarter-hour starts and the live time line remain linearly proportional", () => {
  const date = "2026-09-16";
  const grouped = new Map<string, ScheduleItem[]>([[date, [
    appointment("a", "First Patient", date, "10:30 AM"),
    appointment("b", "Second Patient", date, "10:45 AM"),
    appointment("c", "Third Patient", date, "11:00 AM"),
  ]]]);

  const grid = buildCalendarGridLayout([date], grouped, 7, 20);
  const rows = grid.eventsByDate.get(date)!;

  assert.equal(
    grid.minuteTop(10 * 60 + 45) - grid.minuteTop(10 * 60 + 30),
    CALENDAR_BASE_SLOT_HEIGHT,
  );
  assert.equal(
    grid.minuteTop(10 * 60 + 37.5) - grid.minuteTop(10 * 60 + 30),
    CALENDAR_BASE_SLOT_HEIGHT / 2,
  );

  assert.ok(rows[1].topPx > rows[0].topPx);
  assert.equal(rows[0].laneCount, 2);
  assert.equal(rows[1].laneCount, 2);
  assert.equal(rows[2].laneCount, 2);
  assert.equal(rows[2].laneIndex, 0);
});

test("full 24-hour day spans midnight to midnight (0:00 to 24:00) with 96 slots", () => {
  const date = "2026-09-16";
  const early = appointment("early", "Early Bird", date, "06:15 AM");
  const midday = appointment("midday", "Midday Visit", date, "12:00 PM");
  const late = appointment("late", "Night Visit", date, "09:30 PM");

  const grouped = new Map<string, ScheduleItem[]>([[date, [early, midday, late]]]);

  const grid = buildCalendarGridLayout([date], grouped, 0, 24);

  // 24 hours * 4 slots/hour = 96 slots
  assert.equal(grid.slotHeights.length, 96);
  assert.equal(grid.slotOffsets.length, 97);
  assert.equal(grid.startHour, 0);
  assert.equal(grid.endHour, 24);

  // Midnight (0:00) is at 0px
  assert.equal(grid.minuteTop(0), 0);
  // Noon (12:00 = 720 min) is at 48 slots * 24px = 1152px
  assert.equal(grid.minuteTop(12 * 60), 48 * CALENDAR_BASE_SLOT_HEIGHT);

  const rows = grid.eventsByDate.get(date)!;
  assert.equal(rows.length, 3);
  // All three visits are laid out
  assert.ok(rows[0].topPx < rows[1].topPx);
  assert.ok(rows[1].topPx < rows[2].topPx);
});

test("compact / thinned density scales slots and minuteTop proportionally", () => {
  const date = "2026-09-16";
  const compactSlotHeight = 14;
  const compactCardHeight = 28;
  const grouped = new Map<string, ScheduleItem[]>([[date, [
    appointment("a", "Patient One", date, "09:00 AM"),
    appointment("b", "Patient Two", date, "09:15 AM"),
  ]]]);

  const grid = buildCalendarGridLayout([date], grouped, 7, 20, compactSlotHeight, compactCardHeight);

  assert.ok(grid.slotHeights.every((h) => h === compactSlotHeight));
  assert.equal(grid.slotHeight, compactSlotHeight);
  assert.equal(grid.eventCardHeight, compactCardHeight);

  // 1 hour at 14px per 15 min = 56px per hour
  const nineAm = grid.minuteTop(9 * 60);
  const tenAm = grid.minuteTop(10 * 60);
  assert.equal(tenAm - nineAm, 56);

  // Full 13-hour day is 13 * 56 = 728px (fits full day cleanly in viewport)
  const fullDayHeight = grid.slotOffsets[grid.slotOffsets.length - 1];
  assert.equal(fullDayHeight, (20 - 7) * 4 * compactSlotHeight);
  assert.equal(fullDayHeight, 728);
});

test("spacious / lengthened density expands rows for high-detail view", () => {
  const date = "2026-09-16";
  const spaciousSlotHeight = 32;
  const spaciousCardHeight = 56;
  const grouped = new Map<string, ScheduleItem[]>([[date, [
    appointment("a", "Patient One", date, "09:00 AM"),
  ]]]);

  const grid = buildCalendarGridLayout([date], grouped, 8, 18, spaciousSlotHeight, spaciousCardHeight);

  assert.ok(grid.slotHeights.every((h) => h === spaciousSlotHeight));
  assert.equal(grid.slotHeight, spaciousSlotHeight);
  // 1 hour at 32px per 15 min = 128px per hour
  assert.equal(grid.minuteTop(9 * 60) - grid.minuteTop(8 * 60), 128);
});
