/**
 * When a clinical task is due.
 *
 * Tasks used to store the clinician's choice as words — "Today", "Tomorrow",
 * "In 2 weeks" — so a task made "due today" said "Today" forever and never became
 * overdue. A due date is now a practice-calendar date ("2026-10-07") or none,
 * resolved once when the task is created. Rows written before that still hold the
 * words; they are read against the day the task was created, which is the day the
 * clinician meant, and are never rewritten.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NO_DUE = new Set(["", "no due date", "none", "done"]);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Adds whole days to a practice-calendar date, in UTC so no clock change shifts it. */
export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function weekdayOf(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Days from `from` to the choice; a weekday name is its coming occurrence, today included. */
function relativeOffsetDays(value: string, from: string): number | null {
  const normalized = value.trim().toLowerCase();
  const weekday = WEEKDAYS.indexOf(normalized);
  if (weekday >= 0) return (weekday - weekdayOf(from) + 7) % 7;
  if (normalized === "today") return 0;
  if (normalized === "tomorrow") return 1;
  const match = /^(?:in\s+)?(\d{1,3})\s+(day|week)s?$/.exec(normalized);
  if (!match) return null;
  return Number(match[1]) * (match[2] === "week" ? 7 : 1);
}

/**
 * The stored due date for a choice made on `today`. An absent choice keeps the
 * long-standing default of today; "No due date" is none. Anything else that is not
 * a calendar date or a recognised interval is refused rather than stored as text.
 */
export function resolveTaskDue(choice: string | null | undefined, today: string): string | null {
  if (choice === undefined || choice === null) return today;
  if (NO_DUE.has(choice.trim().toLowerCase())) return null;
  if (ISO_DATE.test(choice.trim())) return choice.trim();
  const offset = relativeOffsetDays(choice, today);
  if (offset === null) throw new Error(`Unrecognised task due date: ${choice}`);
  return addCalendarDays(today, offset);
}

/** Reads a stored value, including legacy words anchored to the creation day. */
export function storedTaskDue(stored: string | null | undefined, createdOn: string): string | null {
  if (stored === null || stored === undefined) return null;
  if (NO_DUE.has(stored.trim().toLowerCase())) return null;
  if (ISO_DATE.test(stored.trim())) return stored.trim();
  const offset = relativeOffsetDays(stored, createdOn);
  return offset === null ? null : addCalendarDays(createdOn, offset);
}

function shortDate(date: string, today: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const label = `${MONTHS[month - 1]} ${day}`;
  return year === Number(today.slice(0, 4)) ? label : `${label}, ${year}`;
}

export type TaskDueView = { label: string; overdue: boolean };

/** "Overdue · Oct 6", "Due today", "Due tomorrow", "Due Oct 14", or "No due date". */
export function describeTaskDue(due: string | null | undefined, today: string, completed = false): TaskDueView {
  if (!due) return { label: "No due date", overdue: false };
  // A value from an older client or server is shown as given, never as a broken date.
  if (!ISO_DATE.test(due)) return { label: `Due ${due}`, overdue: false };
  if (due === today) return { label: "Due today", overdue: false };
  if (due === addCalendarDays(today, 1)) return { label: "Due tomorrow", overdue: false };
  if (due < today) {
    return completed
      ? { label: `Was due ${shortDate(due, today)}`, overdue: false }
      : { label: `Overdue · ${shortDate(due, today)}`, overdue: true };
  }
  return { label: `Due ${shortDate(due, today)}`, overdue: false };
}
