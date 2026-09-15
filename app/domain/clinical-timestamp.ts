/**
 * Normalizing a recorded timestamp without touching the record that holds it.
 *
 * `encounters.signed_at` is not uniformly formatted. Everything the signing path
 * writes is an ISO instant, but rows seeded before that path existed carry a
 * display date — `"Aug 08, 2026"` — and signed encounters are immutable at the
 * database level, by trigger, on purpose. They cannot be rewritten into a tidy
 * shape, and they should not be: the legal record says what it says.
 *
 * The consequence is sharp. `signed_at >= ? AND signed_at <= ?` is a string
 * comparison in SQLite, and `"Aug 08, 2026"` sorts after any `"2026-..."` because
 * digits precede letters in ASCII. A windowed query therefore *silently* drops
 * every such row. Silent is the problem: a count that quietly omits records is a
 * false statement about the practice, in the same family as the numbers P9-0
 * removed.
 *
 * So this module normalizes for reading only, and it distinguishes three outcomes
 * rather than two:
 *
 * - `iso` — already an instant. Used directly.
 * - `parsed` — a recognised display form, normalized to an instant. Recorded as
 *   derived, so nothing mistakes it for what the record stores.
 * - `unparseable` — nothing is guessed. The row keeps its raw value, carries no
 *   instant, and any window that cannot place it must say so out loud rather than
 *   omitting it.
 *
 * Deliberately narrow. Only forms this product is known to have written are
 * recognised; a permissive parser would turn an unknown string into a confident
 * wrong date, which is worse than admitting it cannot be placed.
 */

export type ClinicalTimestampParseStatus = "iso" | "parsed" | "unparseable";

export type NormalizedClinicalTimestamp = {
  /** Exactly what the record holds; never modified. */
  raw: string;
  /** The instant this maps to, or null when it could not be determined. */
  iso: string | null;
  status: ClinicalTimestampParseStatus;
};

/** `2026-09-14T18:29:08.000Z` and friends, including a bare `2026-09-14`. */
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** `Aug 08, 2026` and `August 8 2026`, with or without the comma. */
const MONTH_NAME_FIRST = /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/;

/** `08 Aug 2026`. */
const DAY_FIRST = /^(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})$/;

/** `09/14/2026`, month first — the form this product's own fixtures use. */
const US_NUMERIC = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

function monthIndex(name: string): number | null {
  const index = MONTHS[name.toLowerCase()];
  return index === undefined ? null : index;
}

/**
 * Midnight UTC of a calendar date.
 *
 * A display date names a day, not an instant. Placing it at the start of that day
 * in UTC is a stated convention rather than a recovered fact, which is why the
 * status stays `parsed` and never becomes `iso`.
 */
function utcMidnight(year: number, month: number, day: number): string | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const instant = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(instant.getTime())) return null;
  // Rejects a rolled-over date such as February 31.
  if (instant.getUTCMonth() !== month || instant.getUTCDate() !== day) return null;
  return instant.toISOString();
}

export function normalizeClinicalTimestamp(value: string | null | undefined): NormalizedClinicalTimestamp {
  const raw = (value ?? "").trim();
  if (!raw) return { raw: value ?? "", iso: null, status: "unparseable" };

  if (ISO_LIKE.test(raw)) {
    const instant = new Date(raw.length === 10 ? `${raw}T00:00:00.000Z` : raw);
    if (!Number.isNaN(instant.getTime())) {
      return { raw, iso: instant.toISOString(), status: "iso" };
    }
    // Shaped like an instant but not one (2026-13-45). Not guessed at.
    return { raw, iso: null, status: "unparseable" };
  }

  const monthFirst = raw.match(MONTH_NAME_FIRST);
  if (monthFirst) {
    const month = monthIndex(monthFirst[1]);
    if (month !== null) {
      const iso = utcMidnight(Number(monthFirst[3]), month, Number(monthFirst[2]));
      if (iso) return { raw, iso, status: "parsed" };
    }
    return { raw, iso: null, status: "unparseable" };
  }

  const dayFirst = raw.match(DAY_FIRST);
  if (dayFirst) {
    const month = monthIndex(dayFirst[2]);
    if (month !== null) {
      const iso = utcMidnight(Number(dayFirst[3]), month, Number(dayFirst[1]));
      if (iso) return { raw, iso, status: "parsed" };
    }
    return { raw, iso: null, status: "unparseable" };
  }

  const usNumeric = raw.match(US_NUMERIC);
  if (usNumeric) {
    const iso = utcMidnight(Number(usNumeric[3]), Number(usNumeric[1]) - 1, Number(usNumeric[2]));
    if (iso) return { raw, iso, status: "parsed" };
    return { raw, iso: null, status: "unparseable" };
  }

  // No `new Date(raw)` fallback on purpose. It accepts almost anything and returns
  // a confident wrong answer for the rest — "next tuesday" becomes Invalid Date,
  // but "3" becomes the year 2001 in some engines. An unrecognised string stays
  // unplaceable, which is a reportable state rather than a wrong date.
  return { raw, iso: null, status: "unparseable" };
}

/** Whether a normalized timestamp falls inside a closed ISO window. */
export function withinWindow(
  normalized: NormalizedClinicalTimestamp,
  since: string,
  until: string,
): boolean {
  if (!normalized.iso) return false;
  return normalized.iso >= since && normalized.iso <= until;
}
