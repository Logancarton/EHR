import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CREATE_TABLES_SQL } from "../app/server/db/schema";
import { seedDatabaseIfEmpty, seededScheduleDate, shouldSeedDemoSchedule } from "../app/server/db/seed";
import { SEED_SCHEDULE_ANCHOR_DATE, seedSchedule } from "../app/domain/schedule-seed";

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

    // Same set, moved as one: every row keeps its distance from the anchor, so the
    // fixture week keeps its shape rather than collapsing onto a single day.
    const byId = new Map(rows.map((row) => [row.id, row]));
    const offsets = new Set<number>();
    for (const fixture of seedSchedule) {
      const seeded = byId.get(fixture.id);
      assert.ok(seeded, `${fixture.id} should have been seeded`);
      assert.equal(seeded.time, fixture.time, "the shift moves days, never clock times");
      offsets.add(Date.parse(`${seeded.date}T00:00:00Z`) - Date.parse(`${fixture.date}T00:00:00Z`));
    }
    assert.equal(offsets.size, 1, "one offset for the whole set");
  } finally {
    if (original === undefined) delete process.env.EHR_SEED_DEMO_SCHEDULE;
    else process.env.EHR_SEED_DEMO_SCHEDULE = original;
    db.close();
  }
});

test("the seeded date is the fixture date carried to the day the database is opened", () => {
  // The anchor day itself is the reference point: a row written for the anchor is
  // seeded on today, and its neighbours keep their offsets, including across a
  // month boundary and a leap day.
  assert.equal(seededScheduleDate(SEED_SCHEDULE_ANCHOR_DATE, "2026-09-21"), "2026-09-21");
  assert.equal(seededScheduleDate("2026-09-03", "2026-09-21"), "2026-09-20");
  assert.equal(seededScheduleDate("2026-09-08", "2026-09-21"), "2026-09-25");
  assert.equal(seededScheduleDate("2026-09-08", "2026-09-04"), "2026-09-08", "no shift on the anchor day");
  assert.equal(seededScheduleDate("2026-09-08", "2026-10-30"), "2026-11-03", "crosses a month end");
  assert.equal(seededScheduleDate("2026-09-04", "2028-02-28"), "2028-02-28");
  assert.equal(seededScheduleDate("2026-09-05", "2028-02-28"), "2028-02-29", "a leap day is a real day");
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
