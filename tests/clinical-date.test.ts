import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarDaysBetween,
  formatCalendarDate,
  formatClinicalDate,
  formatClinicalDateTime,
  formatDateAge,
  toCalendarDate,
} from "../app/lib/clinical-date";
import { calculateMonitoringStatus, medicationProtocols, monitoringEvidenceFromRecord } from "../app/lib/clinical-protocols";

// Each test file runs in its own process; Node re-reads TZ when it changes, so
// these cases run under several host zones to prove the output does not depend
// on the machine (server or browser) doing the formatting.
const HOST_ZONES = ["UTC", "America/Los_Angeles", "America/Phoenix", "Asia/Tokyo", "Pacific/Kiritimati"];

function underEachZone(run: (zone: string) => void) {
  const original = process.env.TZ;
  try {
    for (const zone of HOST_ZONES) {
      process.env.TZ = zone;
      run(zone);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

// 7:07 PM on Oct 4 at the practice (America/Phoenix, UTC-7) is 02:07 on Oct 5 UTC.
const EVENING_VITALS = "2026-10-05T02:07:00.000Z";

test("a date-only value stays the same calendar date in every host zone", () => {
  underEachZone((zone) => {
    assert.equal(formatClinicalDate("2026-10-04"), "Oct 4, 2026", zone);
    assert.equal(formatClinicalDateTime("2026-10-04"), "Oct 4, 2026", `${zone}: no invented midnight`);
    assert.equal(toCalendarDate("2026-10-04"), "2026-10-04", zone);
    assert.equal(formatCalendarDate("Sep 24, 2026"), "Sep 24, 2026", zone);
    assert.equal(toCalendarDate("Sep 24, 2026"), "2026-09-24", zone);
  });
});

test("an evening instant is shown on the practice's day and clock, not UTC's", () => {
  underEachZone((zone) => {
    assert.equal(formatClinicalDateTime(EVENING_VITALS), "Oct 4, 2026 · 7:07 PM", zone);
    assert.equal(formatClinicalDate(EVENING_VITALS), "Oct 4, 2026", zone);
    assert.equal(toCalendarDate(EVENING_VITALS), "2026-10-04", zone);
  });
});

test("the zone is a parameter: Los Angeles reads the same instant on its own clock", () => {
  assert.equal(formatClinicalDateTime(EVENING_VITALS, "America/Los_Angeles"), "Oct 4, 2026 · 7:07 PM");
  // In January Los Angeles is UTC-8 and Phoenix stays UTC-7.
  assert.equal(formatClinicalDateTime("2027-01-05T02:07:00Z", "America/Los_Angeles"), "Jan 4, 2027 · 6:07 PM");
  assert.equal(formatClinicalDateTime("2027-01-05T02:07:00Z"), "Jan 4, 2027 · 7:07 PM");
  assert.equal(formatClinicalDateTime(EVENING_VITALS, "UTC"), "Oct 5, 2026 · 2:07 AM");
});

test("explicit offsets, midnight and noon format correctly", () => {
  assert.equal(formatClinicalDateTime("2026-10-04T19:07:00-07:00"), "Oct 4, 2026 · 7:07 PM");
  assert.equal(formatClinicalDateTime("2026-10-04T07:00:00Z"), "Oct 4, 2026 · 12:00 AM");
  assert.equal(formatClinicalDateTime("2026-10-04T19:00:00Z"), "Oct 4, 2026 · 12:00 PM");
});

test("a floating timestamp (no offset) is shown exactly as written", () => {
  underEachZone((zone) => {
    assert.equal(formatClinicalDateTime("2026-10-04T19:07"), "Oct 4, 2026 · 7:07 PM", zone);
    assert.equal(toCalendarDate("2026-10-04T23:30:00"), "2026-10-04", zone);
  });
});

test("numbers and Date objects are instants", () => {
  assert.equal(formatClinicalDateTime(0, "UTC"), "Jan 1, 1970 · 12:00 AM");
  const epoch = Date.parse(EVENING_VITALS);
  underEachZone((zone) => {
    assert.equal(formatClinicalDateTime(epoch), "Oct 4, 2026 · 7:07 PM", zone);
    assert.equal(formatClinicalDate(new Date(epoch)), "Oct 4, 2026", zone);
    assert.equal(toCalendarDate(epoch), "2026-10-04", zone);
  });
});

test("missing and invalid input is never turned into a confident date", () => {
  assert.equal(formatClinicalDate(null), "—");
  assert.equal(formatClinicalDate(undefined), "—");
  assert.equal(formatClinicalDate(""), "—");
  assert.equal(formatClinicalDateTime(null), "—");
  assert.equal(formatClinicalDate("not a date"), "not a date");
  assert.equal(formatClinicalDateTime("not a date"), "not a date");
  assert.equal(formatClinicalDate("2026-02-31"), "2026-02-31", "rolled-over dates are not shifted into March");
  assert.equal(formatClinicalDate(Number.NaN), "NaN");
  assert.equal(toCalendarDate("not a date"), null);
  assert.equal(calendarDaysBetween("not a date", "2026-10-04"), null);
  assert.equal(formatDateAge("not a date", "2026-10-04"), "");
});

test("relative days count practice calendar days across the UTC boundary", () => {
  underEachZone((zone) => {
    // Recorded 7:07 PM Oct 4; the practice's today is Oct 4. UTC says Oct 5.
    assert.equal(calendarDaysBetween(EVENING_VITALS, "2026-10-04"), 0, zone);
    assert.equal(formatDateAge(EVENING_VITALS, "2026-10-04"), "today", zone);
    assert.equal(formatDateAge(EVENING_VITALS, "2026-10-05"), "yesterday", zone);
    // 11 PM yesterday is one calendar day old at 8 AM, though under 24 hours.
    assert.equal(calendarDaysBetween("2026-10-04T06:00:00Z", "2026-10-04T15:00:00Z"), 1, zone);
    assert.equal(calendarDaysBetween("2026-10-04", "2026-10-01"), -3, zone);
  });
});

test("monitoring surveillance places evening vitals on the practice day and counts calendar days", () => {
  const rule = medicationProtocols.find((item) => item.id === "guanfacine-vitals");
  assert.ok(rule);
  const evidence = monitoringEvidenceFromRecord([], [{ recordedAt: EVENING_VITALS, systolic: 118, diastolic: 76, heartRate: 70 }]);
  assert.equal(evidence[0]?.date, "2026-10-04");

  // 7:30 PM Oct 4 in Phoenix — still the same clinic day as the reading.
  const sameEvening = calculateMonitoringStatus(["Guanfacine ER 2 mg nightly"], evidence, {
    protocols: [rule!],
    referenceDate: new Date("2026-10-05T02:30:00Z"),
  });
  assert.equal(sameEvening[0]?.lastDoneDate, "2026-10-04");
  assert.equal(sameEvening[0]?.daysElapsed, 0);

  // 8 AM Oct 5 in Phoenix — the next clinic day, though under 24 hours later.
  const nextMorning = calculateMonitoringStatus(["Guanfacine ER 2 mg nightly"], evidence, {
    protocols: [rule!],
    referenceDate: new Date("2026-10-05T15:00:00Z"),
  });
  assert.equal(nextMorning[0]?.daysElapsed, 1);
});


test("invalid timestamp components are preserved rather than rolled into another day", () => {
  underEachZone((zone) => {
    for (const value of ["2026-02-31T19:07:00Z", "2026-10-04T24:00:00Z", "2026-10-04T19:07:60", "2026-10-04T19:60:00-07:00"]) {
      assert.equal(toCalendarDate(value), null, `${zone}: ${value}`);
      assert.equal(formatClinicalDateTime(value), value, `${zone}: ${value}`);
    }
    assert.equal(toCalendarDate("0099-01-01"), "0099-01-01", zone);
  });
});

test("legacy timestamps with an explicit timezone are instants in every host zone", () => {
  underEachZone((zone) => {
    assert.equal(formatClinicalDateTime("Mon, 05 Oct 2026 02:07:00 GMT"), "Oct 4, 2026 · 7:07 PM", zone);
    assert.equal(toCalendarDate("Oct 5, 2026 02:07:00 +0000"), "2026-10-04", zone);
  });
});


test("calendar-day intervals remain whole days across daylight-saving transitions", () => {
  assert.equal(calendarDaysBetween("2026-03-08T08:00:00Z", "2026-03-09T07:00:00Z", "America/Los_Angeles"), 1);
  assert.equal(calendarDaysBetween("2026-11-01T07:00:00Z", "2026-11-02T08:00:00Z", "America/Los_Angeles"), 1);
});
