/**
 * Billing domain vocabulary (roadmap §15, P9-0 and P9-B).
 *
 * Financial truth is kept separate from clinical truth, and it is derived from the
 * clinical record rather than typed alongside it: a charge exists because a
 * clinician signed an encounter and attested to the services in it, and it carries
 * the codes that were frozen into that signed legal record.
 *
 * Three rules shape everything in this file, and each of them replaced something
 * the removed prototype did:
 *
 * 1. **No money is invented.** There is no fee schedule in this product, so a
 *    charge carries codes and units and no amount. The prototype showed
 *    `billedAmount: 285.00`, an expected remittance, a monthly settled total and a
 *    "98.2% clean claim rate", none of which came from anywhere. Unavailable is
 *    represented as unavailable — never as zero, and never as a plausible number.
 * 2. **Nothing here can report a transmission.** No status in this module means
 *    "sent", "accepted" or "paid". Those belong to P9-C/P9-D behind a real
 *    clearinghouse adapter; until one is configured the transport boundary refuses
 *    rather than simulating. See `BillingTransportStatus`.
 * 3. **Every count states its period and its denominator.** A number with neither
 *    is a claim about the practice that cannot be checked.
 */

/** Charge lifecycle that this build actually implements. */
export type BillingChargeStatus = "prepared" | "reviewed" | "void";

export const BILLING_CHARGE_STATUSES: readonly BillingChargeStatus[] = ["prepared", "reviewed", "void"];

/**
 * The claim lifecycle from P9-C — `submitted`, `accepted`, `rejected`,
 * `adjudicated`, `paid`, `denied`, `reconciled` — is deliberately absent from the
 * status vocabulary above rather than present and unreachable. A status the
 * product can name is a status a screen will eventually render, and none of those
 * can be known without a payer talking to us.
 */
export const BILLING_CLAIM_LIFECYCLE_OWNER = "P9-C (requires a configured clearinghouse adapter)";

export type BillingProcedureCode = {
  code: string;
  codingSystem: "CPT";
  description: string;
  units: number;
};

export type BillingDiagnosisCode = {
  code: string;
  codingSystem: string;
  display: string;
  /** The confirmed note reference this code was attested through, for click-through. */
  referenceId: string;
};

/**
 * How the patient's coverage stood when the charge was prepared, frozen so a later
 * insurance edit cannot silently restate what was billed against.
 *
 * `none-on-file` is not self-pay and not "eligible". It is the absence of a record,
 * and eligibility is P9-A — a payer has never been asked anything here.
 */
export type BillingCoverageBasis = "policy-on-file" | "self-pay-recorded" | "none-on-file";

