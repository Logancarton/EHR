import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

test("P3-B: Allergy & Intolerance Workspace with explicit NKDA assessment semantics", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-allergy-semantics-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-allergy-semantics-secret-0123456789";

  try {
    const [
      { ClinicalRecordRepository },
      { ClinicalActionGateway },
      { ensureClinicalRecordFoundation },
      { getDatabase },
    ] = await Promise.all([
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/db/clinical-record-foundation"),
      import("../app/server/db/connection"),
    ]);

    await grantSyntheticOrganizationAccess(["team-taylor"]);
    const db = getDatabase();
    ensureClinicalRecordFoundation(db);

    const actor = { userId: "team-taylor", displayName: "Dr. Taylor", role: "provider" as const };
    const context = { source: "api" as const, requestId: "allergy-semantics-test" };

    // 1. A patient without recorded allergies has an empty list.
    // Clinically, empty results must NEVER imply NKDA.
    const unassessedPatient = "patient-unassessed-test";
    await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "create_patient",
        payload: {
          id: unassessedPatient,
          name: "Unassessed Patient",
          initials: "UP",
          dob: "01/01/1985",
          age: 41,
          pronouns: "they/them",
          mrn: "TEST-UNASSESSED-001",
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

    const initialAllergies = ClinicalRecordRepository.allergies(unassessedPatient);
    assert.equal(initialAllergies.length, 0, "No allergies recorded for unassessed patient");
    const hasExplicitNkda = initialAllergies.some((a: { is_nkda?: number }) => Boolean(a.is_nkda));
    assert.equal(hasExplicitNkda, false, "Empty list must not be treated as NKDA");

    // 2. Explicit NKDA is recorded as a structured assessment
    const nkdaRecord = (await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: unassessedPatient,
      action: {
        type: "add_allergy",
        payload: {
          patientId: unassessedPatient,
          substance: "No Known Drug Allergies (NKDA)",
          reaction: "No known adverse drug reactions",
          severity: "unknown",
          category: "medication",
          isNkda: true,
        },
      },
    })) as { id: string; substance: string; category?: string; is_nkda?: boolean | number };

    assert.equal(nkdaRecord.substance, "No Known Drug Allergies (NKDA)");
    assert.equal(nkdaRecord.category, "medication");
    assert.equal(Boolean(nkdaRecord.is_nkda), true);

    const assessedAllergies = ClinicalRecordRepository.allergies(unassessedPatient);
    assert.equal(assessedAllergies.length, 1);
    assert.equal(Boolean(assessedAllergies[0].is_nkda), true);
    assert.equal(assessedAllergies[0].category, "medication");

    // 3. Adding an explicit adverse reaction with category (e.g. medication)
    const patientB = "maya-chen";
    const allergyRecord = (await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientB,
      action: {
        type: "add_allergy",
        payload: {
          patientId: patientB,
          substance: "Amoxicillin",
          reaction: "Urticarial rash and facial angioedema",
          severity: "severe",
          category: "medication",
          isNkda: false,
        },
      },
    })) as { id: string; substance: string; category?: string; severity: string; is_nkda?: boolean | number };

    assert.equal(allergyRecord.substance, "Amoxicillin");
    assert.equal(allergyRecord.category, "medication");
    assert.equal(allergyRecord.severity, "severe");
    assert.equal(Boolean(allergyRecord.is_nkda), false);

    // 4. Inactivating the allergy preserves historical record
    await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientB,
      action: {
        type: "update_allergy",
        payload: {
          recordId: allergyRecord.id,
          patch: { status: "inactive" },
        },
      },
    });

    const mayaAllergies = ClinicalRecordRepository.allergies(patientB);
    const updated = mayaAllergies.find((a: { id: string }) => a.id === allergyRecord.id);
    assert.equal(updated?.status, "inactive");

    const versions = ClinicalRecordRepository.versions("allergy", allergyRecord.id);
    assert.ok(versions.length >= 2, "Should retain create and update versions");
  } finally {
    process.chdir(originalCwd);
    env.NODE_ENV = originalNodeEnv;
    env.EHR_SESSION_SECRET = originalSecret;
  }
});
