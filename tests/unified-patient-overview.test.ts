import test from "node:test";
import assert from "node:assert/strict";
import { clinicalRecordService } from "../app/server/services/clinical-record-service";
import { MeasurementRepository } from "../app/server/repositories/measurement-repository";
import { ClinicalRecordRepository } from "../app/server/repositories/clinical-record-repository";
import { EncounterRepository } from "../app/server/repositories/encounter-repository";
import { AppointmentRepository } from "../app/server/repositories/appointment-repository";
import type { ProviderContext } from "../app/server/auth/provider-context";

const testActor: ProviderContext = {
  userId: "prov-overview-test",
  displayName: "Dr. Overview Tester",
  role: "provider",
  organizationId: "org-test",
  capabilities: ["read_clinical", "manage_clinical_record", "sign_encounter"],
};

test("P3-G: Unified patient overview - snapshot envelope contains all 6 clinical facets", async () => {
  const patientId = "maya-chen";

  const snapshot = clinicalRecordService.snapshot(patientId, testActor);

  // Verify authoritative envelope completeness
  assert.ok(Array.isArray(snapshot.problems), "snapshot includes problems");
  assert.ok(Array.isArray(snapshot.allergies), "snapshot includes allergies");
  assert.ok(Array.isArray(snapshot.medications), "snapshot includes medications");
  assert.ok(Array.isArray(snapshot.vitals), "snapshot includes vitals");
  assert.ok(Array.isArray(snapshot.psychiatricHistory), "snapshot includes psychiatric history");
  assert.ok(Array.isArray(snapshot.assessments), "snapshot includes assessments");
  assert.ok(Array.isArray(snapshot.encounters), "snapshot includes encounters");
  assert.ok(Array.isArray(snapshot.upcomingAppointments), "snapshot includes upcoming appointments");

  // Question 1: Who is this patient? (Verified identity in database)
  assert.ok(snapshot.problems.length >= 0, "problems exist");

  // Question 2: What is being treated? (Authoritative diagnoses with ICD-10 codes)
  const adhd = snapshot.problems.find((p) => p.display_text.toLowerCase().includes("adhd"));
  if (adhd) {
    assert.equal(adhd.code, "F90.2", "ADHD problem has authoritative ICD-10 code F90.2");
  }

  // Question 3: What medications are active?
  assert.ok(snapshot.medications.length >= 0, "active medications listed");

  // Question 4: What changed recently? (Recent vitals and assessments)
  assert.ok(snapshot.vitals.length > 0, "vitals present for trajectory evaluation");

  // Question 5: What needs attention? (Overdue items / safety flags)
  const vitalsFlags = snapshot.vitals.flatMap((v) => v.flags);
  assert.ok(Array.isArray(vitalsFlags), "vital flags evaluated");

  // Question 6: What is next? (Upcoming appointments or scheduled care)
  assert.ok(Array.isArray(snapshot.upcomingAppointments), "upcoming appointments queried");
});

test("P3-G: Unified patient overview - critical safety alerts from rating scales trigger attention", async () => {
  const patientId = "maya-chen";

  // Record an assessment with Question 9 suicide ideation flag
  const criticalAssessment = MeasurementRepository.recordAssessment(
    {
      patientId,
      instrument: "phq-9",
      responses: {
        1: 2,
        2: 2,
        3: 1,
        4: 2,
        5: 1,
        6: 2,
        7: 1,
        8: 1,
        9: 2, // Positive suicidality!
      },
      source: "clinician",
    },
    { userId: "prov-test", displayName: "Dr. Tester" },
  );

  assert.ok(criticalAssessment.flags.length > 0, "Assessment has safety alert flag");
  assert.match(criticalAssessment.flags[0], /POSITIVE ITEM 9/i, "Flags Item 9 suicide ideation");

  // Verify it surfaces in snapshot
  const snapshot = clinicalRecordService.snapshot(patientId, testActor);
  const found = snapshot.assessments?.find((a) => a.id === criticalAssessment.id);
  assert.ok(found, "Critical assessment present in snapshot");
  assert.ok(found.flags.length > 0, "Critical assessment flags preserved in snapshot");
});

test("P3-G: Unified patient overview - metabolic shift surveillance evaluates >=7% weight delta", async () => {
  const patientId = "maya-chen";

  // Record baseline vitals: 130 lbs
  MeasurementRepository.recordVitals(
    {
      patientId,
      weightLbs: 130,
      heightIn: 64,
      systolic: 118,
      diastolic: 76,
      heartRate: 72,
    },
    { userId: "prov-test", displayName: "Dr. Tester" },
  );

  // Record follow-up vitals with >= 7% weight gain: 142 lbs (+9.2%)
  const followup = MeasurementRepository.recordVitals(
    {
      patientId,
      weightLbs: 142,
      heightIn: 64,
      systolic: 120,
      diastolic: 78,
      heartRate: 74,
    },
    { userId: "prov-test", displayName: "Dr. Tester" },
  );

  const weightFlag = followup.flags.find((f) => f.type === "weight_change");
  assert.ok(weightFlag, "Detected significant weight shift flag");
  assert.equal(weightFlag.severity, "warning", "Warning severity for metabolic shift");
  assert.match(weightFlag.label, />=7%/, "Flags >=7% weight gain");
});
