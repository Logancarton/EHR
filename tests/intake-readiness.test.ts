import test from "node:test";
import assert from "node:assert/strict";
import {
  ELIGIBILITY_FRESHNESS_DAYS,
  checklistProgress,
  computeIntakeChecklist,
  intakePriorityScore,
  intakeStage,
  isReadyToConfirm,
  matchPlanAcceptance,
  sortIntakeQueue,
  type IntakeQueueRow,
  type IntakeReadinessInput,
} from "../app/domain/intake";
import type { PatientAdministrativeRecord } from "../app/domain/patient-administration";

/**
 * Pure readiness-projection logic for Clinical Bond Intake (D-075).
 *
 * These never touch SQLite: readiness is a projection over evidence the
 * caller supplies, so it can be exercised as ordinary pure-function input and
 * output without standing up the database.
 */

function baseAdmin(overrides: Partial<PatientAdministrativeRecord> = {}): PatientAdministrativeRecord {
  return {
    patientId: "patient-synthetic",
    identity: { legalName: "Avery Example", dob: "1990-01-01", pronouns: "she/her", mrn: "SYN-1", recordStatus: "active" },
    contact: { mobilePhone: "555-010-2345", email: "avery@example.test", allowVoicemail: true, allowSms: true, allowEmail: true },
    relatedPeople: [],
    careNetwork: [],
    coverage: [],
    pharmacies: [],
    ...overrides,
  };
}

function baseInput(overrides: Partial<IntakeReadinessInput> = {}): IntakeReadinessInput {
  return {
    administrative: baseAdmin(),
    appointment: { status: "tentative", intakeStatus: "pending" },
    episode: { guardianSituation: "not_applicable", staffReviewResolvedAt: undefined },
    governmentIdDocuments: [],
    planAcceptance: { result: "needs_review" },
    requiredConsents: [],
    signedConsents: [],
    formSubmissions: [],
    requiredFormTemplateIds: [],
    now: new Date("2026-09-17T12:00:00.000Z"),
    ...overrides,
  };
}

test("readiness is computed from evidence, never a stored checklist", () => {
  const steps = computeIntakeChecklist(baseInput());
  const byId = new Map(steps.map((s) => [s.id, s]));

  assert.equal(byId.get("identity")!.state, "recorded", "name and valid DOB are present");
  assert.equal(byId.get("contact")!.state, "recorded", "phone and email are present");
  assert.equal(byId.get("government_id")!.state, "needed", "no ID documents supplied");
  assert.equal(byId.get("coverage")!.state, "needed", "no coverage policy on file");
  assert.equal(byId.get("account")!.state, "not_available", "no patient portal exists yet (P7-F)");
  assert.equal(isReadyToConfirm(steps), false);
});

test("required, optional, and conditional levels are distinguished, and blocking is explicit per step", () => {
  const steps = computeIntakeChecklist(baseInput());
  const byId = new Map(steps.map((s) => [s.id, s]));

  assert.equal(byId.get("identity")!.level, "required");
  assert.equal(byId.get("identity")!.blocking, true);
  assert.equal(byId.get("eligibility")!.level, "conditional");
  assert.equal(byId.get("eligibility")!.blocking, false, "eligibility informs the insurance-issue stage but does not itself block confirming");
  assert.equal(byId.get("account")!.blocking, false, "an unbuilt patient portal cannot block intake");
});

test("insurance card on file is not the same fact as eligibility checked", () => {
  const admin = baseAdmin({
    coverage: [{ id: "cov-1", patientId: "patient-synthetic", payerName: "Acme Health", coverageType: "commercial", isSelfPay: false, priority: 1, status: "active" }],
  });
  const steps = computeIntakeChecklist(baseInput({ administrative: admin }));
  const byId = new Map(steps.map((s) => [s.id, s]));

  assert.equal(byId.get("coverage")!.state, "recorded", "a policy is on file");
  assert.equal(byId.get("eligibility")!.state, "needed", "no eligibility check has been recorded for it");
  assert.match(byId.get("eligibility")!.detail, /Not configured/i);
});

test("eligibility being active is not the same fact as the plan being accepted by the practice", () => {
  const admin = baseAdmin({
    coverage: [{ id: "cov-1", patientId: "patient-synthetic", payerName: "Acme Health", coverageType: "commercial", isSelfPay: false, priority: 1, status: "active" }],
  });
  const steps = computeIntakeChecklist(
    baseInput({
      administrative: admin,
      eligibility: { id: "elig-1", patientId: "patient-synthetic", coveragePolicyId: "cov-1", result: "active", source: "manual_staff_attestation", checkedAt: "2026-09-17T00:00:00.000Z" },
      planAcceptance: { result: "not_accepted" },
    }),
  );
  const byId = new Map(steps.map((s) => [s.id, s]));

  assert.equal(byId.get("eligibility")!.state, "recorded", "coverage is active and the check is fresh");
  // Plan acceptance is a separate axis entirely, surfaced through intakeStage
  // rather than the eligibility step — active coverage never implies the
  // practice participates with that payer.
  const stage = intakeStage("tentative", steps, "not_accepted");
  assert.equal(stage, "insurance_issue");
});

