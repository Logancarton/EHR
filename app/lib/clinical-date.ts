/**
 * Clinical display distinguishes calendar dates from recorded instants.
 * Date-only and unzoned floating timestamps retain the day/time written. Zoned
 * timestamps, epoch numbers and Date objects use the practice clock, matching
 * practiceToday() (D-049) instead of the server/browser clock or UTC calendar day.
 *
 * This is a display/projection boundary: stored values and transport are unchanged.
 * Explicit zones also keep server/client rendering consistent. Per-organization
 * zone configuration remains deferred; callers can supply a zone to the helpers.
 */

import { PRACTICE_TIME_ZONE } from "./practice-calendar";

export type ClinicalDateValue = string | number | Date | null | undefined;

/** A value resolved to the day (and, when known, the minute) a clinician reads. */
type ClinicalMoment = {
  /** `YYYY-MM-DD` */
  date: string;
  /** Minutes past midnight, or null for a calendar date with no time of day. */
  minutes: number | null;
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_WITH_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function validCalendarDate(year: number, month: number, day: number): string | null {
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

/** The practice-zone wall clock of an instant. */
function instantMoment(instant: Date, timeZone: string): ClinicalMoment | null {
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    // Some runtimes render midnight as 24 even with h23; normalise it.
    minutes: (Number(part("hour")) % 24) * 60 + Number(part("minute")),
  };
}

function resolve(value: ClinicalDateValue, timeZone: string): ClinicalMoment | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? instantMoment(new Date(value), timeZone) : null;
  if (value instanceof Date) return instantMoment(value, timeZone);

  const text = value.trim();
  const dateOnly = DATE_ONLY.exec(text);
  if (dateOnly) {
    const date = validCalendarDate(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));
    return date ? { date, minutes: null } : null;
  }

  const iso = ISO_WITH_TIME.exec(text);
  if (iso) {
    const date = validCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    const hours = Number(iso[4]);
    const minutes = Number(iso[5]);
    if (!date || hours > 23 || minutes > 59 || Number(iso[6] ?? 0) > 59) return null;
    if (iso[7]) return instantMoment(new Date(text), timeZone);
    // Floating wall clock: shown exactly as written, never shifted.
    return { date, minutes: hours * 60 + minutes };
  }

  // A display date such as "Sep 24, 2026". `Date` parses these as local
  // midnight, so the local parts give back the day the string names in any zone.
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  // Legacy transport timestamps can name GMT/UTC or a numeric offset. Their
  // parsed value is an instant, never a host-local calendar date.
  if (/\b(?:GMT|UTC)\b|[+-]\d{2}:?\d{2}\s*$|Z$/i.test(text)) return instantMoment(parsed, timeZone);
  const date = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  const minutes = parsed.getHours() * 60 + parsed.getMinutes();
  return { date, minutes: /\d:\d{2}/.test(text) ? minutes : null };
}

function formatDay(date: string): string {
  // A calendar date formatted at UTC midnight in UTC is that same day everywhere.
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${pad(minute)} ${hours < 12 ? "AM" : "PM"}`;
}

/** "Oct 4, 2026". An unreadable value is shown as given rather than guessed at. */
export function formatClinicalDate(value?: ClinicalDateValue, timeZone: string = PRACTICE_TIME_ZONE): string {
  if (value === null || value === undefined || value === "") return "—";
  const moment = resolve(value, timeZone);
  return moment ? formatDay(moment.date) : String(value);
}

/**
 * "Oct 4, 2026 · 7:07 PM". A calendar date has no time of day, so it is shown
 * as the date alone rather than an invented midnight.
 */
export function formatClinicalDateTime(value?: ClinicalDateValue, timeZone: string = PRACTICE_TIME_ZONE): string {
  if (value === null || value === undefined || value === "") return "—";
  const moment = resolve(value, timeZone);
  if (!moment) return String(value);
  return moment.minutes === null ? formatDay(moment.date) : `${formatDay(moment.date)} · ${formatMinutes(moment.minutes)}`;
}

export function formatRelativeDays(daysElapsed?: number | null): string {
  if (daysElapsed === null || daysElapsed === undefined) return "No record";
  if (daysElapsed === 0) return "Today";
  if (daysElapsed === 1) return "Yesterday";
  if (daysElapsed < 0) return `In ${Math.abs(daysElapsed)} days`;
  return `${daysElapsed} days ago`;
}

/**
 * The calendar day (YYYY-MM-DD) a clinical value belongs to: a calendar date as
 * written, an instant as its day at the practice. Records arrive as ISO dates,
 * ISO instants and display dates ("Sep 24, 2026"); sorting or comparing them as
 * raw strings puts every "Sep …" after every "2026-…", and slicing an instant's
 * first ten characters gives its UTC day — tomorrow, for an evening visit.
 */
export function toCalendarDate(value?: ClinicalDateValue, timeZone: string = PRACTICE_TIME_ZONE): string | null {
  return resolve(value, timeZone)?.date ?? null;
}

/**
 * Whole calendar days from `from` to `to` (both read by `toCalendarDate`), or
 * null when either cannot be placed. Counting days, not 24-hour spans: a result
 * from 11 PM yesterday is one day old at 8 AM, not zero.
 */
export function calendarDaysBetween(
  from: ClinicalDateValue,
  to: ClinicalDateValue,
  timeZone: string = PRACTICE_TIME_ZONE,
): number | null {
  const start = toCalendarDate(from, timeZone);
  const end = toCalendarDate(to, timeZone);
  if (!start || !end) return null;
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

/** One display format for a calendar date, whichever shape it arrived in. */
export function formatCalendarDate(value?: string | null): string {
  const date = toCalendarDate(value);
  return date ? formatDay(date) : value || "—";
}

/**
 * How long ago (or how far ahead) a calendar date is, relative to `today`
 * (YYYY-MM-DD in the practice's zone). Readiness data is only useful with its
 * age: a blood pressure from this morning and one from last year read the same
 * without it.
 */
export function formatDateAge(value: string | null | undefined, today: string): string {
  const days = calendarDaysBetween(value, today);
  if (days === null) return "";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days === -1) return "tomorrow";
  const span = Math.abs(days);
  const amount =
    span < 14 ? `${span} days` : span < 60 ? `${Math.round(span / 7)} wk` : span < 730 ? `${Math.round(span / 30.4)} mo` : `${Math.round(span / 365)} yr`;
  return days > 0 ? `${amount} ago` : `in ${amount}`;
}

/** "Sep 24, 2026 · 1 day ago" — the date and its age together. */
export function formatDateWithAge(value: string | null | undefined, today: string): string {
  if (!value) return "—";
  const age = formatDateAge(value, today);
  return age ? `${formatCalendarDate(value)} · ${age}` : formatCalendarDate(value);
}
