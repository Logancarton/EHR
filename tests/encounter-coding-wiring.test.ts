import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  calculateEncounterCoding,
  createInitialEncounter,
  defaultMse,
  type CodingReference,
  type EncounterState,
} from "../app/lib/encounter-engine";

/**
 * The whole chain, end to end (docs/NOTE_REFERENCES.md, phase 4 wiring).
 *
 * An order staged against this encounter, converted into medication truth, derived
 * into a reference, read back, and handed to the coding engine — which reports
 * prescription drug management as coming from a named record rather than from
 * having found the letters "mg" in the note.
 */

const ACTOR = { userId: "user-wiring-clinician", displayName: "Wiring Clinician" };

let getDatabase: any;
let OrderRepository: any;
let ClinicalRecordRepository: any;
let NoteReferenceRepository: any;
let ActionDerivedReferenceService: any;

before(async () => {
  const env = process.env as unknown as Record<string, string | undefined>;
  process.chdir(mkdtempSync(join(tmpdir(), "ehr-coding-wiring-")));
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-coding-wiring-secret-0123456789abcdef";

  [
    { getDatabase },
    { OrderRepository },
    { ClinicalRecordRepository },
    { NoteReferenceRepository },
    { ActionDerivedReferenceService },
  ] = await Promise.all([
    import("../app/server/db/connection"),
    import("../app/server/repositories/order-repository"),
    import("../app/server/repositories/clinical-record-repository"),
    import("../app/server/repositories/note-reference-repository"),
    import("../app/server/services/action-derived-reference-service"),
  ]);
});

function noteDraft(encounterId: string): EncounterState {
  return {
    ...createInitialEncounter("synthetic-patient"),
    encounterId,
    intervalHistory: "Doing well since the last visit; sleeping and working normally.",
    // Nothing here may contain a fallback trigger word — note that "continues"
    // would match the heuristic's "continue", which is the false positive this
    // whole layer replaces.
    treatmentResponse: "Symptom burden keeps falling week over week.",
    sideEffects: "None reported.",
    mse: { ...defaultMse },
    // Deliberately says nothing a word search could latch onto.
    assessment: "Established conditions reviewed today.",
    plan: "Regimen adjusted as discussed; review at the next visit.",

    candidateActions: [],
  };
}

let counter = 0;
function newEncounter(): { id: string; patientId: string } {
  const db = getDatabase();
  const patient = db.prepare(`SELECT id FROM patients LIMIT 1`).get() as any;
  counter += 1;
  const id = `enc-wiring-${Date.now()}-${counter}`;
  const at = new Date().toISOString();
  db.prepare(
    `INSERT INTO encounters (id, patient_id, date, type, status, created_at, updated_at)
     VALUES (?, ?, '2026-09-13', 'Psychiatric Follow-Up', 'draft', ?, ?)`,
  ).run(id, patient.id, at, at);
  return { id, patientId: patient.id };
}

test("an order staged in this encounter reaches the coding engine as a named record", () => {
  const encounter = newEncounter();

  // Before anything is ordered, the note alone has nothing structured to say.
  const before = calculateEncounterCoding(noteDraft(encounter.id), 0, []);
  assert.equal(before.evidenceBasis, "inferred");
  assert.equal(before.goals.find((goal) => goal.id === "rx-management")?.met, false);

  // The clinician prescribes, and converts the prescription into medication truth.
  const medication = ClinicalRecordRepository.addMedication(
    { patientId: encounter.patientId, displayText: "Sertraline 100 mg daily" },
    ACTOR,
  );
  const order = OrderRepository.stageOrder({
    patientId: encounter.patientId,
    type: "medication",
    name: "Sertraline 100 mg daily",
    details: {},
    orderedBy: ACTOR.displayName,
    encounterId: encounter.id,
  });
  OrderRepository.recordMedicationTruthConfirmation(order.id, {
    operation: "add",
    medicationRecordId: medication.id,
    confirmedBy: ACTOR.displayName,
    confirmedAt: new Date().toISOString(),
    advisoryImpact: "synthetic",
  });
  ActionDerivedReferenceService.deriveForEncounter(encounter.id, ACTOR);

  // What the read path hands the engine.
  const references: CodingReference[] = NoteReferenceRepository.listForEncounter(encounter.id);
  const after = calculateEncounterCoding(noteDraft(encounter.id), 0, references);

  const rx = after.goals.find((goal) => goal.id === "rx-management");
  assert.equal(rx?.met, true, "the act establishes the element, not the wording of the note");
  assert.equal(rx?.evidence, "action-derived");
  assert.deepEqual(rx?.sourceRefs, [medication.id]);
  assert.equal(after.riskScore, "moderate");
  assert.notEqual(after.evidenceBasis, "inferred");
  assert.equal(after.unconfirmedReferenceCount, 0);
});

test("withdrawing the order takes the coding element with it", () => {
  const encounter = newEncounter();
  const medication = ClinicalRecordRepository.addMedication(
    { patientId: encounter.patientId, displayText: "Guanfacine ER 3 mg nightly" },
    ACTOR,
  );
  const order = OrderRepository.stageOrder({
    patientId: encounter.patientId,
    type: "medication",
    name: "Guanfacine ER 3 mg nightly",
    details: {},
    orderedBy: ACTOR.displayName,
    encounterId: encounter.id,
  });
  OrderRepository.recordMedicationTruthConfirmation(order.id, {
    operation: "add",
    medicationRecordId: medication.id,
    confirmedBy: ACTOR.displayName,
    confirmedAt: new Date().toISOString(),
    advisoryImpact: "synthetic",
  });
  ActionDerivedReferenceService.deriveForEncounter(encounter.id, ACTOR);
  assert.equal(
    calculateEncounterCoding(
      noteDraft(encounter.id),
      0,
      NoteReferenceRepository.listForEncounter(encounter.id),
    ).riskScore,
    "moderate",
  );

  OrderRepository.removeStaged(order.id);
  ActionDerivedReferenceService.deriveForEncounter(encounter.id, ACTOR);

  const after = calculateEncounterCoding(
    noteDraft(encounter.id),
    0,
    NoteReferenceRepository.listForEncounter(encounter.id),
  );
  assert.equal(after.riskScore, "low", "the code follows the record, in both directions");
});
