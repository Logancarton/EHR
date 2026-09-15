import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

test("P3-E: Structured psychiatric history normalized records and versioning", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-psych-hist-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-psych-secret-0123456789abcdef";

  try {
    const [
      { ensureClinicalRecordFoundation },
      { getDatabase },
      { MeasurementRepository },
      { ClinicalRecordRepository },
      { ClinicalActionGateway },
    ] = await Promise.all([
      import("../app/server/db/clinical-record-foundation"),
      import("../app/server/db/connection"),
      import("../app/server/repositories/measurement-repository"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/actions/clinical-action-gateway"),
    ]);

    const db = getDatabase();
    ensureClinicalRecordFoundation(db);

    const actor = {
      userId: "user-psych-tester",
      displayName: "Dr. Alex Taylor, MD",
      role: "provider" as const,
      capabilities: ["read_clinical", "manage_clinical_record", "edit_draft"] as any,
    };
    await grantSyntheticOrganizationAccess([actor.userId]);

    const patientId = "maya-chen";

    // 1. Seeded items verification
    const items = MeasurementRepository.listPsychiatricHistory(patientId);
    assert.ok(items.length >= 4);

    const medTrial = items.find((i) => i.category === "medication_trial");
    assert.ok(medTrial);
    assert.ok(medTrial?.title.includes("Escitalopram"));
    assert.equal(medTrial?.details.drug, "Escitalopram");

    const psych = items.find((i) => i.category === "psychotherapy");
    assert.ok(psych);
    assert.equal(psych?.details.modality, "Cognitive Behavioral Therapy (CBT)");

    // 2. Category filtering
    const trials = MeasurementRepository.listPsychiatricHistory(patientId, "medication_trial");
    assert.ok(trials.length >= 1);
    assert.ok(trials.every((t) => t.category === "medication_trial"));

    // 3. Adding a new hospitalization record
    const created = MeasurementRepository.addPsychiatricHistoryItem(
      {
        patientId,
        category: "hospitalization",
        title: "Brief Crisis Stabilization Unit Stay (2020)",
        details: {
          facility: "Bay Area Behavioral Health",
          duration: "3 days",
          voluntary: true,
          reason: "Severe panic attacks during lockdown",
        },
        status: "historical",
        onsetDate: "2020-04-15",
        resolvedDate: "2020-04-18",
      },
      { userId: actor.userId, displayName: actor.displayName },
    );

    assert.ok(created.id);
    assert.equal(created.patientId, patientId);
    assert.equal(created.category, "hospitalization");

    // Verify record versions and provenance
    const versions = ClinicalRecordRepository.versions("psychiatric_history", created.id);
    assert.equal(versions.length, 1);
    assert.equal(versions[0].operation, "create");

    // 4. Updating psychiatric history item
    const updated = MeasurementRepository.updatePsychiatricHistoryItem(
      created.id,
      {
        title: "Crisis Stabilization Stay (Updated Details)",
        status: "historical",
        resolvedDate: "2020-04-19",
      },
      { userId: actor.userId, displayName: actor.displayName },
    );

    assert.equal(updated.title, "Crisis Stabilization Stay (Updated Details)");
    assert.equal(updated.resolvedDate, "2020-04-19");

    const versionsAfterUpdate = ClinicalRecordRepository.versions("psychiatric_history", created.id);
    assert.equal(versionsAfterUpdate.length, 2);
    assert.equal(versionsAfterUpdate[0].version_number, 2);

    // 5. Gateway execution
    const addResult = await ClinicalActionGateway.execute({
      action: {
        type: "add_psychiatric_history_item",
        payload: {
          patientId: "david-kim",
          category: "substance_use",
          title: "Past Alcohol Use in College",
          details: { substance: "Alcohol", pattern: "Binge drinking in college (2018-2020); currently sober" },
          status: "in-remission",
        },
      },
      actor,
      context: { source: "api", requestId: "req-psych-gateway-1" },
      expectedPatientId: "david-kim",
    });

    assert.ok(addResult);
    const itemId = (addResult as any).id;
    assert.ok(itemId);

    const updateResult = await ClinicalActionGateway.execute({
      action: {
        type: "update_psychiatric_history_item",
        payload: {
          recordId: itemId,
          patch: {
            status: "historical",
          },
        },
      },
      actor,
      context: { source: "api", requestId: "req-psych-gateway-2" },
      expectedPatientId: "david-kim",
    });

    assert.equal((updateResult as any).status, "historical");
  } finally {
    process.chdir(originalCwd);
    env.NODE_ENV = originalNodeEnv;
    env.EHR_SESSION_SECRET = originalSecret;
  }
});
