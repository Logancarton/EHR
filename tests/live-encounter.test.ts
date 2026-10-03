import test from "node:test";
import assert from "node:assert/strict";
import { createInitialEncounter } from "../app/lib/encounter-engine";
import {
  applyProviderGuidance,
  captureUtterance,
  attestCoverage,
  sectionCoverage,
  encounterMode,
  validateLiveSupport,
  type ProviderGuidance,
} from "../app/domain/live-encounter";
const event = (patch: Partial<ProviderGuidance> = {}): ProviderGuidance => ({
  id: crypto.randomUUID(),
  kind: "correction",
  target: "mse.moodAffect",
  text: "Restricted affect, not flat.",
  createdAt: new Date().toISOString(),
  needsClarification: false,
  ...patch,
});

test("live capture progresses from source speech; corrections persist without changing evidence or actions", () => {
  let draft = createInitialEncounter("synthetic-patient");
  const utterance = {
    id: "u1",
    speaker: "patient" as const,
    speakerName: "Synthetic patient",
    text: "Increase my medication?",
    timestamp: "00:01",
  };
  draft = captureUtterance(draft, utterance);
  assert.match(draft.intervalHistory, /Increase my medication/);
  assert.deepEqual(draft.candidateActions, []);
  draft = applyProviderGuidance(draft, event());
  draft = captureUtterance(draft, {
    ...utterance,
    id: "u2",
    text: "I feel sleepy.",
  });
  assert.equal(draft.mse.moodAffect, "Restricted affect, not flat.");
  assert.deepEqual(draft.ambientTranscript[0], utterance);
  assert.equal(captureUtterance(draft, utterance), draft);
  assert.equal(draft.riskAssessment, "");
  assert.equal(encounterMode(draft, true), "LIVE");
  assert.equal(encounterMode(draft, false), "REVIEW");
});
test("observations update MSE, thoughts remain separate and corrections retain replaced wording", () => {
  let draft = createInitialEncounter("synthetic-patient");
  draft.mse.moodAffect = "Flat affect";
  draft = applyProviderGuidance(draft, event());
  assert.equal(draft.liveSupport?.guidance[0].replaces, "Flat affect");
  draft = applyProviderGuidance(
    draft,
    event({
      kind: "observation",
      target: "mse.behavior",
      text: "Intermittent facial motor tic",
    }),
  );
  assert.equal(draft.mse.behavior, "Intermittent facial motor tic");
  draft = applyProviderGuidance(
    draft,
    event({
      kind: "clinical-thought",
      target: "assessment",
      text: "Consider akathisia",
      needsClarification: true,
    }),
  );
  assert.equal(draft.assessment, "");
  assert.equal(sectionCoverage(draft, "assessment").state, "clarification");
});
test("coverage uses current evidence and explicit assessment, never silence or stale attestations", () => {
  let draft = createInitialEncounter("synthetic-patient");
  assert.equal(sectionCoverage(draft, "riskAssessment").state, "missing");
  draft.riskAssessment = "Safety discussion requires clarification";
  assert.equal(sectionCoverage(draft, "riskAssessment").state, "partial");
  assert.equal(attestCoverage(draft, "riskAssessment", false), draft);
  draft = attestCoverage(draft, "riskAssessment", true);
  assert.equal(sectionCoverage(draft, "riskAssessment").state, "covered");
  draft.riskAssessment += " New concern";
  assert.equal(sectionCoverage(draft, "riskAssessment").state, "partial");
});
test("signed note remains immutable and malformed guidance is rejected", () => {
  const draft = {
    ...createInitialEncounter("synthetic-patient"),
    status: "signed" as const,
  };
  assert.equal(encounterMode(draft, true), "SIGNED");
  assert.equal(applyProviderGuidance(draft, event()), draft);
  assert.equal(attestCoverage(draft, "plan", false), draft);
  assert.equal(
    captureUtterance(draft, {
      id: "u",
      speaker: "patient",
      speakerName: "Test",
      text: "Test",
      timestamp: "0",
    }),
    draft,
  );
  assert.throws(() =>
    validateLiveSupport({
      guidance: [event({ target: "invalid" as never })],
      attestations: [],
    }),
  );
  assert.throws(() =>
    validateLiveSupport({
      guidance: [],
      attestations: [
        {
          id: "a",
          target: "riskAssessment",
          evidence: "unknown",
          createdAt: new Date().toISOString(),
          safetyExplicitlyAssessed: false,
        },
      ],
    }),
  );
});

test("withholding a premature interpretation clears draft characterization but retains evidence and guidance", () => {
  const draft = createInitialEncounter("synthetic-patient");
  draft.mse.thoughtContent = "Delusional content";
  const next = applyProviderGuidance(
    draft,
    event({
      target: "mse.thoughtContent",
      text: "Real legal dispute; do not characterize as delusion yet.",
      needsClarification: true,
    }),
  );
  assert.equal(next.mse.thoughtContent, "");
  assert.equal(next.liveSupport?.guidance[0].replaces, "Delusional content");
  assert.equal(
    sectionCoverage(next, "mse.thoughtContent").state,
    "clarification",
  );
});
