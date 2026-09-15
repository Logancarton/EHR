import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";
import {
  PHQ9_INSTRUMENT,
  GAD7_INSTRUMENT,
  ASRS_INSTRUMENT,
  CSSRS_INSTRUMENT,
} from "../app/domain/clinical-measurements";

test("P3-F: Instrument definitions and automated severity / critical flag scoring", () => {
  // Mild depression without suicidality
  const mildAnswers: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 0, 8: 0, 9: 0 };
  const mildInterp = PHQ9_INSTRUMENT.interpret(6, mildAnswers);
  assert.equal(mildInterp.severity, "Mild Depression");
  assert.equal(mildInterp.flags.length, 0);

  // Severe depression WITH question 9 suicidal ideation
  const severeAnswers: Record<number, number> = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 2, 6: 3, 7: 2, 8: 2, 9: 2 };
  const severeInterp = PHQ9_INSTRUMENT.interpret(23, severeAnswers);
  assert.equal(severeInterp.severity, "Severe Depression");
  assert.equal(severeInterp.flags.length, 1);
  assert.ok(severeInterp.flags[0].includes("POSITIVE ITEM 9"));
  assert.ok(severeInterp.summary.includes("[SAFETY ALERT: Item 9 Endorsed]"));

  // GAD-7
  assert.equal(GAD7_INSTRUMENT.interpret(3, {}).severity, "Minimal Anxiety");
  assert.equal(GAD7_INSTRUMENT.interpret(7, {}).severity, "Mild Anxiety");
  assert.equal(GAD7_INSTRUMENT.interpret(12, {}).severity, "Moderate Anxiety");
  assert.equal(GAD7_INSTRUMENT.interpret(18, {}).severity, "Severe Anxiety");

  // ASRS v1.1
  const positiveAnswers: Record<number, number> = { 1: 3, 2: 2, 3: 2, 4: 3, 5: 1, 6: 1 };
  const posInterp = ASRS_INSTRUMENT.interpret(12, positiveAnswers);
  assert.ok(posInterp.severity.includes("Positive ADHD Screen"));
  assert.equal(posInterp.flags.length, 1);

  // C-SSRS
  const highRiskAnswers: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 0 };
  const highInterp = CSSRS_INSTRUMENT.interpret(5, highRiskAnswers);
  assert.ok(highInterp.severity.includes("High Risk (Suicidal Intent with Specific Plan)"));
  assert.ok(highInterp.flags.some((f) => f.includes("CRITICAL")));
});

test("P3-F: Assessments persistence, review lifecycle, and snapshot inclusion", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-assess-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-assess-secret-0123456789abcdef";

  try {
    const [
      { ensureClinicalRecordFoundation },
      { getDatabase },
      { MeasurementRepository },
      { ClinicalRecordRepository },
      { clinicalRecordService },
      { ClinicalActionGateway },
    ] = await Promise.all([
      import("../app/server/db/clinical-record-foundation"),
      import("../app/server/db/connection"),
      import("../app/server/repositories/measurement-repository"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/services/clinical-record-service"),
      import("../app/server/actions/clinical-action-gateway"),
    ]);

    const db = getDatabase();
    ensureClinicalRecordFoundation(db);

    const actor = {
      userId: "user-assess-tester",
      displayName: "Dr. Alex Taylor, MD",
      role: "provider" as const,
      capabilities: ["read_clinical", "manage_clinical_record", "edit_draft"] as any,
    };
    await grantSyntheticOrganizationAccess([actor.userId]);

    const patientId = "maya-chen";

    // 1. Record standard PHQ-9
    const record = MeasurementRepository.recordAssessment(
      {
        patientId,
        instrument: "phq-9",
        responses: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 0, 6: 1, 7: 1, 8: 0, 9: 0 },
        source: "clinician",
        notes: "Routine follow-up assessment",
      },
      { userId: actor.userId, displayName: actor.displayName },
    );

    assert.ok(record.id);
    assert.equal(record.totalScore, 6);
    assert.equal(record.severity, "Mild Depression");
    assert.equal(record.flags.length, 0);

    const versions = ClinicalRecordRepository.versions("clinical_assessment", record.id);
    assert.equal(versions.length, 1);
    assert.equal(versions[0].operation, "record_assessment");

    // 2. Record with safety alert flag
    const alertRecord = MeasurementRepository.recordAssessment(
      {
        patientId,
        instrument: "phq-9",
        responses: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 1, 6: 2, 7: 1, 8: 1, 9: 1 },
        source: "clinician",
        notes: "Endorsed passive death wish on item 9",
      },
      { userId: actor.userId, displayName: actor.displayName },
    );

    assert.equal(alertRecord.totalScore, 14);
    assert.equal(alertRecord.severity, "Moderate Depression");
    assert.equal(alertRecord.flags.length, 1);
    assert.ok(alertRecord.flags[0].includes("POSITIVE ITEM 9"));

    // 3. Review assessment
    const reviewed = MeasurementRepository.reviewAssessment(
      alertRecord.id,
      { userId: actor.userId, displayName: actor.displayName },
      "Safety plan reinforced with patient.",
    );

    assert.equal(reviewed.reviewStatus, "reviewed");
    assert.equal(reviewed.reviewedBy, actor.displayName);
    assert.ok(reviewed.notes?.includes("Safety plan"));

    // 4. ClinicalActionGateway execution
    const gatewayResult = await ClinicalActionGateway.execute({
      action: {
        type: "record_assessment",
        payload: {
          patientId,
          instrument: "gad-7",
          responses: { 1: 1, 2: 0, 3: 1, 4: 1, 5: 0, 6: 0, 7: 0 },
          source: "clinician",
          notes: "GAD-7 screening",
        },
      },
      actor,
      context: { source: "api", requestId: "req-assess-gateway-1" },
      expectedPatientId: patientId,
    });

    assert.ok(gatewayResult);
    assert.equal((gatewayResult as any).totalScore, 3);
    assert.equal((gatewayResult as any).severity, "Minimal Anxiety");

    // 5. Service snapshot verification
    const snapshot = clinicalRecordService.snapshot(patientId, actor);
    assert.ok(Array.isArray(snapshot.vitals));
    assert.ok(Array.isArray(snapshot.psychiatricHistory));
    assert.ok(snapshot.psychiatricHistory.length >= 4);
    assert.ok(Array.isArray(snapshot.assessments));
    assert.ok(snapshot.assessments.length >= 1);
  } finally {
    process.chdir(originalCwd);
    env.NODE_ENV = originalNodeEnv;
    env.EHR_SESSION_SECRET = originalSecret;
  }
});
