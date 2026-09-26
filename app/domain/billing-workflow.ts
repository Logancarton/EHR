/**
 * The billing workflow queue (BILL-05, D-105).
 *
 * A projection over records billing already owns — signed encounters with no
 * charge, and charge records — arranged the way Intake arranges its work: one
 * row per piece of work, a stage, a readiness checklist, and the next thing that
 * blocks it. Nothing here is stored and nothing is checked off by hand; every
 * step is recomputed from the authoritative rows on each load, so the queue can
 * never disagree with the Charges view it sits beside.
 *
 * Two rules carry over from `billing.ts` and bind this file too:
 *
 * - **No step reports a transmission.** Claim submission is always a step that
 *   is not available here, with the transport's own reason. It is never
 *   counted toward progress, so a fully reviewed charge reads "complete" for the
 *   work this build can do rather than implying a claim went anywhere.
 * - **Unknown is not missing.** Before a charge is prepared, the diagnoses,
 *   coverage and fees it will carry have not been read from the signed record
 *   yet. Those steps are `pending`, not `needed`, so an unbilled encounter is not
 *   shown as lacking codes it may well have.
 */

import type {
  BillingChargeBlocker,
  BillingChargeRecord,
  BillingTransportStatus,
} from "./billing";

export type BillingWorkflowStage =
  | "needs_charge"
  | "coding_incomplete"
  | "ready_for_review"
  | "reviewed"
  | "void";

export const BILLING_WORKFLOW_STAGE_ORDER: readonly BillingWorkflowStage[] = [
  "needs_charge",
  "coding_incomplete",
  "ready_for_review",
  "reviewed",
  "void",
];

export const BILLING_WORKFLOW_STAGE_LABELS: Record<BillingWorkflowStage, string> = {
  needs_charge: "Needs charge",
  coding_incomplete: "Coding incomplete",
  ready_for_review: "Ready for review",
  reviewed: "Reviewed",
  void: "Voided",
};

/**
 * The same state vocabulary Intake's readiness timeline uses, plus `pending`
 * for a fact that cannot be known until an earlier step runs.
 */
export type BillingWorkflowStepState = "recorded" | "review" | "needed" | "pending" | "not_available";

export type BillingWorkflowStepId =
  | "signed"
  | "charge"
  | "procedure"
  | "diagnosis"
  | "coverage"
  | "fees"
  | "review"
  | "submission";

/** Who can resolve the step — where its fix lives, not who is to blame. */
export type BillingWorkflowOwner = "Clinician" | "Billing" | "Front desk" | "Practice setup";

export type BillingWorkflowStep = {
  id: BillingWorkflowStepId;
  label: string;
  shortLabel: string;
  state: BillingWorkflowStepState;
  /** Blocks the charge from moving to its next stage. */
  blocking: boolean;
  owner: BillingWorkflowOwner;
  detail: string;
};

/** The unbilled-encounter row `/api/billing` returns as `awaitingCharge`. */
export type BillingWorkflowAwaitingInput = {
  encounterId: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  encounterType: string;
  serviceDate: string;
  signedAt: string;
  cptCode: string;
};

/** The charge row `/api/billing` returns, with its server-computed blockers. */
export type BillingWorkflowChargeInput = BillingChargeRecord & {
  patientName: string;
  patientMrn: string;
  encounterType: string;
  blockers: BillingChargeBlocker[];
  reviewable: boolean;
};

/**
 * Generic over its inputs so a caller gets back exactly the rows it passed in —
 * the screen hands them straight to the same actions the Charges view uses.
 */
export type BillingWorkflowItem<
  C extends BillingWorkflowChargeInput = BillingWorkflowChargeInput,
  A extends BillingWorkflowAwaitingInput = BillingWorkflowAwaitingInput,
> = {
  /** Stable across the charge being prepared: the encounter is the unit of work. */
  key: string;
  stage: BillingWorkflowStage;
  patientId: string;
  patientName: string;
  patientMrn: string;
  encounterId: string;
  encounterType: string;
  serviceDate: string;
  /** Exactly one of these is set. */
  awaiting: A | null;
  charge: C | null;
  steps: BillingWorkflowStep[];
};

