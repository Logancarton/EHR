import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CREATE_TABLES_SQL } from "../app/server/db/schema";
import { seedDatabaseIfEmpty, seededScheduleDate, shouldSeedDemoSchedule } from "../app/server/db/seed";
import { SEED_SCHEDULE_ANCHOR_DATE, seedSchedule } from "../app/domain/schedule-seed";
import { practiceToday } from "../app/lib/practice-calendar";

/**
 * The boundary between the demo clinic day and the tests that book against it.
 *
 * The demo schedule is written for one anchor Friday and shifted onto whatever day
 * the database is first opened on, so a demo install never opens on an empty week.
 * That shift made the unit suite's outcome depend on the date it ran: the fixture
 * day advanced one slot per day until it reached a date some test had written down
 * as empty. On 2026-09-21 it reached `tests/intake-workflow.test.ts`, whose
 * 2026-09-25 10:00 AM tentative hold met the shifted `apt-tue-1` and was refused by
 * the schedule-conflict guard — a red inner loop with nothing wrong in the code.
 *
 * The repair is at the fixture boundary, not in any assertion: a unit-test database
 * gets no demo clinic day, so it holds exactly the appointments its own test
 * created. These tests hold both halves of that in place — the demo behaviour a
 * first install still depends on, and the absence the unit suite now depends on.
 */

function freshDatabase(): DatabaseSync {
  const db = new DatabaseSync(join(mkdtempSync(join(tmpdir(), "ehr-seed-boundary-")), "ehr.db"));
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(CREATE_TABLES_SQL);
  return db;
}

function appointmentRows(db: DatabaseSync): { id: string; date: string; time: string }[] {
  return db.prepare("SELECT id, date, time FROM appointments ORDER BY date, id").all() as never;
}

test("a unit-test database is created without the demo clinic day", () => {
  // This is the condition the repair exists for. It is asserted against the real
  // seeding entry point rather than the helper, because the collision came from
  // what ended up in the table, not from what the helper returned.
  const db = freshDatabase();
  try {
    seedDatabaseIfEmpty(db);
    assert.deepEqual(
      appointmentRows(db),
      [],
      "a test's schedule contains what that test booked and nothing that moved onto it",
    );

    // The rest of the fixtures are unaffected: tests still open charts by id.
    const patients = db.prepare("SELECT COUNT(*) AS count FROM patients").get() as { count: number };
    assert.ok(patients.count > 0, "only the dated clinic day is withheld, not the roster");
  } finally {
    db.close();
  }
});

test("the demo clinic day is still seeded for an install, on the day it is opened", () => {
  const db = freshDatabase();
  const original = process.env.EHR_SEED_DEMO_SCHEDULE;
  process.env.EHR_SEED_DEMO_SCHEDULE = "1";
  try {
    seedDatabaseIfEmpty(db);
    const rows = appointmentRows(db);
    assert.equal(rows.length, seedSchedule.length, "a first install opens on a full practice");

    // The set keeps its shape rather than collapsing onto a single day, and it
    // keeps it in the two different units it was written in. The anchor's own
    // week is written in days — yesterday, today, tomorrow — so those rows move
    // by one shared offset. The "Upcoming Week" rows are written in weeks, so
    // they move by their own shared offset, a whole number of weeks larger.
    const byId = new Map(rows.map((row) => [row.id, row]));
    const offsetOf = (id: string, fixtureDate: string) => {
      const seeded = byId.get(id);
      assert.ok(seeded, `${id} should have been seeded`);
      return Math.round(
        (Date.parse(`${seeded.date}T00:00:00Z`) - Date.parse(`${fixtureDate}T00:00:00Z`)) / 86_400_000,
      );
    };
    for (const fixture of seedSchedule) {
      assert.equal(
        byId.get(fixture.id)?.time,
        fixture.time,
        "the shift moves days, never clock times",
      );
    }

    const mondayOf = (date: string) => {
      const day = new Date(`${date}T00:00:00Z`);
      day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
      return day.toISOString().slice(0, 10);
    };
    const weekdayOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
    const plusDays = (date: string, days: number) => {
      const day = new Date(`${date}T00:00:00Z`);
      day.setUTCDate(day.getUTCDate() + days);
      return day.toISOString().slice(0, 10);
    };

    const today = practiceToday();
    const currentClinicDays = seedSchedule.filter((fixture) => fixture.date <= "2026-09-05");
    const upcomingWeek = seedSchedule.filter((fixture) => fixture.date >= "2026-09-07");

    const dayOffsets = new Set(
      currentClinicDays.map((fixture) => offsetOf(fixture.id, fixture.date)),
    );
    assert.equal(dayOffsets.size, 1, "one offset across the current clinic days");
    assert.equal(
      byId.get("apt-1")?.date,
      today,
      "the anchor day is today, so a first install opens on a populated clinic",
    );

    for (const fixture of upcomingWeek) {
      const seeded = byId.get(fixture.id);
      assert.ok(seeded);
      assert.equal(
        mondayOf(seeded.date),
        plusDays(mondayOf(today), 7),
        `${fixture.id} belongs to the week after this one`,
      );
      assert.equal(
        weekdayOf(seeded.date),
        weekdayOf(fixture.date),
        `${fixture.id} keeps the weekday it was written for`,
      );
    }

    // The property the browser suite's CB-3 case depends on, stated where it is
    // decided: a patient seen today and again "next week" is not drawn twice into
    // one displayed week. That is what the single day shift used to do on every
    // day of the year except a Friday.
    const weeksByPatient = new Map<string, Set<string>>();
    for (const fixture of seedSchedule) {
      const seeded = byId.get(fixture.id);
      assert.ok(seeded);
      const weeks = weeksByPatient.get(fixture.patientId) ?? new Set<string>();
      weeks.add(mondayOf(seeded.date));
      weeksByPatient.set(fixture.patientId, weeks);
    }
    const jordanWeeks = weeksByPatient.get("jordan-reed");
    assert.equal(
      jordanWeeks?.size,
      2,
      "the patient with a visit today and one next week is in two different weeks",
    );
  } finally {
    if (original === undefined) delete process.env.EHR_SEED_DEMO_SCHEDULE;
    else process.env.EHR_SEED_DEMO_SCHEDULE = original;
    db.close();
  }
});

