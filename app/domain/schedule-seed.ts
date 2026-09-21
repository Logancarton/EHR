import type { ActionQueueItem, ScheduleItem } from "../lib/schedule-data";

/**
 * The synthetic clinic days a fresh database is seeded with.
 *
 * Seed data, not a runtime schedule. `TodayDashboard` used to start from this array
 * and only replace it when the backend answered with a non-empty list, so an empty
 * day, an access scope containing no appointments and a failed request all rendered
 * the same confident clinic day for patients the signed-in clinician might not be
 * able to open at all. The runtime schedule now comes from `app/lib/schedule-store`
 * and nothing else; a test in `tests/schedule-runtime.test.ts` keeps it that way,
 * the same way `patient-roster-runtime` does for the patient fixtures.
 */

/**
 * The day the fixture dates below are written relative to.
 *
 * The rows carry literal dates because they are easier to read and edit that way,
 * but a demo practice whose clinic days are pinned to one Friday in September is
 * empty on every day after it. `seededScheduleDate` carries the set onto the
 * practice calendar at seed time, so a first install opens on a realistic day with
 * yesterday behind it and next week ahead. Existing databases are never reseeded,
 * so no recorded appointment is ever moved.
 *
 * The two blocks below are not written in the same unit, and that distinction is
 * load-bearing rather than cosmetic. The anchor's own week is written in *days*
 * relative to the anchor — yesterday, today, tomorrow — and the "Upcoming Week"
 * block is written in *weeks*: a second visit for a patient already seen, placed
 * deliberately on the far side of a week boundary. `seededScheduleDate` places
 * each by its own relationship and explains what that costs; a row added here
 * should be put in whichever block matches what it is meant to demonstrate.
 */
export const SEED_SCHEDULE_ANCHOR_DATE = "2026-09-04";

