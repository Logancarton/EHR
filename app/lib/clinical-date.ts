/**
 * Clinical Date Formatting Utility
 * Standardizes raw UTC ISO strings, timestamps, and date strings into
 * elegant, human-readable clinical representations without hydration mismatches.
 */

export function formatClinicalDate(value?: string | number | null): string {
  if (!value) return "—";
  const parsed = typeof value === "number" ? new Date(value) : new Date(value);
  if (isNaN(parsed.getTime())) return String(value);

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatClinicalDateTime(value?: string | number | null): string {
  if (!value) return "—";
  const parsed = typeof value === "number" ? new Date(value) : new Date(value);
  if (isNaN(parsed.getTime())) return String(value);

  const datePart = parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const timePart = parsed.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return `${datePart} · ${timePart}`;
}

export function formatRelativeDays(daysElapsed?: number | null): string {
  if (daysElapsed === null || daysElapsed === undefined) return "No record";
  if (daysElapsed === 0) return "Today";
  if (daysElapsed === 1) return "Yesterday";
  if (daysElapsed < 0) return `In ${Math.abs(daysElapsed)} days`;
  return `${daysElapsed} days ago`;
}

/**
 * A calendar date (YYYY-MM-DD) from either an ISO string or a display date such
 * as "Sep 24, 2026". Records arrive in both shapes; sorting or comparing them as
 * raw strings puts every "Sep …" after every "2026-…".
 */
export function toCalendarDate(value?: string | null): string | null {
  if (!value) return null;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (iso) return iso[1];
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return null;
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${parsed.getFullYear()}-${month}-${day}`;
}

/** One display format for a calendar date, whichever shape it arrived in. */
export function formatCalendarDate(value?: string | null): string {
  const date = toCalendarDate(value);
  return date ? formatClinicalDate(`${date}T00:00:00Z`) : value || "—";
}

/**
 * How long ago (or how far ahead) a calendar date is, relative to `today`
 * (YYYY-MM-DD in the practice's zone). Readiness data is only useful with its
 * age: a blood pressure from this morning and one from last year read the same
 * without it.
 */
export function formatDateAge(value: string | null | undefined, today: string): string {
  const date = toCalendarDate(value);
  if (!date) return "";
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
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
