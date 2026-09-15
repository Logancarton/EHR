import { assertPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import { accessiblePatientIds, assertPatientAccess } from "../auth/patient-access";
import { getDatabase } from "../db/connection";
import { AuditRepository } from "../repositories/audit-repository";
import { IntegrationConfigurationRepository } from "../repositories/integration-configuration-repository";
import { OrganizationRepository } from "../repositories/organization-repository";
import {
  BillingRepository,
  type BillingChargeRow,
  type PrepareBillingChargeInput,
} from "../repositories/billing-repository";
import {
  UNCONFIGURED_BILLING_TRANSPORT,
  billingChargeBlockers,
  billingChargeIsReviewable,
  billingPeriod,
  buildBillingSummary,
  type BillingChargeBlocker,
  type BillingChargeRecord,
  type BillingCoverageBasis,
  type BillingDiagnosisCode,
  type BillingProcedureCode,
  type BillingSummary,
  type BillingTransportStatus,
} from "../../domain/billing";
import type { ClinicalExecutionContext } from "./clinical-service";

/**
 * Authoritative billing (roadmap P9-0 and P9-B).
 *
 * Every charge here is derived from a *signed* encounter snapshot. That is the
 * whole architecture: the legal record is frozen at signature and hashed, so the
 * codes on a charge can be traced to a specific attested note and a later chart
 * edit cannot retroactively restate what was billed.
 *
 * What this service deliberately cannot do:
 *
 * - **Transmit anything.** `submitClaim` refuses while no clearinghouse adapter is
 *   configured, and it writes nothing when it refuses. There is no code path that
 *   reports a submission, an acknowledgement, a payer decision or a payment.
 * - **Produce a monetary figure.** No fee schedule exists, so no amount does.
 * - **Answer an eligibility question.** Coverage is copied from the chart as
 *   recorded; no payer has been asked, and an absent policy stays absent rather
 *   than becoming "self-pay" or "eligible" (P9-A).
 */

export class BillingTransportUnavailableError extends Error {
  readonly transport: BillingTransportStatus;

  constructor(transport: BillingTransportStatus) {
    super(
      transport.unavailableReason ??
        "Claim submission is unavailable: no clearinghouse adapter is configured for this practice.",
    );
    this.name = "BillingTransportUnavailableError";
    this.transport = transport;
  }
}

export class BillingChargeNotReviewableError extends Error {
  readonly blockers: BillingChargeBlocker[];

  constructor(chargeId: string, blockers: BillingChargeBlocker[]) {
    super(`Billing charge ${chargeId} cannot be reviewed: ${blockers.map((b) => b.message).join(" ")}`);
    this.name = "BillingChargeNotReviewableError";
    this.blockers = blockers;
  }
}

type SnapshotContent = {
  patientId?: string;
  date?: string;
  coding?: { cptCode?: string; emLevel?: string; psychotherapyMinutes?: number };
  references?: Array<{
    id?: string;
    entityType?: string;
    code?: string | null;
    codingSystem?: string | null;
    display?: string | null;
    status?: string;
  }>;
};

/** What the signed legal record says, read back from the frozen snapshot only. */
function readSignedSnapshot(encounterId: string): {
  contentSha256: string;
  patientId: string;
  serviceDate: string;
  content: SnapshotContent;
} | null {
  const row = getDatabase()
    .prepare("SELECT patient_id, content_json, content_sha256 FROM signed_encounter_snapshots WHERE encounter_id = ?")
    .get(encounterId) as any;
  if (!row) return null;

  let content: SnapshotContent = {};
  try {
    content = JSON.parse(row.content_json) as SnapshotContent;
  } catch {
    content = {};
  }

  return {
    contentSha256: row.content_sha256,
    patientId: row.patient_id,
    serviceDate: content.date || "",
    content,
  };
}

/**
 * Procedure codes are taken from the frozen snapshot, never recomputed.
 *
 * Only the primary E/M code is present: add-on codes shown during the signing
 * ceremony are not persisted onto the encounter record, so they are not on the
 * charge either. Reconstructing them here from psychotherapy minutes would put a
 * code on a claim that no clinician attested — the exact move the abandoned coding
 * prototype made. The gap is recorded in ROADMAP §15 under P9-B instead.
 */
function procedureCodesFromSnapshot(content: SnapshotContent): BillingProcedureCode[] {
  const code = content.coding?.cptCode?.trim();
  if (!code) return [];
  return [
    {
      code,
      codingSystem: "CPT",
      description: content.coding?.emLevel?.trim() || "Attested on the signed encounter",
      units: 1,
    },
  ];
}

/** Diagnoses come only from confirmed problem references that actually carry a code. */
function diagnosisCodesFromSnapshot(content: SnapshotContent): BillingDiagnosisCode[] {
  const references = Array.isArray(content.references) ? content.references : [];
  const seen = new Set<string>();
  const codes: BillingDiagnosisCode[] = [];

  for (const reference of references) {
    if (reference.entityType !== "problem") continue;
    if (reference.status && reference.status !== "confirmed") continue;
    const code = reference.code?.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push({
      code,
      codingSystem: reference.codingSystem?.trim() || "ICD-10-CM",
      display: reference.display?.trim() || code,
      referenceId: reference.id || "",
    });
  }

  return codes;
}

/**
 * Coverage as the chart records it at preparation time.
 *
 * Three outcomes, kept distinct because collapsing them is how a screen comes to
 * imply a payer relationship that does not exist: a policy on file, an explicitly
 * recorded self-pay arrangement, and no coverage record at all.
 */
function coverageFromChart(patientId: string): {
  basis: BillingCoverageBasis;
  coverageId: string | null;
  payerName: string | null;
} {
  const rows = getDatabase()
    .prepare(`
      SELECT id, payer_name, is_self_pay, status, coverage_priority
      FROM insurance_policies
      WHERE patient_id = ? AND status = 'active'
      ORDER BY coverage_priority ASC, updated_at DESC
    `)
    .all(patientId) as any[];

  const primary = rows[0];
  if (!primary) return { basis: "none-on-file", coverageId: null, payerName: null };
  if (Number(primary.is_self_pay) === 1) {
    return { basis: "self-pay-recorded", coverageId: primary.id, payerName: null };
  }
  return { basis: "policy-on-file", coverageId: primary.id, payerName: primary.payer_name || null };
}

export type BillingChargeView = BillingChargeRow & {
  blockers: BillingChargeBlocker[];
  reviewable: boolean;
};

export type BillingWorkspaceView = {
  charges: BillingChargeView[];
  awaitingCharge: ReturnType<typeof BillingRepository.signedEncountersAwaitingCharge>;
  summary: BillingSummary;
  transport: BillingTransportStatus;
};

function withBlockers(row: BillingChargeRow): BillingChargeView {
  return { ...row, blockers: billingChargeBlockers(row), reviewable: billingChargeIsReviewable(row) };
}

export const billingService = {
  /**
   * Whether claims can leave the building.
   *
   * Read from the same integration-configuration record every other vendor
   * boundary uses, so "configured" means a real practice decision was recorded —
   * not that a screen mentioned a vendor name.
   */
  transportStatus(): BillingTransportStatus {
    const configurations = IntegrationConfigurationRepository.list().filter(
      (configuration) => configuration.purpose === "billing",
    );
    if (configurations.length === 0) return UNCONFIGURED_BILLING_TRANSPORT;

    const enabled = configurations.find((configuration) => configuration.enabled);
    if (!enabled) {
      const first = configurations[0];
      return {
        configured: true,
        adapterId: first.adapterId,
        environment: first.environment,
        readiness: "disabled",
        unavailableReason: `The ${first.adapterId} claims adapter is configured but disabled, so nothing can be transmitted.`,
      };
    }

    if (Object.keys(enabled.secretRefs).length === 0) {
      return {
        configured: true,
        adapterId: enabled.adapterId,
        environment: enabled.environment,
        readiness: "missing_secret",
        unavailableReason: `The ${enabled.adapterId} claims adapter has no credentials configured, so nothing can be transmitted.`,
      };
    }

    // Reaching "ready" still does not make a transport exist: no claims adapter has
    // been written, because no vendor has been selected (P9-0, and D-037's DrFirst
    // deferral for the same reason). `submitClaim` refuses on that separately.
    return {
      configured: true,
      adapterId: enabled.adapterId,
      environment: enabled.environment,
      readiness: "ready",
      unavailableReason: null,
    };
  },

  /**
   * The billing worklist for this actor.
   *
   * `view_financial` is required for rows *and* for the summary. Denying rows while
   * still returning totals would leak the shape of the practice's finances to
   * someone refused the detail, so both come from this one authorized call.
   */
  worklist(
    actor: ProviderContext,
    options: { periodDays?: number; now?: Date } = {},
  ): BillingWorkspaceView {
    assertPermission(actor, "view_financial");

    const scope = accessiblePatientIds(actor);
    const period = billingPeriod(options.now ?? new Date(), options.periodDays ?? 30);
    const counts = BillingRepository.counts({
      patientIds: scope,
      since: period.start,
      until: period.end,
    });

    return {
      charges: BillingRepository.listCharges({ patientIds: scope }).map(withBlockers),
      // Not period-scoped; see the repository for why unbilled work is a backlog.
      awaitingCharge: BillingRepository.signedEncountersAwaitingCharge({ patientIds: scope }),
      summary: buildBillingSummary({
        periodStart: period.start,
        periodEnd: period.end,
        periodLabel: period.label,
        computedAt: (options.now ?? new Date()).toISOString(),
        ...counts,
      }),
      transport: this.transportStatus(),
    };
  },

  charge(chargeId: string, actor: ProviderContext): BillingChargeView {
    assertPermission(actor, "view_financial");
    const charge = BillingRepository.getById(chargeId);
    if (!charge) throw new Error(`Billing charge not found: ${chargeId}`);
    assertPatientAccess(actor, charge.patientId);
    const [row] = BillingRepository.listCharges({ patientIds: [charge.patientId] }).filter(
      (candidate) => candidate.id === chargeId,
    );
    if (!row) throw new Error(`Billing charge not found: ${chargeId}`);
    return withBlockers(row);
  },

  /**
   * Turns a signed encounter into a durable charge record.
   *
   * Refuses unless the encounter has a signed snapshot: an unsigned note is a
   * draft, and a draft is not billing evidence. The snapshot's hash is stored on
   * the charge so the codes stay traceable to that exact legal record.
   */
  prepareCharge(
    encounterId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): BillingChargeRecord {
    assertPermission(actor, "view_financial");

    const snapshot = readSignedSnapshot(encounterId);
    if (!snapshot) {
      throw new Error(
        `Encounter ${encounterId} has no signed legal record, so no charge can be prepared from it.`,
      );
    }

    assertPatientAccess(actor, snapshot.patientId);

    const organizationId = OrganizationRepository.organizationForPatient(snapshot.patientId);
    if (!organizationId) {
      throw new Error(
        `Patient ${snapshot.patientId} is not owned by an organization, so a charge cannot be attributed to one.`,
      );
    }

    const coverage = coverageFromChart(snapshot.patientId);
    const input: PrepareBillingChargeInput = {
      organizationId,
      patientId: snapshot.patientId,
      encounterId,
      encounterSnapshotSha256: snapshot.contentSha256,
      serviceDate: snapshot.serviceDate,
      procedureCodes: procedureCodesFromSnapshot(snapshot.content),
      diagnosisCodes: diagnosisCodesFromSnapshot(snapshot.content),
      coverageBasis: coverage.basis,
      coverageId: coverage.coverageId,
      coveragePayerName: coverage.payerName,
      preparedBy: actor.userId,
      preparedByName: providerLabel(actor),
    };

    const charge = BillingRepository.prepare(input);

    AuditRepository.log({
      userId: actor.userId,
      userName: providerLabel(actor),
      userRole: actor.role,
      eventType: "billing_charge_prepared",
      patientId: charge.patientId,
      description: `Prepared billing charge ${charge.id} from signed encounter ${encounterId}.`,
      metadata: {
        source: context.source,
        requestId: context.requestId,
        chargeId: charge.id,
        encounterId,
        organizationId,
        encounterSnapshotSha256: charge.encounterSnapshotSha256,
        procedureCodes: charge.procedureCodes.map((entry) => entry.code),
        diagnosisCodes: charge.diagnosisCodes.map((entry) => entry.code),
        coverageBasis: charge.coverageBasis,
      },
    });

    return charge;
  },

  /**
   * The human gate. A reviewed charge is one an accountable person has looked at;
   * it is still not a submitted claim, and nothing here says otherwise.
   */
  reviewCharge(
    chargeId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    options: { note?: string; expectedVersion?: number } = {},
  ): BillingChargeRecord {
    assertPermission(actor, "view_financial");

    const existing = BillingRepository.getById(chargeId);
    if (!existing) throw new Error(`Billing charge not found: ${chargeId}`);
    assertPatientAccess(actor, existing.patientId);

    const blockers = billingChargeBlockers(existing);
    if (blockers.length > 0) throw new BillingChargeNotReviewableError(chargeId, blockers);

    const charge = BillingRepository.review(
      chargeId,
      { userId: actor.userId, displayName: providerLabel(actor) },
      options,
    );

    AuditRepository.log({
      userId: actor.userId,
      userName: providerLabel(actor),
      userRole: actor.role,
      eventType: "billing_charge_reviewed",
      patientId: charge.patientId,
      description: `Reviewed billing charge ${charge.id} for encounter ${charge.encounterId}.`,
      metadata: {
        source: context.source,
        requestId: context.requestId,
        chargeId: charge.id,
        encounterId: charge.encounterId,
        reviewNote: options.note,
        version: charge.version,
      },
    });

    return charge;
  },

  voidCharge(
    chargeId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    options: { reason: string; expectedVersion?: number },
  ): BillingChargeRecord {
    assertPermission(actor, "view_financial");
    const reason = options.reason?.trim();
    if (!reason) throw new Error("A void reason is required so the financial record explains itself.");

    const existing = BillingRepository.getById(chargeId);
    if (!existing) throw new Error(`Billing charge not found: ${chargeId}`);
    assertPatientAccess(actor, existing.patientId);

    const charge = BillingRepository.void(
      chargeId,
      { userId: actor.userId, displayName: providerLabel(actor) },
      { reason, expectedVersion: options.expectedVersion },
    );

    AuditRepository.log({
      userId: actor.userId,
      userName: providerLabel(actor),
      userRole: actor.role,
      eventType: "billing_charge_voided",
      patientId: charge.patientId,
      description: `Voided billing charge ${charge.id}: ${reason}`,
      metadata: {
        source: context.source,
        requestId: context.requestId,
        chargeId: charge.id,
        encounterId: charge.encounterId,
        reason,
        version: charge.version,
      },
    });

    return charge;
  },

  /**
   * Claim submission (P9-C).
   *
   * There is no clearinghouse adapter, so this always refuses and writes nothing —
   * no status change, no attempt row, no audit entry claiming an outcome. It exists
   * as a real refusal rather than an absent function so the UI has something
   * truthful to call and a test can prove the refusal, which is what the removed
   * prototype's "Batch 837P transmitted 1 claim to Availity" could not survive.
   */
  submitClaim(chargeId: string, actor: ProviderContext): never {
    assertPermission(actor, "view_financial");
    const charge = BillingRepository.getById(chargeId);
    if (charge) assertPatientAccess(actor, charge.patientId);

    const transport = this.transportStatus();
    // A configuration that passes its own readiness checks still has no adapter
    // behind it. Saying so plainly is the point: the failure a clinician sees has
    // to name the real reason, not a plausible one.
    throw new BillingTransportUnavailableError(
      transport.readiness === "ready"
        ? {
            ...transport,
            unavailableReason:
              `A ${transport.adapterId} claims configuration exists, but no clearinghouse adapter implementation is built yet (P9-C), so no claim can be transmitted and no payer status can be known.`,
          }
        : transport,
    );
  },
};