test("the seeded date is the fixture date carried to the day the database is opened", () => {
  // The anchor day itself is the reference point: a row written for the anchor is
  // seeded on today, and the rest of the anchor's week keeps its day offset,
  // including across a month boundary and a leap day.
  assert.equal(seededScheduleDate(SEED_SCHEDULE_ANCHOR_DATE, "2026-09-21"), "2026-09-21");
  assert.equal(seededScheduleDate("2026-09-03", "2026-09-21"), "2026-09-20");
  assert.equal(seededScheduleDate("2026-09-04", "2028-02-28"), "2028-02-28");
  assert.equal(seededScheduleDate("2026-09-05", "2028-02-28"), "2028-02-29", "a leap day is a real day");

  // A row written for the week *after* the anchor is placed in the week after
  // today's, on the weekday it was written for — not three days after today,
  // which is where a single day shift put it and which is inside the same
  // displayed week for five days out of seven.
  assert.equal(
    seededScheduleDate("2026-09-08", "2026-09-21"),
    "2026-09-29",
    "next week's Tuesday is a Tuesday next week",
  );
  assert.equal(seededScheduleDate("2026-09-07", "2026-09-21"), "2026-09-28");
  assert.equal(seededScheduleDate("2026-09-08", "2026-09-04"), "2026-09-08", "no shift on the anchor day");
  assert.equal(seededScheduleDate("2026-09-08", "2026-10-30"), "2026-11-03", "crosses a month end");
  assert.equal(
    seededScheduleDate("2026-09-07", "2026-09-20"),
    "2026-09-21",
    "a Sunday install still has next week's Monday in next week",
  );
});

test("only the unit suite opts out, and it can be overridden in either direction", () => {
  // Node sets NODE_TEST_CONTEXT in every `--test` worker, so a single file run
  // directly opts out the same way `npm test` does. That matters: the failure this
  // repairs was first reproduced by running one file on its own.
  assert.ok(process.env.NODE_TEST_CONTEXT, "this assertion is what the default relies on");
  assert.equal(shouldSeedDemoSchedule(), false, "the suite this runs in takes the opt-out");

  assert.equal(shouldSeedDemoSchedule({}), true, "a dev or production server is unaffected");
  assert.equal(shouldSeedDemoSchedule({ NODE_TEST_CONTEXT: "child-v8" }), false);
  assert.equal(
    shouldSeedDemoSchedule({ NODE_TEST_CONTEXT: "child-v8", EHR_SEED_DEMO_SCHEDULE: "1" }),
    true,
    "the browser suite asks for a practice even though it is a test suite",
  );
  assert.equal(shouldSeedDemoSchedule({ EHR_SEED_DEMO_SCHEDULE: "0" }), false);
});
