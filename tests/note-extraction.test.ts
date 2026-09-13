import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Extraction (docs/NOTE_REFERENCES.md, phase 2b).
 *
 * Extraction is a selection over a supplied set. These tests hold the boundary
 * that makes it safe to run automatically: the extractor may only point at records
 * this patient already has, anything else it returns is discarded and recorded,
 * and nothing it produces counts until a clinician confirms it.
 */

const ACTOR = { userId: "user-extraction-clinician", displayName: "Extraction Clinician" };

let getDatabase: any;
let ClinicalRecordRepository: any;
let NoteReferenceRepository: any;
let NoteExtractionService: any;
let validateExtractionOutput: any;

before(async () => {
  const env = process.env as unknown as Record<string, string | undefined>;
  process.chdir(mkdtempSync(join(tmpdir(), "ehr-note-extraction-")));
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-note-extraction-secret-0123456789abcdef";

  [
    { getDatabase },
    { ClinicalRecordRepository },
    { NoteReferenceRepository },
    { NoteExtractionService },
    { validateExtractionOutput },
  ] = await Promise.all([
    import("../app/server/db/connection"),
    import("../app/server/repositories/clinical-record-repository"),
    import("../app/server/repositories/note-reference-repository"),
    import("../app/server/services/note-extraction-service"),
    import("../app/domain/note-reference-extraction"),
  ]);
});

let counter = 0;
function newEncounter(status: "draft" | "signed" = "draft"): { id: string; patientId: string } {
  const db = getDatabase();
  const patient = db.prepare(`SELECT id FROM patients LIMIT 1`).get() as any;
  counter += 1;
  const id = `enc-extract-${Date.now()}-${counter}`;
  const at = new Date().toISOString();
  db.prepare(
    `INSERT INTO encounters (id, patient_id, date, type, status, created_at, updated_at)
     VALUES (?, ?, '2026-09-13', 'Psychiatric Follow-Up', ?, ?, ?)`,
  ).run(id, patient.id, status, at, at);
  return { id, patientId: patient.id };
}

/** An extractor that answers whatever the test tells it to, and counts its calls. */
function scriptedExtractor(response: unknown) {
  return {
    provider: "test",
    model: "scripted-v1",
    calls: 0,
    async extract() {
      this.calls += 1;
      return response;
    },
  };
}

test("a section naming a medication proposes a reference to that record", async () => {
  const encounter = newEncounter();
  const medication = ClinicalRecordRepository.addMedication(
    { patientId: encounter.patientId, displayText: "Sertraline 100 mg daily", genericName: "sertraline" },
    ACTOR,
  );

  const references = await NoteExtractionService.extractSection(
    encounter.id,
    "plan",
    "Holding sertraline at its current dose and reviewing again in four weeks.",
    ACTOR,
  );

  const match = references.find((reference: any) => reference.entityId === medication.id);
  assert.ok(match, "the leading drug name identifies the record even without the dose");
  assert.equal(match.source, "ai-extracted");
  assert.equal(match.status, "proposed", "extraction proposes; it never decides");
  assert.equal(match.modelId, "deterministic-v1");
  assert.ok(match.confidence > 0 && match.confidence <= 1);
});

test("a record the extractor was never offered is discarded, not written", async () => {
  const encounter = newEncounter();
  const rogue = scriptedExtractor({
    selections: [
      { entityId: "prb-invented-by-the-model", spanStart: 0, spanEnd: 4, confidence: 0.99 },
    ],
  });

  const references = await NoteExtractionService.extractSection(
    encounter.id,
    "assessment",
    "Some assessment text.",
    ACTOR,
    rogue,
  );

  assert.deepEqual(references, [], "an identifier the model made up must never become a reference");
  const recorded = getDatabase()
    .prepare(
      `SELECT COUNT(*) AS n FROM provenance_events
       WHERE activity = 'note-extraction-rejected' AND entity_id = ?`,
    )
    .get(encounter.id) as any;
  assert.ok(Number(recorded.n) > 0, "the rejection is recorded rather than silently dropped");
});

