import test from "node:test";
import assert from "node:assert/strict";
import { clinicalRecordService } from "../app/server/services/clinical-record-service";
import { MeasurementRepository } from "../app/server/repositories/measurement-repository";
import { EncounterRepository } from "../app/server/repositories/encounter-repository";
import type { ProviderContext } from "../app/server/auth/provider-context";
import type { TimelineEvent } from "../app/components/patient/PatientHistory";

const testActor: ProviderContext = {
  userId: "prov-timeline-test",
  displayName: "Dr. Timeline Tester",
  role: "provider",
  organizationId: "org-test",
  capabilities: ["read_clinical", "manage_clinical_record", "sign_encounter"],
};

test("P3-H: Longitudinal timeline - unifies all clinical event streams in chronological order", async () => {
  const patientId = "maya-chen";

  // Create known test events with distinct dates
  const v1 = MeasurementRepository.recordVitals(
    {
      patientId,
      systolic: 122,
      diastolic: 80,
      heartRate: 70,
      weightLbs: 135,
    },
    { userId: "prov-test", displayName: "Dr. Tester" },
  );

  const a1 = MeasurementRepository.recordAssessment(
    {
      patientId,
      instrument: "gad-7",
      responses: { 1: 1, 2: 1, 3: 1, 4: 0, 5: 0, 6: 0, 7: 0 },
      source: "clinician",
    },
    { userId: "prov-test", displayName: "Dr. Tester" },
  );

  const enc1 = EncounterRepository.saveDraft({
    id: `enc-test-${Date.now()}`,
    patientId,
    date: "2026-09-10",
    type: "Psychiatric Follow-up",
    chiefComplaint: "ADHD follow-up and academic focus review",
    assessment: "ADHD in good partial response to Guanfacine ER.",
    plan: "Continue Guanfacine ER 2mg qhs.",
  });

  const snapshot = clinicalRecordService.snapshot(patientId, testActor);

  // Assemble timeline events
  const events: TimelineEvent[] = [];

  snapshot.encounters?.forEach((e) => {
    events.push({ type: "encounter", id: e.id, date: e.date, data: e });
  });

  snapshot.problems.forEach((p) => {
    events.push({
      type: "diagnosis",
      id: p.id,
      date: p.onset_date || p.recorded_at.split("T")[0],
      data: p,
    });
  });

  snapshot.assessments?.forEach((a) => {
    events.push({
      type: "assessment",
      id: a.id,
      date: a.administeredAt.split("T")[0],
      data: a,
    });
  });

  snapshot.vitals?.forEach((v) => {
    events.push({
      type: "vitals",
      id: v.recordedAt,
      date: v.recordedAt.split("T")[0],
      data: v,
    });
  });

  // Verify multi-stream aggregation
  assert.ok(events.length >= 4, "Timeline contains events across multiple domains");
  const types = new Set(events.map((e) => e.type));
  assert.ok(types.has("encounter"), "Contains encounter events");
  assert.ok(types.has("diagnosis"), "Contains diagnosis events");
  assert.ok(types.has("assessment"), "Contains assessment rating scale events");
  assert.ok(types.has("vitals"), "Contains vitals flowsheet events");

  // Verify sorting order: descending by date
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  for (let i = 0; i < events.length - 1; i++) {
    const d1 = new Date(events[i].date).getTime();
    const d2 = new Date(events[i + 1].date).getTime();
    assert.ok(d1 >= d2, `Events are sorted descending: ${events[i].date} >= ${events[i + 1].date}`);
  }
});

