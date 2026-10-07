import test from "node:test";
import assert from "node:assert/strict";

import type { AssembledClinicalContext } from "../app/server/context/context-assembler";
import { buildLongitudinalClinicalReasoning } from "../app/server/ai/longitudinal-clinical-reasoner";

test("longitudinal reasoning separates evidence classes and cites every conclusion", () => {
  const context: AssembledClinicalContext = {
    patient: { id: "synthetic", name: "Synthetic Patient", mrn: "S-1", dob: "2000-01-01", age: 26, pronouns: "they/them" },
    surface: "longitudinal-query",
    userRole: "provider",
    allergies: [],
    activeDiagnoses: ["Major depressive disorder"],
    activeMedications: ["Sertraline 100 mg daily"],
    pendingMedicationCandidates: [{
      authority: "evidence",
      candidateId: "cand-1",
      status: "pending",
      source: { type: "patient-report", system: "ehr-local", ref: null, evidenceType: "reported-medication" },
      rawEvidenceText: "Patient reports taking sertraline 50 mg daily.",
      interpretation: {
        displayText: "Sertraline 50 mg daily",
        medicationName: "Sertraline",
        genericName: "sertraline",
        strength: "50 mg",
        dose: "50 mg",
        route: "oral",
        frequency: "daily",
        startDate: null,
        endDate: null,
        prescriber: null,
      },
      observedAt: "2026-10-05T12:00:00Z",
      createdAt: "2026-10-05T12:00:00Z",
      linkedMedicationId: "med-1",
      advisory: {
        authority: "advisory",
        matchConfidence: "likely",
        suggestedMedicationId: "med-1",
        suggestedMedicationDisplay: "Sertraline 100 mg daily",
        conflictSignal: "Reported dose differs from the active medication record",
        deltas: ["50 mg reported versus 100 mg active"],
      },
      provenanceRef: "medication-candidates/cand-1",
    }],
    vitals: { wt: "138 lbs" },
    recentVitals: [
      { id: "v2", code: "wt", testName: "Weight", date: "2026-10-01", value: "138 lbs", unit: "lbs", provenanceRef: "observations/v2" },
      { id: "v1", code: "wt", testName: "Weight", date: "2026-09-01", value: "142 lbs", unit: "lbs", provenanceRef: "observations/v1" },
    ],
    recentAssessments: [
      { id: "a2", instrument: "phq-9", title: "PHQ-9", date: "2026-10-01", totalScore: 7, maxScore: 27, severity: "Mild", flags: [], provenanceRef: "clinical-assessments/a2" },
      { id: "a1", instrument: "phq-9", title: "PHQ-9", date: "2026-09-01", totalScore: 14, maxScore: 27, severity: "Moderate", flags: [], provenanceRef: "clinical-assessments/a1" },
    ],
    recentLabs: [
      { id: "l2", testName: "Lithium", date: "2026-10-01", value: "0.7", unit: "mmol/L" },
      { id: "l1", testName: "Lithium", date: "2026-09-01", value: "0.5", unit: "mmol/L" },
    ],
    monitoringProtocols: [],
    recentEncounters: [
      { encounterId: "e2", date: "2026-10-01", type: "follow-up", chiefComplaint: "Follow-up", assessment: "Mood improved.", plan: "Continue treatment.", provenanceRef: "encounters/e2" },
      { encounterId: "e1", date: "2026-09-01", type: "follow-up", chiefComplaint: "Follow-up", assessment: "Persistent depression.", plan: "Increase support.", provenanceRef: "encounters/e1" },
    ],
    recentMessages: [],
    chartedCommunications: [{
      id: "c1",
      type: "patient-message",
      title: "Interval update",
      body: "Patient reported improved sleep after the last visit.",
      createdAt: "2026-10-03T10:00:00Z",
      sourceRef: "messages/m1",
    }],
    provenanceMap: {
      patient: "patients/synthetic",
      "medication-med-1": "medications/med-1",
      "assessment-a2": "clinical-assessments/a2",
      "assessment-a1": "clinical-assessments/a1",
      "vital-v2": "observations/v2",
      "vital-v1": "observations/v1",
    },
    estimatedTokens: 900,
    isTruncated: false,
    assembledAt: "2026-10-06T12:00:00Z",
  };

  const reasoning = buildLongitudinalClinicalReasoning(context);

  assert.ok(reasoning.insights.some((item) => item.kind === "contradiction"));
  assert.ok(reasoning.insights.some((item) => item.kind === "change"));
  assert.ok(reasoning.insights.some((item) => item.kind === "recorded_fact"));
  assert.ok(reasoning.insights.some((item) => item.kind === "possible_interpretation"));
  assert.ok(
    reasoning.insights.every((item) => item.evidence.length > 0 && item.evidence.every((source) => source.sourceRef.length > 0)),
    "every surfaced conclusion must carry source references",
  );
  assert.match(reasoning.answer, /no clinical action was taken/i);
  assert.equal(reasoning.reviewSuggestion?.label, "Review medication reconciliation");
  assert.ok(reasoning.reviewSuggestion?.evidence.length);
});
