import { practiceToday } from "./practice-calendar";

export type AppointmentStatus =
  | "tentative"
  | "scheduled"
  | "confirmed"
  | "waiting"
  | "in-visit"
  | "completed"
  | "no-show"
  | "cancelled";

/**
 * The states the front desk moves an appointment through before the
 * clinician takes over, in the order they happen. The roster exposes exactly these
 * as a one-click segmented control; everything after arrival (in-visit, completed,
 * no-show) is a clinical outcome and stays in the full status menu.
 *
 * "waiting" is the stored value for a patient who has physically arrived. It is
 * labelled "In Office" because that is what the front desk is actually asserting —
 * the lobby is an implementation detail of where they wait.
 */
export const FRONT_DESK_STATUSES = [
  { value: "tentative", label: "Tentative", icon: "pending", hint: "Time held while intake or confirmation is pending" },
  { value: "scheduled", label: "Scheduled", icon: "event", hint: "On the books, not yet confirmed" },
  { value: "confirmed", label: "Confirmed", icon: "task_alt", hint: "Patient confirmed they are coming" },
  { value: "waiting", label: "In Office", icon: "how_to_reg", hint: "Patient has arrived and is on site" },
] as const satisfies ReadonlyArray<{
  value: AppointmentStatus;
  label: string;
  icon: string;
  hint: string;
}>;

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  tentative: "Tentative",
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  waiting: "In Office",
  "in-visit": "In Visit",
  completed: "Completed",
  "no-show": "No Show",
  cancelled: "Cancelled",
};

export function isAppointmentStatus(value: unknown): value is AppointmentStatus {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(APPOINTMENT_STATUS_LABELS, value);
}

/**
 * Operational cancellation reasons (DASH-06, DB-4).
 * Kept strictly operational (scheduling facts), never clinical inferences.
 */
