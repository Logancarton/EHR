import test from "node:test";
import assert from "node:assert/strict";
import { buildClinicalBrief } from "../app/domain/clinical-brief";
import type { PatientEncounterSummary } from "../app/domain/clinical-records";
import type { AssessmentRecord, VitalSignSummary } from "../app/domain/clinical-measurements";

function encounter(overrides: Partial<PatientEncounterSummary> = {}): PatientEncounterSummary {
  return {
    id: "enc-1",
    patientId: "patient-1",
    date: "Sep 25, 2026",
    type: "Psychiatric Follow-Up",
    status: "signed",
    chiefComplaint: "Medication follow-up",
    assessment: "Stable.",
    plan: "Continue current medications.",
    followUp: "Return in 4 weeks. Reassess PHQ-9, GAD-7, BP/HR, and medication response.",
    createdAt: "2026-09-25T15:00:00.000Z",
    updatedAt: "2026-09-25T15:30:00.000Z",
    signedAt: "2026-09-25T15:30:00.000Z",
    ...overrides,
  };
}

function assessment(
  instrument: AssessmentRecord["instrument"],
  score: number,
  maxScore: number,
  administeredAt: string,
  severity: string,
): AssessmentRecord {
  return {
    id: `${instrument}-${administeredAt}`,
    patientId: "patient-1",
    instrument,
    instrumentVersion: "1.0",
    title: instrument,
    totalScore: score,
    maxScore,
    severity,
    responses: {},
    flags: [],
    source: "clinician",
    administeredBy: "prov-1",
    administeredAt,
    reviewStatus: "reviewed",
    createdAt: administeredAt,
    updatedAt: administeredAt,
  };
}

test("clinical brief uses the latest signed encounter as the next-visit continuity source", () => {
  const signed = encounter();
  const newerDraft = encounter({
    id: "enc-draft",
    date: "Sep 27, 2026",
    status: "draft",
    followUp: "Draft content must not carry forward.",
    signedAt: undefined,
  });
  const vitals: VitalSignSummary[] = [
    {
      recordedAt: "2026-09-27T16:00:00.000Z",
      bpText: "120/78",
      heartRate: 74,
      weightLbs: 142,
      flags: [],
    },
  ];

  const brief = buildClinicalBrief({
    encounters: [newerDraft, signed],
    assessments: [
      assessment("phq-9", 9, 27, "2026-09-01T12:00:00.000Z", "Mild Depression"),
      assessment("phq-9", 14, 27, "2026-09-27T12:00:00.000Z", "Moderate Depression"),
    ],
    vitals,
    medications: [],
    observations: [],
  });

  assert.equal(brief.previousVisit?.id, signed.id);
  assert.equal(brief.carryForwardSource, "follow-up");
  assert.match(brief.carryForward || "", /Reassess PHQ-9, GAD-7, BP\/HR/);
  assert.ok(brief.sinceLastVisit.some((change) => change.text.includes("PHQ-9 14/27")));
  assert.ok(brief.sinceLastVisit.some((change) => change.text.includes("BP 120/78")));
});

test("clinical brief keeps rating-scale trajectories compact and chronological", () => {
  const brief = buildClinicalBrief({
    encounters: [encounter()],
    assessments: [
      assessment("phq-9", 7, 27, "2026-08-01T12:00:00.000Z", "Mild Depression"),
      assessment("phq-9", 9, 27, "2026-09-01T12:00:00.000Z", "Mild Depression"),
      assessment("phq-9", 14, 27, "2026-09-27T12:00:00.000Z", "Moderate Depression"),
      assessment("gad-7", 12, 21, "2026-08-01T12:00:00.000Z", "Moderate Anxiety"),
      assessment("gad-7", 8, 21, "2026-09-27T12:00:00.000Z", "Mild Anxiety"),
    ],
    vitals: [],
    medications: [],
    observations: [],
  });

  const phq = brief.trajectories.find((trajectory) => trajectory.instrument === "phq-9");
  const gad = brief.trajectories.find((trajectory) => trajectory.instrument === "gad-7");

  assert.deepEqual(phq?.scores.map((entry) => entry.score), [7, 9, 14]);
  assert.equal(phq?.direction, "up");
  assert.deepEqual(gad?.scores.map((entry) => entry.score), [12, 8]);
  assert.equal(gad?.direction, "down");
});
