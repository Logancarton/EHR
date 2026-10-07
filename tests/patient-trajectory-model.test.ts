import test from "node:test";
import assert from "node:assert/strict";

import type { AssembledClinicalContext } from "../app/server/context/context-assembler";
import { buildPatientTrajectory } from "../app/server/ai/patient-trajectory-model";

test("patient trajectory assigns direction only from evidence that supports direction", () => {
  const context: AssembledClinicalContext = {
    patient: { id: "trajectory", name: "Trajectory Patient", mrn: "T-1", dob: "2000-01-01", age: 26, pronouns: "they/them" },
    surface: "longitudinal-query",
    userRole: "provider",
    allergies: [],
    activeDiagnoses: ["Depressive disorder", "Anxiety disorder"],
    activeMedications: ["Sertraline 100 mg daily"],
    recentMedicationChanges: [{
      medicationId: "med-1",
      medicationName: "Sertraline",
      displayText: "Sertraline 100 mg daily",
      status: "active",
      changedAt: "2026-10-02T09:00:00Z",
      changes: [{ field: "dose", label: "Dose", from: "50 mg", to: "100 mg" }],
      provenanceRef: "medications/med-1#version-2",
    }],
    vitals: {},
    recentVitals: [],
    recentAssessments: [
      { id: "phq2", instrument: "phq-9", title: "PHQ-9", date: "2026-10-01", totalScore: 7, maxScore: 27, severity: "Mild", flags: [], provenanceRef: "clinical-assessments/phq2" },
      { id: "phq1", instrument: "phq-9", title: "PHQ-9", date: "2026-09-01", totalScore: 14, maxScore: 27, severity: "Moderate", flags: [], provenanceRef: "clinical-assessments/phq1" },
      { id: "gad2", instrument: "gad-7", title: "GAD-7", date: "2026-10-01", totalScore: 13, maxScore: 21, severity: "Moderate", flags: [], provenanceRef: "clinical-assessments/gad2" },
      { id: "gad1", instrument: "gad-7", title: "GAD-7", date: "2026-09-01", totalScore: 8, maxScore: 21, severity: "Mild", flags: [], provenanceRef: "clinical-assessments/gad1" },
      { id: "asrs2", instrument: "asrs-v1.1", title: "ASRS v1.1", date: "2026-10-01", totalScore: 5, maxScore: 6, severity: "Positive screen", flags: [], provenanceRef: "clinical-assessments/asrs2" },
      { id: "asrs1", instrument: "asrs-v1.1", title: "ASRS v1.1", date: "2026-09-01", totalScore: 4, maxScore: 6, severity: "Positive screen", flags: [], provenanceRef: "clinical-assessments/asrs1" },
    ],
    recentLabs: [],
    monitoringProtocols: [],
    recentEncounters: [{
      encounterId: "e1",
      date: "2026-10-01",
      type: "follow-up",
      chiefComplaint: "Follow-up",
      assessment: "Sleep remains fragmented. Denies suicidal thoughts. School attendance improved. Reports nausea.",
      plan: "Continue current plan.",
      provenanceRef: "encounters/e1",
    }],
    recentMessages: [],
    chartedCommunications: [],
    provenanceMap: {
      patient: "patients/trajectory",
      "assessment-phq2": "clinical-assessments/phq2",
      "assessment-phq1": "clinical-assessments/phq1",
      "assessment-gad2": "clinical-assessments/gad2",
      "assessment-gad1": "clinical-assessments/gad1",
      "assessment-asrs2": "clinical-assessments/asrs2",
      "assessment-asrs1": "clinical-assessments/asrs1",
      "medication-version-med-1-2": "medications/med-1#version-2",
    },
    estimatedTokens: 500,
    isTruncated: false,
    assembledAt: "2026-10-03T00:00:00Z",
  };

  const trajectory = buildPatientTrajectory(context, []);
  const byDomain = new Map(trajectory.domains.map((item) => [item.domain, item]));

  assert.equal(byDomain.get("mood")?.direction, "improving");
  assert.match(byDomain.get("mood")?.summary || "", /lower recently reported symptom-score direction/i);
  assert.equal(byDomain.get("anxiety")?.direction, "worsening");
  assert.equal(byDomain.get("attention")?.direction, "changed", "ASRS change is not automatically interpreted as better or worse");
  assert.equal(byDomain.get("medication_course")?.direction, "changed");
  assert.equal(byDomain.get("sleep")?.direction, "recorded_mention", "free-text sleep content is reviewable but not directional");
  assert.equal(byDomain.get("safety")?.direction, "recorded_mention", "explicit safety language is surfaced neutrally without converting denial into a risk conclusion");
  assert.equal(byDomain.get("adverse_effects")?.direction, "recorded_mention");
  assert.equal(byDomain.get("functioning")?.direction, "recorded_mention");

  assert.ok(
    trajectory.domains
      .filter((item) => item.direction !== "insufficient_evidence")
      .every((item) => item.evidence.length > 0),
    "every surfaced trajectory signal carries source evidence",
  );
});

test("absence stays insufficient instead of becoming a reassuring clinical claim", () => {
  const context: AssembledClinicalContext = {
    patient: { id: "empty", name: "Empty Patient", mrn: "E-1", dob: "2000-01-01", age: 26, pronouns: "they/them" },
    surface: "longitudinal-query",
    userRole: "provider",
    allergies: [],
    activeDiagnoses: [],
    activeMedications: [],
    vitals: {},
    recentVitals: [],
    recentAssessments: [],
    recentLabs: [],
    monitoringProtocols: [],
    recentEncounters: [],
    recentMessages: [],
    chartedCommunications: [],
    provenanceMap: { patient: "patients/empty" },
    estimatedTokens: 50,
    isTruncated: false,
    assembledAt: "2026-10-03T00:00:00Z",
  };

  const trajectory = buildPatientTrajectory(context, []);
  assert.equal(trajectory.domains.length, 8);
  assert.ok(trajectory.domains.every((item) => item.direction === "insufficient_evidence"));
  assert.ok(trajectory.domains.every((item) => item.evidence.length === 0));
});


test("unchanged symptom score cannot be mislabeled improving or worsening when severity text changes", () => {
  const context: AssembledClinicalContext = {
    patient: { id: "same-score", name: "Same Score", mrn: "S-3", dob: "2000-01-01", age: 26, pronouns: "they/them" },
    surface: "longitudinal-query",
    userRole: "provider",
    allergies: [],
    activeDiagnoses: [],
    activeMedications: [],
    vitals: {},
    recentVitals: [],
    recentAssessments: [
      { id: "p2", instrument: "phq-9", title: "PHQ-9", date: "2026-10-02", totalScore: 10, maxScore: 27, severity: "Moderate", flags: [], provenanceRef: "clinical-assessments/p2" },
      { id: "p1", instrument: "phq-9", title: "PHQ-9", date: "2026-09-02", totalScore: 10, maxScore: 27, severity: "Mild", flags: [], provenanceRef: "clinical-assessments/p1" },
    ],
    recentLabs: [],
    monitoringProtocols: [],
    recentEncounters: [],
    recentMessages: [],
    chartedCommunications: [],
    provenanceMap: { patient: "patients/same-score" },
    estimatedTokens: 80,
    isTruncated: false,
    assembledAt: "2026-10-03T00:00:00Z",
  };

  const mood = buildPatientTrajectory(context, []).domains.find((item) => item.domain === "mood");
  assert.equal(mood?.direction, "changed");
  assert.match(mood?.summary || "", /No improving\/worsening direction is assigned/i);
});
