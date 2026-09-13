import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateEncounterCoding,
  createInitialEncounter,
  defaultMse,
  type CodingReference,
  type EncounterState,
} from "../app/lib/encounter-engine";

/**
 * The structured coding engine (docs/NOTE_REFERENCES.md, phase 3).
 *
 * Coding used to be decided by searching note prose for words: any note containing
 * "mg" satisfied prescription drug management, and an assessment that named a
 * condition outside the engine's vocabulary scored no problems at all. These tests
 * hold the replacement — elements are established by referenced records, the word
 * search survives only as a labelled fallback for a note nothing has referenced
 * yet, and an unconfirmed proposal never moves a code.
 */

function draft(overrides: Partial<EncounterState> = {}): EncounterState {
  return {
    ...createInitialEncounter("synthetic-patient"),
    intervalHistory: "Stable since the last visit, sleeping through the night, working full days.",
    treatmentResponse: "Sleep onset latency down from 90 to 25 minutes.",
    sideEffects: "Mild dry mouth, no sedation.",
    mse: { ...defaultMse },
    assessment: "Ongoing treatment of the established conditions below.",
    plan: "Continue current regimen and review at the next visit.",
    candidateActions: [],
    ...overrides,
  };
}

function reference(overrides: Partial<CodingReference> = {}): CodingReference {
  return {
    section: "assessment",
    entityType: "problem",
    entityId: "prb-1",
    source: "clinician-authored",
    status: "confirmed",
    ...overrides,
  };
}

test("a condition addressed by reference counts even when the note never names it", () => {
  // The old engine searched the assessment for "adhd", "anxiety", "depress",
  // "bipolar", "insomnia". Anything else scored zero problems no matter how
  // clearly it was addressed.
  const references = [
    reference({ entityId: "prb-ptsd", section: "assessment" }),
    reference({ entityId: "prb-ocd", section: "plan" }),
  ];
  const coding = calculateEncounterCoding(
    draft({ assessment: "Both established conditions reviewed; no change in severity." }),
    0,
    references,
  );

  assert.equal(coding.problemsScore, "moderate", "two referenced problems is moderate complexity");
  assert.match(coding.problemsDetail, /2 referenced problem records/);
});

test("an incidental dose in the prose does not establish prescription drug management", () => {
  // "her mother takes lithium 300 mg" used to satisfy the Moderate-risk pillar of
  // a 99214 on its own.
  const withReferences = calculateEncounterCoding(
    draft({
      plan: "Discussed family history; her mother takes lithium 300 mg. No changes to her own treatment.",
    }),
    0,
    [reference({ entityId: "prb-gad" })],
  );

  assert.equal(withReferences.riskScore, "low", "a dose someone else takes is not this patient's drug management");
  const rx = withReferences.goals.find((goal) => goal.id === "rx-management");
  assert.equal(rx?.met, false);
  assert.match(rx?.detail ?? "", /no medication record is referenced/);
});

test("a medication reference in the plan establishes it, and says which record did", () => {
  const coding = calculateEncounterCoding(draft(), 0, [
    reference({ entityId: "prb-gad" }),
    reference({ section: "plan", entityType: "medication", entityId: "med-sertraline", source: "action-derived" }),
  ]);

  const rx = coding.goals.find((goal) => goal.id === "rx-management");
  assert.equal(rx?.met, true);
  assert.equal(rx?.evidence, "action-derived");
  assert.deepEqual(rx?.sourceRefs, ["med-sertraline"]);
  assert.equal(coding.riskScore, "moderate");
  // One problem plus moderate risk is 99213: the 2-of-3 rule needs a second
  // category at moderate, which one chronic condition does not give.
  assert.equal(coding.primaryCode, "99213");
});

test("two referenced problems plus a referenced medication change is a 99214", () => {
  const coding = calculateEncounterCoding(draft(), 0, [
    reference({ entityId: "prb-gad", section: "assessment" }),
    reference({ entityId: "prb-mdd", section: "assessment" }),
    reference({ section: "plan", entityType: "medication", entityId: "med-sertraline", source: "action-derived" }),
  ]);

  assert.equal(coding.problemsScore, "moderate");
  assert.equal(coding.riskScore, "moderate");
  assert.equal(coding.primaryCode, "99214");
  assert.equal(
    coding.unconfirmedReferenceCount,
    0,
    "every element of this code is a confirmed reference to a named record",
  );
});

test("an unconfirmed proposal is reported but never moves the code", () => {
  const base = calculateEncounterCoding(draft(), 0, [reference({ entityId: "prb-gad" })]);
  const withProposal = calculateEncounterCoding(draft(), 0, [
    reference({ entityId: "prb-gad" }),
    reference({
      section: "plan",
      entityType: "medication",
      entityId: "med-proposed",
      source: "ai-extracted",
      status: "proposed",
    }),
  ]);

  assert.equal(withProposal.primaryCode, base.primaryCode, "a proposal alone must not lift a code level");
  assert.equal(withProposal.riskScore, base.riskScore);
  assert.equal(withProposal.unconfirmedReferenceCount, 1);
  assert.match(withProposal.nextStepRecommendation, /await confirmation/);
});

test("a rejected reference is not evidence", () => {
  const coding = calculateEncounterCoding(draft(), 0, [
    reference({ entityId: "prb-gad" }),
    reference({
      section: "plan",
      entityType: "medication",
      entityId: "med-declined",
      status: "rejected",
      source: "ai-extracted",
    }),
  ]);

  assert.equal(coding.goals.find((goal) => goal.id === "rx-management")?.met, false);
  assert.equal(coding.unconfirmedReferenceCount, 0, "a declined proposal is not pending, it is decided");
});

test("a problem referenced only in the history is context, not a problem addressed", () => {
  const coding = calculateEncounterCoding(
    draft({ assessment: "Reviewed today." }),
    0,
    [
      reference({ entityId: "prb-addressed", section: "assessment" }),
      reference({ entityId: "prb-mentioned", section: "intervalHistory" }),
      reference({ entityId: "prb-also-mentioned", section: "reviewOfSymptoms" }),
    ],
  );

  assert.match(coding.problemsDetail, /1 referenced problem record/);
  assert.equal(coding.problemsScore, "low", "recalling a condition is not addressing it");
});

test("a note with no references keeps the old behavior, and says that is what it is", () => {
  // The fallback tier exists so an un-extracted draft still shows something. It must
  // be visibly a different kind of answer.
  const coding = calculateEncounterCoding(
    draft({
      assessment: "ADHD and generalized anxiety, both stable.",
      plan: "Continue guanfacine 2 mg nightly.",
    }),
    0,
    [],
  );

  assert.equal(coding.riskScore, "moderate", "the word search still runs when nothing else can");
  assert.equal(coding.evidenceBasis, "inferred");
  assert.match(coding.mdmReasoning, /rests on reading the note text/);
  assert.ok(
    coding.goals.filter((goal) => goal.met).every((goal) => goal.evidence !== null),
    "every satisfied goal declares how it was satisfied",
  );
});

test("the recommendation reports whether it rests on records or on reading", () => {
  const structured = calculateEncounterCoding(draft(), 0, [
    reference({ section: "plan", entityType: "medication", entityId: "med-1", source: "action-derived" }),
  ]);
  assert.equal(structured.evidenceBasis, "mixed", "narrative goals are still read from text");

  const none = calculateEncounterCoding(draft(), 0, []);
  assert.equal(none.evidenceBasis, "inferred");
});
