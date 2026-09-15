import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";
import {
  calculateBmi,
  bmiCategory,
  evaluateVitalFlags,
} from "../app/domain/clinical-measurements";

test("P3-D: Domain calculation and safety flag logic", () => {
  // BMI calculation
  const bmi = calculateBmi(150, 65);
  assert.equal(bmi, 25.0);
  assert.equal(bmiCategory(bmi), "Overweight");

  const bmiNormal = calculateBmi(135, 65);
  assert.equal(bmiNormal, 22.5);
  assert.equal(bmiCategory(bmiNormal), "Normal weight");

  // Blood pressure evaluation
  const normalFlags = evaluateVitalFlags({ systolic: 118, diastolic: 76 });
  assert.equal(normalFlags.length, 0);

  const stage1Flags = evaluateVitalFlags({ systolic: 132, diastolic: 82 });
  assert.ok(stage1Flags.some((f) => f.label === "Stage 1 Hypertension"));

  const stage2Flags = evaluateVitalFlags({ systolic: 144, diastolic: 92 });
  assert.ok(stage2Flags.some((f) => f.label === "Stage 2 Hypertension"));

  const crisisFlags = evaluateVitalFlags({ systolic: 184, diastolic: 122 });
  assert.ok(crisisFlags.some((f) => f.label === "Hypertensive Crisis" && f.severity === "critical"));

  // Heart rate thresholds
  const tachyFlags = evaluateVitalFlags({ heartRate: 118 });
  assert.ok(tachyFlags.some((f) => f.label === "Tachycardia"));

  const bradyFlags = evaluateVitalFlags({ heartRate: 46 });
  assert.ok(bradyFlags.some((f) => f.label === "Bradycardia"));

  // Weight shift surveillance (>=7%)
  const gainFlags = evaluateVitalFlags({ weightLbs: 162 }, 150);
  assert.ok(gainFlags.some((f) => f.type === "weight_change" && f.label.includes("Weight Gain (>=7%)")));

  const minorGainFlags = evaluateVitalFlags({ weightLbs: 152 }, 150);
  assert.equal(minorGainFlags.some((f) => f.type === "weight_change"), false);

  const lossFlags = evaluateVitalFlags({ weightLbs: 138 }, 150);
  assert.ok(lossFlags.some((f) => f.type === "weight_change" && f.label.includes("Weight Loss (>=7%)")));
});

test("P3-D: Longitudinal vitals storage, auto-BMI, and gateway integration", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-vitals-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-vitals-secret-0123456789abcdef";

  try {
    const [
      { ensureClinicalRecordFoundation },
      { getDatabase },
      { MeasurementRepository },
      { ClinicalActionGateway },
    ] = await Promise.all([
      import("../app/server/db/clinical-record-foundation"),
      import("../app/server/db/connection"),
      import("../app/server/repositories/measurement-repository"),
      import("../app/server/actions/clinical-action-gateway"),
    ]);

    const db = getDatabase();
    ensureClinicalRecordFoundation(db);

    const actor = {
      userId: "user-vitals-tester",
      displayName: "Dr. Alex Taylor, MD",
      role: "provider" as const,
      capabilities: ["read_clinical", "manage_clinical_record", "edit_draft"] as any,
    };
    await grantSyntheticOrganizationAccess([actor.userId]);

    const patientId = "maya-chen";

    // 1. Direct MeasurementRepository recordVitals
    const summary = MeasurementRepository.recordVitals(
      {
        patientId,
        systolic: 124,
        diastolic: 78,
        heartRate: 70,
        weightLbs: 136,
        heightIn: 65,
        oxygenSaturation: 99,
        temperatureF: 98.4,
        respiratoryRate: 14,
        notes: "Routine pre-visit check",
      },
      { userId: actor.userId, displayName: actor.displayName },
    );

    assert.equal(summary.systolic, 124);
    assert.equal(summary.diastolic, 78);
    assert.equal(summary.bpText, "124/78");
    assert.equal(summary.heartRate, 70);
    assert.equal(summary.weightLbs, 136);
    assert.equal(summary.heightIn, 65);
    assert.equal(summary.bmi, 22.6);
    assert.equal(summary.bmiCategory, "Normal weight");
    assert.equal(summary.oxygenSaturation, 99);

    // 2. Query listVitals
    const list = MeasurementRepository.listVitals(patientId);
    assert.ok(list.length > 0);
    const matched = list.find((v) => v.recordedAt === summary.recordedAt);
    assert.ok(matched);
    assert.equal(matched?.systolic, 124);

    // 3. ClinicalActionGateway execution
    const gatewayResult = await ClinicalActionGateway.execute({
      action: {
        type: "record_vitals",
        payload: {
          patientId,
          systolic: 134,
          diastolic: 84,
          heartRate: 82,
          weightLbs: 140,
          heightIn: 65,
          notes: "Gateway action test",
        },
      },
      actor,
      context: { source: "api", requestId: "req-vitals-1" },
      expectedPatientId: patientId,
    });

    assert.ok(gatewayResult);
    assert.equal((gatewayResult as any).bpText, "134/84");
    assert.equal((gatewayResult as any).heartRate, 82);
  } finally {
    process.chdir(originalCwd);
    env.NODE_ENV = originalNodeEnv;
    env.EHR_SESSION_SECRET = originalSecret;
  }
});
