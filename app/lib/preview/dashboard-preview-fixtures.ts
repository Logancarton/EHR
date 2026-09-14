/**
 * Synthetic content for the DB-1 dashboard prototype.
 *
 * Every name, record and figure below is invented for this preview. Nothing here is
 * read from the database, written to it, or derived from a real person: the preview
 * imports this module and makes no network request at all, which is how "no demo
 * action is wired to a clinical write" is guaranteed by construction rather than by
 * remembering not to.
 *
 * The day sets are the ones DB-1 asks the prototype to be inspected against: a full
 * day, an empty day, two patients who share a name, one patient with two visits in
 * the same day, a cancelled visit, and pending work belonging to someone who is not
 * on today's schedule at all.
 */

export type PreviewVisitStatus =
  | "scheduled"
  | "confirmed"
  | "arrived"
  | "in-visit"
  | "completed"
  | "no-show"
  | "cancelled";

export const PREVIEW_VISIT_STATUS_LABEL: Record<PreviewVisitStatus, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  arrived: "In office",
  "in-visit": "In visit",
  completed: "Completed",
  "no-show": "No show",
  cancelled: "Cancelled",
};

export type PreviewVisit = {
  /** The appointment's own identity. Two visits for one patient are two rows. */
  id: string;
  time: string;
  /** Minutes from midnight, so the timeline can place the row without reparsing. */
  startMinutes: number;
  durationMinutes: number;
  patientId: string;
  patientName: string;
  mrn: string;
  dob: string;
  age: number;
  visitType: string;
  reason: string;
  status: PreviewVisitStatus;
  room?: string;
  telehealth?: boolean;
  insurance: string;
  coverageNote?: string;
  /** A safety or workflow flag; never a diagnosis and never an invented threshold. */
  flag?: string;
  waitingMinutes?: number;
  /**
   * Why a cancelled visit was cancelled, and who said so.
   *
   * Present only on cancelled visits, and operational rather than clinical: this
   * records a scheduling fact, never a reason for care. `note` is free text a person
   * wrote. An absent reason is shown as absent — never guessed from the status.
   */
  cancellation?: {
    reason: PreviewCancellationReason;
    note?: string;
    recordedBy: string;
    recordedAt: string;
  };
};

/**
 * The reasons a visit comes off the schedule.
 *
 * Deliberately operational. A cancellation is a fact about the calendar, and a
 * dropdown here that offered clinical explanations would invite a clinical claim
 * being recorded by whoever happened to answer the phone.
 */
export const PREVIEW_CANCELLATION_REASONS = [
  "Patient cancelled",
  "Patient rescheduled",
  "Patient did not confirm",
  "Practice cancelled",
  "Coverage or authorization problem",
  "Clinic closure",
  "Other — see note",
] as const;

export type PreviewCancellationReason = (typeof PREVIEW_CANCELLATION_REASONS)[number];

export type PreviewDayId = "full" | "empty";

export type PreviewDay = {
  id: PreviewDayId;
  label: string;
  /** What this fixture is here to show, printed in the preview's own day picker. */
  note: string;
  heading: string;
  visits: readonly PreviewVisit[];
};

/* --- The full clinic day -------------------------------------------------- */

