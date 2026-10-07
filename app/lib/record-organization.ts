import { useEffect, useState } from "react";
import { practiceToday } from "./practice-calendar";
import { toCalendarDate } from "./clinical-date";

/**
 * Sorting, grouping and date-windowing for long chart lists (Documents,
 * History). A chart with hundreds of entries is unusable as one flat feed; the
 * clinician chooses how to slice it, and the choice is remembered per viewer
 * in this browser because it is a reading preference, not chart state.
 *
 * Nothing here filters by content or hides a record silently: the date window
 * and any collapsed group are shown with their counts, so "not shown" is always
 * visible and one click away.
 */

export type RecordSort = "newest" | "oldest" | "title";
export type RecordGrouping = "none" | "month" | "year" | "type";
export type RecordWindow = "all" | "30d" | "90d" | "1y" | "older";
export type RecordDensity = "detailed" | "compact";

export type RecordOrganization = {
  sort: RecordSort;
  group: RecordGrouping;
  window: RecordWindow;
  density: RecordDensity;
};

export const DEFAULT_RECORD_ORGANIZATION: RecordOrganization = {
  sort: "newest",
  group: "none",
  window: "all",
  density: "detailed",
};

export const RECORD_SORT_LABELS: Record<RecordSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  title: "Title A–Z",
};

export const RECORD_GROUP_LABELS: Record<RecordGrouping, string> = {
  none: "No grouping",
  month: "Month",
  year: "Year",
  type: "Type",
};

export const RECORD_WINDOW_LABELS: Record<RecordWindow, string> = {
  all: "All time",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "1y": "Last 12 months",
  older: "Older than 12 months",
};

export type OrganizableRecord = {
  /** ISO instant or YYYY-MM-DD. */
  date: string;
  title: string;
  /** Group label when grouping by type. */
  typeLabel: string;
};

function dayOf(value: string): string {
  return toCalendarDate(value) ?? value.slice(0, 10);
}

function daysBetween(fromDay: string, toDay: string): number {
  const from = Date.parse(`${fromDay}T00:00:00Z`);
  const to = Date.parse(`${toDay}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

export function inRecordWindow(date: string, window: RecordWindow, today: string = practiceToday()): boolean {
  if (window === "all") return true;
  const age = daysBetween(dayOf(date), today);
  if (window === "30d") return age <= 30;
  if (window === "90d") return age <= 90;
  if (window === "1y") return age <= 365;
  return age > 365;
}

function compareDates(a: string, b: string): number {
  const left = Date.parse(a);
  const right = Date.parse(b);
  return (Number.isNaN(left) ? 0 : left) - (Number.isNaN(right) ? 0 : right);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function groupLabel(record: OrganizableRecord, group: RecordGrouping): string {
  if (group === "type") return record.typeLabel;
  const day = dayOf(record.date);
  const [year, month] = day.split("-");
  if (!year || Number.isNaN(Number(year))) return "Undated";
  if (group === "year") return year;
  const monthName = MONTHS[Number(month) - 1];
  return monthName ? `${monthName} ${year}` : year;
}

export type RecordGroup<T> = { key: string; label: string; items: T[] };

/**
 * Applies the window, sort and grouping. Returns one unlabeled group when
 * grouping is off so callers render one code path. `hiddenByWindow` is how many
 * records the date window left out, for the "n older not shown" line.
 */
export function organizeRecords<T>(
  items: readonly T[],
  describe: (item: T) => OrganizableRecord,
  organization: RecordOrganization,
  today: string = practiceToday(),
): { groups: RecordGroup<T>[]; shown: number; hiddenByWindow: number } {
  const described = items.map((item) => ({ item, record: describe(item) }));
  const windowed = described.filter(({ record }) => inRecordWindow(record.date, organization.window, today));
  windowed.sort((a, b) => {
    if (organization.sort === "title") return a.record.title.localeCompare(b.record.title) || compareDates(b.record.date, a.record.date);
    const byDate = compareDates(a.record.date, b.record.date);
    return organization.sort === "oldest" ? byDate : -byDate;
  });
  const hiddenByWindow = described.length - windowed.length;
  if (organization.group === "none") {
    return { groups: [{ key: "all", label: "", items: windowed.map(({ item }) => item) }], shown: windowed.length, hiddenByWindow };
  }
  const groups = new Map<string, RecordGroup<T>>();
  for (const { item, record } of windowed) {
    const label = groupLabel(record, organization.group);
    const group = groups.get(label);
    if (group) group.items.push(item);
    else groups.set(label, { key: label, label, items: [item] });
  }
  const ordered = Array.from(groups.values());
  // Type groups read alphabetically; date groups follow the chosen date order.
  if (organization.group === "type") ordered.sort((a, b) => a.label.localeCompare(b.label));
  return { groups: ordered, shown: windowed.length, hiddenByWindow };
}

/**
 * The organization a viewer last chose for one list, kept in this browser.
 * Storage can be unavailable (private windows, blocked site data); the list
 * then simply starts from the defaults.
 */
export function useRecordOrganization(storageKey: string, defaults: RecordOrganization = DEFAULT_RECORD_ORGANIZATION) {
  const [organization, setOrganization] = useState<RecordOrganization>(defaults);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) setOrganization({ ...defaults, ...(JSON.parse(stored) as Partial<RecordOrganization>) });
    } catch {
      // Defaults stand.
    }
    // Read once per list; `defaults` is a constant at each call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const update = (patch: Partial<RecordOrganization>) => {
    setOrganization((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Not remembered, still applied.
      }
      return next;
    });
  };
  return [organization, update] as const;
}