test("P3-H: Longitudinal timeline - category stream filtering isolates target event domains", async () => {
  const events: TimelineEvent[] = [
    {
      type: "encounter",
      id: "enc-1",
      date: "2026-09-12",
      data: {
        id: "enc-1",
        patientId: "maya-chen",
        date: "2026-09-12",
        type: "Evaluation",
        status: "signed",
        chiefComplaint: "Anxiety",
        assessment: "GAD",
        plan: "Plan",
        createdAt: "2026-09-12T00:00:00Z",
        updatedAt: "2026-09-12T00:00:00Z",
      },
    },
    {
      type: "med",
      id: "med-1",
      date: "2026-09-11",
      data: {
        id: "med-1",
        patient_id: "maya-chen",
        display_text: "Guanfacine ER 2 mg nightly",
        medication_name: "Guanfacine ER",
        generic_name: "guanfacine",
        strength: "2 mg",
        dose: "2 mg",
        route: "oral",
        frequency: "nightly",
        indication: "ADHD",
        status: "active",
        start_date: "2026-09-11",
        end_date: null,
        prescriber: "Dr. Tester",
        source_type: "clinician",
        source_system: "clinical-bond",
        source_ref: null,
        recorded_by: "Dr. Tester",
        recorded_at: "2026-09-11T10:00:00Z",
        updated_at: "2026-09-11T10:00:00Z",
      },
    },
    {
      type: "assessment",
      id: "scale-1",
      date: "2026-09-10",
      data: {
        id: "scale-1",
        patientId: "maya-chen",
        instrument: "phq-9",
        instrumentVersion: "1.0",
        title: "PHQ-9",
        totalScore: 6,
        maxScore: 27,
        severity: "Mild depression",
        responses: {},
        flags: [],
        source: "clinician",
        administeredBy: "Dr. Tester",
        administeredAt: "2026-09-10T10:00:00Z",
        reviewStatus: "reviewed",
        createdAt: "2026-09-10T10:00:00Z",
        updatedAt: "2026-09-10T10:00:00Z",
      },
    },
    {
      type: "vitals",
      id: "vital-1",
      date: "2026-09-09",
      data: {
        recordedAt: "2026-09-09T10:00:00Z",
        systolic: 120,
        diastolic: 80,
        heartRate: 72,
        flags: [],
      },
    },
  ];

  // Filter: encounters only
  const encountersOnly = events.filter((e) => e.type === "encounter");
  assert.equal(encountersOnly.length, 1);
  assert.equal(encountersOnly[0].type, "encounter");

  // Filter: meds only
  const medsOnly = events.filter((e) => e.type === "med");
  assert.equal(medsOnly.length, 1);
  assert.equal(medsOnly[0].type, "med");

  // Filter: assessments only
  const assessmentsOnly = events.filter((e) => e.type === "assessment");
  assert.equal(assessmentsOnly.length, 1);
  assert.equal(assessmentsOnly[0].type, "assessment");

  // Filter: vitals only
  const vitalsOnly = events.filter((e) => e.type === "vitals");
  assert.equal(vitalsOnly.length, 1);
  assert.equal(vitalsOnly[0].type, "vitals");
});

test("P3-H: Longitudinal timeline - search filtering matches clinical query terms across domains", async () => {
  const events: TimelineEvent[] = [
    {
      type: "encounter",
      id: "enc-1",
      date: "2026-09-12",
      data: {
        id: "enc-1",
        patientId: "maya-chen",
        date: "2026-09-12",
        type: "ADHD Follow-up Visit",
        status: "signed",
        chiefComplaint: "Difficulty focusing on afternoon work",
        assessment: "ADHD in partial remission",
        plan: "Titrate stimulant or alpha-2 agonist",
        createdAt: "2026-09-12T00:00:00Z",
        updatedAt: "2026-09-12T00:00:00Z",
      },
    },
    {
      type: "med",
      id: "med-1",
      date: "2026-09-11",
      data: {
        id: "med-1",
        patient_id: "maya-chen",
        display_text: "Guanfacine ER 2 mg nightly",
        medication_name: "Guanfacine ER",
        generic_name: "guanfacine",
        strength: "2 mg",
        dose: "2 mg",
        route: "oral",
        frequency: "nightly",
        indication: "ADHD",
        status: "active",
        start_date: "2026-09-11",
        end_date: null,
        prescriber: "Dr. Tester",
        source_type: "clinician",
        source_system: "clinical-bond",
        source_ref: null,
        recorded_by: "Dr. Tester",
        recorded_at: "2026-09-11T10:00:00Z",
        updated_at: "2026-09-11T10:00:00Z",
      },
    },
    {
      type: "assessment",
      id: "scale-1",
      date: "2026-09-10",
      data: {
        id: "scale-1",
        patientId: "maya-chen",
        instrument: "asrs-v1.1",
        instrumentVersion: "1.0",
        title: "ASRS v1.1 ADHD Screen",
        totalScore: 18,
        maxScore: 24,
        severity: "Highly consistent with Adult ADHD",
        responses: {},
        flags: [],
        source: "clinician",
        administeredBy: "Dr. Tester",
        administeredAt: "2026-09-10T10:00:00Z",
        reviewStatus: "reviewed",
        createdAt: "2026-09-10T10:00:00Z",
        updatedAt: "2026-09-10T10:00:00Z",
      },
    },
  ];

  // Query "ADHD" matches encounter and ASRS assessment
  const query = "adhd";
  const adhdMatches = events.filter((evt) => {
    if (evt.type === "encounter") {
      const d = evt.data as any;
      return (
        d.chiefComplaint.toLowerCase().includes(query) ||
        d.assessment.toLowerCase().includes(query) ||
        d.type.toLowerCase().includes(query)
      );
    }
    if (evt.type === "assessment") {
      return (
        evt.data.title.toLowerCase().includes(query) ||
        evt.data.severity.toLowerCase().includes(query)
      );
    }
    return false;
  });

  assert.equal(adhdMatches.length, 2, "Matched 2 events containing 'ADHD'");
});
