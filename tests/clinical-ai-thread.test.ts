import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { OmniboxPlan } from "../app/domain/omnibox";
import {
  MAX_THREAD_TURNS,
  beginClinicalAiTurn,
  clearClinicalAiThread,
  clinicalAiThreadFor,
  dismissClinicalAiTurn,
  priorQuestionsFor,
  resetClinicalAiThreads,
  settleClinicalAiTurn,
  subscribeClinicalAiThreads,
  threadHasPendingTurn,
  turnAnswersForAnotherPatient,
  turnSummary,
} from "../app/lib/clinical-ai-thread";

/**
 * The Clinical AI conversation thread (D-132, CONV-1).
 *
 * These hold the thread's safety properties: a thread belongs to one patient, a
 * late answer lands only in the thread it was asked in and never revives a
 * cleared one, an answer about somebody else is labelled rather than moving the
 * thread, and nothing survives the end of the session.
 */

function plan(resolved: { id: string; name: string; source?: "active_patient" | "mentioned_patient" }, answer = "An answer"): OmniboxPlan {
  return {
    query: "q",
    intent: { kind: "clinical_question", question: "q" },
    confidence: 1,
    planner: { provider: "deterministic", model: "test" },
    patient: {
      resolution: "resolved",
      switchRequired: false,
      resolved: { id: resolved.id, name: resolved.name, source: resolved.source ?? "active_patient" },
    },
    answer,
    evidence: [],
    proposals: [],
    safety: { mutatesClinicalRecord: false, requiresHumanReview: false, blockedReasons: [] },
  };
}

beforeEach(() => resetClinicalAiThreads());

test("turns accumulate in order within one patient's thread", () => {
  const first = beginClinicalAiTurn("maya-chen", "What medications is she taking?");
  settleClinicalAiTurn("maya-chen", first, { status: "answered", plan: plan({ id: "maya-chen", name: "Maya Chen" }) });
  beginClinicalAiTurn("maya-chen", "And her last lithium level?");

  const turns = clinicalAiThreadFor("maya-chen");
  assert.deepEqual(turns.map((turn) => turn.query), ["What medications is she taking?", "And her last lithium level?"]);
  assert.deepEqual(turns.map((turn) => turn.status), ["answered", "pending"]);
  assert.ok(turns.every((turn) => turn.patientId === "maya-chen"));
  assert.equal(threadHasPendingTurn("maya-chen"), true);
});

test("threads are separate per patient", () => {
  beginClinicalAiTurn("maya-chen", "Summarize chart");
  beginClinicalAiTurn("david-kim", "Check labs");
  assert.equal(clinicalAiThreadFor("maya-chen").length, 1);
  assert.equal(clinicalAiThreadFor("david-kim").length, 1);
  assert.equal(clinicalAiThreadFor("maya-chen")[0].query, "Summarize chart");
  assert.equal(clinicalAiThreadFor("jordan-reed").length, 0);
});

test("an answer settles only the thread it was asked in", () => {
  const mayaTurn = beginClinicalAiTurn("maya-chen", "Summarize chart");
  beginClinicalAiTurn("david-kim", "Summarize chart");

  // A turn id from Maya's thread cannot settle anything in David's.
  assert.equal(settleClinicalAiTurn("david-kim", mayaTurn, { status: "failed", error: "x" }), false);
  assert.equal(clinicalAiThreadFor("david-kim")[0].status, "pending");

  assert.equal(settleClinicalAiTurn("maya-chen", mayaTurn, { status: "failed", error: "Planner unavailable" }), true);
  assert.equal(clinicalAiThreadFor("maya-chen")[0].error, "Planner unavailable");
  assert.equal(threadHasPendingTurn("maya-chen"), false);
});

test("a late answer does not revive a cleared thread or a dismissed turn", () => {
  const cleared = beginClinicalAiTurn("maya-chen", "Summarize chart");
  clearClinicalAiThread("maya-chen");
  assert.equal(settleClinicalAiTurn("maya-chen", cleared, { status: "answered", plan: plan({ id: "maya-chen", name: "Maya Chen" }) }), false);
  assert.equal(clinicalAiThreadFor("maya-chen").length, 0);

  const dismissed = beginClinicalAiTurn("maya-chen", "Check labs");
  dismissClinicalAiTurn("maya-chen", dismissed);
  assert.equal(settleClinicalAiTurn("maya-chen", dismissed, { status: "failed", error: "x" }), false);
  assert.equal(clinicalAiThreadFor("maya-chen").length, 0);
});

test("a settled turn cannot be settled again", () => {
  const id = beginClinicalAiTurn("maya-chen", "Summarize chart");
  assert.equal(settleClinicalAiTurn("maya-chen", id, { status: "failed", error: "first" }), true);
  assert.equal(settleClinicalAiTurn("maya-chen", id, { status: "failed", error: "second" }), false);
  assert.equal(clinicalAiThreadFor("maya-chen")[0].error, "first");
});

