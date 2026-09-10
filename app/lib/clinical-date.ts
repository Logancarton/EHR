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