export const seedSchedule: readonly ScheduleItem[] = Object.freeze([
  // Thursday, Sep 3, 2026 (Yesterday - completed)
  {
    id: "apt-y-1",
    date: "2026-09-03",
    patientId: "marcus-vance",
    patientName: "Marcus Vance",
    dob: "08/14/1995",
    age: 31,
    mrn: "P-10231",
    time: "10:00 AM",
    duration: "30 min",
    type: "30-min Med Check",
    status: "completed",
    chiefComplaint: "Prior day routine medication check.",
    room: "Room 1",
    insurance: "Blue Cross Blue Shield",
  },
  {
    id: "apt-y-2",
    date: "2026-09-03",
    patientId: "david-kim",
    patientName: "David Kim",
    dob: "12/05/1979",
    age: 46,
    mrn: "P-10889",
    time: "02:00 PM",
    duration: "45 min",
    type: "Psychotherapy + Meds",
    status: "completed",
    chiefComplaint: "Mood check and coping strategies.",
    room: "Room 2",
    insurance: "Cigna Open Access",
  },

  // Friday, Sep 4, 2026 (Today)
  {
    id: "apt-1",
    date: "2026-09-04",
    patientId: "marcus-vance",
    patientName: "Marcus Vance",
    dob: "08/14/1995",
    age: 31,
    mrn: "P-10231",
    time: "09:00 AM",
    duration: "30 min",
    type: "30-min Med Check",
    status: "completed",
    chiefComplaint: "ADHD medication refill and work focus review.",
    room: "Room 1",
    insurance: "Blue Cross Blue Shield",
  },
  {
    id: "apt-2",
    date: "2026-09-04",
    patientId: "maya-chen",
    patientName: "Maya Chen",
    dob: "04/18/1992",
    age: 34,
    mrn: "P-10482",
    time: "10:30 AM",
    duration: "45 min",
    type: "Psychotherapy + Meds",
    status: "completed",
    chiefComplaint: "Anxiety symptoms, sleep onset, Guanfacine titration response.",
    room: "Room 2",
    insurance: "Aetna Choice POS",
  },
  {
    id: "apt-3",
    date: "2026-09-04",
    patientId: "elena-rostova",
    patientName: "Elena Rostova",
    dob: "03/22/1988",
    age: 38,
    mrn: "P-10764",
    time: "01:15 PM",
    duration: "30 min",
    type: "30-min Med Check",
    status: "in-visit",
    chiefComplaint: "Depressive symptoms, energy level on Bupropion XL.",
    room: "Telehealth Room A",
    insurance: "UnitedHealthcare",
  },
  {
    id: "apt-4",
    date: "2026-09-04",
    patientId: "david-kim",
    patientName: "David Kim",
    dob: "12/05/1979",
    age: 46,
    mrn: "P-10889",
    time: "02:45 PM",
    duration: "30 min",
    type: "30-min Med Check",
    status: "completed",
    chiefComplaint: "Bipolar II maintenance, Lithium level review.",
    room: "Room 1",
    insurance: "Cigna Open Access",
  },
  {
    id: "apt-5",
    date: "2026-09-04",
    patientId: "jordan-reed",
    patientName: "Jordan Reed",
    dob: "11/03/1986",
    age: 39,
    mrn: "P-10917",
    time: "04:30 PM",
    duration: "30 min",
    type: "30-min Med Check",
    status: "waiting",
    chiefComplaint: "Mood stabilization review, sleep quality on Quetiapine.",
    room: "Waiting Room · Lobby",
    alert: "Metabolic surveillance labs overdue (Fasting Lipids & HbA1c)",
    insurance: "Blue Cross Blue Shield",
  },
  {
    id: "apt-6",
    date: "2026-09-04",
    patientId: "sofia-martinez",
    patientName: "Sofia Martinez",
    dob: "01/27/2008",
    age: 18,
    mrn: "P-11104",
    time: "05:15 PM",
    duration: "60 min",
    type: "60-min Intake",
    status: "scheduled",
    chiefComplaint: "Comprehensive adolescent mood evaluation, college transition stress.",
    room: "Room 3",
    insurance: "Kaiser Permanente",
  },

  // Saturday, Sep 5, 2026 (Tomorrow)
  {
    id: "apt-sat-1",
    date: "2026-09-05",
    patientId: "maya-chen",
    patientName: "Maya Chen",
    dob: "04/18/1992",
    age: 34,
    mrn: "P-10482",
    time: "10:00 AM",
    duration: "30 min",
    type: "Urgent Walk-in",
    status: "scheduled",
    chiefComplaint: "Urgent check-in regarding prescription refill prior authorization.",
    room: "Telehealth Room B",
    insurance: "Aetna Choice POS",
  },

  // Monday, Sep 7, 2026 (Upcoming Week)
  {
    id: "apt-mon-1",
    date: "2026-09-07",
    patientId: "jordan-reed",
    patientName: "Jordan Reed",
    dob: "11/03/1986",
    age: 39,
    mrn: "P-10917",
    time: "09:30 AM",
    duration: "30 min",
    type: "30-min Med Check",
    status: "scheduled",
    chiefComplaint: "Follow-up on metabolic blood draws and Quest lab receipts.",
    room: "Room 2",
    insurance: "Blue Cross Blue Shield",
  },
  {
    id: "apt-mon-2",
    date: "2026-09-07",
    patientId: "sofia-martinez",
    patientName: "Sofia Martinez",
    dob: "01/27/2008",
    age: 18,
    mrn: "P-11104",
    time: "11:00 AM",
    duration: "45 min",
    type: "Psychotherapy + Meds",
    status: "scheduled",
    chiefComplaint: "Psychotherapy session #1: College adjustment coping tools.",
    room: "Room 1",
    insurance: "Kaiser Permanente",
  },
  {
    id: "apt-mon-3",
    date: "2026-09-07",
    patientId: "marcus-vance",
    patientName: "Marcus Vance",
    dob: "08/14/1995",
    age: 31,
    mrn: "P-10231",
    time: "02:15 PM",
    duration: "30 min",
    type: "30-min Med Check",
    status: "scheduled",
    chiefComplaint: "Work performance rating scale follow-up.",
    room: "Room 3",
    insurance: "Blue Cross Blue Shield",
  },

  // Tuesday, Sep 8, 2026
  {
    id: "apt-tue-1",
    date: "2026-09-08",
    patientId: "david-kim",
    patientName: "David Kim",
    dob: "12/05/1979",
    age: 46,
    mrn: "P-10889",
    time: "10:00 AM",
    duration: "30 min",
    type: "30-min Med Check",
    status: "scheduled",
    chiefComplaint: "Lithium level confirmation and hydration review.",
    room: "Room 1",
    insurance: "Cigna Open Access",
  },
  {
    id: "apt-tue-2",
    date: "2026-09-08",
    patientId: "elena-rostova",
    patientName: "Elena Rostova",
    dob: "03/22/1988",
    age: 38,
    mrn: "P-10764",
    time: "01:30 PM",
    duration: "45 min",
    type: "Psychotherapy + Meds",
    status: "scheduled",
    chiefComplaint: "CBT for dysthymia and behavioral activation.",
    room: "Telehealth Room A",
    insurance: "UnitedHealthcare",
  },
]);

export const seedActionQueue: readonly ActionQueueItem[] = Object.freeze([
  {
    id: "act-1",
    type: "unsigned-note",
    title: "Unsigned Encounter Draft",
    patientId: "maya-chen",
    patientName: "Maya Chen",
    date: "Aug 12, 2026",
    summary: "Psychiatric Follow-Up draft awaiting final review & signature.",
    actionLabel: "Review & Sign",
    targetSection: "Encounter",
  },
  {
    id: "act-2",
    type: "lab-alert",
    title: "Overdue Lab Surveillance",
    patientId: "jordan-reed",
    patientName: "Jordan Reed",
    date: "Due now",
    summary: "Fasting Lipid Panel & HbA1c overdue 446 days for Quetiapine protocol.",
    actionLabel: "Draft Orders",
    targetSection: "Labs",
  },
  {
    id: "act-3",
    type: "portal-message",
    title: "Prescription Refill Request",
    patientId: "maya-chen",
    patientName: "Maya Chen",
    date: "Today · 11:15 AM",
    summary: "Requested 90-day refill for Sertraline 100mg with preferred local pharmacy.",
    actionLabel: "Review Request",
    targetSection: "Meds",
  },
]);
