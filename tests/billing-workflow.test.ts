import test from "node:test";
import assert from "node:assert/strict";
import {
  UNCONFIGURED_BILLING_TRANSPORT,
  billingChargeBlockers,
  billingChargeIsReviewable,
  type BillingChargeRecord,
} from "../app/domain/billing";
import {
  billingWorkflowPriority,
  buildBillingWorkflow,
  daysSinceService,
  nextWorkflowStep,
  workflowAttention,
  workflowProgress,
  type BillingWorkflowAwaitingInput,
  type BillingWorkflowChargeInput,
} from "../app/domain/billing-workflow";

/**
 * The billing workflow queue (BILL-05, D-105) is a projection. What is asserted
 * is what would be wrong if it failed:
 *
 * - its stage agrees with the server's own review rule, so the queue cannot call
 *   a charge ready that the review action would refuse;
 * - an unbilled encounter is not shown as missing codes nobody has read yet;
 * - no step ever reports a transmission, and submission never counts as progress;
 * - absent coverage and unpriced lines are raised without blocking review, and
 *   neither is rendered as self-pay or $0.00.
 */

const synthetic = {
  organizationId: "org-synthetic",
  patientId: "patient-synthetic",
  patientName: "Synthetic Patient",
  patientMrn: "MRN-0001",
  encounterType: "Follow-up",
};

function charge(overrides: Partial<BillingChargeRecord> = {}): BillingWorkflowChargeInput {
  const record: BillingChargeRecord = {
    id: "charge-1",
    organizationId: synthetic.organizationId,
    patientId: synthetic.patientId,
    encounterId: "enc-1",
    encounterSnapshotSha256: "a".repeat(64),
    serviceDate: "2026-09-01",
    status: "prepared",
    procedureCodes: [{ code: "99214", codingSystem: "CPT", description: "Office visit", units: 1, feeCents: 18_000 }],
    diagnosisCodes: [{ code: "F41.1", codingSystem: "ICD-10-CM", display: "Generalized anxiety disorder", referenceId: "ref-1" }],
    coverageBasis: "policy-on-file",
    coverageId: "cov-1",
    coveragePayerName: "Synthetic Health Plan",
    placeOfService: "11",
    chargeTemplateId: null,
    chargeTemplateName: null,
    preparedBy: "user-1",
    preparedByName: "Taylor",
    preparedAt: "2026-09-02T12:00:00.000Z",
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: null,
    voidedBy: null,
    voidedAt: null,
    voidReason: null,
    version: 1,
    createdAt: "2026-09-02T12:00:00.000Z",
    updatedAt: "2026-09-02T12:00:00.000Z",
    ...overrides,
  };
  return {
    ...record,
    patientName: synthetic.patientName,
    patientMrn: synthetic.patientMrn,
    encounterType: synthetic.encounterType,
    blockers: billingChargeBlockers(record),
    reviewable: billingChargeIsReviewable(record),
  };
}

function awaiting(overrides: Partial<BillingWorkflowAwaitingInput> = {}): BillingWorkflowAwaitingInput {
  return {
    encounterId: "enc-2",
    patientId: synthetic.patientId,
    patientName: synthetic.patientName,
    patientMrn: synthetic.patientMrn,
    encounterType: synthetic.encounterType,
    serviceDate: "2026-09-10",
    signedAt: "2026-09-10T18:00:00.000Z",
    cptCode: "99213",
    ...overrides,
  };
}

function build(input: { charges?: BillingWorkflowChargeInput[]; awaitingCharge?: BillingWorkflowAwaitingInput[] }) {
  return buildBillingWorkflow({
    charges: input.charges ?? [],
    awaitingCharge: input.awaitingCharge ?? [],
    transport: UNCONFIGURED_BILLING_TRANSPORT,
  });
}

test("stages follow the server's review rule, not a second one", () => {
  const items = build({
    charges: [
      charge({ id: "ready", encounterId: "e-ready" }),
      charge({ id: "no-dx", encounterId: "e-no-dx", diagnosisCodes: [] }),
      charge({ id: "no-cpt", encounterId: "e-no-cpt", procedureCodes: [] }),
      charge({ id: "done", encounterId: "e-done", status: "reviewed", reviewedByName: "Morgan", reviewedAt: "2026-09-03T00:00:00.000Z" }),
      charge({ id: "void", encounterId: "e-void", status: "void", voidReason: "Duplicate" }),
    ],
    awaitingCharge: [awaiting()],
  });
  const stageOf = (key: string) => items.find((item) => item.key === key)?.stage;

  assert.equal(stageOf("e-ready"), "ready_for_review");
  assert.equal(stageOf("e-no-dx"), "coding_incomplete");
  assert.equal(stageOf("e-no-cpt"), "coding_incomplete");
  assert.equal(stageOf("e-done"), "reviewed");
  assert.equal(stageOf("e-void"), "void");
  assert.equal(stageOf("enc-2"), "needs_charge");

  for (const item of items) {
    if (!item.charge) continue;
    assert.equal(
      item.stage === "ready_for_review",
      item.charge.reviewable,
      `${item.key}: "Ready for review" must match whether the review action would accept it`,
    );
  }
});

