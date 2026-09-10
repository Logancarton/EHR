import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

/**
 * Review of symptoms, risk assessment, and follow-up are clinical content of the
 * note. Risk assessment in particular had been a draft-only field: the client held
 * it, the save payload never carried it, and it was therefore absent from the
 * server copy and from the signed legal record. These tests hold the round trip.
 */

test("review of symptoms, risk, and follow-up survive a save and reach the signed record", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-note-sections-"));
  process.chdir(isolatedRoot);

  try {
    const [{ ClinicalActionGateway }, { EncounterRepository }, { getDatabase }] = await Promise.all([
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/encounter-repository"),
      import("../app/server/db/connection"),
    ]);

    await grantSyntheticOrganizationAccess(["test-provider"]);

    const patientId = "test-note-sections-patient";
    const encounterId = "test-note-sections-encounter";
    const actor = {
      userId: "test-provider",
      displayName: "Test Provider",
      credentials: "MD",
      role: "provider" as const,
    };
    const context = { source: "api" as const, requestId: "test-encounter-note-sections" };

    await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "create_patient",
        payload: {
          id: patientId,
          name: "Note Sections Test",
          initials: "NS",
          dob: "01/01/1990",
          age: 36,
          pronouns: "they/them",
          mrn: "TEST-SECTIONS-001",
          status: "Established",
          allergies: [],
          diagnoses: [],
          meds: [],
          vitals: {},
          lastVisit: "Initial",
          nextVisit: "Unscheduled",
        },
      },
    });

    const reviewOfSymptoms =
      "Denies excessive worry, panic attacks, and avoidance behaviour. Reports adequate, restorative sleep.";
    const riskAssessment =
      "Denies suicidal and homicidal ideation, intent, and plan. No access to lethal means reported.";
    const followUp = "Return in 4 weeks, sooner if symptoms worsen or side effects emerge.";

    await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientId,
      action: {
        type: "save_encounter_draft",
        payload: {
          id: encounterId,
          patientId,
          date: "Sep 10, 2026",
          type: "Medication Management",
          chiefComplaint: "Follow-up",
          intervalHistory: "Mood stable since last visit.",
          reviewOfSymptoms,
          treatmentResponse: "Improved",
          sideEffects: "None reported",
          mse: { moodAffect: "Euthymic, full range, congruent." },
          assessment: "Stable on current regimen.",
          riskAssessment,
          followUp,
          plan: "Continue current medications.",
          cptCode: "99214",
          emLevel: "Moderate Complexity (99214)",
        },
      },
    });

    const reloaded = EncounterRepository.getById(encounterId);
    assert.equal(reloaded?.reviewOfSymptoms, reviewOfSymptoms);
    assert.equal(reloaded?.riskAssessment, riskAssessment);
    assert.equal(reloaded?.followUp, followUp);

    // A second save that does not mention these sections must not blank them: the
    // repository merges against the existing row rather than defaulting to empty.
    await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientId,
      action: {
        type: "save_encounter_draft",
        payload: { id: encounterId, patientId, plan: "Continue. Recheck metabolic panel." },
      },
    });

    const afterPartialSave = EncounterRepository.getById(encounterId);
    assert.equal(afterPartialSave?.reviewOfSymptoms, reviewOfSymptoms);
    assert.equal(afterPartialSave?.riskAssessment, riskAssessment);
    assert.equal(afterPartialSave?.followUp, followUp);

    await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientId,
      action: { type: "sign_encounter", payload: { encounterId } },
    });

    const snapshot = getDatabase()
      .prepare("SELECT content_json FROM signed_encounter_snapshots WHERE encounter_id = ?")
      .get(encounterId) as { content_json: string } | undefined;
    assert.ok(snapshot, "signing should snapshot the legal record");

    const content = JSON.parse(snapshot.content_json) as Record<string, unknown>;
    assert.equal(content.reviewOfSymptoms, reviewOfSymptoms);
    assert.equal(
      content.riskAssessment,
      riskAssessment,
      "the risk assessment must be inside the sealed legal record, not only in a browser",
    );
    assert.equal(content.followUp, followUp);
  } finally {
    process.chdir(originalCwd);
  }
});

test("the note-section migration adds columns to a database that predates them", async () => {
  const { APPLICATION_MIGRATIONS, applyMigrations } = await import("../app/server/db/migrations");
  const migration = APPLICATION_MIGRATIONS.find(
    (candidate) => candidate.id === "2026-09-10-003-encounter-note-sections",
  );
  assert.ok(migration, "the note-section migration must be declared");

  const db = new DatabaseSync(":memory:");
  try {
    // The encounters table as it stood before this change: no review of symptoms,
    // no risk assessment, no follow-up.
    db.exec(`
      CREATE TABLE encounters (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        interval_history TEXT NOT NULL DEFAULT '',
        assessment TEXT NOT NULL DEFAULT '',
        plan TEXT NOT NULL DEFAULT ''
      );
    `);
    db.prepare("INSERT INTO encounters (id, patient_id, plan) VALUES (?, ?, ?)")
      .run("legacy-encounter", "legacy-patient", "Continue current medications.");

    applyMigrations(db, [migration]);

    const columns = (db.prepare("PRAGMA table_info(encounters)").all() as Array<{ name: string }>)
      .map((entry) => entry.name);
    for (const column of ["review_of_symptoms", "risk_assessment", "follow_up"]) {
      assert.ok(columns.includes(column), `migration should add ${column}`);
    }

    const legacyRow = db
      .prepare("SELECT plan, risk_assessment FROM encounters WHERE id = ?")
      .get("legacy-encounter") as { plan: string; risk_assessment: string };
    assert.equal(legacyRow.plan, "Continue current medications.", "existing rows must be preserved");
    assert.equal(legacyRow.risk_assessment, "", "new columns default to empty, never to a claim");

    // Applying against a database that already has the columns must be a no-op
    // rather than a duplicate-column failure, because the base schema creates them
    // for fresh databases before the migration ledger ever runs.
    assert.doesNotThrow(() => migration.apply(db));
  } finally {
    db.close();
  }
});