test("a structurally invalid response is rejected outright", async () => {
  const encounter = newEncounter();
  await assert.rejects(
    () =>
      NoteExtractionService.extractSection(
        encounter.id,
        "plan",
        "Any text.",
        ACTOR,
        scriptedExtractor({ somethingElse: true }),
      ),
    /invalid response shape/,
    "a response that is not the agreed shape cannot be partially trusted",
  );
});

test("unchanged text is never re-extracted", async () => {
  const encounter = newEncounter();
  const extractor = scriptedExtractor({ selections: [] });
  const sectionText = "Stable, no changes this visit.";

  await NoteExtractionService.extractSection(encounter.id, "plan", sectionText, ACTOR, extractor);
  await NoteExtractionService.extractSection(encounter.id, "plan", sectionText, ACTOR, extractor);
  assert.equal(extractor.calls, 1, "the steady state must cost nothing");

  await NoteExtractionService.extractSection(encounter.id, "plan", `${sectionText} Added a sentence.`, ACTOR, extractor);
  assert.equal(extractor.calls, 2, "edited text is read again");
});

test("a confirmed reference survives a later extraction pass", async () => {
  const encounter = newEncounter();
  const medication = ClinicalRecordRepository.addMedication(
    { patientId: encounter.patientId, displayText: "Lamotrigine 200 mg daily" },
    ACTOR,
  );

  const first = await NoteExtractionService.extractSection(
    encounter.id,
    "plan",
    "Lamotrigine unchanged.",
    ACTOR,
  );
  const proposed = first.find((reference: any) => reference.entityId === medication.id);
  assert.ok(proposed);
  NoteReferenceRepository.confirm([proposed.id], ACTOR);

  // The clinician rewrites the sentence and the drug is no longer named.
  await NoteExtractionService.extractSection(encounter.id, "plan", "No medication changes.", ACTOR);

  const after = NoteReferenceRepository.listForEncounter(encounter.id).find(
    (reference: any) => reference.entityId === medication.id,
  );
  assert.equal(after?.status, "confirmed", "a pass may retire its own proposals, never a decision");
});

test("a signed note is not extracted from", async () => {
  const encounter = newEncounter("signed");
  const extractor = scriptedExtractor({ selections: [] });

  const references = await NoteExtractionService.extractSection(
    encounter.id,
    "plan",
    "Anything at all.",
    ACTOR,
    extractor,
  );

  assert.equal(extractor.calls, 0, "a signed note is settled; its references were confirmed at signing");
  assert.deepEqual(references, []);
});

test("validation discards bad spans and confidences without losing good selections", () => {
  const request = {
    section: "plan",
    text: "0123456789",
    candidates: [
      { entityType: "problem", entityId: "prb-a", display: "A" },
      { entityType: "problem", entityId: "prb-b", display: "B" },
      { entityType: "problem", entityId: "prb-c", display: "C" },
    ],
  };

  const result = validateExtractionOutput(
    {
      selections: [
        { entityId: "prb-a", spanStart: 0, spanEnd: 4, confidence: 0.8 },
        { entityId: "prb-b", spanStart: 9, spanEnd: 4, confidence: 0.8 },
        { entityId: "prb-c", spanStart: null, spanEnd: null, confidence: 7 },
      ],
    },
    request,
  );

  assert.equal(result.selections.length, 2);
  assert.deepEqual(result.selections[0], { entityId: "prb-a", spanStart: 0, spanEnd: 4, confidence: 0.8 });
  assert.equal(
    result.selections[1].spanStart,
    null,
    "a nonsensical span is dropped but the reference it decorated survives",
  );
  assert.ok(result.discarded.some((entry: any) => entry.reason === "invalid-confidence"));
  assert.ok(result.discarded.some((entry: any) => entry.reason === "invalid-span"));
});