test("the next step names the blocker and who resolves it", () => {
  const [noDx] = build({ charges: [charge({ diagnosisCodes: [] })] });
  assert.equal(nextWorkflowStep(noDx.steps)?.id, "diagnosis");
  assert.equal(nextWorkflowStep(noDx.steps)?.owner, "Clinician");

  const [unbilled] = build({ awaitingCharge: [awaiting()] });
  assert.equal(nextWorkflowStep(unbilled.steps)?.id, "charge");
  assert.equal(nextWorkflowStep(unbilled.steps)?.owner, "Billing");

  const [ready] = build({ charges: [charge()] });
  assert.equal(nextWorkflowStep(ready.steps)?.id, "review");

  const [reviewed] = build({ charges: [charge({ status: "reviewed" })] });
  assert.equal(nextWorkflowStep(reviewed.steps), undefined, "a reviewed charge has no blocking work left here");
});

test("an unbilled encounter is not shown as missing facts nobody has read yet", () => {
  const [item] = build({ awaitingCharge: [awaiting()] });
  const state = (id: string) => item.steps.find((step) => step.id === id)?.state;

  assert.equal(state("signed"), "recorded");
  assert.equal(state("charge"), "needed");
  assert.equal(state("procedure"), "recorded");
  for (const id of ["diagnosis", "coverage", "fees", "review"]) {
    assert.equal(state(id), "pending", `${id} is unknown before preparation, not missing`);
  }

  const [noCode] = build({ awaitingCharge: [awaiting({ cptCode: "" })] });
  assert.equal(noCode.steps.find((step) => step.id === "procedure")?.state, "needed");
});

test("no step reports a transmission, and submission never counts as progress", () => {
  const [reviewed] = build({ charges: [charge({ status: "reviewed" })] });
  const submission = reviewed.steps.find((step) => step.id === "submission")!;

  assert.equal(submission.state, "not_available");
  assert.match(submission.detail, /clearinghouse/i);

  const progress = workflowProgress(reviewed.steps);
  assert.equal(progress.complete, progress.total, "everything this build can do is done");
  assert.ok(!reviewed.steps.some((step) => /submitted|sent|paid|accepted/i.test(step.detail)));

  // Even a transport claiming readiness does not make a sent claim.
  const [withReadyTransport] = buildBillingWorkflow({
    charges: [charge({ status: "reviewed" })],
    awaitingCharge: [],
    transport: { configured: true, adapterId: "x", environment: "test", readiness: "ready", unavailableReason: null },
  });
  assert.equal(withReadyTransport.steps.find((step) => step.id === "submission")?.state, "not_available");
});

test("absent coverage and unpriced lines are raised without blocking review", () => {
  const [item] = build({
    charges: [
      charge({
        coverageBasis: "none-on-file",
        coverageId: null,
        coveragePayerName: null,
        procedureCodes: [{ code: "99214", codingSystem: "CPT", description: "Office visit", units: 1, feeCents: null }],
      }),
    ],
  });

  assert.equal(item.stage, "ready_for_review");
  const attention = workflowAttention(item.steps).map((step) => step.id);
  assert.deepEqual(attention, ["coverage", "fees"]);

  const coverage = item.steps.find((step) => step.id === "coverage")!;
  assert.match(coverage.detail, /not self-pay/i);
  assert.ok(!item.steps.some((step) => step.detail.includes("$0.00")));
});

test("priority puts movable work above finished work, oldest first within a stage", () => {
  const now = new Date("2026-09-25T12:00:00.000Z");
  const items = build({
    charges: [
      charge({ id: "old-ready", encounterId: "old-ready", serviceDate: "2026-08-01" }),
      charge({ id: "new-ready", encounterId: "new-ready", serviceDate: "2026-09-20" }),
      charge({ id: "reviewed", encounterId: "reviewed", status: "reviewed", serviceDate: "2026-07-01" }),
    ],
  });
  const ordered = [...items].sort((a, b) => billingWorkflowPriority(b, now) - billingWorkflowPriority(a, now));
  assert.deepEqual(ordered.map((item) => item.key).slice(0, 2), ["old-ready", "new-ready"]);

  // A display date is placed; an unparseable one is unknown, not "today".
  assert.equal(daysSinceService({ serviceDate: "Sep 20, 2026" }, now), 5);
  assert.equal(daysSinceService({ serviceDate: "not a date" }, now), null);
});