const SUBMISSION_UNAVAILABLE =
  "Claim submission requires a configured clearinghouse adapter, which this practice does not have.";

function submissionStep(transport: BillingTransportStatus | null): BillingWorkflowStep {
  return {
    id: "submission",
    label: "Submit claim",
    shortLabel: "Submit",
    // Not available even when a transport reports ready: submission itself is
    // P9-C and is refused by the service. A ready transport is not a sent claim.
    state: "not_available",
    blocking: false,
    owner: "Billing",
    detail: transport?.unavailableReason ?? SUBMISSION_UNAVAILABLE,
  };
}

function signedStep(signedAt: string, detail?: string): BillingWorkflowStep {
  const when = signedAt && !Number.isNaN(Date.parse(signedAt)) ? new Date(signedAt).toLocaleDateString() : null;
  return {
    id: "signed",
    label: "Note signed",
    shortLabel: "Signed",
    state: "recorded",
    blocking: false,
    owner: "Clinician",
    detail: detail ?? (when ? `Signed ${when}. The legal record is sealed.` : "The legal record is signed and sealed."),
  };
}

function pendingStep(
  id: BillingWorkflowStepId,
  label: string,
  shortLabel: string,
  owner: BillingWorkflowOwner,
): BillingWorkflowStep {
  return {
    id,
    label,
    shortLabel,
    state: "pending",
    blocking: false,
    owner,
    detail: "Read from the signed record when the charge is prepared.",
  };
}

export function awaitingSteps(
  row: BillingWorkflowAwaitingInput,
  transport: BillingTransportStatus | null,
): BillingWorkflowStep[] {
  return [
    signedStep(row.signedAt),
    {
      id: "charge",
      label: "Prepare charge",
      shortLabel: "Charge",
      state: "needed",
      blocking: true,
      owner: "Billing",
      detail: "No charge has been prepared from this signed encounter yet. Preparing one copies the attested codes, coverage and practice fees from the sealed record.",
    },
    row.cptCode
      ? {
          id: "procedure",
          label: "Procedure code attested",
          shortLabel: "Procedure",
          state: "recorded",
          blocking: false,
          owner: "Clinician",
          detail: `CPT ${row.cptCode} is on the signed encounter.`,
        }
      : {
          id: "procedure",
          label: "Procedure code attested",
          shortLabel: "Procedure",
          state: "needed",
          blocking: true,
          owner: "Clinician",
          detail: "The signed encounter carries no procedure code, so a charge prepared from it will have no service to bill.",
        },
    pendingStep("diagnosis", "Coded diagnosis attested", "Diagnosis", "Clinician"),
    pendingStep("coverage", "Coverage on file", "Coverage", "Front desk"),
    pendingStep("fees", "Practice fee on every line", "Fees", "Practice setup"),
    {
      id: "review",
      label: "Charge reviewed",
      shortLabel: "Review",
      state: "pending",
      blocking: false,
      owner: "Billing",
      detail: "A charge can be reviewed once it has been prepared.",
    },
    submissionStep(transport),
  ];
}

