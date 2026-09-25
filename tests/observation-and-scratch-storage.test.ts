import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { genericObservationRefusal, looksLikeVitalSign } from "../app/domain/observation-categories";
import { CREATE_TABLES_SQL } from "../app/server/db/schema";
import { seedDatabaseIfEmpty } from "../app/server/db/seed";
import { seedTeamCollaboration } from "../app/server/db/team-seed";
import { ensureAuthFoundation } from "../app/server/db/auth-foundation";
import { ensureClinicalRecordFoundation } from "../app/server/db/clinical-record-foundation";
import { ensureMedicationReconciliationFoundation } from "../app/server/db/medication-reconciliation-foundation";
import { ensurePrescriptionTransactionFoundation } from "../app/server/db/prescription-transaction-foundation";
import { ensurePrescriptionRefillFoundation } from "../app/server/db/prescription-refill-foundation";
import { ensurePrescriptionChangeRequestFoundation } from "../app/server/db/prescription-change-request-foundation";
import { ensurePrescriptionCallbackFoundation } from "../app/server/db/prescription-callback-foundation";
import { ensureDocumentWorkflowFoundation } from "../app/server/db/document-workflow-foundation";
import { ensureChartCommunicationFoundation } from "../app/server/db/chart-communication-foundation";
import { ensureChartIntegrity } from "../app/server/db/chart-integrity";
import { APPLICATION_MIGRATIONS, applyMigrations } from "../app/server/db/migrations";

/**
 * D-103: vital signs and lab results are stored where they belong, and a
 * scratchpad note belongs to the clinician who wrote it.
 */

test("the generic observation path refuses vital signs and unknown categories", () => {
  const lab = { category: "laboratory", testName: "Serum Lithium Level", code: "14334-7", valueText: "0.68" };
  assert.equal(genericObservationRefusal(lab), null);

  assert.match(
    genericObservationRefusal({ ...lab, testName: "Resting Blood Pressure & Pulse", code: "85354-9", valueText: "128/82" })!,
    /vital sign/,
  );
  assert.match(
    genericObservationRefusal({ ...lab, testName: "Uncoded reading", code: "8867-4", valueText: "72" })!,
    /vital sign/,
    "a vital-sign LOINC code is refused even under another name",
  );
  assert.match(genericObservationRefusal({ ...lab, category: "vital-signs" })!, /vitals form/);
  assert.match(genericObservationRefusal({ ...lab, category: "labz" })!, /Unknown observation category/);
  assert.match(genericObservationRefusal({ ...lab, valueText: "  " })!, /needs a value/);
  assert.equal(looksLikeVitalSign({ testName: "TSH (Thyroid Stimulating Hormone)", code: "3016-3" }), false);
});

function bootstrap(db: DatabaseSync, migrations = APPLICATION_MIGRATIONS) {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(CREATE_TABLES_SQL);
  seedDatabaseIfEmpty(db);
  seedTeamCollaboration(db);
  ensureAuthFoundation(db);
  ensureClinicalRecordFoundation(db);
  ensureMedicationReconciliationFoundation(db);
  ensurePrescriptionTransactionFoundation(db);
  ensurePrescriptionRefillFoundation(db);
  ensurePrescriptionChangeRequestFoundation(db);
  ensurePrescriptionCallbackFoundation(db);
  ensureDocumentWorkflowFoundation(db);
  ensureChartCommunicationFoundation(db);
  ensureChartIntegrity(db);
  applyMigrations(db, migrations);
}