test("the session ending drops every thread", () => {
  beginClinicalAiTurn("maya-chen", "Summarize chart");
  const pending = beginClinicalAiTurn("david-kim", "Check labs");
  resetClinicalAiThreads();
  assert.equal(clinicalAiThreadFor("maya-chen").length, 0);
  assert.equal(clinicalAiThreadFor("david-kim").length, 0);
  // The previous clinician's in-flight answer cannot land in the next session.
  assert.equal(settleClinicalAiTurn("david-kim", pending, { status: "failed", error: "x" }), false);
  assert.equal(clinicalAiThreadFor("david-kim").length, 0);
});

test("an answer about another patient is labelled and does not move the thread", () => {
  const id = beginClinicalAiTurn("maya-chen", "What is David Kim taking?");
  settleClinicalAiTurn("maya-chen", id, {
    status: "answered",
    plan: plan({ id: "david-kim", name: "David Kim", source: "mentioned_patient" }),
  });
  const [turn] = clinicalAiThreadFor("maya-chen");
  assert.equal(turn.patientId, "maya-chen");
  assert.deepEqual(turnAnswersForAnotherPatient(turn), { id: "david-kim", name: "David Kim" });
  assert.equal(clinicalAiThreadFor("david-kim").length, 0);

  const own = beginClinicalAiTurn("maya-chen", "And hers?");
  settleClinicalAiTurn("maya-chen", own, { status: "answered", plan: plan({ id: "maya-chen", name: "Maya Chen" }) });
  assert.equal(turnAnswersForAnotherPatient(clinicalAiThreadFor("maya-chen")[1]), null);
});

test("the thread keeps only the most recent turns", () => {
  for (let i = 0; i < MAX_THREAD_TURNS + 5; i += 1) beginClinicalAiTurn("maya-chen", `question ${i}`);
  const turns = clinicalAiThreadFor("maya-chen");
  assert.equal(turns.length, MAX_THREAD_TURNS);
  assert.equal(turns[0].query, "question 5");
  assert.equal(turns.at(-1)?.query, `question ${MAX_THREAD_TURNS + 4}`);
});

test("listeners hear changes and the snapshot is stable between them", () => {
  let calls = 0;
  const unsubscribe = subscribeClinicalAiThreads(() => {
    calls += 1;
  });
  const before = clinicalAiThreadFor("maya-chen");
  assert.equal(clinicalAiThreadFor("maya-chen"), before);
  beginClinicalAiTurn("maya-chen", "Summarize chart");
  assert.equal(calls, 1);
  const after = clinicalAiThreadFor("maya-chen");
  assert.notEqual(after, before);
  assert.equal(clinicalAiThreadFor("maya-chen"), after);
  unsubscribe();
  beginClinicalAiTurn("maya-chen", "Check labs");
  assert.equal(calls, 1);
});

test("collapsed turns summarize what came back without inventing content", () => {
  const answered = beginClinicalAiTurn("maya-chen", "q1");
  settleClinicalAiTurn("maya-chen", answered, { status: "answered", plan: plan({ id: "maya-chen", name: "Maya Chen" }, "Sertraline 100 mg daily") });
  const workspace = beginClinicalAiTurn("maya-chen", "compact mode");
  settleClinicalAiTurn("maya-chen", workspace, { status: "workspace", feedback: "Switched to compact density." });
  const empty = beginClinicalAiTurn("maya-chen", "q3");
  const silent = plan({ id: "maya-chen", name: "Maya Chen" });
  delete silent.answer;
  settleClinicalAiTurn("maya-chen", empty, { status: "answered", plan: silent });

  const turns = clinicalAiThreadFor("maya-chen");
  assert.equal(turnSummary(turns[0]), "Sertraline 100 mg daily");
  assert.equal(turnSummary(turns[1]), "Switched to compact density.");
  assert.equal(turnSummary(turns[2]), "The assistant could not answer this.");
});

test("follow-ups are read only against answered questions about this thread's patient", () => {
  const maya = { id: "maya-chen", name: "Maya Chen" };
  const settle = (query: string, outcome: Parameters<typeof settleClinicalAiTurn>[2]) =>
    settleClinicalAiTurn("maya-chen", beginClinicalAiTurn("maya-chen", query), outcome);

  settle("What was her last lithium level?", { status: "answered", plan: plan(maya) });
  settle("compact mode", { status: "workspace", feedback: "Compact." });
  settle("What is David Kim taking?", { status: "answered", plan: plan({ id: "david-kim", name: "David Kim", source: "mentioned_patient" }) });
  settle("Check labs", { status: "failed", error: "Planner unavailable" });
  const clarified = plan(maya);
  clarified.clarification = { required: true, field: "request", reason: "request_ambiguous", message: "Which one?" };
  settle("that one", { status: "answered", plan: clarified });
  beginClinicalAiTurn("maya-chen", "still pending");
  settle("Summarize chart", { status: "answered", plan: plan(maya) });

  assert.deepEqual(priorQuestionsFor(clinicalAiThreadFor("maya-chen"), 6), [
    "What was her last lithium level?",
    "Summarize chart",
  ]);
  assert.deepEqual(priorQuestionsFor(clinicalAiThreadFor("maya-chen"), 1), ["Summarize chart"]);
});
