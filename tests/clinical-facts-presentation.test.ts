import test from "node:test";
import assert from "node:assert/strict";

import type { AllergyRecord, ProblemRecord } from "../app/domain/clinical-records";
import {
  mayAssertAbsence,
  presentClinicalFacts,
  type FactsLoad,
} from "../app/lib/clinical-facts-presentation";

function allergy(id: string, substance: string, patientId = "patient-a"): AllergyRecord {
  return {
    id,
    patient_id: patientId,
    substance,
    reaction: "Hives",
    severity: "moderate",
    status: "active",
    source_type: "clinician",
    source_system: "ehr",
    source_ref: null,
    recorded_by: "prototype-provider",
    recorded_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  };
}

function problem(id: string, displayText: string, patientId = "patient-a"): ProblemRecord {
  return {
    id,
    patient_id: patientId,
    code: null,
    coding_system: null,
    display_text: displayText,
    status: "active",
    onset_date: null,
    resolved_date: null,
    source_type: "clinician",
    source_system: "ehr",
    source_ref: null,
    recorded_by: "prototype-provider",
    recorded_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  };
}

test("an in-flight load never authorises an absence assertion", () => {
  const presentation = presentClinicalFacts({ status: "loading", patientId: "patient-a" }, "patient-a");

  assert.equal(presentation.kind, "pending");
  assert.equal(mayAssertAbsence(presentation), false);
});

test("a failed load is surfaced as unverified rather than as no known allergies", () => {
  const presentation = presentClinicalFacts(
    { status: "failed", patientId: "patient-a", message: "Network unavailable." },
    "patient-a",
  );

  assert.equal(presentation.kind, "unverified");
  assert.equal(mayAssertAbsence(presentation), false);
  assert.equal(
    presentation.kind === "unverified" ? presentation.message : null,
    "Network unavailable.",
  );
});

test("a loaded empty snapshot is the only state that may assert absence", () => {
  const presentation = presentClinicalFacts(
    { status: "loaded", patientId: "patient-a", problems: [], allergies: [] },
    "patient-a",
  );

  assert.equal(presentation.kind, "facts");
  assert.equal(mayAssertAbsence(presentation), true);
});

test("another patient's loaded facts are never attributed to the active patient", () => {
  // The wrong-patient case: patient A's allergies are resolved while the
  // clinician has already activated patient B.
  const loadedForA: FactsLoad = {
    status: "loaded",
    patientId: "patient-a",
    problems: [problem("prob-1", "Generalized anxiety disorder")],
    allergies: [allergy("alg-1", "Sulfa drugs")],
  };

  const presentation = presentClinicalFacts(loadedForA, "patient-b");

  assert.equal(presentation.kind, "pending");
  assert.equal(mayAssertAbsence(presentation), false);
});

test("a stale failure for a previous patient does not mark the active patient unverified", () => {
  const failedForA: FactsLoad = {
    status: "failed",
    patientId: "patient-a",
    message: "Network unavailable.",
  };

  assert.equal(presentClinicalFacts(failedForA, "patient-b").kind, "pending");
});

test("facts are released only for the patient they were loaded for", () => {
  const loaded: FactsLoad = {
    status: "loaded",
    patientId: "patient-a",
    problems: [problem("prob-1", "Generalized anxiety disorder")],
    allergies: [allergy("alg-1", "Sulfa drugs")],
  };

  const own = presentClinicalFacts(loaded, "patient-a");
  assert.equal(own.kind, "facts");
  assert.deepEqual(
    own.kind === "facts" ? own.allergies.map((entry) => entry.substance) : [],
    ["Sulfa drugs"],
  );
});