export function chargeSteps(
  charge: BillingWorkflowChargeInput,
  transport: BillingTransportStatus | null,
): BillingWorkflowStep[] {
  const isVoid = charge.status === "void";
  const unpriced = charge.procedureCodes.filter((line) => typeof line.feeCents !== "number").length;

  const coverage: BillingWorkflowStep =
    charge.coverageBasis === "policy-on-file"
      ? {
          id: "coverage",
          label: "Coverage on file",
          shortLabel: "Coverage",
          state: "recorded",
          blocking: false,
          owner: "Front desk",
          detail: `${charge.coveragePayerName || "A policy"} was on file when the charge was prepared. It is recorded, not verified: no payer has been asked about eligibility.`,
        }
      : charge.coverageBasis === "self-pay-recorded"
        ? {
            id: "coverage",
            label: "Coverage on file",
            shortLabel: "Coverage",
            state: "recorded",
            blocking: false,
            owner: "Front desk",
            detail: "Self-pay was recorded on the chart when the charge was prepared. A superbill can be produced once the charge is reviewed.",
          }
        : {
            id: "coverage",
            label: "Coverage on file",
            shortLabel: "Coverage",
            state: "review",
            blocking: false,
            owner: "Front desk",
            detail: "No coverage record was on file when this charge was prepared. That is not self-pay and not eligible. Record coverage in the patient's information. The charge keeps the coverage it was prepared with.",
          };

  const fees: BillingWorkflowStep =
    charge.procedureCodes.length === 0
      ? {
          id: "fees",
          label: "Practice fee on every line",
          shortLabel: "Fees",
          state: "not_available",
          blocking: false,
          owner: "Practice setup",
          detail: "There are no procedure lines to price.",
        }
      : unpriced === 0
        ? {
            id: "fees",
            label: "Practice fee on every line",
            shortLabel: "Fees",
            state: "recorded",
            blocking: false,
            owner: "Practice setup",
            detail: "Every line carries a fee from the practice fee schedule, frozen when the charge was prepared.",
          }
        : {
            id: "fees",
            label: "Practice fee on every line",
            shortLabel: "Fees",
            state: "review",
            blocking: false,
            owner: "Practice setup",
            detail: `${unpriced} line${unpriced === 1 ? " has" : "s have"} no practice fee, so this charge has no billed total. Add the code to the fee schedule in Practice setup. Fees are frozen at preparation, so this charge keeps its unpriced lines.`,
          };

  const review: BillingWorkflowStep = isVoid
    ? {
        id: "review",
        label: "Charge reviewed",
        shortLabel: "Review",
        state: "not_available",
        blocking: false,
        owner: "Billing",
        detail: `Voided${charge.voidReason ? `: ${charge.voidReason}` : "."} A voided charge cannot be reviewed.`,
      }
    : charge.status === "reviewed"
      ? {
          id: "review",
          label: "Charge reviewed",
          shortLabel: "Review",
          state: "recorded",
          blocking: false,
          owner: "Billing",
          detail: `Reviewed by ${charge.reviewedByName ?? "a billing reviewer"}${charge.reviewedAt ? ` on ${new Date(charge.reviewedAt).toLocaleDateString()}` : ""}.`,
        }
      : {
          id: "review",
          label: "Charge reviewed",
          shortLabel: "Review",
          state: "needed",
          blocking: true,
          owner: "Billing",
          detail: charge.reviewable
            ? "Someone accountable confirms the attested codes before this charge can support a claim or a superbill."
            : "Review is blocked until the coding steps before it are resolved.",
        };

  return [
    signedStep("", `Signed encounter, legal record hash ${charge.encounterSnapshotSha256.slice(0, 12)}…`),
    {
      id: "charge",
      label: "Prepare charge",
      shortLabel: "Charge",
      state: "recorded",
      blocking: false,
      owner: "Billing",
      detail: `Prepared by ${charge.preparedByName} on ${new Date(charge.preparedAt).toLocaleDateString()}.`,
    },
    charge.procedureCodes.length > 0
      ? {
          id: "procedure",
          label: "Procedure code attested",
          shortLabel: "Procedure",
          state: "recorded",
          blocking: false,
          owner: "Clinician",
          detail: `${charge.procedureCodes.map((line) => line.code).join(", ")} attested on the signed note.`,
        }
      : {
          id: "procedure",
          label: "Procedure code attested",
          shortLabel: "Procedure",
          state: isVoid ? "not_available" : "needed",
          blocking: !isVoid,
          owner: "Clinician",
          detail: "The signed encounter carries no procedure code, so there is no service to bill.",
        },
    charge.diagnosisCodes.length > 0
      ? {
          id: "diagnosis",
          label: "Coded diagnosis attested",
          shortLabel: "Diagnosis",
          state: "recorded",
          blocking: false,
          owner: "Clinician",
          detail: `${charge.diagnosisCodes.map((code) => code.code).join(", ")} attested on the signed note.`,
        }
      : {
          id: "diagnosis",
          label: "Coded diagnosis attested",
          shortLabel: "Diagnosis",
          state: isVoid ? "not_available" : "needed",
          blocking: !isVoid,
          owner: "Clinician",
          detail:
            charge.blockers.find((blocker) => blocker.code === "no-coded-diagnosis")?.message ??
            "No coded diagnosis was attested on the signed note.",
        },
    coverage,
    fees,
    review,
    submissionStep(transport),
  ];
}