export type BillingChargeRecord = {
  id: string;
  organizationId: string;
  patientId: string;
  encounterId: string;
  /** Hash of the signed snapshot the codes came from; proves which legal record. */
  encounterSnapshotSha256: string;
  serviceDate: string;
  status: BillingChargeStatus;
  procedureCodes: BillingProcedureCode[];
  diagnosisCodes: BillingDiagnosisCode[];
  coverageBasis: BillingCoverageBasis;
  coverageId: string | null;
  coveragePayerName: string | null;
  preparedBy: string;
  preparedByName: string;
  preparedAt: string;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  voidedBy: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

/** A named reason a charge may not be advanced, stated as the clinician would fix it. */
export type BillingChargeBlocker = {
  code: "no-coded-diagnosis" | "no-procedure-code" | "already-reviewed" | "voided";
  message: string;
};

/**
 * What stops this charge from being reviewed.
 *
 * Pure over the record so the same answer is reachable from the service, the API
 * and a test without a database. Review is the human gate P9-B requires: suggested
 * coding is not billing evidence until someone accountable has looked at it, and a
 * charge that cannot support a claim must not be able to pass that gate quietly.
 */
export function billingChargeBlockers(charge: BillingChargeRecord): BillingChargeBlocker[] {
  const blockers: BillingChargeBlocker[] = [];

  if (charge.status === "void") {
    blockers.push({ code: "voided", message: "This charge was voided and cannot be advanced." });
    return blockers;
  }
  if (charge.status === "reviewed") {
    blockers.push({ code: "already-reviewed", message: "This charge has already been reviewed." });
  }
  if (charge.procedureCodes.length === 0) {
    blockers.push({
      code: "no-procedure-code",
      message: "The signed encounter carries no procedure code, so there is no service to bill.",
    });
  }
  if (charge.diagnosisCodes.length === 0) {
    blockers.push({
      code: "no-coded-diagnosis",
      message:
        "No coded diagnosis was attested on the signed note. Add a coded problem to the chart and reference it in the note before this can be billed.",
    });
  }

  return blockers;
}

export function billingChargeIsReviewable(charge: BillingChargeRecord): boolean {
  return billingChargeBlockers(charge).length === 0;
}

/**
 * Whether a clearinghouse can be reached at all.
 *
 * `configured: false` is the current and expected answer: no vendor has been
 * selected, and the prototype's mention of Availity was prototype text, not a
 * procurement decision (P9-0). The shape exists so a screen can say why submission
 * is unavailable instead of offering a button that pretends.
 */
export type BillingTransportReadiness = "unconfigured" | "disabled" | "missing_secret" | "ready";

export type BillingTransportStatus = {
  configured: boolean;
  adapterId: string | null;
  environment: string | null;
  readiness: BillingTransportReadiness;
  /** Null only when `readiness === "ready"`. */
  unavailableReason: string | null;
};

export const UNCONFIGURED_BILLING_TRANSPORT: BillingTransportStatus = {
  configured: false,
  adapterId: null,
  environment: null,
  readiness: "unconfigured",
  unavailableReason:
    "No clearinghouse adapter is configured for this practice, so claims cannot be transmitted and no payer status can be known.",
};

/**
 * Counts over the authoritative records, each with the window and the denominator
 * it was taken against.
 *
 * `monetaryTotals` is permanently null in this slice and says why. It is a field
 * rather than an omission so that a screen has to render the reason: a dashboard
 * that simply leaves money out reads as "no revenue", which is its own false claim.
 */
export type BillingSummary = {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  computedAt: string;
  /** Denominator: signed encounters *in the period* for the caller's patients. */
  signedEncounters: number;
  chargesPrepared: number;
  chargesReviewed: number;
  chargesVoided: number;
  /**
   * Backlog, **not** period-scoped: every signed encounter with no charge record,
   * however long ago it was signed. Unbilled work does not stop mattering after
   * thirty days, and a windowed version of this number would quietly hide the
   * oldest and most urgent rows. A screen must label it as a backlog rather than
   * presenting it as a ratio of `signedEncounters`, which counts something else.
   */
  encountersAwaitingCharge: number;
  monetaryTotals: null;
  monetaryTotalsUnavailableReason: string;
};

export const MONETARY_TOTALS_UNAVAILABLE_REASON =
  "Amounts require a practice fee schedule (P9-B) and payer remittance (P9-D). Neither exists yet, so no billed, expected or collected figure can be shown.";

export type BillingSummaryInput = {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  computedAt: string;
  signedEncounters: number;
  chargesPrepared: number;
  chargesReviewed: number;
  chargesVoided: number;
  encountersAwaitingCharge: number;
};

export function buildBillingSummary(input: BillingSummaryInput): BillingSummary {
  return {
    ...input,
    monetaryTotals: null,
    monetaryTotalsUnavailableReason: MONETARY_TOTALS_UNAVAILABLE_REASON,
  };
}

/** The window a summary is taken over. Explicit so the number is checkable. */
export function billingPeriod(reference: Date, days = 30): { start: string; end: string; label: string } {
  const end = new Date(reference.getTime());
  const start = new Date(reference.getTime() - Math.max(1, days) * 24 * 60 * 60 * 1000);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label: `Last ${Math.max(1, days)} days`,
  };
}
