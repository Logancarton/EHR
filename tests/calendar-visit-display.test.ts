import test from "node:test";
import assert from "node:assert/strict";
import { countPatientVisits, formatVisitTime } from "../app/lib/schedule-data";

test("visit times share one clock format and are never invented", () => {
  assert.equal(formatVisitTime("09:30 AM"), "9:30 AM");
  assert.equal(formatVisitTime("7:00 AM"), "7:00 AM");
  assert.equal(formatVisitTime("02:15 pm"), "2:15 PM");
  assert.equal(formatVisitTime("14:30"), "2:30 PM");
  assert.equal(formatVisitTime("00:05"), "12:05 AM");
  // The shared parser falls back to 9:00 AM; the display must not.
  assert.equal(formatVisitTime("TBD"), "TBD");
  assert.equal(formatVisitTime("13:00 PM"), "13:00 PM");
});

test("a day's visit count leaves out cancelled visits and non-patient blocks", () => {
  const items = [
    { patientId: "maya-chen", status: "scheduled", type: "30-min Med Check" },
    { patientId: "jordan-reed", status: "checked-in", type: "60-min Psychotherapy" },
    { patientId: "david-kim", status: "cancelled", type: "30-min Med Check" },
    { patientId: "event-standup", status: "scheduled", type: "30-min Med Check" },
  ] as const;
  assert.equal(countPatientVisits(items as never), 2);
});
