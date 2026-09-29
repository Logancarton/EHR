import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCockcroftGault,
  calculateBmiAndMetabolic,
  calculateQtc,
  calculateDaysLater,
} from "../app/domain/medical-calculators";

test("Cockcroft-Gault CrCl calculates accurately for male and female patients", () => {
  // 60-year-old male, 70kg, SCr 1.0 mg/dL:
  // CrCl = ((140 - 60) * 70) / (72 * 1.0) = 5600 / 72 = 77.8 mL/min
  const maleResult = calculateCockcroftGault({
    age: 60,
    sex: "male",
    weightKg: 70,
    serumCreatinineMgDl: 1.0,
  });
  assert.ok(maleResult);
  assert.equal(maleResult.crClMlMin, 77.8);
  assert.equal(maleResult.severity, "mild");

  // 60-year-old female, 70kg, SCr 1.0 mg/dL:
  // CrCl = 77.78 * 0.85 = 66.1 mL/min
  const femaleResult = calculateCockcroftGault({
    age: 60,
    sex: "female",
    weightKg: 70,
    serumCreatinineMgDl: 1.0,
  });
  assert.ok(femaleResult);
  assert.equal(femaleResult.crClMlMin, 66.1);

  // Severe renal impairment check:
  const severeResult = calculateCockcroftGault({
    age: 75,
    sex: "female",
    weightKg: 50,
    serumCreatinineMgDl: 2.2,
  });
  assert.ok(severeResult);
  assert.ok(severeResult.crClMlMin < 30);
  assert.equal(severeResult.severity, "severe");
  assert.match(severeResult.lithiumGuidance, /CONTRAINDICATED/);
});

test("BMI and metabolic surveillance evaluates CDC classes and psychotropic risk", () => {
  // 160 lbs, 68 inches: (160 * 703) / 4624 = 24.3 (Normal)
  const normalResult = calculateBmiAndMetabolic({ weightLbs: 160, heightIn: 68 });
  assert.ok(normalResult);
  assert.equal(normalResult.bmi, 24.3);
  assert.equal(normalResult.severity, "normal");

  // 210 lbs, 68 inches: (210 * 703) / 4624 = 31.9 (Obese Class I)
  const obeseResult = calculateBmiAndMetabolic({ weightLbs: 210, heightIn: 68 });
  assert.ok(obeseResult);
  assert.equal(obeseResult.bmi, 31.9);
  assert.equal(obeseResult.severity, "severe");
  assert.match(obeseResult.category, /Obesity Class I/);

  // Metric conversion check: 70kg, 175cm
  const metricResult = calculateBmiAndMetabolic({ weightKg: 70, heightCm: 175 });
  assert.ok(metricResult);
  assert.ok(metricResult.bmi >= 22.8 && metricResult.bmi <= 23.0);
});

test("QTc interval calculator computes Bazett and Fridericia with psychotropic alerts", () => {
  // QT 400ms, HR 60bpm: RR = 1.0s, QTc Bazett = 400ms (Normal)
  const normalResult = calculateQtc({
    qtMs: 400,
    heartRateBpm: 60,
    sex: "male",
  });
  assert.ok(normalResult);
  assert.equal(normalResult.qtcBazettMs, 400);
  assert.equal(normalResult.qtcFridericiaMs, 400);
  assert.equal(normalResult.severity, "normal");

  // QT 480ms, HR 75bpm: RR = 0.8s, QTc Bazett = 480 / sqrt(0.8) = 480 / 0.8944 = 537ms (Critical)
  const criticalResult = calculateQtc({
    qtMs: 480,
    heartRateBpm: 75,
    sex: "male",
  });
  assert.ok(criticalResult);
  assert.equal(criticalResult.qtcBazettMs, 537);
  assert.equal(criticalResult.severity, "critical");
  assert.match(criticalResult.clinicalAlert, /Torsades de Pointes/);
});

test("Days-later follow-up calculator flags weekends and formats dates", () => {
  const result = calculateDaysLater({
    baseDate: "2026-10-01", // Thursday
    days: 14,
  });
  assert.equal(result.targetDate, "2026-10-15");
  assert.equal(result.dayOfWeek, "Thursday");
  assert.equal(result.isWeekend, false);

  const weekendResult = calculateDaysLater({
    baseDate: "2026-10-01", // Thursday
    days: 16, // Saturday Oct 17
  });
  assert.equal(weekendResult.dayOfWeek, "Saturday");
  assert.equal(weekendResult.isWeekend, true);
  assert.match(weekendResult.weekendWarning, /Saturday/);
});