const FULL_DAY_VISITS: readonly PreviewVisit[] = [
  {
    id: "apt-p1",
    time: "8:00 AM",
    startMinutes: 8 * 60,
    durationMinutes: 30,
    patientId: "prv-webb",
    patientName: "Marcus Webb",
    mrn: "DEMO-10241",
    dob: "1987-03-14",
    age: 39,
    visitType: "30-min med check",
    reason: "Lamotrigine titration review",
    status: "completed",
    room: "2",
    insurance: "Demo Health PPO",
  },
  {
    id: "apt-p2",
    time: "8:30 AM",
    startMinutes: 8 * 60 + 30,
    durationMinutes: 30,
    patientId: "prv-alvarez-a",
    patientName: "Maria Alvarez",
    mrn: "DEMO-10388",
    dob: "1994-11-02",
    age: 31,
    visitType: "30-min med check",
    reason: "Sertraline follow-up",
    status: "completed",
    room: "1",
    insurance: "Demo Health PPO",
    // Two different people share this name today. The row keeps DOB and MRN
    // reachable so the wrong chart is not opened out of habit.
    flag: "Shares a name with another patient on today's schedule",
  },
  {
    id: "apt-p3",
    time: "9:00 AM",
    startMinutes: 9 * 60,
    durationMinutes: 60,
    patientId: "prv-okafor",
    patientName: "Tolu Okafor",
    mrn: "DEMO-10455",
    dob: "2001-06-21",
    age: 25,
    visitType: "60-min intake",
    reason: "New patient — anxiety, sleep",
    status: "in-visit",
    room: "3",
    insurance: "Demo State Managed Care",
    coverageNote: "Eligibility not yet verified",
  },
  {
    id: "apt-p4",
    time: "10:15 AM",
    startMinutes: 10 * 60 + 15,
    durationMinutes: 30,
    patientId: "prv-alvarez-b",
    patientName: "Maria Alvarez",
    mrn: "DEMO-11907",
    dob: "1968-04-30",
    age: 58,
    visitType: "30-min med check",
    reason: "Bupropion review",
    status: "arrived",
    room: "1",
    insurance: "Demo Medicare Advantage",
    waitingMinutes: 12,
    flag: "Shares a name with another patient on today's schedule",
  },
  {
    id: "apt-p5",
    time: "10:45 AM",
    startMinutes: 10 * 60 + 45,
    durationMinutes: 45,
    patientId: "prv-lindqvist",
    patientName: "Annika Lindqvist",
    mrn: "DEMO-10512",
    dob: "1979-09-08",
    age: 46,
    visitType: "45-min therapy + meds",
    reason: "Ongoing therapy, medication review",
    status: "arrived",
    insurance: "Demo Health PPO",
    waitingMinutes: 3,
  },
  {
    id: "apt-p6",
    time: "11:30 AM",
    startMinutes: 11 * 60 + 30,
    durationMinutes: 30,
    patientId: "prv-santos",
    patientName: "Rafael Santos",
    mrn: "DEMO-10620",
    dob: "1990-01-17",
    age: 36,
    visitType: "30-min med check",
    reason: "Stimulant follow-up",
    status: "cancelled",
    insurance: "Demo Health PPO",
    // Off the active roster after Logan's DB-1 review, reachable through the
    // cancelled list, and carrying why it was cancelled rather than only that it
    // was. The slot is still a fact about the day; it is just not work.
    cancellation: {
      reason: "Patient rescheduled",
      note: "Asked for the same slot next Thursday. Front desk to call back.",
      recordedBy: "Front desk",
      recordedAt: "7:52 AM",
    },
  },
  {
    id: "apt-p7",
    time: "12:00 PM",
    startMinutes: 12 * 60,
    durationMinutes: 30,
    patientId: "prv-bennett",
    patientName: "Dana Bennett",
    mrn: "DEMO-10733",
    dob: "1996-12-05",
    age: 29,
    visitType: "30-min med check",
    reason: "Telehealth — mood check",
    status: "confirmed",
    telehealth: true,
    insurance: "Demo Health HMO",
  },
  {
    id: "apt-p8",
    time: "1:30 PM",
    startMinutes: 13 * 60 + 30,
    durationMinutes: 45,
    patientId: "prv-ferraro",
    patientName: "Gio Ferraro",
    mrn: "DEMO-10804",
    dob: "1985-07-23",
    age: 41,
    visitType: "45-min therapy + meds",
    reason: "Therapy, lithium level review",
    status: "confirmed",
    room: "2",
    insurance: "Demo Health PPO",
    flag: "Monitoring due — see medication window",
  },
  {
    id: "apt-p9",
    time: "2:30 PM",
    startMinutes: 14 * 60 + 30,
    durationMinutes: 30,
    patientId: "prv-nakamura",
    patientName: "Ellis Nakamura",
    mrn: "DEMO-10918",
    dob: "2004-02-11",
    age: 22,
    visitType: "30-min med check",
    reason: "ADHD medication review",
    status: "scheduled",
    insurance: "Demo Student Health",
    coverageNote: "Referral on file expires this month",
  },
  {
    id: "apt-p10",
    time: "3:15 PM",
    startMinutes: 15 * 60 + 15,
    durationMinutes: 30,
    patientId: "prv-haddad",
    patientName: "Yara Haddad",
    mrn: "DEMO-11002",
    dob: "1973-05-19",
    age: 53,
    visitType: "30-min med check",
    reason: "Follow-up after ED visit",
    status: "no-show",
    insurance: "Demo Medicare Advantage",
  },
  {
    id: "apt-p11",
    time: "4:15 PM",
    startMinutes: 16 * 60 + 15,
    durationMinutes: 30,
    patientId: "prv-webb",
    patientName: "Marcus Webb",
    mrn: "DEMO-10241",
    dob: "1987-03-14",
    age: 39,
    visitType: "30-min urgent add-on",
    reason: "Added this morning — side effects",
    status: "scheduled",
    insurance: "Demo Health PPO",
    // The same patient, a second visit, its own appointment identity. Signing the
    // morning note must not close this one; that is the defect DB-0 fixed and the
    // reason this fixture exists.
    flag: "Second visit today for this patient",
  },
];

