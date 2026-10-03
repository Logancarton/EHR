import test from "node:test";
import assert from "node:assert/strict";
import { buildClinicalBrief, vitalContext } from "../app/domain/clinical-brief";
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
    patientId: "patient-1",
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
    patientId: "patient-1",
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

test("clinical brief scopes continuity and measures to its patient and excludes older events", () => {
  const brief = buildClinicalBrief({ patientId: "patient-1",
    encounters: [encounter(), encounter({ id: "foreign", patientId: "other", date: "Sep 29, 2026", plan: "Foreign plan" })],
    assessments: [assessment("phq-9", 9, 27, "2026-09-24", "Mild"),
      assessment("phq-9", 10, 27, "2026-09-25", "Moderate"),
      assessment("phq-9", 12, 27, "2026-09-26", "Moderate"),
      { ...assessment("phq-9", 27, 27, "2026-09-29", "Severe"), patientId: "other" }],
    vitals: [], medications: [], observations: [] });
  assert.equal(brief.previousVisit?.id, "enc-1");
  assert.equal(brief.sinceLastVisit.length, 1);
  assert.match(brief.sinceLastVisit[0].text, /12\/27.*\+2 from 10/);
  assert.deepEqual(brief.trajectories[0].scores.map((score) => score.score), [9, 10, 12]);
});

test("since-last-visit retains each supported measure rather than dropping categories at three rows", () => {
  const brief = buildClinicalBrief({ patientId: "patient-1", encounters: [encounter()],
    assessments: [assessment("phq-9", 12, 27, "2026-09-26", "Moderate"),
      assessment("gad-7", 8, 21, "2026-09-26", "Mild"),
      assessment("asrs-v1.1", 4, 6, "2026-09-26", "Positive"),
      assessment("phq-9", 14, 27, "2026-09-27", "Moderate")], vitals: [], medications: [], observations: [] });
  assert.equal(brief.sinceLastVisit.length, 4);
  assert.ok(brief.sinceLastVisit.some((item) => item.text.startsWith("ASRS")));
});

test("no signed baseline means no invented changes or carry-forward", () => {
  const brief = buildClinicalBrief({ patientId: "patient-1", encounters: [encounter({ status: "draft" })],
    assessments: [], vitals: [], medications: [], observations: [] });
  assert.equal(brief.previousVisit, null);
  assert.equal(brief.carryForward, null);
  assert.deepEqual(brief.sinceLastVisit, []);
  assert.deepEqual(brief.trajectories, []);
});

test("medication and laboratory deltas exclude old, foreign and invalid source records", () => {
  const medication = (id: string, updated_at: string, status = "active") => ({ id, patient_id: "patient-1", updated_at, status,
    display_text: "Synthetic medicine 10 mg", medication_name: "Synthetic medicine" });
  const observation = (id: string, effective_at: string, status = "final", category = "laboratory") => ({ id,
    patient_id: "patient-1", effective_at, status, category, test_name: "Synthetic test", value_text: "0.7", unit: "mmol/L", interpretation: "normal" });
  const brief = buildClinicalBrief({ patientId: "patient-1", encounters: [encounter()], assessments: [], vitals: [],
    medications: [medication("old", "2026-09-24"), medication("new", "2026-09-26"), medication("stopped", "2026-09-27", "discontinued"),
      medication("invalid", "2026-09-28", "entered-in-error"), { ...medication("foreign", "2026-09-29"), patient_id: "other" }] as import("../app/domain/clinical-records").MedicationRecord[],
    observations: [observation("old", "2026-09-24"), observation("new", "2026-09-27"), observation("cancelled", "2026-09-28", "cancelled"),
      observation("vital", "2026-09-28", "final", "vital-signs")] as import("../app/domain/clinical-records").ObservationRecord[] });
  assert.deepEqual(brief.sinceLastVisit.map((item) => item.id).sort(), ["lab-new", "medication-new", "medication-stopped"]);
  assert.match(brief.sinceLastVisit.find((item) => item.id === "medication-stopped")!.text, /discontinued/);
  assert.ok(brief.sinceLastVisit.every((item) => !item.text.includes("dose changed")));
});

test("a signed active encounter is excluded from its own previous-visit context", () => {
  const brief = buildClinicalBrief({ patientId: "patient-1", excludeEncounterId: "active", encounters: [encounter(),
    encounter({ id: "active", date: "Sep 29, 2026", assessment: "Today's assessment" })],
    assessments: [], vitals: [], medications: [], observations: [] });
  assert.equal(brief.previousVisit?.id, "enc-1");
});


test("vitals compare the latest two measurements without inventing absent values", () => {
  const prior = { recordedAt: "2026-09-02", systolic: 120, diastolic: 80, heartRate: 70, weightLbs: 140, flags: [] };
  const latest = { recordedAt: "2026-09-03", systolic: 126, diastolic: 82, heartRate: 74, weightLbs: 141.5, flags: [] };
  const result = vitalContext([latest, prior]);
  assert.equal(result.latest, latest);
  assert.match(result.comparison!, /systolic \+6 mmHg.*diastolic \+2 mmHg.*HR \+4 bpm.*weight \+1.5 lb/);
  assert.equal(vitalContext([{ recordedAt: "2026-09-02", flags: [] }, latest]).comparison, null);
  assert.equal(vitalContext([]).latest, null);
});
