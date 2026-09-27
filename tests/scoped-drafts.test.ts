import assert from "node:assert/strict";
import test from "node:test";
import {
  PRACTICE_DRAFT_SCOPE,
  draftScopeFor,
  textDraft,
  writeScopedDraft,
} from "../app/lib/use-scoped-drafts";

test("CB-6c: each patient, and the practice, has its own draft scope", () => {
  assert.equal(draftScopeFor("maya-chen"), "patient:maya-chen");
  assert.notEqual(draftScopeFor("maya-chen"), draftScopeFor("jordan-reed"));
  assert.equal(draftScopeFor(undefined), PRACTICE_DRAFT_SCOPE);
  assert.equal(draftScopeFor(null), PRACTICE_DRAFT_SCOPE);
  assert.equal(draftScopeFor(""), PRACTICE_DRAFT_SCOPE);
});

test("CB-6c: writing one patient's draft never touches another's", () => {
  const maya = draftScopeFor("maya-chen");
  const jordan = draftScopeFor("jordan-reed");
  const start = writeScopedDraft<string>({}, maya, "Recheck lithium level");
  const next = writeScopedDraft(start, jordan, "Call pharmacy");
  assert.deepEqual(next, { [maya]: "Recheck lithium level", [jordan]: "Call pharmacy" });
  assert.deepEqual(start, { [maya]: "Recheck lithium level" }, "the input is not mutated");
});

test("CB-6c: discarding a draft removes only that scope; no-ops keep identity", () => {
  const maya = draftScopeFor("maya-chen");
  const drafts = { [maya]: "x", [PRACTICE_DRAFT_SCOPE]: "y" };
  assert.deepEqual(writeScopedDraft(drafts, maya, undefined), { [PRACTICE_DRAFT_SCOPE]: "y" });
  assert.equal(writeScopedDraft(drafts, "patient:nobody", undefined), drafts);
  assert.equal(writeScopedDraft(drafts, maya, "x"), drafts);
});

test("CB-6c: an empty text draft is no draft, but an empty target is a real choice", () => {
  assert.equal(textDraft(""), undefined);
  assert.equal(textDraft(" "), " ");
  // "" is the practice-note target; it must be storable, not treated as absent.
  const maya = draftScopeFor("maya-chen");
  assert.deepEqual(writeScopedDraft<string>({}, maya, ""), { [maya]: "" });
});

test("CB-6e: the in-flight key is one draft — same scope and text — not the whole composer", async () => {
  const { inFlightKey } = await import("../app/lib/use-in-flight");
  const maya = draftScopeFor("maya-chen");
  assert.equal(inFlightKey(maya, "Recheck lithium"), inFlightKey(maya, "  Recheck lithium \n"));
  assert.notEqual(inFlightKey(maya, "Recheck lithium"), inFlightKey(draftScopeFor("jordan-reed"), "Recheck lithium"));
  assert.notEqual(inFlightKey(maya, "Recheck lithium"), inFlightKey(maya, "Call pharmacy"));
});

test("CB-6h: only real text counts as an unsent draft", async () => {
  const { hasUnsentDraft } = await import("../app/lib/use-warn-before-leaving");
  assert.equal(hasUnsentDraft({}), false);
  assert.equal(hasUnsentDraft({ [draftScopeFor("maya-chen")]: "   " }), false);
  assert.equal(hasUnsentDraft({ [draftScopeFor("jordan-reed")]: "Call pharmacy" }), true);
});