export const CANCELLATION_REASONS = [
  "Patient cancelled",
  "Patient rescheduled",
  "Patient did not confirm",
  "Practice cancelled",
  "Coverage or authorization problem",
  "Clinic closure",
  "Other — see note",
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export type VisitType =
  | "30-min Med Check"
  | "45-min Therapy + Meds"
  | "60-min Intake"
  | "Psychotherapy + Meds"
  | "Urgent Walk-in"
  | "Team Meeting"
  | "Case Conference"
  | "Supervision"
  | "Admin & Charting"
  | "Break"
  | "Time Off"
  | "Schedule Block";

export const NON_PATIENT_VISIT_TYPES: readonly VisitType[] = [
  "Team Meeting",
  "Case Conference",
  "Supervision",
  "Admin & Charting",
  "Break",
  "Time Off",
  "Schedule Block",
] as const;

export function isNonPatientVisitType(type?: string | null): boolean {
  if (!type) return false;
  return (NON_PATIENT_VISIT_TYPES as readonly string[]).includes(type);
}

export function isNonPatientEvent(patientId?: string | null, type?: string | null): boolean {
  if (patientId && (
    patientId.startsWith("event-") ||
    patientId.startsWith("non-patient-") ||
    patientId === "practice-event"
  )) {
    return true;
  }
  return isNonPatientVisitType(type);
}

/**
 * A prospective/front-door identity (D-076): a tentative caller who has not yet
 * been promoted to a full patient chart. `appointments.patient_id` has no
 * database foreign key, so it already tolerates non-patient sentinels like
 * `event-...`; a prospective person's id reuses that same tolerance rather than
 * requiring a schema change to the appointments table. This is identity-bound,
 * unlike a non-patient event — it still requires patient-access-style
 * authorization, just scoped to the prospect's organization rather than a chart.
 */
export const PROSPECTIVE_PERSON_ID_PREFIX = "prospect-";

export function isProspectivePersonId(id?: string | null): boolean {
  return Boolean(id && id.startsWith(PROSPECTIVE_PERSON_ID_PREFIX));
}

export type ScheduleItem = {
  id: string;
  date: string; // ISO format: YYYY-MM-DD (e.g. 2026-09-04)
  patientId: string;
  patientName: string;
  dob: string;
  age: number;
  mrn: string;
  time: string; // e.g. "09:00 AM"
  duration: string; // e.g. "30 min", "45 min", "60 min"
  type: VisitType;
  status: AppointmentStatus;
  chiefComplaint: string;
  room?: string;
  alert?: string;
  insurance: string;
  modality?: "in-person" | "video";
  providerId?: string;
  providerName?: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  intakeStatus?: "completed" | "pending" | "exempt";
  cancellationReason?: string;
  cancellationNote?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  notes?: string;
  arrivedAt?: string;
  startedAt?: string;
  completedAt?: string;
  followUpInterval?: string;
  originAppointmentId?: string;
  version?: number;
};

/**
 * Standard clinical follow-up intervals for psychiatric encounters.
 */
export const FOLLOW_UP_INTERVALS = [
  "1 week",
  "2 weeks",
  "3 weeks",
  "4 weeks",
  "6 weeks",
  "8 weeks",
  "3 months",
  "6 months",
] as const;

export type FollowUpInterval = (typeof FOLLOW_UP_INTERVALS)[number];

/**
 * Calculates a target date based on a base ISO date and a follow-up interval.
 * Supported intervals: '1 week', '2 weeks', '3 weeks', '4 weeks', '6 weeks', '8 weeks', '3 months', '6 months', '1 year'.
 */
export function calculateFollowUpDate(baseDateStr: string, interval: string): string {
  const d = parseDateString(baseDateStr);
  const lower = interval.toLowerCase().trim();
  if (lower.includes("1 week") || lower === "1w") {
    d.setDate(d.getDate() + 7);
  } else if (lower.includes("2 week") || lower === "2w") {
    d.setDate(d.getDate() + 14);
  } else if (lower.includes("3 week") || lower === "3w") {
    d.setDate(d.getDate() + 21);
  } else if (lower.includes("4 week") || lower === "4w") {
    d.setDate(d.getDate() + 28);
  } else if (lower.includes("6 week") || lower === "6w") {
    d.setDate(d.getDate() + 42);
  } else if (lower.includes("8 week") || lower === "8w") {
    d.setDate(d.getDate() + 56);
  } else if (lower.includes("3 month") || lower === "3m") {
    d.setMonth(d.getMonth() + 3);
  } else if (lower.includes("6 month") || lower === "6m") {
    d.setMonth(d.getMonth() + 6);
  } else if (lower.includes("1 year") || lower === "1y") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setDate(d.getDate() + 28);
  }
  return formatToIsoDate(d);
}

/**
 * Determines if a scheduled appointment on today's roster is late.
 * An appointment is considered late if:
 * 1. It is for today
 * 2. Its status is still 'scheduled' or 'confirmed'
 * 3. The current time has passed its start time plus a 10-minute grace window
 */
export function isAppointmentLate(
  apt: ScheduleItem,
  minutesNow: number,
  todayStr: string = practiceToday(),
): boolean {
  if (apt.date !== todayStr) return false;
  if (apt.status !== "scheduled" && apt.status !== "confirmed") return false;
  const aptMinutes = timeStringToMinutes(apt.time);
  return minutesNow > aptMinutes + 10;
}

/**
 * Calculates elapsed wait time string given an ISO arrival timestamp or scheduled time string.
 */