test("stale eligibility reopens the step, and a changed policy invalidates a prior check outright", () => {
  const admin = baseAdmin({
    coverage: [{ id: "cov-1", patientId: "patient-synthetic", payerName: "Acme Health", coverageType: "commercial", isSelfPay: false, priority: 1, status: "active" }],
  });
  const now = new Date("2026-09-17T12:00:00.000Z");

  const fresh = computeIntakeChecklist(
    baseInput({
      administrative: admin,
      now,
      eligibility: { id: "elig-1", patientId: "patient-synthetic", coveragePolicyId: "cov-1", result: "active", source: "manual_staff_attestation", checkedAt: new Date(now.getTime() - 3 * 86_400_000).toISOString() },
    }),
  );
  assert.equal(fresh.find((s) => s.id === "eligibility")!.state, "recorded");

  const staleAt = new Date(now.getTime() - (ELIGIBILITY_FRESHNESS_DAYS + 1) * 86_400_000).toISOString();
  const stale = computeIntakeChecklist(
    baseInput({
      administrative: admin,
      now,
      eligibility: { id: "elig-1", patientId: "patient-synthetic", coveragePolicyId: "cov-1", result: "active", source: "manual_staff_attestation", checkedAt: staleAt },
    }),
  );
  assert.equal(stale.find((s) => s.id === "eligibility")!.state, "needed", "past the freshness window, a prior active result is not trusted");

  // The example from the product spec: insurance changes after eligibility was
  // checked, so the prior check no longer applies to the current policy.
  const changedPolicy = computeIntakeChecklist(
    baseInput({
      administrative: baseAdmin({
        coverage: [{ id: "cov-2", patientId: "patient-synthetic", payerName: "New Payer", coverageType: "commercial", isSelfPay: false, priority: 1, status: "active" }],
      }),
      now,
      eligibility: { id: "elig-1", patientId: "patient-synthetic", coveragePolicyId: "cov-1", result: "active", source: "manual_staff_attestation", checkedAt: new Date(now.getTime() - 3600_000).toISOString() },
    }),
  );
  assert.equal(changedPolicy.find((s) => s.id === "eligibility")!.state, "needed", "the check on file belongs to a policy the patient no longer has");
});

test("a minor's chart requires guardian resolution; an adult's does not", () => {
  const adultSteps = computeIntakeChecklist(baseInput({ now: new Date("2026-09-17T00:00:00.000Z") }));
  const guardianAdult = adultSteps.find((s) => s.id === "guardian")!;
  assert.equal(guardianAdult.state, "not_available");
  assert.equal(guardianAdult.blocking, false);

  const minorAdmin = baseAdmin({ identity: { legalName: "Young Patient", dob: "2015-01-01", pronouns: "they/them", mrn: "SYN-2", recordStatus: "active" } });

  const unknownGuardian = computeIntakeChecklist(
    baseInput({ administrative: minorAdmin, now: new Date("2026-09-17T00:00:00.000Z"), episode: { guardianSituation: "unknown_needs_review", staffReviewResolvedAt: undefined } }),
  );
  const guardianStep = unknownGuardian.find((s) => s.id === "guardian")!;
  assert.equal(guardianStep.level, "required");
  assert.equal(guardianStep.blocking, true);
  assert.equal(guardianStep.state, "review", "not yet established, needs staff to ask");

  const resolvedGuardian = computeIntakeChecklist(
    baseInput({ administrative: minorAdmin, now: new Date("2026-09-17T00:00:00.000Z"), episode: { guardianSituation: "joint_requires_multiple", staffReviewResolvedAt: undefined } }),
  );
  assert.equal(resolvedGuardian.find((s) => s.id === "guardian")!.state, "recorded");
});

test("checklist progress counts only relevant steps, excluding not-available ones", () => {
  const steps = computeIntakeChecklist(baseInput());
  const progress = checklistProgress(steps);
  const notAvailableCount = steps.filter((s) => s.state === "not_available").length;
  assert.equal(progress.total, steps.length - notAvailableCount);
});

