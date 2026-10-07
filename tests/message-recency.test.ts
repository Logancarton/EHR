import test from "node:test";
import assert from "node:assert/strict";
import { sortThreadsNewestFirst, threadLastInstant, threadTimeLabel } from "../app/lib/message-recency";

const thread = (id: string, lastMessageAt: string, createdAt?: string) => ({
  id,
  lastMessageAt,
  messages: [{ createdAt }] as never[],
});

test("threads sort by the last message's recorded instant, not by clock text", () => {
  const rows = [
    thread("seed-sep", "Sep 5, 2026 · 11:42 AM"),
    thread("today-morning", "09:05 AM", "2026-10-07T16:05:00.000Z"),
    thread("no-day", "01:30 PM"),
    thread("today-afternoon", "01:30 PM", "2026-10-07T20:30:00.000Z"),
    thread("seed-aug", "Aug 28, 2026 · 04:15 PM"),
  ];
  assert.deepEqual(
    sortThreadsNewestFirst(rows, (row) => row).map((row) => row.id),
    ["today-afternoon", "today-morning", "seed-sep", "seed-aug", "no-day"],
  );
  // A bare clock time names no day, so no instant is invented for it.
  assert.equal(threadLastInstant(thread("bare", "01:30 PM")), null);
});

test("the list label is the time today and the day otherwise", () => {
  // 1:30 PM at the practice (Phoenix, UTC-7) on Oct 7.
  assert.equal(threadTimeLabel(thread("a", "01:30 PM", "2026-10-07T20:30:00.000Z"), "2026-10-07"), "1:30 PM");
  assert.equal(threadTimeLabel(thread("b", "01:30 PM", "2026-10-06T20:30:00.000Z"), "2026-10-07"), "Oct 6");
  assert.equal(threadTimeLabel(thread("c", "x", "2025-12-30T20:30:00.000Z"), "2026-10-07"), "Dec 30, 2025");
  assert.equal(threadTimeLabel(thread("d", "Sep 5, 2026 · 11:42 AM"), "2026-10-07"), "Sep 5, 2026 · 11:42 AM");
});