export function calculateElapsedWait(timeOrIso?: string): string {
  if (!timeOrIso) return "In office";
  try {
    const now = Date.now();
    let arrivalMs = 0;
    if (timeOrIso.includes("T") || (timeOrIso.includes("-") && timeOrIso.length >= 10)) {
      arrivalMs = new Date(timeOrIso).getTime();
    } else {
      const parts = timeOrIso.trim().split(/\s+/);
      if (parts.length < 2) return "In office";
      const [time, period] = parts;
      const [hoursStr, minsStr] = time.split(":");
      let hours = parseInt(hoursStr, 10);
      const mins = parseInt(minsStr, 10);
      if (period.toUpperCase() === "PM" && hours !== 12) hours += 12;
      if (period.toUpperCase() === "AM" && hours === 12) hours = 0;
      const scheduledDate = new Date();
      scheduledDate.setHours(hours, mins, 0, 0);
      arrivalMs = scheduledDate.getTime();
    }

    if (isNaN(arrivalMs) || arrivalMs <= 0) return "In office";
    const diffMinutes = Math.floor((now - arrivalMs) / (1000 * 60));
    if (diffMinutes <= 0) return "Just arrived";
    if (diffMinutes < 60) return `${diffMinutes}m wait`;
    const h = Math.floor(diffMinutes / 60);
    const m = diffMinutes % 60;
    return `${h}h ${m}m wait`;
  } catch {
    return "In office";
  }
}

export const HANDOFF_REASONS = [
  "Coverage handover",
  "Clinical escalation",
  "Room transfer",
  "End-of-shift transition",
  "Specialty consult",
  "Other — see note",
] as const;

export type HandoffReason = (typeof HANDOFF_REASONS)[number];

export type HandoffStatus = "pending" | "accepted" | "declined" | "cancelled";

export type HandoffHistoryEvent = {
  action: string;
  actorId: string;
  actorName: string;
  timestamp: string;
  note?: string;
};

export type VisitHandoff = {
  id: string;
  appointmentId: string;
  patientId: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  reason: string;
  clinicalSummary: string;
  status: HandoffStatus;
  declineReason?: string;
  history: HandoffHistoryEvent[];
  createdAt: string;
  updatedAt: string;
};

export type ActionQueueItem = {
  id: string;
  type: "unsigned-note" | "lab-alert" | "portal-message";
  title: string;
  patientId: string;
  patientName: string;
  date: string;
  summary: string;
  actionLabel: string;
  targetSection?: "Encounter" | "Labs" | "Messages" | "Meds";
};

