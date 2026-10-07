import type { PatientMessageThread } from "../domain/messages";
import { formatClinicalDate, formatClinicalDateTime } from "./clinical-date";
import { practiceDateOf, practiceToday } from "./practice-calendar";

/**
 * When a conversation last moved, for ordering and for its list label.
 *
 * `lastMessageAt` is display text: "01:30 PM" for a message written today by
 * this server, "Sep 5, 2026 · 11:42 AM" for older rows. Sorting threads with
 * `new Date(lastMessageAt)` turned every time-only value into Invalid Date, so
 * "newest first" silently did nothing. The last message's recorded instant is the
 * authority; older text that carries its own date is the fallback; a bare clock
 * time carries no day and is not guessed at.
 */
export function threadLastInstant(thread: Pick<PatientMessageThread, "messages" | "lastMessageAt">): number | null {
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const recorded = thread.messages[index]?.createdAt;
    if (recorded) {
      const parsed = Date.parse(recorded);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  const text = thread.lastMessageAt?.replace("·", " ").replace(/\s+/g, " ").trim() ?? "";
  // Only text that names a day; "01:30 PM" alone would parse to nothing or to a
  // fabricated date depending on the engine.
  if (!/\d{4}/.test(text)) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Newest first; threads with no knowable time keep their relative order at the end. */
export function sortThreadsNewestFirst<T>(rows: T[], threadOf: (row: T) => Pick<PatientMessageThread, "messages" | "lastMessageAt">): T[] {
  return rows
    .map((row, index) => ({ row, index, at: threadLastInstant(threadOf(row)) }))
    .sort((a, b) => {
      if (a.at === null && b.at === null) return a.index - b.index;
      if (a.at === null) return 1;
      if (b.at === null) return -1;
      return b.at - a.at || a.index - b.index;
    })
    .map(({ row }) => row);
}

/**
 * The list label: the time for a conversation that moved today, the day
 * otherwise. Text with no recorded instant is shown as it was stored.
 */
export function threadTimeLabel(thread: Pick<PatientMessageThread, "messages" | "lastMessageAt">, today: string = practiceToday()): string {
  const last = thread.messages[thread.messages.length - 1];
  const recorded = last?.createdAt;
  if (!recorded || !Number.isFinite(Date.parse(recorded))) return thread.lastMessageAt ?? "";
  if (practiceDateOf(new Date(recorded)) === today) {
    return formatClinicalDateTime(recorded).split(" · ")[1] ?? formatClinicalDateTime(recorded);
  }
  const day = formatClinicalDate(recorded);
  // The year is noise within the current one: "Oct 6" rather than "Oct 6, 2026".
  return day.endsWith(`, ${today.slice(0, 4)}`) ? day.slice(0, -6) : day;
}