test("an existing database's lab-filed blood pressures and unowned scratch notes are migrated", () => {
  const db = new DatabaseSync(":memory:");
  const before = APPLICATION_MIGRATIONS.filter((migration) => !migration.id.startsWith("2026-09-25-"));
  bootstrap(db, before);

  // Recreate the pre-fix state: the reading's id held a laboratory row, and the
  // scratchpad lived in `tasks` with no author.
  db.prepare(`UPDATE observations SET category = 'laboratory', code = '85354-9',
                test_name = 'Blood Pressure & Pulse Record', value_text = '116/74 mmHg, Pulse 68',
                source_system = 'synthetic-fixture-migration'
              WHERE id = 'lab-mc-2'`).run();
  const now = new Date().toISOString();
  db.prepare(`UPDATE tasks SET patient_id = NULL WHERE id IN ('note-1', 'note-2')`).run();
  db.prepare(`INSERT INTO tasks (id, patient_id, text, completed, type, color, created_at, updated_at)
              VALUES ('sn-by-alex', NULL, 'Call pharmacy about shortage list', 0, 'scratchpad', 'note-yellow', ?, ?)`)
    .run(now, now);
  db.prepare(`INSERT INTO audit_logs (id, timestamp, user_id, user_name, user_role, event_type, patient_id, description, metadata_json)
              VALUES ('audit-sn', ?, 'team-pmhnp', 'Alex Rivera', 'provider', 'scratchpad_created', NULL, 'Created', ?)`)
    .run(now, JSON.stringify({ noteId: "sn-by-alex" }));
  db.prepare(`INSERT INTO tasks (id, patient_id, text, completed, type, color, created_at, updated_at)
              VALUES ('sn-orphan', NULL, 'Nobody knows who wrote this', 0, 'scratchpad', 'note-yellow', ?, ?)`)
    .run(now, now);

  applyMigrations(db);

  const bp = db.prepare(`SELECT category, code, value_text FROM observations WHERE id = 'lab-mc-2'`).get() as Record<string, string>;
  assert.deepEqual({ ...bp }, { category: "vital-signs", code: "bp", value_text: "116/74" });
  const hr = db.prepare(`SELECT category, value_num FROM observations WHERE id = 'lab-mc-2-hr'`).get() as Record<string, unknown>;
  assert.equal(hr.category, "vital-signs");
  assert.equal(hr.value_num, 68);
  const labBp = db.prepare(`SELECT COUNT(*) AS n FROM observations WHERE category = 'laboratory' AND code = '85354-9'`).get() as { n: number };
  assert.equal(labBp.n, 0, "no blood pressure remains in the lab record");
  const provenance = db.prepare(`SELECT activity FROM provenance_events WHERE id = 'prov-reclassify-lab-mc-2'`).get() as { activity: string };
  assert.equal(provenance.activity, "reclassify");

  const leftover = db.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE type = 'scratchpad'`).get() as { n: number };
  assert.equal(leftover.n, 0, "scratch notes no longer live in the task queue");
  const notes = new Map(
    (db.prepare(`SELECT id, author_user_id, patient_id FROM scratch_notes`).all() as Array<Record<string, string | null>>)
      .map((row) => [row.id, row]),
  );
  assert.equal(notes.get("note-1")?.patient_id, "maya-chen", "the titration memo is Maya Chen's");
  assert.equal(notes.get("note-1")?.author_user_id, "prototype-provider");
  assert.equal(notes.get("note-3")?.patient_id, null, "the front-desk memo is a practice note");
  assert.equal(notes.get("sn-by-alex")?.author_user_id, "team-pmhnp", "authorship comes from the audit event");
  assert.equal(notes.get("sn-orphan")?.author_user_id, null, "an unattributable note stays, marked unattributed");
  db.close();
});

test("a fresh database seeds vitals as vitals and scratch notes with owners", () => {
  const db = new DatabaseSync(":memory:");
  bootstrap(db);
  for (const id of ["lab-mc-2", "lab-er-1", "lab-mv-1"]) {
    const row = db.prepare(`SELECT category FROM observations WHERE id = ?`).get(id) as { category: string };
    assert.equal(row.category, "vital-signs", `${id} is a vital-sign reading`);
  }
  const note = db.prepare(`SELECT author_user_id, patient_id FROM scratch_notes WHERE id = 'note-2'`).get() as Record<string, string>;
  assert.equal(note.author_user_id, "prototype-provider");
  assert.equal(note.patient_id, "maya-chen");
  db.close();
});

test("scratch notes are private to their author and entry refuses vitals as lab results", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  process.chdir(mkdtempSync(join(tmpdir(), "ehr-scratch-storage-")));
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-scratch-storage-session-secret-0123456789";

  try {
    const [{ scratchNoteService }, { clinicalRecordService }, { getDatabase }, { PracticeQueueRepository }] =
      await Promise.all([
        import("../app/server/services/scratch-note-service"),
        import("../app/server/services/clinical-record-service"),
        import("../app/server/db/connection"),
        import("../app/server/repositories/practice-queue-repository"),
      ]);
    getDatabase();
    const context = { source: "test", requestId: "req-scratch" } as never;
    const owner = { userId: "prototype-provider", displayName: "Prototype Provider", role: "provider" } as const;
    const colleague = { userId: "team-pmhnp", displayName: "Alex Rivera", role: "provider" } as const;

    const ownNotes = scratchNoteService.list(owner);
    assert.deepEqual(ownNotes.map((note) => note.id).sort(), ["note-1", "note-2", "note-3"]);
    assert.equal(scratchNoteService.list(colleague).length, 0, "a colleague in the same practice sees none of them");

    const created = scratchNoteService.create({ text: "  Check lithium trough timing  ", patientId: "david-kim" }, colleague, context);
    assert.equal(created.text, "Check lithium trough timing");
    assert.ok(created.createdAt);
    assert.ok(!scratchNoteService.list(owner).some((note) => note.id === created.id));
    assert.ok(scratchNoteService.list(colleague).some((note) => note.id === created.id));

    assert.throws(() => scratchNoteService.delete("note-1", colleague, context), /not found/,
      "another clinician's note answers like a missing one");
    assert.throws(() => scratchNoteService.create({ text: "   " }, owner, context), /needs text/);

    assert.throws(
      () => clinicalRecordService.addObservation(
        { patientId: "maya-chen", category: "laboratory", testName: "Resting Blood Pressure & Pulse", code: "85354-9", valueText: "120/80" },
        owner, context,
      ),
      /vital sign/,
    );
    const lithium = clinicalRecordService.addObservation(
      { patientId: "david-kim", category: "laboratory", testName: "Serum Lithium Level", code: "14334-7", valueText: "0.71", unit: "mEq/L" },
      owner, context,
    );
    assert.equal(lithium.category, "laboratory");

    // Vitals are several rows per reading; a run of them must not push lab
    // history out of the chart snapshot the Labs section reads.
    const { MeasurementRepository } = await import("../app/server/repositories/measurement-repository");
    for (let index = 0; index < 20; index += 1) {
      MeasurementRepository.recordVitals(
        { patientId: "david-kim", systolic: 118 + index, diastolic: 76, heartRate: 70, weightLbs: 180, heightIn: 70,
          effectiveAt: new Date(Date.now() - index * 60_000).toISOString() },
        { userId: owner.userId, displayName: owner.displayName },
      );
    }
    const snapshot = clinicalRecordService.snapshot("david-kim", owner);
    assert.ok(snapshot.observations.some((row: { id: string }) => row.id === lithium.id), "lab history survives many vitals");
    assert.ok(
      !snapshot.observations.some((row: { category: string }) => row.category === "vital-signs"),
      "snapshot observations are results; vitals arrive summarized",
    );
    assert.ok(snapshot.vitals.length >= 20);

    const queue = PracticeQueueRepository.labs();
    assert.ok(!queue.some((row) => /blood pressure/i.test(row.testName)), "the lab queue carries no vital signs");
    assert.ok(queue.some((row) => row.observationId === lithium.id), "a hand-entered result awaits acknowledgement");
  } finally {
    process.chdir(originalCwd);
    env.NODE_ENV = originalNodeEnv;
    env.EHR_SESSION_SECRET = originalSecret;
  }
});

test("hand-entered results are validated at the API boundary", async () => {
  const { validateClinicalRecordAction } = await import("../app/server/actions/clinical-record-validation");
  const base = { patientId: "david-kim", category: "laboratory", testName: "Serum Lithium Level", valueText: "0.7" };

  const action = validateClinicalRecordAction({
    type: "add_observation",
    payload: { ...base, effectiveAt: "2026-09-01", observedBy: "Someone Else", source: { system: "spoofed" } },
  }) as { payload: Record<string, unknown> };
  assert.equal(action.payload.observedBy, undefined, "the recorder is the signed-in clinician, never the request");
  assert.equal(action.payload.source, undefined);
  assert.equal(action.payload.effectiveAt, "2026-09-01T12:00:00.000Z");

  assert.throws(() => validateClinicalRecordAction({ type: "add_observation", payload: { ...base, effectiveAt: "2999-01-01" } }), /future/);
  assert.throws(() => validateClinicalRecordAction({ type: "add_observation", payload: { ...base, interpretation: "spicy" } }), /interpretation/);
  assert.throws(() => validateClinicalRecordAction({ type: "add_observation", payload: { ...base, testName: "Heart Rate" } }), /vital sign/);
  assert.throws(() => validateClinicalRecordAction({ type: "add_observation", payload: { ...base, category: "vital-signs" } }), /vitals form/);
});

test("care-completion reads stored laboratory results, whatever the category spelling", async () => {
  const { resolveResultReview } = await import("../app/server/services/care-completion-rules");
  const bundle = {
    patientId: "p",
    encounters: [], appointments: [], orders: [], transactions: [], medications: [], messages: [],
    noteReferences: [], charges: [], tasks: [], careNetwork: [],
    observations: [
      { id: "o1", testName: "Serum Lithium Level", category: "laboratory", effectiveAt: "2026-09-20T00:00:00.000Z", status: "final" },
      { id: "o2", testName: "Blood Pressure", category: "vital-signs", effectiveAt: "2026-09-20T00:00:00.000Z", status: "final" },
    ],
  } as never;
  const items = resolveResultReview(bundle, {
    capabilities: new Set(["acknowledge_results", "read_clinical", "manage_clinical_record"] as never),
    now: new Date("2026-09-25T00:00:00.000Z"),
  });
  assert.deepEqual(items.map((item) => item.label), ["Review result — Serum Lithium Level"]);
});
