import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("signed note -> edit blocked -> snapshot unchanged -> addendum preserved", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-signed-encounter-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { ClinicalActionGateway },
      { EncounterRepository },
      { ClinicalRecordRepository },
      { getDatabase },
    ] = await Promise.all([
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/encounter-repository"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/db/connection"),
    ]);

    const patientId = "test-signed-encounter-patient";
    const encounterId = "test-signed-encounter";
    const actor = {
      userId: "test-provider",
      displayName: "Test Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const context = { source: "api" as const, requestId: "test-signed-encounter-integrity" };

    await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "create_patient",
        payload: {
          id: patientId,
          name: "Signed Encounter Test",
          initials: "SE",
          dob: "01/01/1990",
          age: 36,
          pronouns: "they/them",
          mrn: "TEST-SIGNED-001",
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

    const draft = await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "save_encounter_draft",
        payload: {
          id: encounterId,
          patientId,
          date: "Sep 6, 2026",
          type: "Medication Management",
          chiefComplaint: "Follow-up",
          intervalHistory: "Mood stable since last visit.",
          treatmentResponse: "Improved",
          sideEffects: "None reported",
          mse: { mood: "euthymic", affect: "congruent" },
          assessment: "Stable on current regimen.",
          plan: "Continue current medications.",
          cptCode: "99214",
          emLevel: "Moderate Complexity (99214)",
          workingState: {
            selectedTemplateId: "psych-follow-up",
            psychotherapyMinutes: 16,
            candidateActions: [],
            ambientTranscript: [],
          },
        },
      },
    });
    assert.equal(draft.status, "draft");

    const signed = await ClinicalActionGateway.execute({
      actor,
      context,
      action: { type: "sign_encounter", payload: { encounterId } },
    });
    assert.equal(signed.status, "signed");

    const db = getDatabase();
    const snapshotBefore = db
      .prepare("SELECT content_sha256, content_json FROM signed_encounter_snapshots WHERE encounter_id = ?")
      .get(encounterId) as { content_sha256: string; content_json: string } | undefined;
    assert.ok(snapshotBefore, "signing should create an immutable legal-record snapshot");

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor,
        context,
        action: {
          type: "save_encounter_draft",
          payload: {
            id: encounterId,
            patientId,
            plan: "This edit must never replace the signed plan.",
          },
        },
      }),
      /immutable|amendment/i,
      "application-level writes must reject edits to a signed encounter",
    );

    assert.throws(
      () => db.prepare("UPDATE encounters SET plan = ? WHERE id = ?").run("Direct DB overwrite", encounterId),
      /immutable|amendment/i,
      "database triggers must block direct signed-note mutation",
    );

    const addendum = await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "add_encounter_addendum",
        payload: {
          encounterId,
          addendumType: "addendum",
          reason: "Clarification after signing",
          body: "Patient later confirmed medication is taken with food.",
        },
      },
    });

    const encounterAfter = EncounterRepository.getById(encounterId);
    assert.ok(encounterAfter);
    assert.equal(encounterAfter.status, "signed");
    assert.equal(encounterAfter.plan, "Continue current medications.");

    const snapshotAfter = db
      .prepare("SELECT content_sha256, content_json FROM signed_encounter_snapshots WHERE encounter_id = ?")
      .get(encounterId) as { content_sha256: string; content_json: string } | undefined;
    assert.ok(snapshotAfter);
    assert.equal(snapshotAfter.content_sha256, snapshotBefore.content_sha256, "addenda must not alter the original signed hash");
    assert.equal(snapshotAfter.content_json, snapshotBefore.content_json, "addenda must not rewrite the signed snapshot");

    const addenda = ClinicalRecordRepository.addenda(encounterId);
    assert.equal(addenda.length, 1);
    assert.equal(addenda[0].id, addendum.id);
    assert.equal(addenda[0].body, "Patient later confirmed medication is taken with food.");

    const versions = ClinicalRecordRepository.versions("encounter_addendum", addendum.id);
    const provenance = ClinicalRecordRepository.provenance("encounter_addendum", addendum.id);
    assert.equal(versions.length, 1);
    assert.equal(versions[0].operation, "create");
    assert.equal(provenance.length, 1);
    assert.equal(provenance[0].source_ref, `encounters/${encounterId}`);
  } finally {
    process.chdir(originalCwd);
  }
});