export function chargeWorkflowStage(charge: BillingWorkflowChargeInput): BillingWorkflowStage {
  if (charge.status === "void") return "void";
  if (charge.status === "reviewed") return "reviewed";
  // Blockers come from the server's own `billingChargeBlockers`, the same rule the
  // review action enforces — so "Ready for review" here cannot disagree with it.
  return charge.reviewable ? "ready_for_review" : "coding_incomplete";
}

export function buildBillingWorkflow<
  C extends BillingWorkflowChargeInput,
  A extends BillingWorkflowAwaitingInput,
>(input: {
  charges: readonly C[];
  awaitingCharge: readonly A[];
  transport: BillingTransportStatus | null;
}): BillingWorkflowItem<C, A>[] {
  const items: BillingWorkflowItem<C, A>[] = [];

  for (const row of input.awaitingCharge) {
    items.push({
      key: row.encounterId,
      stage: "needs_charge",
      patientId: row.patientId,
      patientName: row.patientName,
      patientMrn: row.patientMrn,
      encounterId: row.encounterId,
      encounterType: row.encounterType,
      serviceDate: row.serviceDate,
      awaiting: row,
      charge: null,
      steps: awaitingSteps(row, input.transport),
    });
  }

  for (const charge of input.charges) {
    items.push({
      key: charge.encounterId,
      stage: chargeWorkflowStage(charge),
      patientId: charge.patientId,
      patientName: charge.patientName,
      patientMrn: charge.patientMrn,
      encounterId: charge.encounterId,
      encounterType: charge.encounterType,
      serviceDate: charge.serviceDate,
      awaiting: null,
      charge,
      steps: chargeSteps(charge, input.transport),
    });
  }

  return items;
}

/** Steps that count toward progress: the ones this build can actually complete. */
export function workflowProgress(steps: readonly BillingWorkflowStep[]): { complete: number; total: number } {
  const relevant = steps.filter((step) => step.state !== "not_available");
  return {
    complete: relevant.filter((step) => step.state === "recorded").length,
    total: relevant.length,
  };
}

/** The first blocking step not yet done — what the card footer names as "Next". */
export function nextWorkflowStep(steps: readonly BillingWorkflowStep[]): BillingWorkflowStep | undefined {
  return steps.find((step) => step.blocking && step.state !== "recorded");
}

/** Non-blocking items that still want someone's attention (coverage, fees). */
export function workflowAttention(steps: readonly BillingWorkflowStep[]): BillingWorkflowStep[] {
  return steps.filter((step) => step.state === "review");
}

/**
 * Whole days since the date of service, or null when it cannot be placed in time.
 *
 * Encounter dates are not uniformly formatted (display dates such as
 * "Sep 25, 2026" sit beside ISO dates), so an unparseable one is reported as
 * unknown rather than silently treated as today.
 */
export function daysSinceService(item: Pick<BillingWorkflowItem, "serviceDate">, now: Date): number | null {
  const parsed = Date.parse(item.serviceDate);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.floor((now.getTime() - parsed) / 86_400_000));
}

const STAGE_RANK: Record<BillingWorkflowStage, number> = {
  // Coding problems need a clinician and get older fastest, so they lead.
  coding_incomplete: 4,
  ready_for_review: 3,
  needs_charge: 2,
  reviewed: 1,
  void: 0,
};

/**
 * Practice priority: the stage decides first, so work that can move always sorts
 * above work that is finished however old the finished work is; within a stage,
 * older service dates rise. An unplaceable date sorts as if new rather than
 * pretending to an age it does not have.
 */
export function billingWorkflowPriority(item: BillingWorkflowItem, now: Date): number {
  const age = Math.min(daysSinceService(item, now) ?? 0, 99_999);
  return STAGE_RANK[item.stage] * 100_000 + age;
}
