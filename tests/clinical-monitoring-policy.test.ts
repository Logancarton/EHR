import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateMonitoringStatus,
  medicationProtocols,
  resolveMonitoringRules,
  type LabObservation,
} from "../app/lib/clinical-protocols";

test("monitoring policy resolves system -> practice -> provider -> patient", () => {
  const practice = resolveMonitoringRules([
    { ruleId: "lithium-level", intervalDays: 365 },
  ]);
  assert.equal(practice.find((rule) => rule.id === "lithium-level")?.intervalDays, 365);
  assert.equal(practice.find((rule) => rule.id === "lithium-level")?.source, "practice");

  const provider = resolveMonitoringRules(
    [{ ruleId: "lithium-level", intervalDays: 365 }],
    [{ ruleId: "lithium-level", intervalDays: 120, dueSoonDays: 21 }],
  );
  assert.equal(provider.find((rule) => rule.id === "lithium-level")?.intervalDays, 120);
  assert.equal(provider.find((rule) => rule.id === "lithium-level")?.dueSoonDays, 21);
  assert.equal(provider.find((rule) => rule.id === "lithium-level")?.source, "provider");

  const patient = resolveMonitoringRules(
    [{ ruleId: "lithium-level", intervalDays: 365 }],
    [{ ruleId: "lithium-level", intervalDays: 120 }],
    [{ ruleId: "lithium-level", intervalDays: 30, reason: "Short-term post-dose-change monitoring." }],
  );
  const lithium = patient.find((rule) => rule.id === "lithium-level");
  assert.equal(lithium?.intervalDays, 30);
  assert.equal(lithium?.source, "patient");
  assert.equal(lithium?.policyReason, "Short-term post-dose-change monitoring.");
});

test("one medication can carry separate lab rules with independent intervals", () => {
  const rules = resolveMonitoringRules([
    { ruleId: "lithium-level", intervalDays: 365 },
    { ruleId: "lithium-renal", intervalDays: 180 },
    { ruleId: "lithium-tsh", intervalDays: 90 },
  ]);
  const lithiumRules = rules.filter((rule) => rule.medicationKeyword === "lithium");
  assert.equal(lithiumRules.length, 3);
  assert.deepEqual(
    lithiumRules.map((rule) => [rule.id, rule.intervalDays]),
    [
      ["lithium-level", 365],
      ["lithium-renal", 180],
      ["lithium-tsh", 90],
    ],
  );
});

test("monitoring evaluation uses the resolved interval and current evidence instead of a hard-coded date", () => {
  const evidence: LabObservation[] = [
    {
      id: "combined",
      testName: "Serum Lithium Level, BUN/Creatinine, & TSH",
      code: "14334-7",
      date: "2026-02-15",
      value: "Lithium 0.68, Cr 1.0, TSH 2.1",
      unit: "multi",
      referenceRange: "recorded",
      orderedBy: "Example",
      kind: "lab",
    },
  ];

  const practiceRules = resolveMonitoringRules([
    { ruleId: "lithium-level", intervalDays: 365, dueSoonDays: 30, overdueGraceDays: 14 },
    { ruleId: "lithium-renal", intervalDays: 365, dueSoonDays: 30, overdueGraceDays: 14 },
    { ruleId: "lithium-tsh", intervalDays: 365, dueSoonDays: 30, overdueGraceDays: 14 },
  ]);

  const result = calculateMonitoringStatus(
    ["Lithium Carbonate 600 mg BID"],
    evidence,
    { protocols: practiceRules, referenceDate: new Date("2026-09-23T00:00:00Z") },
  );

  assert.equal(result.length, 3);
  assert.ok(result.every((item) => item.status === "current"));
  assert.ok(result.every((item) => item.policySource === "practice"));

  const providerRules = resolveMonitoringRules(
    [],
    [{ ruleId: "lithium-level", intervalDays: 120, dueSoonDays: 14, overdueGraceDays: 7 }],
  );
  const providerResult = calculateMonitoringStatus(
    ["Lithium Carbonate 600 mg BID"],
    evidence,
    { protocols: providerRules, referenceDate: new Date("2026-09-23T00:00:00Z") },
  );
  assert.equal(providerResult.find((item) => item.ruleId === "lithium-level")?.status, "overdue");
});

test("vital-sign rules consume vital evidence rather than lab evidence", () => {
  const vital: LabObservation = {
    id: "vital-1",
    testName: "Resting Blood Pressure & Pulse",
    code: "85354-9",
    date: "2026-09-01",
    value: "116/74, HR 68",
    unit: "mmHg",
    referenceRange: "recorded",
    orderedBy: "Clinical record",
    kind: "vital",
  };

  const rule = medicationProtocols.find((item) => item.id === "guanfacine-vitals");
  assert.ok(rule);
  const result = calculateMonitoringStatus(
    ["Guanfacine ER 2 mg nightly"],
    [vital],
    { protocols: [rule!], referenceDate: new Date("2026-09-23T00:00:00Z") },
  );
  assert.equal(result[0]?.status, "current");
  assert.equal(result[0]?.measureKind, "vital");
});
