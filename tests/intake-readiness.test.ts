import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_INTAKE_FRESHNESS_POLICY,
  checklistProgress,
  computeIntakeChecklist,
  estimatePatientResponsibility,
  intakePriorityScore,
  intakeStage,
  isReadyToConfirm,
  matchPlanAcceptance,
  outstandingBlockers,
  sortIntakeQueue,
  type IntakeQueueRow,
  type IntakeReadinessInput,
} from "../app/domain/intake";
import type { PatientAdministrativeRecord } from "../app/domain/patient-administration";

/**
 * Pure readiness-projection logic for Clinical Bond Intake (D-075/D-076).
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
    insuranceCardDocuments: [],
    planAcceptance: { result: "needs_review" },
    requiredConsents: [],
    signedConsents: [],
    formSubmissions: [],
    requiredFormTemplateIds: [],
    now: new Date("2026-09-17T12:00:00.000Z"),
    ...overrides,
  };
}

const INSURED_POLICY = { id: "cov-1", patientId: "patient-synthetic", payerName: "Acme Health", coverageType: "commercial" as const, isSelfPay: false, priority: 1, status: "active" as const };

test("readiness is computed from evidence, never a stored checklist", () => {
  const steps = computeIntakeChecklist(baseInput());
  const byId = new Map(steps.map((s) => [s.id, s]));

  assert.equal(byId.get("identity")!.state, "recorded", "name and valid DOB are present");
  assert.equal(byId.get("contact")!.state, "recorded", "phone and email are present");
  assert.equal(byId.get("government_id")!.state, "needed", "no ID documents supplied");
  assert.equal(byId.get("insurance_details")!.state, "needed", "no coverage policy on file");
  assert.equal(byId.get("account")!.state, "not_available", "no patient portal exists yet (P7-F)");
  assert.equal(isReadyToConfirm(steps), false);
});

test("required, optional, and conditional levels are distinguished, and blocking is explicit per step", () => {
  const steps = computeIntakeChecklist(baseInput());
  const byId = new Map(steps.map((s) => [s.id, s]));

  assert.equal(byId.get("identity")!.level, "required");
  assert.equal(byId.get("identity")!.blocking, true);
  assert.equal(byId.get("eligibility")!.blocking, false, "self-pay/no-policy patients are not blocked on eligibility");
  assert.equal(byId.get("account")!.blocking, false, "an unbuilt patient portal cannot block intake");
});

test("insurance details, insurance card, plan acceptance, and eligibility are four distinct facts", () => {
  const admin = baseAdmin({ coverage: [INSURED_POLICY] });
  const steps = computeIntakeChecklist(baseInput({ administrative: admin }));
  const byId = new Map(steps.map((s) => [s.id, s]));

  // A policy is on file, but nothing else has happened yet.
  assert.equal(byId.get("insurance_details")!.state, "recorded", "a policy is on file");
  assert.equal(byId.get("insurance_card")!.state, "needed", "no card image has been collected");
  assert.equal(byId.get("plan_acceptance")!.state, "review", "no participation configured — needs_review, not accepted");
  assert.equal(byId.get("eligibility")!.state, "needed", "no eligibility check has been recorded");
  assert.match(byId.get("eligibility")!.detail, /Not configured/i);

  // insured -> both insurance_card and plan_acceptance and eligibility become blocking
  assert.equal(byId.get("insurance_card")!.blocking, true);
  assert.equal(byId.get("plan_acceptance")!.blocking, true);
  assert.equal(byId.get("eligibility")!.blocking, true);
});

test("a card image received is not the same fact as it being reviewed, and reviewed is not the same as coverage active", () => {
  const admin = baseAdmin({ coverage: [INSURED_POLICY] });

  const received = computeIntakeChecklist(baseInput({
    administrative: admin,
    insuranceCardDocuments: [{ documentType: "insurance_card_primary", workflowStatus: "received" }],
  }));
  assert.equal(received.find((s) => s.id === "insurance_card")!.state, "review", "receipt alone is not review");

  const reviewed = computeIntakeChecklist(baseInput({
    administrative: admin,
    insuranceCardDocuments: [{ documentType: "insurance_card_primary", workflowStatus: "reviewed" }],
  }));
  assert.equal(reviewed.find((s) => s.id === "insurance_card")!.state, "recorded");
  // Reviewing the card image never claims eligibility or coverage-active facts.
  assert.equal(reviewed.find((s) => s.id === "eligibility")!.state, "needed");
});

test("insurance card evidence requires a secondary image only when a secondary policy exists", () => {
  const primaryOnly = baseAdmin({ coverage: [INSURED_POLICY] });
  const withSecondary = baseAdmin({
    coverage: [INSURED_POLICY, { id: "cov-2", patientId: "patient-synthetic", payerName: "Other Payer", coverageType: "commercial", isSelfPay: false, priority: 2, status: "active" }],
  });

  const primaryReviewedOnly = [{ documentType: "insurance_card_primary", workflowStatus: "reviewed" }];

  const onlyPrimaryNeeded = computeIntakeChecklist(baseInput({ administrative: primaryOnly, insuranceCardDocuments: primaryReviewedOnly }));
  assert.equal(onlyPrimaryNeeded.find((s) => s.id === "insurance_card")!.state, "recorded");

  const bothNeeded = computeIntakeChecklist(baseInput({ administrative: withSecondary, insuranceCardDocuments: primaryReviewedOnly }));
  assert.equal(bothNeeded.find((s) => s.id === "insurance_card")!.state, "needed", "the secondary card is still outstanding");
});

test("government ID: a reviewed document is not the same fact as identity being confirmed", () => {
  const docs = [{ id: "doc-1", documentType: "government_id", workflowStatus: "reviewed" }];

  const noReview = computeIntakeChecklist(baseInput({ governmentIdDocuments: docs }));
  assert.equal(noReview.find((s) => s.id === "government_id")!.state, "needed", "generic document review status alone never confirms identity");

  const confirmed = computeIntakeChecklist(baseInput({
    governmentIdDocuments: docs,
    identityDocumentReview: { id: "rev-1", documentId: "doc-1", reviewerName: "Staff One", result: "confirmed", legible: true, reviewedAt: "2026-09-17T00:00:00.000Z" },
  }));
  assert.equal(confirmed.find((s) => s.id === "government_id")!.state, "recorded");

  const conflict = computeIntakeChecklist(baseInput({
    governmentIdDocuments: docs,
    identityDocumentReview: { id: "rev-2", documentId: "doc-1", reviewerName: "Staff One", result: "conflict", legible: true, conflictNote: "Name differs from chart", reviewedAt: "2026-09-17T00:00:00.000Z" },
  }));
  assert.equal(conflict.find((s) => s.id === "government_id")!.state, "review", "a conflict stays unresolved until a human resolves it");
});

test("a superseded government ID reopens identity confirmation", () => {
  const superseded = [
    { id: "doc-1", documentType: "government_id", workflowStatus: "superseded" },
    { id: "doc-2", documentType: "government_id", workflowStatus: "received" },
  ];
  // The review names the OLD (now superseded) document.
  const steps = computeIntakeChecklist(baseInput({
    governmentIdDocuments: superseded,
    identityDocumentReview: { id: "rev-1", documentId: "doc-1", reviewerName: "Staff One", result: "confirmed", legible: true, reviewedAt: "2026-09-16T00:00:00.000Z" },
  }));
  assert.equal(steps.find((s) => s.id === "government_id")!.state, "needed", "the confirming review belongs to a document that is no longer current");
});

test("checklist progress counts only relevant steps, excluding not-available ones", () => {
  const steps = computeIntakeChecklist(baseInput());
  const progress = checklistProgress(steps);
  const notAvailableCount = steps.filter((s) => s.state === "not_available").length;
  assert.equal(progress.total, steps.length - notAvailableCount);
});

function readySteps(overrides: Partial<IntakeReadinessInput> = {}) {
  return computeIntakeChecklist(baseInput({
    administrative: baseAdmin({ coverage: [{ ...INSURED_POLICY, coverageType: "self-pay", isSelfPay: true }] }),
    governmentIdDocuments: [{ id: "doc-1", documentType: "government_id", workflowStatus: "reviewed" }],
    identityDocumentReview: { id: "rev-1", documentId: "doc-1", reviewerName: "Staff One", result: "confirmed", legible: true, reviewedAt: "2026-09-17T00:00:00.000Z" },
    requiredConsents: [{ id: "c1", category: "treatment", title: "Consent", version: 1, requiresGuardianSignature: false, active: true }],
    signedConsents: [{ id: "sig-1", patientId: "patient-synthetic", templateId: "c1", templateVersion: 1, signerName: "Avery Example", signerRelationship: "self", method: "staff_attested", recordedByName: "Staff One", signedAt: "2026-09-17T00:00:00.000Z" }],
    requiredFormTemplateIds: ["form-1"],
    formSubmissions: [{ id: "sub-1", patientId: "patient-synthetic", templateId: "form-1", templateVersion: 1, respondent: "staff", answers: {}, status: "submitted" }],
    payment: { id: "pay-1", patientId: "patient-synthetic", status: "waived", waiverReason: "self-pay exception", recordedAt: "2026-09-17T00:00:00.000Z" },
    episode: { guardianSituation: "not_applicable", staffReviewResolvedAt: undefined },
    ...overrides,
  }));
}

test("ready to confirm requires every blocking step, and stays false if even one is outstanding", () => {
  const nearlyReady = readySteps();
  assert.equal(isReadyToConfirm(nearlyReady), false, "staff review has not been signed off yet");
  assert.deepEqual(outstandingBlockers(nearlyReady).map((s) => s.id), ["staff_review"]);

  const ready = readySteps({ episode: { guardianSituation: "not_applicable", staffReviewResolvedAt: "2026-09-17T00:00:00.000Z" } });
  assert.equal(isReadyToConfirm(ready), true);
  assert.deepEqual(outstandingBlockers(ready), []);
});

test("plan acceptance requires affirmative configuration for THIS payer; unrelated configured payers never cause not_accepted", () => {
  const activePolicy = { id: "cov-1", patientId: "p", payerName: "Random Payer", coverageType: "commercial" as const, isSelfPay: false, priority: 1, status: "active" as const };

  assert.equal(matchPlanAcceptance(activePolicy, []).result, "needs_review", "no participation configured at all");
  assert.equal(
    matchPlanAcceptance(activePolicy, [{ id: "part-1", payerName: "A Different Payer", status: "out_of_network", active: true }]).result,
    "needs_review",
    "a different payer being explicitly excluded says nothing about this one",
  );
  assert.equal(
    matchPlanAcceptance(activePolicy, [{ id: "part-1", payerName: "Random Payer", status: "in_network", active: true }]).result,
    "accepted",
  );
  assert.equal(
    matchPlanAcceptance(activePolicy, [{ id: "part-1", payerName: "Random Payer", status: "out_of_network", active: true }]).result,
    "not_accepted",
    "an explicit out-of-network record for this exact payer",
  );
  assert.equal(
    matchPlanAcceptance(activePolicy, [{ id: "part-1", payerName: "Random Payer", status: "out_of_network", active: false }]).result,
    "needs_review",
    "an inactive configuration record no longer counts as affirmative evidence",
  );
  assert.equal(matchPlanAcceptance(undefined, []).result, "accepted", "self-pay/no-coverage patients have nothing to match");
});

test("an estimated responsibility never fabricates when evidence is thin, and distinguishes a copay estimate from coinsurance uncertainty", () => {
  const noEvidence = estimatePatientResponsibility(undefined);
  assert.equal(noEvidence.estimate, undefined);
  assert.equal(noEvidence.certain, false);

  const copay = estimatePatientResponsibility({ officeVisitCopay: "$25" });
  assert.equal(copay.estimate, "$25");
  assert.equal(copay.certain, true);

  const coinsuranceUnknownDeductible = estimatePatientResponsibility({ coinsurance: "20%" });
  assert.equal(coinsuranceUnknownDeductible.certain, false);
  assert.match(coinsuranceUnknownDeductible.estimate!, /20%/);

  const coinsuranceDeductibleMet = estimatePatientResponsibility({ coinsurance: "20%", deductibleRemaining: "$0" });
  assert.equal(coinsuranceDeductibleMet.certain, true);

  const nothingUseful = estimatePatientResponsibility({ payerMessage: "Call for details" });
  assert.equal(nothingUseful.estimate, undefined, "no fabricated number when the payer returned nothing usable");
});

test("benefit evidence stores only what was actually obtained; unreturned fields stay absent, never guessed", () => {
  const steps = computeIntakeChecklist(baseInput({
    administrative: baseAdmin({ coverage: [INSURED_POLICY] }),
    eligibility: {
      id: "elig-1",
      patientId: "patient-synthetic",
      coveragePolicyId: "cov-1",
      result: "active",
      source: "manual_staff_attestation",
      checkedAt: "2026-09-17T00:00:00.000Z",
      benefitEvidence: { officeVisitCopay: "$25" },
    },
  }));
  assert.equal(steps.find((s) => s.id === "eligibility")!.state, "recorded");
  // deductible, coinsurance, etc. were never returned and are simply absent —
  // estimatePatientResponsibility reads that directly, never a synthesized 0.
  const estimate = estimatePatientResponsibility({ officeVisitCopay: "$25" });
  assert.equal(estimate.estimate, "$25");
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

test("stale eligibility reopens the step, and a changed policy invalidates a prior check outright", () => {
  const admin = baseAdmin({ coverage: [INSURED_POLICY] });
  const now = new Date("2026-09-17T12:00:00.000Z");

  const fresh = computeIntakeChecklist(
    baseInput({
      administrative: admin,
      now,
      eligibility: { id: "elig-1", patientId: "patient-synthetic", coveragePolicyId: "cov-1", result: "active", source: "manual_staff_attestation", checkedAt: new Date(now.getTime() - 3 * 86_400_000).toISOString() },
    }),
  );
  assert.equal(fresh.find((s) => s.id === "eligibility")!.state, "recorded");

  const staleAt = new Date(now.getTime() - (DEFAULT_INTAKE_FRESHNESS_POLICY.eligibilityFreshnessDays + 1) * 86_400_000).toISOString();
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

test("the default queue sort favors near appointments, blocking issues, insurance problems, and waiting time — but stays overridable", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");
  const readySoon: IntakeQueueRow = {
    episode: { id: "e1", patientId: "p1", guardianSituation: "not_applicable", dispositionStatus: "active", createdAt: now.toISOString(), updatedAt: now.toISOString(), appointmentId: "a1" },
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
    episode: { id: "e2", patientId: "p2", guardianSituation: "not_applicable", dispositionStatus: "active", createdAt: now.toISOString(), updatedAt: new Date(now.getTime() - 5 * 86_400_000).toISOString(), appointmentId: "a2" },
    appointmentId: "a2",
    appointmentStatus: "tentative",
    appointmentDate: "2026-09-17",
    appointmentTime: "02:00 PM",
    patientId: "p2",
    patientName: "Tomorrow Patient",
    stage: "insurance_issue",
    steps: [{ id: "insurance_details", label: "Insurance", level: "required", blocking: true, owner: "patient", state: "needed", detail: "" }],
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

test("a prospective-person queue row carries no patientId, and vice versa", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");
  const prospectRow: IntakeQueueRow = {
    episode: { id: "e3", prospectivePersonId: "prospect-1", guardianSituation: "not_applicable", dispositionStatus: "active", createdAt: now.toISOString(), updatedAt: now.toISOString(), appointmentId: "a3" },
    appointmentId: "a3",
    appointmentStatus: "tentative",
    appointmentDate: "2026-09-20",
    appointmentTime: "10:00 AM",
    prospectivePersonId: "prospect-1",
    patientName: "New Caller",
    stage: "tentative",
    steps: [],
    planAcceptance: "accepted",
  };
  assert.equal(prospectRow.patientId, undefined);
  assert.equal(prospectRow.episode.patientId, undefined);
  assert.equal(prospectRow.prospectivePersonId, "prospect-1");

  // intakeStage / sorting work identically regardless of subject kind — they
  // never branch on patient vs. prospect, only on the steps/appointment given.
  const outstandingStep = { id: "identity" as const, label: "Identity", level: "required" as const, blocking: true, owner: "patient" as const, state: "needed" as const, detail: "" };
  assert.equal(intakeStage("tentative", [outstandingStep], "accepted"), "waiting_on_patient");
});
