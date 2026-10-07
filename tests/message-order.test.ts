import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A conversation reads in the order it was written. The chart's thread query
 * sorted by the stored clock text, so "01:30 PM" came before "11:00 AM" and an
 * afternoon reply sat above the morning question it answered.
 */
test("a thread's messages are ordered by when they were written, not by clock text", async () => {
  const originalCwd = process.cwd();
  process.chdir(mkdtempSync(join(tmpdir(), "ehr-message-order-")));
  try {
    const [{ getDatabase }, { MessageRepository }] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/repositories/message-repository"),
    ]);
    const db = getDatabase();
    const insert = db.prepare(`
      INSERT INTO messages (id, patient_id, thread_id, subject, category, urgency, channel,
        sender_role, sender_name, content, status, timestamp, created_at)
      VALUES (?, 'maya-chen', 'th-order', 'Synthetic order check', 'general', 'routine', 'portal', ?, ?, ?, 'delivered', ?, ?)`);
    insert.run("ord-1", "patient", "Maya Chen", "Morning question", "11:00 AM", "2026-10-07T18:00:00.000Z");
    insert.run("ord-2", "provider", "Prototype Provider", "Afternoon reply", "01:30 PM", "2026-10-07T20:30:00.000Z");
    insert.run("ord-3", "patient", "Maya Chen", "Next-day follow-up", "09:05 AM", "2026-10-08T16:05:00.000Z");

    const thread = MessageRepository.getThreadsByPatient("maya-chen").find((t) => t.id === "th-order");
    assert.ok(thread);
    assert.deepEqual(thread.messages.map((m) => m.content), ["Morning question", "Afternoon reply", "Next-day follow-up"]);
    assert.equal(thread.messages[1].createdAt, "2026-10-07T20:30:00.000Z", "the instant travels with the message for display");

    const listed = MessageRepository.getAllThreads(["maya-chen"]).find((t) => t.thread.id === "th-order");
    assert.deepEqual(listed?.thread.messages.map((m) => m.content), ["Morning question", "Afternoon reply", "Next-day follow-up"]);
  } finally {
    process.chdir(originalCwd);
  }
});
