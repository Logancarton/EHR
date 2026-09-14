import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The runtime schedule boundary.
 *
 * `TodayDashboard` started from `initialSchedule` and only replaced it when the
 * backend answered with a non-empty list. Three ordinary situations therefore
 * rendered a full, confident clinic day that did not exist: a practice with no
 * appointments booked, a clinician whose access scope contains none, and a request
 * that failed outright. The rows named patients the signed-in user might not be
 * able to open at all.
 *
 * This is the same boundary `patient-roster-runtime` asserts for patients: one
 * runtime source, a successful empty answer is an empty schedule, a failure is an
 * explicit failure, and the seed fixtures stay in seeding.
 */

const APP_ROOT = fileURLToPath(new URL("../app", import.meta.url));

type StoreModule = typeof import("../app/lib/schedule-store");

const APPOINTMENTS = [
  {
    id: "apt-1",
    date: "2026-09-04",
    patientId: "maya-chen",
    patientName: "Maya Chen",
    dob: "04/18/1992",
    age: 34,
    mrn: "P-10482",
    time: "09:00 AM",
    duration: "30 min",
    type: "30-min Med Check",
    status: "scheduled",
    chiefComplaint: "Follow-up",
    insurance: "Aetna Choice POS",
  },
];

function stubAppointmentFetch(
  appointments: unknown[],
  options: { failWith?: string } = {},
): { calls: () => number; restore: () => void } {
  const original = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls += 1;
    assert.equal(
      String(input),
      "/api/appointments",
      "the schedule must come from the authenticated appointment route",
    );
    if (options.failWith) {
      return new Response(JSON.stringify({ success: false, error: options.failWith }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ success: true, appointments }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  return {
    calls: () => calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

test("a successful empty response is an empty schedule, not the previous rows", async () => {
  const store: StoreModule = await import("../app/lib/schedule-store");

  const populated = stubAppointmentFetch(APPOINTMENTS);
  try {
    store.resetPracticeSchedule();
    assert.equal(store.practiceScheduleState().status, "idle");
    assert.deepEqual(store.practiceScheduleState().appointments, []);

    const loaded = await store.loadPracticeSchedule();
    assert.deepEqual(loaded.map((item) => item.id), ["apt-1"]);
    assert.equal(store.practiceScheduleState().status, "ready");
  } finally {
    populated.restore();
  }

  // The practice's day is now clear. This is the case that used to leave the seeded
  // clinic day on screen, because the old guard was `items.length > 0`.
  const empty = stubAppointmentFetch([]);
  try {
    const reloaded = await store.refreshPracticeSchedule();
    assert.deepEqual(reloaded, [], "an empty day replaces the rows it answered for");
    assert.equal(store.practiceScheduleState().status, "ready");
    assert.equal(store.practiceScheduleState().error, "");
  } finally {
    empty.restore();
    store.resetPracticeSchedule();
  }
});

test("a failed load is an explicit failure with nothing in it, never seeded appointments", async () => {
  const store: StoreModule = await import("../app/lib/schedule-store");
  const { seedSchedule } = await import("../app/domain/schedule-seed");
  const stub = stubAppointmentFetch([], { failWith: "Authentication required" });

  try {
    store.resetPracticeSchedule();
    const loaded = await store.loadPracticeSchedule();

    assert.deepEqual(loaded, [], "a rejected schedule read produces no appointments");
    const state = store.practiceScheduleState();
    assert.equal(state.status, "error");
    assert.match(state.error, /Authentication required/);
    assert.notEqual(
      state.appointments.length,
      seedSchedule.length,
      "a failed schedule must not be quietly replaced by the seed fixtures",
    );
    assert.equal(state.loadedAt, null, "nothing was confirmed, so there is no freshness to claim");
  } finally {
    stub.restore();
    store.resetPracticeSchedule();
  }
});

test("concurrent callers share one request and a later response cannot revive a reset store", async () => {
  const store: StoreModule = await import("../app/lib/schedule-store");
  const stub = stubAppointmentFetch(APPOINTMENTS);

  try {
    store.resetPracticeSchedule();
    const [first, second] = await Promise.all([
      store.loadPracticeSchedule(),
      store.loadPracticeSchedule(),
    ]);
    assert.equal(stub.calls(), 1, "the dashboard and its calendar rail share one read");
    assert.equal(second, first);

    // A confirmed mutation folds back in; an unconfirmed one has nothing to fold.
    store.applyConfirmedAppointment({ ...APPOINTMENTS[0], status: "waiting" } as never);
    assert.equal(store.practiceScheduleState().appointments[0].status, "waiting");

    // And it lands in clock order. Appending left a visit booked for 7am sitting
    // under the 5pm one until the next read.
    store.applyConfirmedAppointment({
      ...APPOINTMENTS[0], id: "apt-early", time: "07:00 AM",
    } as never);
    store.applyConfirmedAppointment({
      ...APPOINTMENTS[0], id: "apt-late", time: "05:15 PM",
    } as never);
    assert.deepEqual(
      store.practiceScheduleState().appointments.map((item) => item.time),
      ["07:00 AM", "09:00 AM", "05:15 PM"],
    );

    store.resetPracticeSchedule();
    store.applyConfirmedAppointment({ ...APPOINTMENTS[0], status: "completed" } as never);
    assert.deepEqual(
      store.practiceScheduleState().appointments,
      [],
      "a confirmation arriving after sign-out must not repopulate the schedule",
    );
  } finally {
    stub.restore();
    store.resetPracticeSchedule();
  }
});

test("a clinic day reads in the order it happens, AM and PM included", async () => {
  const { timeStringToMinutes } = await import("../app/lib/schedule-data");

  // The exact failure: SQLite ordered the stored clock text, so a day opened with
  // its afternoon and the 9am appointment sat below the 4:30pm one.
  const asStored = ["09:00 AM", "10:30 AM", "01:15 PM", "04:30 PM", "12:15 AM", "12:15 PM"];
  const lexical = [...asStored].sort();
  assert.deepEqual(
    lexical.slice(0, 2),
    ["01:15 PM", "04:30 PM"],
    "string ordering really does put the afternoon first — this is what was happening",
  );

  const chronological = [...asStored].sort((a, b) => timeStringToMinutes(a) - timeStringToMinutes(b));
  assert.deepEqual(chronological, [
    "12:15 AM",
    "09:00 AM",
    "10:30 AM",
    "12:15 PM",
    "01:15 PM",
    "04:30 PM",
  ]);

  // Both midnight boundaries, which is where a 12-hour clock usually breaks.
  assert.equal(timeStringToMinutes("12:00 AM"), 0);
  assert.equal(timeStringToMinutes("12:00 PM"), 720);
  assert.equal(timeStringToMinutes("11:59 PM"), 1439);
});

test("the practice day comes from the practice timezone rather than a fixed date", async () => {
  const { PRACTICE_TIME_ZONE, practiceDateOf, practiceToday } = await import(
    "../app/lib/practice-calendar"
  );

  assert.equal(PRACTICE_TIME_ZONE, "America/Phoenix");

  // 06:30 UTC on the 5th is 23:30 on the 4th in Phoenix: still the 4th's clinic.
  assert.equal(practiceDateOf(new Date("2026-09-05T06:30:00Z")), "2026-09-04");
  // 07:30 UTC is 00:30 on the 5th — the next clinic day has started.
  assert.equal(practiceDateOf(new Date("2026-09-05T07:30:00Z")), "2026-09-05");

  assert.match(practiceToday(), /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(
    practiceToday(),
    "2026-09-04",
    "today is computed, not the demo Friday the dashboard was pinned to",
  );
});

test("the seeded clinic days stay in seeding and never reach a runtime surface", async () => {
  const { seedSchedule, seedActionQueue } = await import("../app/domain/schedule-seed");

  assert.ok(Object.isFrozen(seedSchedule), "the fixture schedule is frozen");
  assert.ok(Object.isFrozen(seedActionQueue), "the fixture queue is frozen");
  assert.ok(seedSchedule.length > 0, "there is still seed data to seed with");

  const allowed = new Set([join(APP_ROOT, "server", "db", "seed.ts")]);
  const offenders: string[] = [];

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (path === join(APP_ROOT, "domain", "schedule-seed.ts")) continue;

      const source = readFileSync(path, "utf8");
      if (/from\s+["'][^"']*domain\/schedule-seed["']/.test(source) && !allowed.has(path)) {
        offenders.push(path);
      }
    }
  };

  walk(APP_ROOT);
  assert.deepEqual(
    offenders,
    [],
    "runtime code must resolve the schedule through app/lib/schedule-store, not the seed fixtures",
  );
});

test("the dashboard reports a schedule change only after the server confirms it", () => {
  const dashboard = readFileSync(join(APP_ROOT, "components", "TodayDashboard.tsx"), "utf8");

  assert.match(
    dashboard,
    /const saved = await api\.appointments\.updateStatus\(id, newStatus\);\s*\n\s*\/\/[^\n]*\n\s*applyConfirmedAppointment\(saved\);/,
    "the row moves to what the server stored, not to what was requested",
  );
  assert.match(
    dashboard,
    /if \(savingAppointments\[id\] === "saving"\) return null;/,
    "a second click while a write is in flight is not a second write",
  );
  assert.match(
    dashboard,
    /setSavingAppointments\(\(prev\) => \(\{ \.\.\.prev, \[id\]: "failed" \}\)\)/,
    "a refused change has to be visible on the row it was made on",
  );

  // The regressions themselves, in the words they were written in.
  assert.ok(
    !/setSchedule\(/.test(dashboard),
    "the dashboard no longer holds a schedule of its own to write to",
  );
  assert.ok(
    !/initialSchedule|initialActionQueue/.test(dashboard),
    "no runtime surface starts from the seed fixtures",
  );
  assert.ok(
    !/Dr\. Logan Carton/.test(dashboard),
    "the clinician's name and credentials come from the session",
  );
  assert.match(
    dashboard,
    /providerDisplayLabel\(user\)/,
    "the header names whoever is actually signed in",
  );
});

test("signing one encounter closes the appointment it was written for, and no other", () => {
  const dashboard = readFileSync(join(APP_ROOT, "components", "TodayDashboard.tsx"), "utf8");

  // The defect: `prev.map(item => item.patientId === pId ? completed : item)` closed
  // every visit that patient had — a second appointment later the same day, next
  // week's follow-up, a cancelled slot.
  assert.ok(
    !/item\.patientId === pId/.test(dashboard),
    "appointment completion must not be matched on patient id",
  );
  assert.match(
    dashboard,
    /const appointmentId = detail\?\.appointmentId;\s*\n\s*if \(!appointmentId\) \{/,
    "an encounter with no recorded appointment closes nothing",
  );

  const engine = readFileSync(join(APP_ROOT, "lib", "active-visit.ts"), "utf8");
  assert.match(
    engine,
    /export function scheduledVisitFor\(patientId: string\): string \| undefined \{\s*\n\s*if \(!pending \|\| pending\.patientId !== patientId\) return undefined;/,
    "a chart only ever sees the link for its own patient",
  );
  assert.match(
    engine,
    /export function confirmScheduledVisit\(/,
    "the link stops being pending when the server has recorded it, not when it is first read",
  );
});

test("the booking dialog's markup and its styling name the same things", () => {
  const dashboard = readFileSync(join(APP_ROOT, "components", "TodayDashboard.tsx"), "utf8");
  const css = readFileSync(join(APP_ROOT, "globals.css"), "utf8");

  // The dialog was styled once as `.add-appointment-dialog` / `.dialog-*` and the
  // markup was later rewritten with different names, orphaning the whole block — so
  // it rendered as raw browser controls on top of the backdrop. Same shape of defect
  // as the `.home-tab` regression: styling and markup drifted apart with nothing
  // failing. Every class the dialog renders must resolve to a rule.
  const rendered = ["walkin-modal", "modal-header", "modal-close", "modal-body", "modal-actions"];
  for (const className of rendered) {
    assert.match(
      dashboard,
      new RegExp(`className="[^"]*\\b${className}\\b`),
      `${className} should still be in the dialog markup`,
    );
    assert.match(
      css,
      new RegExp(`\\.${className}[\\s,{:.]`),
      `.${className} is rendered but has no styling — the dialog is drifting again`,
    );
  }

  // Rules, not mentions: the comment above the replacement names the old selectors
  // on purpose, so that the next person reading this block knows what happened.
  assert.ok(
    !/^\s*\.(add-appointment-dialog|dialog-form|dialog-header|two-col-inputs|dialog-actions)\b[^\n]*\{/m.test(css),
    "the orphaned dialog block should be gone, not left beside its replacement",
  );

  // Cancel and submit go through the shared Button, so the dialog cannot grow its
  // own button styling for the 152nd time.
  assert.match(dashboard, /<Button\s+type="submit"\s+variant="primary"/);
  assert.match(dashboard, /loading=\{bookingSubmitting\}/);
});

test("a clinic day can be booked at any half hour it runs, noon included", async () => {
  const { timeStringToMinutes } = await import("../app/lib/schedule-data");
  const dashboard = readFileSync(join(APP_ROOT, "components", "TodayDashboard.tsx"), "utf8");

  // The hand-written list ran 08:00–11:30 and then jumped to 01:00 PM: there was no
  // way to book anything at noon at all.
  assert.ok(
    !/<option value="01:00 PM">/.test(dashboard),
    "the hand-written slot list should be generated instead",
  );
  assert.match(dashboard, /const BOOKING_SLOT_MINUTES/);

  const slots = Array.from({ length: 25 }, (_, index) => 7 * 60 + index * 30);
  const labels = slots.map((minutes) => {
    const hours24 = Math.floor(minutes / 60);
    const period = hours24 >= 12 ? "PM" : "AM";
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    return `${hours12}:${String(minutes % 60).padStart(2, "0")} ${period}`.padStart(8, "0");
  });

  assert.equal(labels[0], "07:00 AM");
  assert.ok(labels.includes("12:00 PM"), "noon is bookable");
  assert.ok(labels.includes("12:30 PM"));
  assert.equal(labels[labels.length - 1], "07:00 PM");

  // Padded to match how appointments are already stored, and every label has to
  // survive the round trip the roster sorts on.
  for (const label of labels) {
    assert.match(label, /^\d{2}:\d{2} [AP]M$/, `${label} should be zero-padded`);
  }
  const minutes = labels.map(timeStringToMinutes);
  assert.deepEqual(minutes, [...minutes].sort((a, b) => a - b));
  assert.deepEqual(minutes, slots, "a slot label parses back to the minute it came from");
});

test("the practice clock decides the next bookable slot, not the browser's", async () => {
  const { practiceMinutesNow } = await import("../app/lib/practice-calendar");
  const dashboard = readFileSync(join(APP_ROOT, "components", "TodayDashboard.tsx"), "utf8");

  const minutes = practiceMinutesNow();
  assert.ok(Number.isInteger(minutes) && minutes >= 0 && minutes < 1440, `got ${minutes}`);

  assert.match(
    dashboard,
    /const minutesNow = practiceMinutesNow\(\);/,
    "same reasoning as the date: a laptop in another timezone books the clinic's slots",
  );
});
