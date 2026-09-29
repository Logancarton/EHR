import test from "node:test";
import assert from "node:assert/strict";

import type { AllergyRecord, MedicationRecord } from "../app/domain/clinical-records";
import type { PsychiatricHistoryItem } from "../app/domain/clinical-measurements";
import { summarizePrescribingContext } from "../app/lib/prescribing-medication-context";

const stamp = "2026-09-01T00:00:00.000Z";
const source = { source_type: "clinician", source_system: "ehr", source_ref: null, recorded_by: "prototype-provider", recorded_at: stamp, updated_at: stamp };

function allergy(id: string, patch: Partial<AllergyRecord> = {}): AllergyRecord {
  return { id, patient_id: "p-a", substance: "Penicillin", reaction: "Hives", severity: "moderate", status: "active", ...source, ...patch };
}

function medication(id: string, patch: Partial<MedicationRecord> = {}): MedicationRecord {
  return {
    id, patient_id: "p-a", display_text: `Med ${id}`, medication_name: `Med ${id}`, generic_name: null,
    strength: "10 mg", dose: null, route: "oral", frequency: "daily", indication: null, status: "active",
    start_date: "2025-01-01", end_date: null, prescriber: null, ...source, ...patch,
  };
}

function trial(id: string, patch: Partial<PsychiatricHistoryItem> = {}): PsychiatricHistoryItem {
  return {
    id, patientId: "p-a", category: "medication_trial", title: `Trial ${id}`,
    details: { drug: "Sertraline", maxDose: "150 mg", outcome: "Partial response", reasonForDiscontinuation: "GI upset" },
    status: "historical", onsetDate: "2022-01-01", resolvedDate: "2022-06-01",
    sourceSystem: "ehr", recordedBy: "prototype-provider", recordedAt: stamp, updatedAt: stamp, ...patch,
  };
}

test("prescribing context separates active medications from past trials across both sources", () => {
  const context = summarizePrescribingContext({
    allergies: [allergy("a1"), allergy("a2", { status: "inactive" }), allergy("a3", { status: "entered-in-error" })],
    medications: [
      medication("active"),
      medication("stopped", { status: "discontinued", end_date: "2024-03-01" }),
      medication("error", { status: "entered-in-error" }),
    ],
    psychiatricHistory: [
      trial("t1"),
      trial("hosp", { category: "hospitalization" }),
      trial("err", { status: "entered-in-error" }),
    ],
  }, "p-a");

  assert.deepEqual(context.allergies.map((a) => a.id), ["a1"]);
  assert.equal(context.nkdaAssessed, false);
  assert.deepEqual(context.activeMedications.map((m) => m.id), ["active"]);
  // Newest first; each trial keeps the source it came from.
  assert.deepEqual(context.pastTrials.map((t) => [t.id, t.source]), [
    ["medication:stopped", "medication-record"],
    ["history:t1", "psychiatric-history"],
  ]);
  assert.match(context.pastTrials[1].detail, /stopped: GI upset/);
  assert.equal(context.pastTrials[1].title, "Sertraline");
});

test("an explicit NKDA assessment is distinguished from an empty allergy list", () => {
  const assessed = summarizePrescribingContext(
    { allergies: [allergy("nkda", { is_nkda: true, substance: "No Known Drug Allergies (NKDA)" })], medications: [] },
    "p-a",
  );
  assert.equal(assessed.nkdaAssessed, true);
  assert.equal(assessed.allergies.length, 0);

  const empty = summarizePrescribingContext({ allergies: [], medications: [] }, "p-a");
  assert.equal(empty.nkdaAssessed, false);
  assert.deepEqual(empty.pastTrials, []);
});

test("records bound to another patient are never shown", () => {
  const context = summarizePrescribingContext({
    allergies: [allergy("other", { patient_id: "p-b" })],
    medications: [medication("other", { patient_id: "p-b" })],
    psychiatricHistory: [trial("other", { patientId: "p-b" })],
  }, "p-a");
  assert.equal(context.allergies.length, 0);
  assert.equal(context.activeMedications.length, 0);
  assert.equal(context.pastTrials.length, 0);
});