// Helper functions for calendar and date navigation
export function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateHeading(dateStr: string): string {
  const date = parseDateString(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(dateStr: string): string {
  const date = parseDateString(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function getRelativeDateBadge(dateStr: string, defaultDate: string = practiceToday()): string {
  if (dateStr === defaultDate) return "TODAY'S SCHEDULE";
  const curr = parseDateString(dateStr).getTime();
  const def = parseDateString(defaultDate).getTime();
  const diffDays = Math.round((curr - def) / (1000 * 60 * 60 * 24));

  if (diffDays === -1) return "YESTERDAY";
  if (diffDays === 1) return "TOMORROW";
  if (diffDays > 1) return `IN ${diffDays} DAYS`;
  if (diffDays < -1) return `${Math.abs(diffDays)} DAYS AGO`;
  return "PRACTICE SCHEDULE";
}

export function stepDate(currentDateStr: string, direction: "prev" | "next"): string {
  const date = parseDateString(currentDateStr);
  date.setDate(date.getDate() + (direction === "next" ? 1 : -1));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Convert "09:30 AM" or 24-hour "14:30" into minutes from midnight
export function timeStringToMinutes(timeStr: string): number {
  const trimmed = timeStr.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const [time, period] = parts;
    const [hours, minutes] = time.split(":").map(Number);
    let hour = hours % 12;
    if (period.toUpperCase() === "PM") hour += 12;
    return hour * 60 + (minutes || 0);
  }
  if (trimmed.includes(":")) {
    const [hours, minutes] = trimmed.split(":").map(Number);
    if (!Number.isNaN(hours)) {
      return hours * 60 + (minutes || 0);
    }
  }
  return 540; // fallback 9:00 AM
}

export function durationStringToMinutes(durationStr: string): number {
  const num = parseInt(durationStr, 10);
  return isNaN(num) ? 30 : num;
}

export function formatToIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getWeekDates(dateStr: string): string[] {
  const d = parseDateString(dateStr);
  const dayOfWeek = d.getDay(); // 0 is Sunday, 1 is Monday...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    dates.push(formatToIsoDate(cur));
  }
  return dates;
}

export function get3DayDates(dateStr: string): string[] {
  const d = parseDateString(dateStr);
  const dates: string[] = [];
  for (let offset = -1; offset <= 1; offset++) {
    const cur = new Date(d);
    cur.setDate(d.getDate() + offset);
    dates.push(formatToIsoDate(cur));
  }
  return dates;
}

export interface MonthGridCell {
  date: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

export function getMonthCalendarGrid(dateStr: string): MonthGridCell[] {
  const target = parseDateString(dateStr);
  const year = target.getFullYear();
  const month = target.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  let startDayOfWeek = firstDay.getDay();
  const paddingBefore = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const cells: MonthGridCell[] = [];
  const todayStr = practiceToday();

  // Days before
  for (let i = paddingBefore; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    const dStr = formatToIsoDate(d);
    cells.push({
      date: dStr,
      dayNumber: d.getDate(),
      isCurrentMonth: false,
      isToday: dStr === todayStr,
    });
  }

  // Days of current month
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const d = new Date(year, month, day);
    const dStr = formatToIsoDate(d);
    cells.push({
      date: dStr,
      dayNumber: day,
      isCurrentMonth: true,
      isToday: dStr === todayStr,
    });
  }

  // Days after to reach full week grid
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    const dStr = formatToIsoDate(d);
    cells.push({
      date: dStr,
      dayNumber: d.getDate(),
      isCurrentMonth: false,
      isToday: dStr === todayStr,
    });
  }

  return cells;
}

export function minutesToTimeString(totalMinutes: number): string {
  const normalized = Math.max(0, Math.min(1439, totalMinutes));
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutesStr = String(minutes).padStart(2, "0");
  return `${hours12}:${minutesStr} ${period}`;
}

export interface OverlapCheckInput {
  date: string;
  time: string;
  duration: string;
  providerId?: string;
  room?: string;
  excludeAppointmentId?: string;
}

export interface OverlapConflict {
  appointment: ScheduleItem;
  conflictType: "provider" | "room" | "both";
}

/**
 * Checks whether a proposed appointment date/time/duration overlaps with any
 * existing active appointment for the same provider or room.
 * Cancelled and no-show appointments are excluded from collision checks.
 */
export function checkAppointmentOverlap(
  appointments: readonly ScheduleItem[],
  proposed: OverlapCheckInput,
): OverlapConflict | null {
  const proposedStart = timeStringToMinutes(proposed.time);
  const proposedDuration = durationStringToMinutes(proposed.duration);
  const proposedEnd = proposedStart + proposedDuration;

  for (const apt of appointments) {
    if (apt.date !== proposed.date) continue;
    if (proposed.excludeAppointmentId && apt.id === proposed.excludeAppointmentId) continue;
    if (apt.status === "cancelled" || apt.status === "no-show") continue;

    const aptStart = timeStringToMinutes(apt.time);
    const aptDuration = durationStringToMinutes(apt.duration);
    const aptEnd = aptStart + aptDuration;

    // Standard interval intersection: [proposedStart, proposedEnd) intersects [aptStart, aptEnd)
    const overlaps = proposedStart < aptEnd && proposedEnd > aptStart;
    if (!overlaps) continue;

    const providerMatch = Boolean(
      proposed.providerId && apt.providerId && proposed.providerId === apt.providerId,
    );
    const roomMatch = Boolean(
      proposed.room &&
        apt.room &&
        proposed.room.trim().toLowerCase() === apt.room.trim().toLowerCase(),
    );

    if (providerMatch && roomMatch) {
      return { appointment: apt, conflictType: "both" };
    }
    if (providerMatch) {
      return { appointment: apt, conflictType: "provider" };
    }
    if (roomMatch) {
      return { appointment: apt, conflictType: "room" };
    }
  }

  return null;
}