test("ready to confirm requires every blocking step, and stays false if even one is outstanding", () => {
  const admin = baseAdmin({
    coverage: [{ id: "cov-1", patientId: "patient-synthetic", payerName: "Acme", coverageType: "self-pay", isSelfPay: true, priority: 1, status: "active" }],
  });
  const nearlyReady = computeIntakeChecklist(
    baseInput({
      administrative: admin,
      governmentIdDocuments: [{ documentType: "government_id", workflowStatus: "reviewed" }],
      requiredConsents: [{ id: "c1", category: "treatment", title: "Consent", version: 1, requiresGuardianSignature: false, active: true }],
      signedConsents: [{ id: "sig-1", patientId: "patient-synthetic", templateId: "c1", templateVersion: 1, signerName: "Avery Example", signerRelationship: "self", method: "staff_attested", recordedByName: "Staff One", signedAt: "2026-09-17T00:00:00.000Z" }],
      requiredFormTemplateIds: ["form-1"],
      formSubmissions: [{ id: "sub-1", patientId: "patient-synthetic", templateId: "form-1", templateVersion: 1, respondent: "staff", answers: {}, status: "submitted" }],
      payment: { id: "pay-1", patientId: "patient-synthetic", status: "waived", waiverReason: "self-pay exception", recordedAt: "2026-09-17T00:00:00.000Z" },
      episode: { guardianSituation: "not_applicable", staffReviewResolvedAt: undefined },
    }),
  );
  assert.equal(isReadyToConfirm(nearlyReady), false, "staff review has not been signed off yet");

  const ready = computeIntakeChecklist(
    baseInput({
      administrative: admin,
      governmentIdDocuments: [{ documentType: "government_id", workflowStatus: "reviewed" }],
      requiredConsents: [{ id: "c1", category: "treatment", title: "Consent", version: 1, requiresGuardianSignature: false, active: true }],
      signedConsents: [{ id: "sig-1", patientId: "patient-synthetic", templateId: "c1", templateVersion: 1, signerName: "Avery Example", signerRelationship: "self", method: "staff_attested", recordedByName: "Staff One", signedAt: "2026-09-17T00:00:00.000Z" }],
      requiredFormTemplateIds: ["form-1"],
      formSubmissions: [{ id: "sub-1", patientId: "patient-synthetic", templateId: "form-1", templateVersion: 1, respondent: "staff", answers: {}, status: "submitted" }],
      payment: { id: "pay-1", patientId: "patient-synthetic", status: "waived", waiverReason: "self-pay exception", recordedAt: "2026-09-17T00:00:00.000Z" },
      episode: { guardianSituation: "not_applicable", staffReviewResolvedAt: "2026-09-17T00:00:00.000Z" },
    }),
  );
  assert.equal(isReadyToConfirm(ready), true);
});

test("plan acceptance is never inferred from active coverage; an unconfigured payer is needs-review, not accepted", () => {
  const activePolicy = { id: "cov-1", patientId: "p", payerName: "Random Payer", coverageType: "commercial" as const, isSelfPay: false, priority: 1, status: "active" as const };

  assert.equal(matchPlanAcceptance(activePolicy, []).result, "needs_review", "no participation configured at all");
  assert.equal(
    matchPlanAcceptance(activePolicy, [{ id: "part-1", payerName: "A Different Payer", active: true }]).result,
    "not_accepted",
    "participations exist but this payer is not one of them",
  );
  assert.equal(
    matchPlanAcceptance(activePolicy, [{ id: "part-1", payerName: "Random Payer", active: true }]).result,
    "accepted",
  );
  assert.equal(matchPlanAcceptance(undefined, []).result, "accepted", "self-pay/no-coverage patients have nothing to match");
});

test("the default queue sort favors near appointments, blocking issues, insurance problems, and waiting time — but stays overridable", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");
  const readySoon: IntakeQueueRow = {
    episode: { id: "e1", patientId: "p1", appointmentId: "a1", guardianSituation: "not_applicable", dispositionStatus: "active", createdAt: now.toISOString(), updatedAt: now.toISOString() },
    appointmentId: "a1",
    appointmentStatus: "tentative",
    appointmentDate: "2026-09-30",
    appointmentTime: "09:00 AM",
    patientId: "p1",
    patientName: "Far Out Patient",
    stage: "ready_to_confirm",
    steps: [],
    planAcceptance: "accepted",
  };
  const urgentBlocked: IntakeQueueRow = {
    episode: { id: "e2", patientId: "p2", appointmentId: "a2", guardianSituation: "not_applicable", dispositionStatus: "active", createdAt: now.toISOString(), updatedAt: new Date(now.getTime() - 5 * 86_400_000).toISOString() },
    appointmentId: "a2",
    appointmentStatus: "tentative",
    appointmentDate: "2026-09-17",
    appointmentTime: "02:00 PM",
    patientId: "p2",
    patientName: "Tomorrow Patient",
    stage: "insurance_issue",
    steps: [{ id: "coverage", label: "Insurance", level: "required", blocking: true, owner: "patient", state: "needed", detail: "" }],
    planAcceptance: "not_accepted",
  };

  const sorted = sortIntakeQueue([readySoon, urgentBlocked], now);
  assert.equal(sorted[0].patientId, "p2", "near, blocked, insurance-issue, and long-waiting outranks a distant ready case");

  // Manual override: a caller can always re-sort by a single dimension instead
  // of the composite priority score.
  const byDate = [...[readySoon, urgentBlocked]].sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate));
  assert.equal(byDate[0].patientId, "p2");

  assert.ok(intakePriorityScore(urgentBlocked, now) > intakePriorityScore(readySoon, now));
});