const EXTRA_CANCELLED: PreviewVisit = {
  id: "apt-p12",
  time: "2:00 PM",
  startMinutes: 14 * 60,
  durationMinutes: 30,
  patientId: "prv-osei",
  patientName: "Kwame Osei",
  mrn: "DEMO-11145",
  dob: "1992-08-27",
  age: 33,
  visitType: "30-min med check",
  reason: "Follow-up",
  status: "cancelled",
  insurance: "Demo Health HMO",
  // No `cancellation`. The panel says the reason was not recorded rather than
  // inventing one from the status, and offers to add it.
};

export const PREVIEW_DAYS: readonly PreviewDay[] = [
  {
    id: "full",
    label: "Full clinic day",
    note: "Two patients share a name, one patient has two visits, one is a no-show. Two cancellations sit off the roster — one with a recorded reason, one without.",
    heading: "Thursday, 17 September",
    visits: [...FULL_DAY_VISITS, EXTRA_CANCELLED].sort((a, b) => a.startMinutes - b.startMinutes),
  },
  {
    id: "empty",
    label: "Empty day",
    note: "Nothing scheduled. The real empty state, not a placeholder day.",
    heading: "Friday, 18 September",
    visits: [],
  },
];

export function previewDay(id: PreviewDayId): PreviewDay {
  const day = PREVIEW_DAYS.find((candidate) => candidate.id === id);
  if (!day) throw new Error(`Unknown preview day: ${id}`);
  return day;
}

/* --- Window contents ------------------------------------------------------ */

export type PreviewWorkItem = {
  id: string;
  title: string;
  detail: string;
  /** Who it concerns; blank for items that are not patient-bound. */
  patientName?: string;
  meta: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  /** Present when this person is not on the day currently being shown. */
  offSchedule?: boolean;
};

export const PREVIEW_PREP_ITEMS: readonly PreviewWorkItem[] = [
  {
    id: "prep-1",
    title: "New-patient intake to read",
    detail: "Intake questionnaire and outside records returned; nothing reviewed yet.",
    patientName: "Tolu Okafor",
    meta: "9:00 AM · 60-min intake",
    tone: "info",
  },
  {
    id: "prep-2",
    title: "Last visit's plan",
    detail: "Bupropion increased at the previous visit; response not yet documented.",
    patientName: "Maria Alvarez · DEMO-11907",
    meta: "10:15 AM · 30-min med check",
    tone: "neutral",
  },
  {
    id: "prep-3",
    title: "Outside record received",
    detail: "Discharge summary filed since the visit was booked.",
    patientName: "Yara Haddad",
    meta: "3:15 PM · 30-min med check",
    tone: "info",
  },
];

export const PREVIEW_FOLLOWUP_ITEMS: readonly PreviewWorkItem[] = [
  {
    id: "fu-1",
    title: "Unsigned encounter draft",
    detail: "30-min med check — lamotrigine titration review.",
    patientName: "Marcus Webb",
    meta: "Today, 8:00 AM visit",
    tone: "warning",
  },
  {
    id: "fu-2",
    title: "Unsigned encounter draft",
    detail: "45-min therapy + meds — draft left open.",
    patientName: "Priya Raghunathan",
    meta: "Tuesday · not on today's schedule",
    tone: "warning",
    offSchedule: true,
  },
  {
    id: "fu-3",
    title: "Result to acknowledge",
    detail: "Comprehensive metabolic panel returned.",
    patientName: "Priya Raghunathan",
    meta: "Monday · not on today's schedule",
    tone: "danger",
    offSchedule: true,
  },
  {
    id: "fu-4",
    title: "Result to acknowledge",
    detail: "Thyroid panel returned.",
    patientName: "Gio Ferraro",
    meta: "Yesterday",
    tone: "info",
  },
];

