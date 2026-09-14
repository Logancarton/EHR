import { practiceToday } from "./practice-calendar";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "waiting"
  | "in-visit"
  | "completed"
  | "no-show";

/**
 * The three states the front desk moves an appointment through before the
 * clinician takes over, in the order they happen. The roster exposes exactly these
 * as a one-click segmented control; everything after arrival (in-visit, completed,
 * no-show) is a clinical outcome and stays in the full status menu.
 *
 * "waiting" is the stored value for a patient who has physically arrived. It is
 * labelled "In Office" because that is what the front desk is actually asserting —
 * the lobby is an implementation detail of where they wait.
 */
export const FRONT_DESK_STATUSES = [
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
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  waiting: "In Office",
  "in-visit": "In Visit",
  completed: "Completed",
  "no-show": "No Show",
};

export type VisitType =
  | "30-min Med Check"
  | "45-min Therapy + Meds"
  | "60-min Intake"
  | "Psychotherapy + Meds"
  | "Urgent Walk-in";

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

// Convert "09:30 AM" into minutes from midnight (570)
export function timeStringToMinutes(timeStr: string): number {
  const parts = timeStr.trim().split(" ");
  if (parts.length < 2) return 540; // fallback 9:00 AM
  const [time, period] = parts;
  const [hours, minutes] = time.split(":").map(Number);
  let hour = hours % 12;
  if (period.toUpperCase() === "PM") hour += 12;
  return hour * 60 + (minutes || 0);
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

