import test from "node:test";
import assert from "node:assert/strict";

import type { MedicationRecord, MedicationStatus } from "../app/domain/clinical-records";
import {
  reviewMedicationPrescriptionIntent,
  type MedicationPrescriptionIntent,
} from "../app/domain/medication-prescription-intent";

const patientId = "synthetic-rx-duplicate-patient";

/**
 * Shape of a chart entry backfilled from the legacy `meds_json` list: the whole
 * display string is the medication name and nothing else is structured. This is
 * how Maya Chen's "Sertraline 100 mg daily" is stored.
 */
function legacyRecord(display: string, status: MedicationStatus = "active", id = `legacy-${display}`): MedicationRecord {
  return {
    id,
    patient_id: patientId,
    display_text: display,
    medication_name: display,
    generic_name: null,
    strength: null,
    dose: null,
    route: null,
    frequency: null,
    indication: null,
    status,
    start_date: null,
    end_date: status === "active" ? null : "2026-05-01",
    prescriber: null,
    source_type: "legacy-json",
    source_system: "ehr-local",
    source_ref: null,
    recorded_by: "system-migration",
    recorded_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

/** The intent the order composer stages for Sertraline 100 mg. */
function sertralineIntent(strength = "100 mg"): MedicationPrescriptionIntent {
  return {
    patientId,
    medicationName: "Sertraline",
    genericName: "sertraline hydrochloride",
    strength,
    dose: strength,
    form: "Tablet",
    route: "Oral",
    frequency: "Once daily in morning",
    quantity: 30,
    daysSupply: 30,
    refills: 3,
    sig: `Take 1 tablet (${strength}) by mouth once daily in the morning with food.`,
    source: "clinician",
    lifecycle: "staged",
  };
}

test("an identical active medication is surfaced as a possible duplicate or continuation, never as new", () => {
  const active = legacyRecord("Sertraline 100 mg daily");
  const review = reviewMedicationPrescriptionIntent({
    intent: sertralineIntent(),
    medications: [active, legacyRecord("Guanfacine ER 2 mg nightly")],
  });

  assert.notEqual(review.truthImpact.kind, "likely-new-medication");
  assert.equal(review.truthImpact.kind, "no-change", "same drug and strength reads as continuation, not a chart change");
  assert.equal(review.truthImpact.medicationId, active.id);
  assert.equal(review.truthImpact.medicationDisplay, "Sertraline 100 mg daily");
  assert.match(review.truthImpact.summary, /possible duplicate or continuation/i);
  assert.equal(review.truthImpact.confidence, "possible", "a match against unstructured chart text never claims certainty");
  assert.equal(review.canAuthorize, true, "the advisory does not itself block; the clinician decides");
});

test("a structured identical active medication also reads as a possible duplicate", () => {
  const structured: MedicationRecord = {
    ...legacyRecord("Sertraline 100 mg once daily"),
    id: "structured-sertraline",
    medication_name: "Sertraline",
    generic_name: "sertraline hydrochloride",
    strength: "100 mg",
    dose: "100 mg",
    route: "Oral",
    frequency: "Once daily in morning",
    source_type: "clinician",
  };
  const review = reviewMedicationPrescriptionIntent({ intent: sertralineIntent(), medications: [structured] });
  assert.equal(review.truthImpact.kind, "no-change");
  assert.equal(review.truthImpact.medicationId, structured.id);
  assert.equal(review.truthImpact.confidence, "likely");
  assert.match(review.truthImpact.summary, /possible duplicate or continuation/i);
});

test("the same drug at a different dose reads as a likely dose change against the existing entry", () => {
  const active = legacyRecord("Sertraline 100 mg daily");
  const review = reviewMedicationPrescriptionIntent({ intent: sertralineIntent("50 mg"), medications: [active] });

  assert.equal(review.truthImpact.kind, "likely-dose-change");
  assert.equal(review.truthImpact.medicationId, active.id);
  const strength = review.truthImpact.deltas.find((delta) => delta.kind === "strength-difference");
  assert.ok(strength, "the strength stated in the chart text is compared");
  assert.equal(strength.candidateValue, "50 mg");
  assert.equal(strength.authoritativeValue, "100 mg");
});

test("a different drug is not matched to an unrelated active medication", () => {
  const review = reviewMedicationPrescriptionIntent({
    intent: { ...sertralineIntent(), medicationName: "Escitalopram", genericName: "escitalopram oxalate", strength: "10 mg", dose: "10 mg" },
    medications: [legacyRecord("Sertraline 100 mg daily"), legacyRecord("Guanfacine ER 2 mg nightly")],
  });
  assert.equal(review.truthImpact.kind, "likely-new-medication");
  assert.equal(review.truthImpact.medicationId, null);
});

test("a name that merely starts with the same letters is not a match", () => {
  const review = reviewMedicationPrescriptionIntent({
    intent: { ...sertralineIntent(), medicationName: "Lithium", genericName: undefined },
    medications: [legacyRecord("Lithiumx 300 mg daily")],
  });
  assert.equal(review.truthImpact.kind, "likely-new-medication");
});

test("a discontinued matching medication is historical context, not a continuation or mutation target", () => {
  const stopped = legacyRecord("Sertraline 100 mg daily", "discontinued");
  const review = reviewMedicationPrescriptionIntent({ intent: sertralineIntent(), medications: [stopped] });

  assert.equal(review.truthImpact.kind, "unclear");
  assert.equal(review.truthImpact.medicationId, null, "a historical entry is never selected for update");
  assert.match(review.truthImpact.summary, /historical discontinued/i);
  assert.deepEqual(review.truthImpact.alternatives, [{ medicationId: stopped.id, displayText: stopped.display_text }]);
});

test("two active entries for the same drug are offered as alternatives, never auto-selected", () => {
  const review = reviewMedicationPrescriptionIntent({
    intent: sertralineIntent(),
    medications: [
      legacyRecord("Sertraline 100 mg daily", "active", "a"),
      legacyRecord("Sertraline 50 mg nightly", "active", "b"),
    ],
  });
  assert.equal(review.truthImpact.kind, "unclear");
  assert.equal(review.truthImpact.medicationId, null);
  assert.equal(review.truthImpact.alternatives.length, 2);
});


test("legacy display matching cannot override a structured medication identity", () => {
  const record = { ...legacyRecord("Sertraline 100 mg daily"), medication_name: "Escitalopram", generic_name: "escitalopram oxalate" };
  const review = reviewMedicationPrescriptionIntent({ intent: sertralineIntent(), medications: [record] });
  assert.equal(review.truthImpact.kind, "likely-new-medication");
  assert.equal(review.truthImpact.medicationId, null);
});

test("legacy liquid strengths compare the denominator rather than only the numerator", () => {
  const intent = { ...sertralineIntent("20 mg/mL"), dose: undefined };
  const review = reviewMedicationPrescriptionIntent({ intent, medications: [legacyRecord("Sertraline 20 mg/5 mL daily")] });
  const delta = review.truthImpact.deltas.find((entry) => entry.kind === "strength-difference");
  assert.ok(delta);
  assert.equal(delta.authoritativeValue, "20 mg/5 mL");
});
