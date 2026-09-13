import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The clinical reference layer (docs/NOTE_REFERENCES.md, phase 1).
 *
 * A note references clinical records; it does not embed copies of them. These
 * tests hold the invariants that make that worth doing: a derivation pass may
 * never overturn a human decision, a signed note is never rewritten underneath
 * its attestation, and no clinical label is turned into a billing code by
 * anything other than the record that authorized it.
 *
 * The database connection is process-wide module state, so these share one
 * isolated database. Each test scopes itself by section and entity identity
 * rather than assuming an empty table.
 */

const ACTOR = { userId: "user-synthetic-clinician", displayName: "Synthetic Clinician" };

let getDatabase: any;
let NoteReferenceRepository: any;

before(async () => {
  const env = process.env as unknown as Record<string, string | undefined>;
  process.chdir(mkdtempSync(join(tmpdir(), "ehr-note-references-")));
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-note-reference-secret-0123456789abcdef";

  [{ getDatabase }, { NoteReferenceRepository }] = await Promise.all([
    import("../app/server/db/connection"),
    import("../app/server/repositories/note-reference-repository"),
  ]);
});

let sharedDraft: { id: string; patientId: string } | null = null;

/**
 * A draft encounter to hang references from, created rather than borrowed: seed
 * data is signed, and a signed note is immutable by database trigger.
 */
function draftEncounter(): { id: string; patientId: string } {
  if (sharedDraft) return sharedDraft;
  const db = getDatabase();
  const patient = db.prepare(`SELECT id FROM patients LIMIT 1`).get() as any;
  assert.ok(patient, "seeded synthetic data should include a patient");

  const id = `enc-note-reference-fixture-${Date.now()}`;
  const at = new Date().toISOString();
  db.prepare(
    `INSERT INTO encounters (id, patient_id, date, type, status, created_at, updated_at)
     VALUES (?, ?, '2026-09-13', 'Psychiatric Follow-Up', 'draft', ?, ?)`,
  ).run(id, patient.id, at, at);

  sharedDraft = { id, patientId: patient.id };
  return sharedDraft;
}

function inSection(encounterId: string, section: string) {
  return NoteReferenceRepository.listForEncounter(encounterId).filter(
    (reference: any) => reference.section === section,
  );
}

test("a reference is keyed by encounter, section and entity rather than by position", () => {
  const encounter = draftEncounter();
  const section = "test-key-stability";

  const first = NoteReferenceRepository.upsert(
    encounter.id,
    encounter.patientId,
    { section, entityType: "problem", entityId: "prb-key-1", spanStart: 10, spanEnd: 24 },
    ACTOR,
  );
  // The same entity referenced again in the same section is the same reference,
  // even though the prose moved underneath it.
  const second = NoteReferenceRepository.upsert(
    encounter.id,
    encounter.patientId,
    { section, entityType: "problem", entityId: "prb-key-1", spanStart: 88, spanEnd: 102 },
    ACTOR,
  );

  assert.equal(second.id, first.id, "a moved span must not create a second reference");
  assert.equal(second.spanStart, 88, "the presentation hint follows the prose");
  assert.equal(inSection(encounter.id, section).length, 1);
});

test("an extraction pass never overturns a clinician decision", () => {
  const encounter = draftEncounter();
  const section = "test-human-decision";

  const authored = NoteReferenceRepository.upsert(
    encounter.id,
    encounter.patientId,
    { section, entityType: "medication", entityId: "med-authored", source: "clinician-authored" },
    ACTOR,
  );
  assert.equal(authored.status, "confirmed", "an explicit link is already a decision");

  const proposed = NoteReferenceRepository.upsert(
    encounter.id,
    encounter.patientId,
    { section, entityType: "problem", entityId: "prb-declined", source: "ai-extracted" },
    ACTOR,
  );
  assert.equal(proposed.status, "proposed", "extraction proposes; it does not decide");
  NoteReferenceRepository.reject([proposed.id], ACTOR);

  // A later pass over the same section sees neither entity and would retire both.
  NoteReferenceRepository.replaceSection(
    encounter.id,
    encounter.patientId,
    section,
    [{ section, entityType: "problem", entityId: "prb-newly-seen", source: "ai-extracted" }],
    ACTOR,
  );

  const byEntity = new Map<string, any>(
    inSection(encounter.id, section).map((reference: any) => [reference.entityId, reference]),
  );

  assert.equal(
    byEntity.get("med-authored")?.status,
    "confirmed",
    "a clinician-authored reference survives re-extraction",
  );
  assert.equal(
    byEntity.get("prb-declined")?.status,
    "rejected",
    "a declined proposal is retained as declined, not deleted and not resurrected",
  );
  assert.ok(byEntity.has("prb-newly-seen"), "the pass may still add its own proposals");
});

