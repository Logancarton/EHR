import test from "node:test";
import assert from "node:assert/strict";
import { createDraftKeyRing, draftSignature } from "../app/lib/draft-idempotency";

test("a retried draft reuses its key until the server confirms it", () => {
  let n = 0;
  const ring = createDraftKeyRing(() => `key-${++n}`);
  const draft = draftSignature("task", "maya-chen", "Call pharmacy", "Today");
  const first = ring.keyFor(draft);
  assert.equal(ring.keyFor(draft), first, "a retry after a lost answer is the same request");
  assert.notEqual(ring.keyFor(draftSignature("task", "maya-chen", "Call pharmacy", "Tomorrow")), first, "a changed draft is a new request");
  ring.confirm(draft);
  assert.notEqual(ring.keyFor(draft), first, "the same text written again after success is a new record");
  assert.notEqual(draftSignature("a", undefined), draftSignature("a", "undefined"));
});
