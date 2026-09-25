import type { DatabaseSync } from "node:sqlite";
import { patients } from "../../domain/patient";
import { patientEncounterHistory } from "../../lib/clinical-protocols";
import { initialPatientThreads } from "../../domain/messages";
import { initialTasks, initialScratchNotes } from "../../domain/tasks";
import { SEED_SCHEDULE_ANCHOR_DATE, seedSchedule } from "../../domain/schedule-seed";
import { practiceToday } from "../../lib/practice-calendar";

export function seedDatabaseIfEmpty(db: DatabaseSync) {
  const patientMap = new Map(patients.map((p) => [p.id, p.name]));
  const now = new Date().toISOString();

  // Ensure encounters_fts is populated if empty
  try {
    const ftsCheck = db.prepare("SELECT COUNT(*) as count FROM encounters_fts").get() as { count: number } | undefined;
    if (!ftsCheck || ftsCheck.count === 0) {
      const insertFts = db.prepare(`
        INSERT INTO encounters_fts (
          encounter_id, patient_id, patient_name, date,
          chief_complaint, hpi, interval_history, treatment_response, assessment, plan
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const [patientId, encList] of Object.entries(patientEncounterHistory)) {
        const pName = patientMap.get(patientId) || patientId;
        for (const enc of encList) {
          insertFts.run(
            enc.id,
            patientId,
            pName,
            enc.date,
            enc.chiefComplaint || "",
            enc.hpi || "",
            "Denies acute worsening; stable interval functional status.",
            "Positive response noted on current titration schedule.",
            enc.assessment || "",
            enc.plan || ""
          );
        }
      }
    }
  } catch (err) {
    console.error("Error checking or populating encounters_fts:", err);
  }

  // Ensure appointments table is populated if empty
  try {
    const apptCheck = db.prepare("SELECT COUNT(*) as count FROM appointments").get() as { count: number } | undefined;
    if (shouldSeedDemoSchedule() && (!apptCheck || apptCheck.count === 0)) {
      const insertAppt = db.prepare(`
        INSERT OR IGNORE INTO appointments (
          id, date, patient_id, patient_name, dob, age, mrn,
          time, duration, type, status, chief_complaint, room,
          alert, insurance, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // The fixture days are written against one anchor date; a demo practice needs
      // them on the calendar it is actually opened on. Seeding runs only when the
      // table is empty, so this never moves an appointment somebody recorded.
      const today = practiceToday();

      for (const apt of seedSchedule) {
        insertAppt.run(
          apt.id,
          seededScheduleDate(apt.date, today),
          apt.patientId,
          apt.patientName,
          apt.dob,
          apt.age,
          apt.mrn,
          apt.time,
          apt.duration,
          apt.type,
          apt.status,
          apt.chiefComplaint,
          apt.room || null,
          apt.alert || null,
          apt.insurance,
          now,
          now
        );
      }
    }
  } catch (err) {
    console.error("Error checking or populating appointments:", err);
  }

  // 1. Seed Patients (idempotent insert for all rostered patients)
  // No `age` column: date of birth is the stored fact and age is derived at read
  // time. The fixtures still carry an age for presentation tests; it is not written.
  const insertPatient = db.prepare(`
    INSERT OR IGNORE INTO patients (
      id, name, dob, mrn, status, pronouns, initials, alert,
      allergies_json, diagnoses_json, meds_json, vitals_json,
      last_visit, next_visit, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of patients) {
    insertPatient.run(
      p.id,
      p.name,
      p.dob,
      p.mrn,
      p.status,
      p.pronouns,
      p.initials,
      p.alert || null,
      JSON.stringify(
        p.id === "maya-chen"
          ? ["Penicillin (Rash)"]
          : p.id === "jordan-reed"
          ? ["Sulfa drugs (Hives)"]
          : p.id === "david-kim"
          ? ["Sulfa drugs (Nausea)"]
          : p.id === "marcus-vance"
          ? ["Aspirin (Gastritis)"]
          : ["NKDA"]
      ),
      JSON.stringify(p.diagnoses),
      JSON.stringify(p.meds),
      JSON.stringify(
        p.id === "maya-chen"
          ? { bp: "118/76", hr: 72, wt: "138 lbs", bmi: "22.4" }
          : p.id === "elena-rostova"
          ? { bp: "128/82", hr: 76, wt: "144 lbs", bmi: "23.1" }
          : p.id === "david-kim"
          ? { bp: "122/78", hr: 70, wt: "168 lbs", bmi: "24.2" }
          : p.id === "marcus-vance"
          ? { bp: "120/78", hr: 72, wt: "178 lbs", bmi: "24.9" }
          : { bp: "124/80", hr: 78, wt: "172 lbs", bmi: "24.8" }
      ),
      p.lastVisit,
      p.nextVisit,
      now,
      now
    );
  }

  // 2. Seed Encounters
  const insertEncounter = db.prepare(`
    INSERT OR IGNORE INTO encounters (
      id, patient_id, date, type, status, chief_complaint, hpi,
      interval_history, treatment_response, side_effects, mse_json,
      assessment, plan, cpt_code, em_level, signed_by, signed_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const [patientId, encList] of Object.entries(patientEncounterHistory)) {
    for (const enc of encList) {
      insertEncounter.run(
        enc.id,
        patientId,
        enc.date,
        enc.type,
        "signed",
        enc.chiefComplaint || "",
        enc.hpi,
        "Denies acute worsening; stable interval functional status.",
        "Positive response noted on current titration schedule.",
        "Tolerating well; denies sedation, tremor, rash, or gastrointestinal upset.",
        JSON.stringify({ appearance: "Well-groomed", mood: "Euthymic", affect: "Congruent", thoughtProcess: "Linear", insight: "Intact" }),
        enc.assessment,
        enc.plan,
        "99214",
        "Moderate Complexity (99214)",
        "Dr. Logan Carton, MD",
        enc.date,
        now,
        now
      );
    }
  }

  // 3. Seed Messages
  const insertMessage = db.prepare(`
    INSERT OR IGNORE INTO messages (
      id, patient_id, thread_id, subject, category, urgency, channel,
      sender_role, sender_name, content, ai_triage_summary, clinical_intent,
      suggested_actions_json, smart_replies_json, status, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const [patientId, threads] of Object.entries(initialPatientThreads)) {
    for (const th of threads) {
      for (const msg of th.messages) {
        insertMessage.run(
          msg.id,
          patientId,
          th.id,
          th.subject,
          th.category,
          th.urgency,
          msg.channel,
          msg.senderRole,
          msg.senderName,
          msg.content,
          th.aiTriageSummary,
          th.clinicalIntent,
          JSON.stringify(th.suggestedActions),
          JSON.stringify(th.smartReplies),
          msg.status,
          msg.timestamp
        );
      }
    }
  }

  // 4. Seed Tasks & Scratchpad
  const insertTask = db.prepare(`
    INSERT OR IGNORE INTO tasks (
      id, patient_id, text, completed, due_date, type, color, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const t of initialTasks) {
    insertTask.run(
      t.id,
      t.patientId || null,
      t.text,
      t.completed ? 1 : 0,
      t.due || "Today",
      "task",
      null,
      now,
      now
    );
  }

  // Scratchpad seed rows land in `tasks` first; migration 2026-09-25-002 moves
  // them into author-owned `scratch_notes` on this same startup.
  for (const sn of initialScratchNotes) {
    insertTask.run(
      sn.id,
      sn.patientId || null,
      sn.text,
      0,
      null,
      "scratchpad",
      sn.color,
      now,
      now
    );
  }

  // 5. Seed Initial Audit Log
  const insertAudit = db.prepare(`
    INSERT OR IGNORE INTO audit_logs (
      id, timestamp, user_id, user_name, user_role, event_type,
      patient_id, description, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAudit.run(
    "audit-init-1",
    now,
    "system",
    "Home Base DB Engine",
    "system",
    "system_init",
    null,
    "EHR home-base SQLite database initialized and synthetic psychiatric clinical records seeded.",
    JSON.stringify({ version: "1.0", syntheticData: true })
  );
}

/** The two variables the seeding decision reads; `process.env` satisfies it. */
type SeedEnvironment = {
  readonly NODE_TEST_CONTEXT?: string;
  readonly EHR_SEED_DEMO_SCHEDULE?: string;
  readonly [name: string]: string | undefined;
};

/**
 * Whether a fresh database should receive the demo clinic day.
 *
 * The demo schedule exists so that a first install opens on a realistic day, which
 * is why the rows are shifted onto the practice calendar rather than left on the
 * one Friday they are written for. A unit test gets none of that benefit and pays
 * the whole cost: the fixture day slides one day further every day the suite runs,
 * so an appointment a test books for a date it believes is empty eventually meets
 * whichever seeded visit has arrived on that slot. `tests/intake-workflow.test.ts`
 * failed exactly that way on 2026-09-21, when `apt-tue-1` reached its 2026-09-25
 * 10:00 AM hold and the schedule-conflict guard correctly refused the booking.
 *
 * Moving the test's date only relocates the collision, and freezing the shift only
 * makes it land on a different test. The unit suite owns its own schedule instead:
 * every test that needs an appointment already creates one, so a database with no
 * demo clinic day in it contains exactly what the test under it put there, on any
 * calendar day. Nothing about the fixtures, the shift, or any assertion changes.
 *
 * `NODE_TEST_CONTEXT` is set by Node in every `--test` worker, so this holds
 * whether the suite was started by `npm test` or by running one file directly.
 * `EHR_SEED_DEMO_SCHEDULE` overrides it in either direction; the browser suite
 * sets it to "1" because that suite does want a populated practice.
 */
export function shouldSeedDemoSchedule(env: SeedEnvironment = process.env): boolean {
  if (env.EHR_SEED_DEMO_SCHEDULE === "0") return false;
  if (env.EHR_SEED_DEMO_SCHEDULE === "1") return true;
  return !env.NODE_TEST_CONTEXT;
}

/**
 * The date a fixture row written for `fixtureDate` is seeded on, given the clinic
 * day the database is first opened on.
 *
 * The set is authored around one anchor Friday and expresses two different
 * relationships, which is why one offset cannot carry it. The anchor's own week
 * is written *in days* — yesterday's completed visits, today's clinic, tomorrow —
 * and the block after it is written *in weeks*: "Upcoming Week", a second visit
 * for a patient who was already seen, deliberately on the far side of a week
 * boundary. Shifting everything by the same number of days kept the first
 * relationship and destroyed the second, pulling next week's Monday into the
 * displayed week whenever `today` was not a Friday. Jordan Reed then appeared
 * twice in one week — once waiting, once scheduled — which is not a practice week
 * any clinician would recognise, and which `tool-navigation`'s CB-3 case had been
 * failing on since the shift was introduced.
 *
 * So each block is placed by the relationship it was written to express:
 *
 * - The anchor's week keeps the day shift. Today is always the anchor day, so a
 *   first install always opens on a populated clinic day with yesterday behind it.
 * - A later week is placed that many weeks after *today's* week, keeping its
 *   authored weekday. Next week's Monday is a Monday next week, on any day of the
 *   year.
 *
 * What is deliberately *not* preserved is the anchor's own weekday: an install on
 * a Sunday gets a Sunday clinic. A demo practice that is empty on the day it is
 * opened is the worse failure, and the fixture weekdays live only in comments and
 * row ids — nothing a clinician sees names them.
 */
export function seededScheduleDate(fixtureDate: string, today: string): string {
  const weeksAfterAnchor = wholeWeeksBetween(SEED_SCHEDULE_ANCHOR_DATE, fixtureDate);
  if (weeksAfterAnchor <= 0) {
    return shiftIsoDate(fixtureDate, daysBetween(SEED_SCHEDULE_ANCHOR_DATE, today));
  }
  return shiftIsoDate(
    startOfWeek(today),
    7 * weeksAfterAnchor + weekdayIndex(fixtureDate),
  );
}

/**
 * Whole weeks from one date's week to another's, on the Monday-start weeks the
 * calendar itself renders (`getWeekDates`). A second week-start convention here
 * would put the fixtures in a week the calendar draws a boundary through.
 */
function wholeWeeksBetween(from: string, to: string): number {
  return daysBetween(startOfWeek(from), startOfWeek(to)) / 7;
}

/** The Monday on or before a date. */
function startOfWeek(date: string): string {
  return shiftIsoDate(date, -weekdayIndex(date));
}

/** Days from the week's Monday: Monday is 0, Sunday is 6. */
function weekdayIndex(date: string): number {
  return (new Date(Date.UTC(...isoParts(date))).getUTCDay() + 6) % 7;
}

/** Whole days from one `YYYY-MM-DD` to another, read as calendar dates. */
function daysBetween(from: string, to: string): number {
  const start = Date.UTC(...isoParts(from));
  const end = Date.UTC(...isoParts(to));
  return Math.round((end - start) / 86_400_000);
}

function shiftIsoDate(date: string, days: number): string {
  if (days === 0) return date;
  const shifted = new Date(Date.UTC(...isoParts(date)));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function isoParts(date: string): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number);
  return [year, month - 1, day];
}