export const PREVIEW_MED_ITEMS: readonly PreviewWorkItem[] = [
  {
    id: "med-1",
    title: "Refill request",
    detail: "Requested through the pharmacy; not yet reviewed.",
    patientName: "Annika Lindqvist",
    meta: "Received 7:41 AM",
    tone: "warning",
  },
  {
    id: "med-2",
    title: "Monitoring due",
    detail: "Lithium level not on file for the current interval.",
    patientName: "Gio Ferraro",
    meta: "Seen today at 1:30 PM",
    tone: "danger",
  },
  {
    id: "med-3",
    title: "Prescription awaiting transmission",
    detail: "Authorized, not yet sent to the pharmacy.",
    patientName: "Ellis Nakamura",
    meta: "Authorized yesterday",
    tone: "info",
  },
];

export const PREVIEW_MESSAGE_ITEMS: readonly PreviewWorkItem[] = [
  {
    id: "msg-1",
    title: "Patient message",
    detail: "Asks whether to keep taking the evening dose before tomorrow's lab.",
    patientName: "Dana Bennett",
    meta: "Unanswered · 2 hours",
    tone: "warning",
  },
  {
    id: "msg-2",
    title: "Call back",
    detail: "Pharmacy called about a prior authorization.",
    patientName: "Ellis Nakamura",
    meta: "Unanswered · 40 minutes",
    tone: "info",
  },
];

export const PREVIEW_ARRIVAL_ITEMS: readonly PreviewWorkItem[] = [
  {
    id: "arr-1",
    title: "Waiting — 12 minutes",
    detail: "Checked in, room 1, paperwork complete.",
    patientName: "Maria Alvarez · DEMO-11907",
    meta: "10:15 AM visit",
    tone: "warning",
  },
  {
    id: "arr-2",
    title: "Waiting — 3 minutes",
    detail: "Checked in, no room assigned yet.",
    patientName: "Annika Lindqvist",
    meta: "10:45 AM visit",
    tone: "neutral",
  },
  {
    id: "arr-3",
    title: "In room 3",
    detail: "With the prescriber since 9:04 AM.",
    patientName: "Tolu Okafor",
    meta: "9:00 AM intake",
    tone: "info",
  },
];

export const PREVIEW_INTAKE_ITEMS: readonly PreviewWorkItem[] = [
  {
    id: "int-1",
    title: "Eligibility not verified",
    detail: "Managed-care plan; coverage not checked for today's visit.",
    patientName: "Tolu Okafor",
    meta: "9:00 AM intake",
    tone: "danger",
  },
  {
    id: "int-2",
    title: "Referral expiring",
    detail: "Referral on file runs out at the end of the month.",
    patientName: "Ellis Nakamura",
    meta: "2:30 PM visit",
    tone: "warning",
  },
  {
    id: "int-3",
    title: "Forms outstanding",
    detail: "Consent and release not returned before the intake.",
    patientName: "Tolu Okafor",
    meta: "Sent Monday",
    tone: "warning",
  },
];

export const PREVIEW_HANDOFF_ITEMS: readonly PreviewWorkItem[] = [
  {
    id: "hand-1",
    title: "Handed to the front desk",
    detail: "Book a 6-week follow-up before the patient leaves.",
    patientName: "Marcus Webb",
    meta: "From the prescriber · 8:32 AM · picked up",
    tone: "success",
  },
  {
    id: "hand-2",
    title: "Handed to the prescriber",
    detail: "Pharmacy needs a decision on the prior authorization.",
    patientName: "Ellis Nakamura",
    meta: "From the front desk · 9:15 AM · not picked up",
    tone: "warning",
  },
];

/* --- Sample financial content, marked Demo everywhere it appears ---------- */

export type PreviewDemoFigure = {
  id: string;
  label: string;
  value: string;
  note: string;
};

export const PREVIEW_BILLING_FIGURES: readonly PreviewDemoFigure[] = [
  { id: "bill-1", label: "Claims held", value: "6", note: "Missing a coded diagnosis" },
  { id: "bill-2", label: "Rejected this week", value: "2", note: "Coverage terminated" },
  { id: "bill-3", label: "Patient balances over 60 days", value: "$1,840", note: "Across 9 patients" },
  { id: "bill-4", label: "Copays collected today", value: "$220", note: "4 of 6 arrived patients" },
];

export const PREVIEW_BUSINESS_FIGURES: readonly PreviewDemoFigure[] = [
  { id: "biz-1", label: "Visits completed this week", value: "48", note: "Target 55" },
  { id: "biz-2", label: "Open slots next week", value: "11", note: "Across 2 prescribers" },
  { id: "biz-3", label: "Collections month to date", value: "$38,400", note: "Sample figure" },
  { id: "biz-4", label: "No-show rate, 30 days", value: "7.4%", note: "Sample figure" },
];