test("a proposal does not outlive the text that produced it", () => {
  const encounter = draftEncounter();
  const section = "test-stale-proposal";

  NoteReferenceRepository.replaceSection(
    encounter.id,
    encounter.patientId,
    section,
    [{ section, entityType: "problem", entityId: "prb-was-mentioned", source: "ai-extracted" }],
    ACTOR,
  );
  assert.equal(inSection(encounter.id, section).length, 1);

  // The clinician deleted that sentence; the next pass no longer sees it.
  NoteReferenceRepository.replaceSection(encounter.id, encounter.patientId, section, [], ACTOR);
  assert.equal(inSection(encounter.id, section).length, 0);
});

test("references are queryable by entity, which is the timeline edge", () => {
  const encounter = draftEncounter();
  NoteReferenceRepository.upsert(
    encounter.id,
    encounter.patientId,
    { section: "test-timeline", entityType: "problem", entityId: "prb-recurrent-mdd", source: "clinician-authored" },
    ACTOR,
  );

  const found = NoteReferenceRepository.listForEntity("problem", "prb-recurrent-mdd");
  assert.equal(found.length, 1);
  assert.equal(found[0].encounterId, encounter.id);
});

test("prototype note markup is stripped from drafts and left alone in signed notes", async () => {
  const db = getDatabase();
  const patientId = draftEncounter().patientId;
  const at = new Date().toISOString();
  const tokenised = "Continuing @[med:Sertraline 100 mg|%7B%22x%22%3A1%7D] for @[dx:Recurrent MDD].";
  const draftId = `enc-token-draft-${Date.now()}`;
  const signedId = `enc-token-signed-${Date.now()}`;

  for (const [id, status] of [
    [draftId, "draft"],
    [signedId, "signed"],
  ] as const) {
    db.prepare(
      `INSERT INTO encounters (id, patient_id, date, type, status, plan, created_at, updated_at)
       VALUES (?, ?, '2026-09-01', 'Psychiatric Follow-Up', ?, ?, ?, ?)`,
    ).run(id, patientId, status, tokenised, at, at);
  }

  const { APPLICATION_MIGRATIONS, applyMigrations } = await import("../app/server/db/migrations");
  const retirement = APPLICATION_MIGRATIONS.filter(
    (migration: any) => migration.id === "2026-09-13-002-retire-prototype-note-tokens",
  );
  assert.equal(retirement.length, 1, "the retirement migration must exist");

  // Apply twice: a migration that rewrites content must be safe to re-run.
  for (let pass = 0; pass < 2; pass += 1) {
    db.prepare(`DELETE FROM schema_migrations WHERE id = ?`).run(retirement[0].id);
    applyMigrations(db, retirement);
  }

  assert.equal(
    (db.prepare(`SELECT plan FROM encounters WHERE id = ?`).get(draftId) as any).plan,
    "Continuing Sertraline 100 mg for Recurrent MDD.",
    "a draft keeps the words the clinician saw and loses the markup around them",
  );
  assert.equal(
    (db.prepare(`SELECT plan FROM encounters WHERE id = ?`).get(signedId) as any).plan,
    tokenised,
    "a signed note is hashed over its text and is not a string a migration may rewrite",
  );
  assert.ok(
    Number(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM provenance_events
             WHERE activity = 'prototype-markup-detected' AND entity_id = ?`,
          )
          .get(signedId) as any
      ).n,
    ) > 0,
    "the untouched signed note is surfaced rather than silently left",
  );
});

function sourceFiles(root: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(root)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(root, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

const APP_ROOT = join(import.meta.dirname, "..", "app");

test("no module invents a billing code from a clinical label", () => {
  // The abandoned prototype assigned ICD-10 by substring guess, so any diagnosis
  // it did not recognise was silently coded as recurrent major depressive
  // disorder. A code reaches a claim by having been recorded on a record.
  const icdLiteral = /["'`][A-TV-Z][0-9][0-9AB](?:\.[0-9A-Z]{1,4})?["'`]/;
  const offenders: string[] = [];

  for (const file of sourceFiles(APP_ROOT)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!icdLiteral.test(line)) continue;
      // Producing a code by inspecting text is the shape being banned, whatever
      // the label happens to be.
      if (/\.includes\(|\.match\(|\.test\(|indexOf\(/.test(line) && /\?|:/.test(line)) {
        offenders.push(`${file}: ${line.trim()}`);
      }
    }
  }

  assert.deepEqual(offenders, [], `a clinical label must never be mapped to a code:\n${offenders.join("\n")}`);
});

test("note markup cannot reach a rendered, copied, or transmitted note", () => {
  // Tokens in note text is the defect the reference layer exists to remove. The
  // retirement migration is the one place entitled to name the pattern, because
  // its job is deleting it.
  const allowed = join(APP_ROOT, "server", "db", "migrations.ts");
  const offenders = sourceFiles(APP_ROOT)
    .filter((file) => file !== allowed)
    .filter((file) => readFileSync(file, "utf8").includes("@["));

  assert.deepEqual(offenders, [], `note markup must not exist in application source:\n${offenders.join("\n")}`);
});
