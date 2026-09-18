import test from "node:test";
import assert from "node:assert/strict";
import {
  parseScheduleJumpQuery,
  calculateFollowUpDate,
  CLINICAL_INTERVAL_PRESETS,
} from "../app/lib/schedule-data";
import { executeClinicalQuery } from "../app/domain/clinical-query";
import { defaultPreferences } from "../app/lib/preference-engine";

const BASE_DATE = "2026-09-17"; // Thursday

test("parseScheduleJumpQuery resolves 28, 56, and 84 days later queries accurately", () => {
  // 28 days = 4 weeks (standard 1-month SSRI/stimulant supply)
  const q28 = parseScheduleJumpQuery("pull up 28 days later", BASE_DATE);
  assert.ok(q28, "should parse 'pull up 28 days later'");
  assert.equal(q28.days, 28);
  assert.equal(q28.targetDate, "2026-10-15");
  assert.match(q28.formattedDisplay, /Thu/);
  assert.equal(q28.weeksHint, "4 weeks");

  // 56 days = 8 weeks (2-month follow-up)
  const q56 = parseScheduleJumpQuery("56 days later", BASE_DATE);
  assert.ok(q56, "should parse '56 days later'");
  assert.equal(q56.days, 56);
  assert.equal(q56.targetDate, "2026-11-12");
  assert.match(q56.formattedDisplay, /Thu/);
  assert.equal(q56.weeksHint, "8 weeks");

  // 84 days = 12 weeks (3-month quarterly renewal)
  const q84 = parseScheduleJumpQuery("schedule 84 days later", BASE_DATE);
  assert.ok(q84, "should parse 'schedule 84 days later'");
  assert.equal(q84.days, 84);
  assert.equal(q84.targetDate, "2026-12-10");
  assert.match(q84.formattedDisplay, /Thu/);
  assert.equal(q84.weeksHint, "12 weeks");
});

test("parseScheduleJumpQuery parses various clinician phrasing patterns", () => {
  // "in 28 days"
  const inDays = parseScheduleJumpQuery("in 28 days", BASE_DATE);
  assert.ok(inDays);
  assert.equal(inDays.days, 28);

  // "calendar 56 days later"
  const calDays = parseScheduleJumpQuery("calendar 56 days later", BASE_DATE);
  assert.ok(calDays);
  assert.equal(calDays.days, 56);

  // "jump 84 days"
  const jumpDays = parseScheduleJumpQuery("jump 84 days", BASE_DATE);
  assert.ok(jumpDays);
  assert.equal(jumpDays.days, 84);

  // "+28d"
  const plusChip = parseScheduleJumpQuery("+28d", BASE_DATE);
  assert.ok(plusChip);
  assert.equal(plusChip.days, 28);

  // Weeks conversions: "pull up 4 weeks later" -> 28 days
  const w4 = parseScheduleJumpQuery("pull up 4 weeks later", BASE_DATE);
  assert.ok(w4);
  assert.equal(w4.days, 28);

  // Weeks conversions: "8 weeks later" -> 56 days
  const w8 = parseScheduleJumpQuery("8 weeks later", BASE_DATE);
  assert.ok(w8);
  assert.equal(w8.days, 56);

  // Weeks conversions: "12 weeks later" -> 84 days
  const w12 = parseScheduleJumpQuery("12 weeks later", BASE_DATE);
  assert.ok(w12);
  assert.equal(w12.days, 84);
});

test("parseScheduleJumpQuery ignores unrelated numerical text", () => {
  assert.equal(parseScheduleJumpQuery("blood pressure 120/80"), null);
  assert.equal(parseScheduleJumpQuery("patient reported insomnia"), null);
  assert.equal(parseScheduleJumpQuery("sertraline 50mg"), null);
  assert.equal(parseScheduleJumpQuery(""), null);
});

test("calculateFollowUpDate supports explicit day counts", () => {
  assert.equal(calculateFollowUpDate(BASE_DATE, "28 days"), "2026-10-15");
  assert.equal(calculateFollowUpDate(BASE_DATE, "56 days"), "2026-11-12");
  assert.equal(calculateFollowUpDate(BASE_DATE, "84 days"), "2026-12-10");
  assert.equal(calculateFollowUpDate(BASE_DATE, "14d"), "2026-10-01");
  assert.equal(calculateFollowUpDate(BASE_DATE, "28d"), "2026-10-15");
});

test("CLINICAL_INTERVAL_PRESETS contains standard psych intervals", () => {
  const days = CLINICAL_INTERVAL_PRESETS.map((p) => p.days);
  assert.ok(days.includes(14), "includes 14d");
  assert.ok(days.includes(28), "includes 28d");
  assert.ok(days.includes(42), "includes 42d");
  assert.ok(days.includes(56), "includes 56d");
  assert.ok(days.includes(84), "includes 84d");
  assert.ok(days.includes(112), "includes 112d");
});

test("executeClinicalQuery returns schedule-jump answer for days later queries", () => {
  const pref = defaultPreferences;
  const answer28 = executeClinicalQuery("pull up 28 days later", null, pref, []);
  assert.ok(answer28, "answer should exist");
  assert.equal(answer28.type, "schedule-jump");
  assert.equal(answer28.scheduleDaysLater, 28);
  assert.ok(answer28.scheduleDate);
  assert.match(answer28.title, /28 Days Later/);
  assert.match(answer28.actionLabel || "", /\+28d/);

  const answer56 = executeClinicalQuery("56 days later", null, pref, []);
  assert.ok(answer56);
  assert.equal(answer56.type, "schedule-jump");
  assert.equal(answer56.scheduleDaysLater, 56);

  const answer84 = executeClinicalQuery("schedule 84 days later", null, pref, []);
  assert.ok(answer84);
  assert.equal(answer84.type, "schedule-jump");
  assert.equal(answer84.scheduleDaysLater, 84);
});
