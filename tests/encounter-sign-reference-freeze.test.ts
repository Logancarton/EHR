import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

test("RL-A: Sign-time note reference review, atomic snapshot freeze, and chart independence", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-sign-ref-freeze-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-sign-ref-freeze-secret-0123456789";

  try {
    const [
      { PATCH: referencesPatch },
      { POST: loginPost },
      { ClinicalRecordRepository },
      { ClinicalRecordUpdateRepository },
      { NoteReferenceRepository },
      { ClinicalActionGateway },
      { ensureClinicalRecordFoundation },
      { getDatabase },
      { AuditRepository },
    ] = await Promise.all([
      import("../app/api/encounters/[id]/references/route"),
      import("../app/api/auth/login/route"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/repositories/clinical-record-update-repository"),
      import("../app/server/repositories/note-reference-repository"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/db/clinical-record-foundation"),
      import("../app/server/db/connection"),
      import("../app/server/repositories/audit-repository"),
    ]);

    await grantSyntheticOrganizationAccess(["team-taylor"]);
    const db = getDatabase();
    ensureClinicalRecordFoundation(db);

    const providerLogin = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "team-taylor" }),
    }));
    assert.equal(providerLogin.status, 200);
    const cookie = providerLogin.headers.get("set-cookie")!.split(";", 1)[0];

    const actor = { userId: "team-taylor", displayName: "Dr. Taylor", role: "provider" as const };
    const context = { source: "api" as const, requestId: "sign-ref-freeze-test" };
    const patientId = "maya-chen";

    // 1. Establish clinical problems with ICD-10 codes
    const prob1 = ClinicalRecordRepository.addProblem({
      patientId,
      displayText: "Major Depressive Disorder, Recurrent, Moderate",
      code: "F33.1",
      codingSystem: "ICD-10-CM",
    }, actor);
    const prob2 = ClinicalRecordRepository.addProblem({
      patientId,
      displayText: "Generalized Anxiety Disorder",
      code: "F41.1",
      codingSystem: "ICD-10-CM",
    }, actor);
    const prob3 = ClinicalRecordRepository.addProblem({
      patientId,
      displayText: "Incidental minor tension headache",
      code: "G44.209",
      codingSystem: "ICD-10-CM",
    }, actor);

    // 2. Draft encounter
    const encounterId = "enc-freeze-test-1";
    await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientId,
      action: {
        type: "save_encounter_draft",
        payload: {
          id: encounterId,
          patientId,
          assessment: "Patient MDD and GAD under active pharmacotherapy.",
          plan: "Continue Sertraline.",
        },
      },
    });

    // 3. Propose 3 note references (all initially proposed via extraction)
    const ref1 = NoteReferenceRepository.upsert(
      encounterId,
      patientId,
      {
        section: "assessment",
        entityType: "problem",
        entityId: prob1.id,
        source: "ai-extracted",
      },
      actor,
    );
    const ref2 = NoteReferenceRepository.upsert(
      encounterId,
      patientId,
      {
        section: "assessment",
        entityType: "problem",
        entityId: prob2.id,
        source: "ai-extracted",
      },
      actor,
    );
    const ref3 = NoteReferenceRepository.upsert(
      encounterId,
      patientId,
      {
        section: "assessment",
        entityType: "problem",
        entityId: prob3.id,
        source: "ai-extracted",
      },
      actor,
    );

    // 4. Clinician reviews references: confirms ref1 & ref2, rejects ref3
    const patchRes = await referencesPatch(new Request(`http://ehr.local/api/encounters/${encounterId}/references`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        confirmIds: [ref1.id, ref2.id],
        rejectIds: [ref3.id],
      }),
    }), { params: Promise.resolve({ id: encounterId }) });

    assert.equal(patchRes.status, 200);
    const patchJson = await patchRes.json();
    assert.equal(patchJson.success, true);
    assert.equal(patchJson.confirmedCount, 2);
    assert.equal(patchJson.rejectedCount, 1);

    const afterReview = NoteReferenceRepository.listForEncounter(encounterId);
    assert.equal(afterReview.find((r) => r.id === ref1.id)?.status, "confirmed");
    assert.equal(afterReview.find((r) => r.id === ref2.id)?.status, "confirmed");
    assert.equal(afterReview.find((r) => r.id === ref3.id)?.status, "rejected");

    // 5. Sign the encounter
    const signResult = (await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientId,
      action: {
        type: "sign_encounter",
        payload: { encounterId },
      },
    })) as { id: string; status: string };

    assert.equal(signResult.status, "signed");

    // 6. Verify snapshot has frozen the confirmed references and attested codes
    const snapshot = db.prepare(
      "SELECT content_sha256, content_json FROM signed_encounter_snapshots WHERE encounter_id = ?",
    ).get(encounterId) as { content_sha256: string; content_json: string } | undefined;
    assert.ok(snapshot, "Signed encounter snapshot must exist");
    assert.ok(snapshot.content_sha256, "Must compute content SHA-256");

    const content = JSON.parse(snapshot.content_json);
    assert.ok(Array.isArray(content.references), "Snapshot must contain frozen references");
    assert.equal(content.references.length, 2, "Only confirmed references are frozen in legal snapshot");
    const codes = content.references.map((r: { code?: string }) => r.code).sort();
    assert.deepEqual(codes, ["F33.1", "F41.1"]);

    // 7. Verify audit log entry contains reference counts and attested codes
    const audits = AuditRepository.getRecent(50, patientId);
    const signAudit = audits.find((a) => a.eventType === "note_signed");
    assert.ok(signAudit, "note_signed audit event must exist");
    const metadata = signAudit.metadata as { confirmedReferencesCount?: number; attestedCodes?: string[] };
    assert.equal(metadata.confirmedReferencesCount, 2);
    assert.ok(metadata.attestedCodes?.some((c) => c.includes("F33.1")));
    assert.ok(metadata.attestedCodes?.some((c) => c.includes("F41.1")));

    // 8. Test Immutability: Modify the chart after signing
    const originalHash = snapshot.content_sha256;
    const originalJson = snapshot.content_json;

    // Clinician updates prob1 status to resolved
    ClinicalRecordUpdateRepository.updateProblem(
      prob1.id,
      { status: "resolved" },
      actor,
    );

    // Clinician adds a new problem
    ClinicalRecordRepository.addProblem({
      patientId,
      displayText: "New unrelated symptom",
    }, actor);

    // Re-verify snapshot
    const recheckedSnapshot = db.prepare(
      "SELECT content_sha256, content_json FROM signed_encounter_snapshots WHERE encounter_id = ?",
    ).get(encounterId) as { content_sha256: string; content_json: string } | undefined;
    assert.equal(recheckedSnapshot?.content_sha256, originalHash, "Hash must remain immutable");
    assert.equal(recheckedSnapshot?.content_json, originalJson, "JSON payload must remain immutable");
  } finally {
    process.chdir(originalCwd);
    env.NODE_ENV = originalNodeEnv;
    env.EHR_SESSION_SECRET = originalSecret;
  }
});
