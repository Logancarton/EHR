import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Action-derived references (docs/NOTE_REFERENCES.md, phase 2a).
 *
 * The strongest evidence class, and the one that needs no model: an order the
 * clinician staged against this encounter, converted into medication truth, is a
 * structural fact. These tests hold the boundaries around it — an order is not a
 * medication until truth is confirmed, a reference never points at a record that
 * is not there, and derivation passes never clear each other's work.
 */

const ACTOR = { userId: "user-derived-clinician", displayName: "Derived Clinician" };

let getDatabase: any;
let OrderRepository: any;
let ClinicalRecordRepository: any;
let NoteReferenceRepository: any;
let ActionDerivedReferenceService: any;

before(async () => {
  const env = process.env as unknown as Record<string, string | undefined>;
  process.chdir(mkdtempSync(join(tmpdir(), "ehr-action-derived-")));
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-action-derived-secret-0123456789abcdef";

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

let counter = 0;
function newEncounter(): { id: string; patientId: string } {
  const db = getDatabase();
  const patient = db.prepare(`SELECT id FROM patients LIMIT 1`).get() as any;
  assert.ok(patient, "seeded synthetic data should include a patient");

  counter += 1;
  const id = `enc-derived-${Date.now()}-${counter}`;
  const at = new Date().toISOString();
  db.prepare(
    `INSERT INTO encounters (id, patient_id, date, type, status, created_at, updated_at)
     VALUES (?, ?, '2026-09-13', 'Psychiatric Follow-Up', 'draft', ?, ?)`,
  ).run(id, patient.id, at, at);
  return { id, patientId: patient.id };
}

function stageConfirmedPrescription(
  encounter: { id: string; patientId: string },
  displayText: string,
): { orderId: string; medicationRecordId: string } {
  const medication = ClinicalRecordRepository.addMedication(
    { patientId: encounter.patientId, displayText },
    ACTOR,
  );
  const order = OrderRepository.stageOrder({
    patientId: encounter.patientId,
    type: "medication",
    name: displayText,
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
  return { orderId: order.id, medicationRecordId: medication.id };
}

test("a prescription confirmed into medication truth becomes an action-derived reference", () => {
  const encounter = newEncounter();
  const { medicationRecordId } = stageConfirmedPrescription(encounter, "Sertraline 100 mg daily");

  const derived = ActionDerivedReferenceService.deriveForEncounter(encounter.id, ACTOR);
  assert.equal(derived.length, 1);
  assert.equal(derived[0].entityType, "medication");
  assert.equal(derived[0].entityId, medicationRecordId);
  assert.equal(derived[0].source, "action-derived");
  assert.equal(
    derived[0].status,
    "confirmed",
    "the clinician already performed the act; this is not a model's proposal",
  );
});

test("prescription intent alone is not a medication reference", () => {
  const encounter = newEncounter();
  OrderRepository.stageOrder({
    patientId: encounter.patientId,
    type: "medication",
    name: "Bupropion XL 150 mg daily",
    details: {},
    orderedBy: ACTOR.displayName,
    encounterId: encounter.id,
  });

  assert.deepEqual(
    ActionDerivedReferenceService.deriveForEncounter(encounter.id, ACTOR),
    [],
    "an order is intent; until truth is confirmed there is no medication record to point at",
  );
});

test("a reference is never written to a record that is not there", () => {
  const encounter = newEncounter();
  const order = OrderRepository.stageOrder({
    patientId: encounter.patientId,
    type: "medication",
    name: "Phantom 10 mg",
    details: {},
    orderedBy: ACTOR.displayName,
    encounterId: encounter.id,
  });
  OrderRepository.recordMedicationTruthConfirmation(order.id, {
    operation: "add",
    medicationRecordId: "med-does-not-exist",
    confirmedBy: ACTOR.displayName,
    confirmedAt: new Date().toISOString(),
    advisoryImpact: "synthetic",
  });

  assert.deepEqual(
    ActionDerivedReferenceService.deriveForEncounter(encounter.id, ACTOR),
    [],
    "a dangling reference would read downstream as a documented medication no chart can produce",
  );
});

test("withdrawing the order withdraws its derived reference", () => {
  const encounter = newEncounter();
  const { orderId } = stageConfirmedPrescription(encounter, "Guanfacine ER 2 mg nightly");
  assert.equal(ActionDerivedReferenceService.deriveForEncounter(encounter.id, ACTOR).length, 1);

  OrderRepository.removeStaged(orderId);

  assert.deepEqual(
    ActionDerivedReferenceService.deriveForEncounter(encounter.id, ACTOR),
    [],
    "derivation owns its own rows and must be able to retire one",
  );
});

test("an order without an encounter does not reach another encounter's references", () => {
  const encounter = newEncounter();
  const medication = ClinicalRecordRepository.addMedication(
    { patientId: encounter.patientId, displayText: "Lithium 600 mg nightly" },
    ACTOR,
  );
  const order = OrderRepository.stageOrder({
    patientId: encounter.patientId,
    type: "medication",
    name: "Lithium 600 mg nightly",
    details: {},
    orderedBy: ACTOR.displayName,
  });
  OrderRepository.recordMedicationTruthConfirmation(order.id, {
    operation: "add",
    medicationRecordId: medication.id,
    confirmedBy: ACTOR.displayName,
    confirmedAt: new Date().toISOString(),
    advisoryImpact: "synthetic",
  });

  assert.deepEqual(
    ActionDerivedReferenceService.deriveForEncounter(encounter.id, ACTOR),
    [],
    "an unassociated order stays unassociated rather than being attached by proximity",
  );
});

test("derivation and extraction write into the same section without clearing each other", () => {
  const encounter = newEncounter();
  const { medicationRecordId } = stageConfirmedPrescription(encounter, "Aripiprazole 5 mg daily");
  ActionDerivedReferenceService.deriveForEncounter(encounter.id, ACTOR);

  // An extraction pass over the same section proposes something else entirely.
  NoteReferenceRepository.replaceSection(
    encounter.id,
    encounter.patientId,
    "plan",
    [{ section: "plan", entityType: "problem", entityId: "prb-extracted", source: "ai-extracted" }],
    ACTOR,
    "ai-extracted",
  );

  const afterExtraction = new Map<string, any>(
    NoteReferenceRepository.listForEncounter(encounter.id).map((reference: any) => [
      reference.entityId,
      reference,
    ]),
  );
  assert.ok(
    afterExtraction.has(medicationRecordId),
    "an extraction pass must not delete what the clinician's own order produced",
  );
  assert.ok(afterExtraction.has("prb-extracted"));

  // And the derivation pass running again must not delete the proposal.
  ActionDerivedReferenceService.deriveForEncounter(encounter.id, ACTOR);
  const afterDerivation = new Set(
    NoteReferenceRepository.listForEncounter(encounter.id).map((reference: any) => reference.entityId),
  );
  assert.ok(afterDerivation.has("prb-extracted"), "derivation must not delete an extraction proposal");
  assert.ok(afterDerivation.has(medicationRecordId));
});
