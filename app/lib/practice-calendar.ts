/**
 * The practice's own calendar day.
 *
 * The dashboard used a fixed `defaultPracticeDate = "2026-09-04"`, so "Today"
 * meant one demo Friday forever: every real appointment booked afterwards landed
 * on a day the dashboard never opened, and "Jump to Today" jumped to a date the
 * practice had long passed.
 *
 * A clinic day is a local date, not a UTC instant. Phoenix does not observe DST,
 * but the rule is the same everywhere: 11pm on the 3rd is still the 3rd's clinic,
 * and computing it from the browser's zone would put a clinician travelling east
 * on tomorrow's schedule.
 *
 * One constant for now. Per-organization scheduling timezone belongs on the
 * organization record and is tracked with the rest of practice configuration; a
 * second hard-coded copy of this value elsewhere would be the regression.
 */
export const PRACTICE_TIME_ZONE = "America/Phoenix";

/** `YYYY-MM-DD` for an instant, read in the practice's zone. */
export function practiceDateOf(instant: Date, timeZone: string = PRACTICE_TIME_ZONE): string {
  // en-CA formats as YYYY-MM-DD, which is the shape appointments are stored in.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** The clinic day currently in progress. */
export function practiceToday(timeZone: string = PRACTICE_TIME_ZONE): string {
  return practiceDateOf(new Date(), timeZone);
}
