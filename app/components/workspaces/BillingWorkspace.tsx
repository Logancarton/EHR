"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../ui/Icon";
import Button from "../ui/Button";
import AsyncSection from "../ui/AsyncSection";
import { api } from "../../lib/api-client";
import { ApiError } from "../../lib/api-error";
import type { BillingWorkspaceView } from "../../server/services/billing-service";
import { chargeTotalCents } from "../../domain/billing";
import { formatCents } from "../../domain/billing-setup";
import { superbillRefusal } from "../../domain/superbill";
import BillingSetupPanel from "./BillingSetupPanel";
import SuperbillDocument from "./SuperbillDocument";
import BillingWorkflowQueue from "./BillingWorkflowQueue";

/**
 * The Billing destination (roadmap P9-0, P9-B).
 *
 * This replaced a prototype that held five invented claims in React state, showed a
 * "98.2% clean claim rate" that came from nowhere, and answered its Transmit button
 * by flipping those rows to "submitted" and announcing a clearinghouse batch. A
 * clinician had no way to tell that apart from a working revenue cycle.
 *
 * What is on this screen now:
 *
 * - **Every row comes from `/api/billing`,** scoped by the caller's own organization
 *   membership and patient access. There is no seed data in this file. An empty
 *   practice shows an empty worklist, which is the truth about an empty practice.
 * - **Counts state their window and their denominator.** "12 of 14 signed encounters"
 *   is checkable; "98.2%" was not.
 * - **Money comes only from the practice.** A billed amount is the practice's own
 *   fee schedule (D-101); a line without a fee shows none, and the count of such
 *   lines is shown beside the total. Expected and collected amounts need payer
 *   remittance, which does not exist, so they are an explicit unavailable rather
 *   than $0.00, because zero is a measurement.
 * - **Setup and superbills live here too.** Charge templates, fees and billing
 *   identity are the "Practice setup" view; a reviewed charge can be rendered as a
 *   superbill for a self-pay or out-of-network patient.
 * - **Submission is disabled and says why.** No clearinghouse adapter is configured,
 *   and the control carries that sentence rather than being quietly missing.
 */

type ChargeView = BillingWorkspaceView["charges"][number];
type AwaitingRow = BillingWorkspaceView["awaitingCharge"][number];

function statusLabel(status: ChargeView["status"]) {
  return status === "prepared" ? "Prepared" : status === "reviewed" ? "Reviewed" : "Void";
}

function coverageLabel(charge: ChargeView) {
  if (charge.coverageBasis === "policy-on-file") {
    return charge.coveragePayerName || "Policy on file";
  }
  if (charge.coverageBasis === "self-pay-recorded") return "Self-pay recorded";
  return "No coverage record on file";
}

/** A number that cannot be known yet, rendered so it cannot be read as zero. */
function Unavailable({ reason }: { reason: string }) {
  return (
    <>
      <span className="billing-unavailable" aria-label="Unavailable">—</span>
      <span className="billing-unavailable-note">{reason}</span>
    </>
  );
}

