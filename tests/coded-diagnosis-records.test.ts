import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

test("P3-A / RL-B: Authoritative ICD-10 diagnosis coding and reference enrichment", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-coded-diagnosis-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-coded-diagnosis-secret-0123456789";

  try {
    const [
      { resolveStandardDiagnosisCode, STANDARD_PSYCHIATRIC_ICD10, ensureClinicalRecordFoundation },
      { ClinicalRecordRepository },
      { NoteReferenceRepository },
      { ClinicalActionGateway },
      { getDatabase },
    ] = await Promise.all([
      import("../app/server/db/clinical-record-foundation"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/repositories/note-reference-repository"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/db/connection"),
    ]);

    await grantSyntheticOrganizationAccess(["team-taylor"]);
    const db = getDatabase();
    ensureClinicalRecordFoundation(db);

    // 1. Authoritative registry mapping
    assert.equal(resolveStandardDiagnosisCode("ADHD, Combined Type")?.code, "F90.2");
    assert.equal(resolveStandardDiagnosisCode("Generalized Anxiety Disorder")?.code, "F41.1");
    assert.equal(resolveStandardDiagnosisCode("Major Depressive Disorder, Recurrent, Moderate")?.code, "F33.1");
    assert.equal(resolveStandardDiagnosisCode("Bipolar I Disorder, Most Recent Episode Depressed, Moderate")?.code, "F31.32");
    assert.equal(resolveStandardDiagnosisCode("Post-Traumatic Stress Disorder (PTSD)")?.code, "F43.10");
    assert.equal(resolveStandardDiagnosisCode("Alcohol Use Disorder, Mild")?.code, "F10.10");

    // Must never hallucinate fake F-codes for unrecognized custom diagnoses
    assert.equal(resolveStandardDiagnosisCode("Custom Unmapped Psychological Complaint"), null);

    // 2. Database persistence with authoritative codes
    const patientId = "maya-chen";
    const actor = { userId: "team-taylor", displayName: "Dr. Taylor", role: "provider" as const };
    const context = { source: "api" as const, requestId: "coded-dx-test" };

    const problemWithCode = ClinicalRecordRepository.addProblem({
      patientId,
      displayText: "Attention-Deficit Hyperactivity Disorder, Combined Type",
      code: "F90.2",
      codingSystem: "ICD-10-CM",
    }, actor);
    assert.equal(problemWithCode.code, "F90.2");
    assert.equal(problemWithCode.coding_system, "ICD-10-CM");

    const uncodedProblem = ClinicalRecordRepository.addProblem({
      patientId,
      displayText: "Non-specific existential distress",
    }, actor);
    assert.equal(uncodedProblem.code, null);
    assert.equal(uncodedProblem.coding_system, null);

    // 3. Draft encounter with note reference enrichment
    const draft = (await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientId,
      action: {
        type: "save_encounter_draft",
        payload: { id: "enc-coded-dx-1", patientId, assessment: "Patient presents with persistent ADHD symptoms." },
      },
    })) as { id: string };

    const ref = NoteReferenceRepository.upsert(
      draft.id,
      patientId,
      {
        section: "assessment",
        entityType: "problem",
        entityId: problemWithCode.id,
        source: "action-derived",
      },
      actor,
    );
    assert.ok(ref.id);

    // 4. listEnrichedForEncounter resolves display and code from authoritative entity table
    const enriched = NoteReferenceRepository.listEnrichedForEncounter(draft.id);
    assert.equal(enriched.length, 1);
    assert.equal(enriched[0].id, ref.id);
    assert.equal(enriched[0].display, "Attention-Deficit Hyperactivity Disorder, Combined Type");
    assert.equal(enriched[0].code, "F90.2");
    assert.equal(enriched[0].codingSystem, "ICD-10-CM");
  } finally {
    process.chdir(originalCwd);
    env.NODE_ENV = originalNodeEnv;
    env.EHR_SESSION_SECRET = originalSecret;
  }
});