export default function BillingWorkspace() {
  const [view, setView] = useState<BillingWorkspaceView | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [selectedChargeId, setSelectedChargeId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  // Charges stays the default while Workflow (BILL-05) proves parity beside it.
  const [billingView, setBillingView] = useState<"charges" | "workflow" | "setup">("charges");
  const [superbillChargeId, setSuperbillChargeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await api.billing.worklist();
      setView(next);
      setPermissionDenied(false);
    } catch (caught) {
      // A refusal is not an empty worklist. Financial access is granted separately
      // from clinical access, so a clinician without it must be told that rather
      // than shown a screen that looks like a practice with no billing.
      if (caught instanceof ApiError && caught.status === 403) {
        setPermissionDenied(true);
        setView(null);
      } else {
        setError(caught instanceof Error ? caught.message : "Billing could not be loaded.");
      }
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const charges = view?.charges ?? [];
  const selectedCharge = useMemo(
    () => charges.find((charge) => charge.id === selectedChargeId) ?? charges[0] ?? null,
    [charges, selectedChargeId],
  );

  async function runAction(id: string, label: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setActionError(null);
    setActionNotice(null);
    try {
      await action();
      await load();
      setActionNotice(`${label} recorded.`);
    } catch (caught) {
      // Nothing optimistic is applied before this point, so a failure leaves the
      // screen showing what the server still holds rather than a state the server
      // never accepted.
      setActionError(caught instanceof Error ? caught.message : `${label} failed.`);
    } finally {
      setBusyId(null);
    }
  }

  // One implementation of each charge action, shared by the Charges and Workflow
  // views, so the two surfaces cannot apply different rules to the same record.
  function prepareCharge(row: AwaitingRow) {
    void runAction(row.encounterId, "Charge preparation", () => api.billing.prepare(row.encounterId, row.patientId));
  }

  function reviewCharge(charge: ChargeView) {
    void runAction(charge.id, "Charge review", () =>
      api.billing.review(charge.id, charge.patientId, { expectedVersion: charge.version }),
    );
  }

  function voidCharge(charge: ChargeView) {
    const reason = window.prompt("Why is this charge being voided?")?.trim();
    if (!reason) return;
    void runAction(`${charge.id}-void`, "Charge void", () =>
      api.billing.void(charge.id, charge.patientId, { reason, expectedVersion: charge.version }),
    );
  }

  if (permissionDenied) {
    return (
      <section className="global-module-placeholder">
        <div className="global-module-placeholder-icon"><Icon name="lock" size="lg" /></div>
        <h2>Financial access required</h2>
        <p>
          Billing records are restricted to accounts with financial access. Your account can reach
          this practice&apos;s charts but not its charges, claims or totals. A practice owner or
          manager can grant financial access.
        </p>
      </section>
    );
  }

  const summary = view?.summary;
  const transport = view?.transport;
  const awaiting = view?.awaitingCharge ?? [];

  return (
    <div className="practice-subworkspace billing-workspace" data-billing-surface="authoritative">
      <div className="billing-view-switch" role="tablist" aria-label="Billing view">
        <button type="button" role="tab" aria-selected={billingView === "charges"} onClick={() => setBillingView("charges")}>
          Charges
        </button>
        <button type="button" role="tab" aria-selected={billingView === "workflow"} onClick={() => setBillingView("workflow")}>
          Workflow
        </button>
        <button type="button" role="tab" aria-selected={billingView === "setup"} onClick={() => setBillingView("setup")}>
          Practice setup
        </button>
      </div>

      {billingView !== "setup" && transport && !(transport.configured && transport.readiness === "ready") && (
        <div className="billing-transport-notice" role="note" data-billing-transport="unavailable">
          <Icon name="info" />
          <span>
            <strong>Claims cannot be submitted from this practice.</strong>{" "}
            {transport.unavailableReason} Charges below can be prepared and reviewed; nothing has
            been sent to a payer and no payer status is known.
          </span>
        </div>
      )}

      {actionError && billingView !== "setup" && (
        <div className="ui-state ui-state-error" role="alert">
          <Icon name="error" />
          <p>{actionError}</p>
        </div>
      )}
      {actionNotice && billingView !== "setup" && (
        <div className="ui-state ui-state-empty" role="status">
          <p>{actionNotice}</p>
        </div>
      )}

      {billingView === "setup" ? (
        <BillingSetupPanel />
      ) : billingView === "workflow" ? (
        <BillingWorkflowQueue
          view={view}
          loading={loading}
          error={error}
          hasLoadedOnce={hasLoadedOnce}
          busyId={busyId}
          onRetry={() => void load()}
          onPrepare={prepareCharge}
          onReview={reviewCharge}
          onVoid={voidCharge}
          onSuperbill={setSuperbillChargeId}
          onShowInCharges={(chargeId) => {
            setSelectedChargeId(chargeId);
            setBillingView("charges");
          }}
          onOpenSetup={() => setBillingView("setup")}
        />
      ) : (
      <>

      <div className="billing-metrics-grid">
        <div className="billing-metric-card">
          <span className="metric-label">Signed encounters</span>
          <span className="metric-value">{summary ? summary.signedEncounters : "—"}</span>
          <span className="metric-sub">{summary?.periodLabel ?? "Loading"} · the denominator below</span>
          {/*
            A window that excludes records says how many. Some encounters carry a
            signing timestamp in a form that cannot be placed in time, and because
            a signed record is immutable it cannot be normalised in place — so the
            count discloses them rather than quietly leaving them out.
          */}
          {summary && summary.signedEncountersUnplaceable > 0 && (
            <span className="billing-unavailable-note" data-billing-unplaceable={summary.signedEncountersUnplaceable}>
              {summary.signedEncountersUnplaceable} signed encounter
              {summary.signedEncountersUnplaceable === 1 ? "" : "s"} could not be placed in time and
              are in no window. They still appear in the unbilled backlog.
            </span>
          )}
        </div>
        <div className="billing-metric-card">
          <span className="metric-label">Unbilled signed encounters</span>
          <span className="metric-value">{summary ? summary.encountersAwaitingCharge : "—"}</span>
          {/*
            Deliberately not "of N this window". This is a backlog across all time,
            and the tile beside it counts a period — presenting one as a ratio of
            the other would be a false figure built from two different scopes.
          */}
          <span className="metric-sub">All time, not just this window</span>
        </div>
        <div className="billing-metric-card">
          <span className="metric-label">Charges reviewed</span>
          <span className="metric-value">{summary ? summary.chargesReviewed : "—"}</span>
          <span className="metric-sub">
            {summary
              ? `of ${summary.chargesPrepared + summary.chargesReviewed} prepared in this window`
              : "Loading"}
          </span>
        </div>
        <div className="billing-metric-card" data-billing-billed={summary?.linesWithFee ? summary.billedAtFeeScheduleCents : "none"}>
          <span className="metric-label">Billed at practice fees</span>
          <span className="metric-value">
            {summary && summary.linesWithFee > 0 ? (
              formatCents(summary.billedAtFeeScheduleCents)
            ) : (
              <span className="billing-unavailable" aria-label="No priced charges">—</span>
            )}
          </span>
          <span className="metric-sub">
            {!summary
              ? "Loading"
              : summary.linesWithFee === 0
                ? `No priced charge lines · ${summary.periodLabel.toLowerCase()}. Fees come only from the practice fee schedule.`
                : summary.linesWithoutFee > 0
                  ? `${summary.linesWithoutFee} line${summary.linesWithoutFee === 1 ? "" : "s"} without a fee not included · ${summary.periodLabel.toLowerCase()}`
                  : summary.periodLabel}
          </span>
          <span className="billing-unavailable-note">
            Expected and collected: unavailable. {summary?.monetaryTotalsUnavailableReason ?? ""}
          </span>
        </div>
      </div>

      <div className="billing-main-layout">
        <div className="billing-table-pane">
          <div className="billing-toolbar">
            <div>
              <strong>Charges</strong>
              <span className="billing-unavailable-note">
                {summary
                  ? `Prepared from signed encounters. Counted over ${summary.periodLabel.toLowerCase()}, computed ${new Date(summary.computedAt).toLocaleString()}.`
                  : ""}
              </span>
            </div>
            <Button size="sm" icon="refresh" onClick={() => void load()}>
              Refresh
            </Button>
          </div>

          <AsyncSection
            loading={loading}
            error={error}
            isEmpty={charges.length === 0}
            hasLoadedOnce={hasLoadedOnce}
            loadingMessage="Loading charges…"
            emptyMessage="No charges have been prepared yet. Prepare one from a signed encounter below."
            onRetry={() => void load()}
          >
            <div className="billing-claims-list">
              <table className="billing-table">
                <thead>
                  <tr>
                    <th>Charge</th>
                    <th>Patient</th>
                    <th>Service date</th>
                    <th>Procedure</th>
                    <th>Diagnoses</th>
                    <th>Coverage</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {charges.map((charge) => (
                    <tr
                      key={charge.id}
                      className={`claim-row ${charge.id === selectedCharge?.id ? "selected" : ""}`}
                      onClick={() => setSelectedChargeId(charge.id)}
                      data-charge-id={charge.id}
                      data-charge-encounter={charge.encounterId}
                    >
                      <td><strong>{charge.id.slice(0, 12)}</strong></td>
                      <td>
                        <div className="patient-cell-name">{charge.patientName}</div>
                        <div className="patient-cell-mrn">{charge.patientMrn}</div>
                      </td>
                      <td>{charge.serviceDate || "—"}</td>
                      <td>
                        <div className="cpt-chips">
                          {charge.procedureCodes.length === 0
                            ? <span className="billing-unavailable">none</span>
                            : charge.procedureCodes.map((code) => (
                                <span key={code.code} className="cpt-chip">{code.code}</span>
                              ))}
                        </div>
                      </td>
                      <td>
                        <div className="cpt-chips">
                          {charge.diagnosisCodes.length === 0
                            ? <span className="billing-unavailable">none coded</span>
                            : charge.diagnosisCodes.map((code) => (
                                <span key={code.code} className="cpt-chip">{code.code}</span>
                              ))}
                        </div>
                      </td>
                      <td>{coverageLabel(charge)}</td>
                      <td>
                        <span className={`claim-status-badge status-${charge.status}`}>
                          {statusLabel(charge.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AsyncSection>

          <div className="billing-toolbar" style={{ marginTop: "1.25rem" }}>
            <div>
              <strong>Signed encounters awaiting a charge</strong>
              <span className="billing-unavailable-note">
                Every unbilled signed encounter, oldest work included. A charge can only be
                prepared from a signed note, and it carries the codes frozen into that signed
                record.
              </span>
            </div>
          </div>

          <AsyncSection
            loading={loading}
            error={error}
            isEmpty={awaiting.length === 0}
            hasLoadedOnce={hasLoadedOnce}
            loadingMessage="Loading signed encounters…"
            emptyMessage="Every signed encounter in this window already has a charge."
            onRetry={() => void load()}
          >
            <table className="billing-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Visit</th>
                  <th>Signed</th>
                  <th>Attested code</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {awaiting.map((row) => (
                  <tr key={row.encounterId} data-awaiting-encounter={row.encounterId}>
                    <td>
                      <div className="patient-cell-name">{row.patientName}</div>
                      <div className="patient-cell-mrn">{row.patientMrn}</div>
                    </td>
                    <td>{row.encounterType}</td>
                    <td>{row.signedAt ? new Date(row.signedAt).toLocaleDateString() : "—"}</td>
                    <td>{row.cptCode ? <span className="cpt-chip">{row.cptCode}</span> : "—"}</td>
                    <td>
                      <Button
                        size="sm"
                        icon="receipt_long"
                        loading={busyId === row.encounterId}
                        onClick={() => prepareCharge(row)}
                      >
                        Prepare charge
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AsyncSection>
        </div>

        {selectedCharge && (
          <aside className="billing-inspector-pane">
            <div className="inspector-header">
              <h3>Charge</h3>
              <span className={`claim-status-badge status-${selectedCharge.status}`}>
                {statusLabel(selectedCharge.status)}
              </span>
            </div>

            <div className="inspector-field">
              <label>Patient</label>
              <p>{selectedCharge.patientName} ({selectedCharge.patientMrn})</p>
            </div>

            <div className="inspector-field">
              <label>Signed encounter</label>
              <p>{selectedCharge.encounterId}</p>
              <span className="billing-unavailable-note">
                Legal record hash {selectedCharge.encounterSnapshotSha256.slice(0, 16)}… — the codes
                below are the ones frozen at signature.
              </span>
            </div>

            <div className="inspector-field">
              <label>Attested procedure code(s)</label>
              {selectedCharge.procedureCodes.length === 0 ? (
                <p className="billing-unavailable">None on the signed record.</p>
              ) : (
                <ul className="cpt-breakdown-list">
                  {selectedCharge.procedureCodes.map((code) => (
                    <li key={code.code}>
                      <strong>
                        {code.codingSystem} {code.code}
                        {code.modifiers && code.modifiers.length > 0 ? `-${code.modifiers.join("-")}` : ""}
                      </strong>
                      <span>
                        {code.description} · {code.units} unit(s) ·{" "}
                        {typeof code.feeCents === "number" ? formatCents(code.feeCents) : "no practice fee"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="inspector-field">
              <label>Attested diagnoses</label>
              {selectedCharge.diagnosisCodes.length === 0 ? (
                <p className="billing-unavailable">No coded diagnosis was attested on this note.</p>
              ) : (
                <ul className="cpt-breakdown-list">
                  {selectedCharge.diagnosisCodes.map((code) => (
                    <li key={code.code}>
                      <strong>{code.code}</strong>
                      <span>{code.display} ({code.codingSystem})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="inspector-field">
              <label>Coverage at preparation</label>
              <p>{coverageLabel(selectedCharge)}</p>
              <span className="billing-unavailable-note">
                Copied from the chart as recorded. No payer has been asked anything: eligibility
                verification does not exist yet.
              </span>
            </div>

            <div className="inspector-field">
              <label>Place of service · template</label>
              <p>
                {selectedCharge.placeOfService ?? "None"}
                {selectedCharge.chargeTemplateName ? ` · ${selectedCharge.chargeTemplateName}` : " · no charge template applied"}
              </p>
              {!selectedCharge.placeOfService && (
                <span className="billing-unavailable-note">
                  No place of service is set when no charge template matched the note, or when the visit had no
                  appointment recording how it was held.
                </span>
              )}
            </div>

            <div className="inspector-field">
              <label>Amounts</label>
              <p>
                Billed at practice fees:{" "}
                <strong>
                  {chargeTotalCents(selectedCharge.procedureCodes) === null
                    ? "not computable — a line has no fee"
                    : formatCents(chargeTotalCents(selectedCharge.procedureCodes)!)}
                </strong>
              </p>
              <p>
                <Unavailable
                  reason={
                    summary?.monetaryTotalsUnavailableReason ??
                    "Expected and collected amounts require payer remittance."
                  }
                />
              </p>
            </div>

            <div className="inspector-field">
              <label>History</label>
              <p>
                Prepared by {selectedCharge.preparedByName} on{" "}
                {new Date(selectedCharge.preparedAt).toLocaleString()}.
              </p>
              {selectedCharge.reviewedAt && (
                <p>
                  Reviewed by {selectedCharge.reviewedByName} on{" "}
                  {new Date(selectedCharge.reviewedAt).toLocaleString()}.
                </p>
              )}
              {selectedCharge.voidedAt && (
                <p>Voided {new Date(selectedCharge.voidedAt).toLocaleString()}: {selectedCharge.voidReason}</p>
              )}
            </div>

            {selectedCharge.blockers.length > 0 && (
              <div className="inspector-alert">
                <Icon name="info" />
                <div>
                  <strong>Not ready for review</strong>
                  <ul className="billing-blockers">
                    {selectedCharge.blockers.map((blocker) => (
                      <li key={blocker.code}>{blocker.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="inspector-actions">
              {selectedCharge.reviewable ? (
                <Button
                  size="sm"
                  icon="fact_check"
                  loading={busyId === selectedCharge.id}
                  onClick={() => reviewCharge(selectedCharge)}
                >
                  Mark reviewed
                </Button>
              ) : (
                <Button
                  size="sm"
                  icon="fact_check"
                  disabled
                  disabledReason={selectedCharge.blockers[0]?.message ?? "This charge cannot be reviewed."}
                >
                  Mark reviewed
                </Button>
              )}

              {superbillRefusal(selectedCharge) === null ? (
                <Button size="sm" icon="description" onClick={() => setSuperbillChargeId(selectedCharge.id)}>
                  Superbill
                </Button>
              ) : (
                <Button size="sm" icon="description" disabled disabledReason={superbillRefusal(selectedCharge)!}>
                  Superbill
                </Button>
              )}

              {/*
                Submission is shown and refused rather than hidden. A missing control
                leaves a clinician wondering where it went; a disabled one that names
                the reason tells them the capability does not exist here yet.
              */}
              <Button
                size="sm"
                icon="send"
                disabled
                disabledReason={
                  transport?.unavailableReason ??
                  "Claim submission requires a configured clearinghouse adapter, which this practice does not have."
                }
              >
                Submit claim
              </Button>

              {selectedCharge.status !== "void" && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon="block"
                  loading={busyId === `${selectedCharge.id}-void`}
                  onClick={() => voidCharge(selectedCharge)}
                >
                  Void charge
                </Button>
              )}
            </div>
          </aside>
        )}
      </div>
      </>
      )}

      {superbillChargeId && (
        <SuperbillDocument chargeId={superbillChargeId} onClose={() => setSuperbillChargeId(null)} />
      )}
    </div>
  );
}
