"use client";

import { useState } from "react";
import Icon from "../ui/Icon";
import Button from "../ui/Button";

/**
 * The retained billing and financial-integration visual prototypes (roadmap P9-0).
 *
 * These two screens used to be live destinations in the workspace. They held
 * invented claims, an invented clean-claim rate, invented bank deposits, and
 * buttons that announced "Batch 837P transmitted 1 claim to Availity clearinghouse"
 * after mutating React state and talking to nothing. A clinician could not tell any
 * of that apart from a working revenue cycle.
 *
 * P9-0 kept the layout and moved it here, because the design work is worth keeping
 * and the deception was in the framing rather than the pixels. The rules this file
 * holds itself to:
 *
 * - it is reachable only at `/preview/billing`, which renders no workspace chrome;
 * - it issues no request and imports no client, so no control can touch a record;
 * - every figure is marked demo, and no control reports an outcome. Pressing
 *   "submit" says a submission would happen here, never that one did.
 *
 * The live Billing destination is `BillingWorkspace`, which reads `/api/billing`
 * and carries no sample data at all.
 */

type PrototypeClaimStatus = "paid" | "submitted" | "ready" | "denied";

interface PrototypeClaim {
  id: string;
  patientName: string;
  mrn: string;
  serviceDate: string;
  cptCodes: string[];
  diagnosis: string;
  payer: string;
  billedAmount: number;
  expectedAmount: number;
  status: PrototypeClaimStatus;
  notes?: string;
}

/**
 * Invented rows. The names do not correspond to the synthetic development roster on
 * purpose, so a screenshot of this page cannot be mistaken for one of the workspace.
 */
const DEMO_CLAIMS: PrototypeClaim[] = [
  {
    id: "DEMO-9042",
    patientName: "Demo Patient A",
    mrn: "DEMO-84920",
    serviceDate: "Demo day 0, 10:00 AM",
    cptCodes: ["99214", "90833"],
    diagnosis: "F33.1 Major Depressive Disorder, Recurrent, Moderate",
    payer: "Demo Commercial Payer",
    billedAmount: 285.0,
    expectedAmount: 215.0,
    status: "ready",
    notes: "Demo row: illustrates a charge awaiting batch preparation.",
  },
  {
    id: "DEMO-9038",
    patientName: "Demo Patient B",
    mrn: "DEMO-77312",
    serviceDate: "Demo day −1, 02:15 PM",
    cptCodes: ["99213", "90833"],
    diagnosis: "F31.81 Bipolar II Disorder",
    payer: "Demo Behavioral Payer",
    billedAmount: 240.0,
    expectedAmount: 185.0,
    status: "submitted",
    notes: "Demo row: illustrates the state a claim would sit in after transmission.",
  },
  {
    id: "DEMO-9015",
    patientName: "Demo Patient C",
    mrn: "DEMO-64219",
    serviceDate: "Demo day −3",
    cptCodes: ["99214"],
    diagnosis: "F41.1 Generalized Anxiety Disorder",
    payer: "Demo National Payer",
    billedAmount: 195.0,
    expectedAmount: 155.0,
    status: "paid",
    notes: "Demo row: illustrates a reconciled remittance. No payment occurred.",
  },
  {
    id: "DEMO-8984",
    patientName: "Demo Patient D",
    mrn: "DEMO-55104",
    serviceDate: "Demo day −5",
    cptCodes: ["99214", "90833"],
    diagnosis: "F10.20 Alcohol Use Disorder, In Remission",
    payer: "Demo Regional Payer",
    billedAmount: 285.0,
    expectedAmount: 210.0,
    status: "denied",
    notes: "Demo row: illustrates a denial that would open a follow-up task.",
  },
];

const DEMO_LEDGER = [
  { id: "demo-tx-501", date: "Demo day 0", description: "Card processor payout", source: "Demo processor", amount: 1480.0 },
  { id: "demo-tx-500", date: "Demo day −1", description: "Payer EFT remittance batch", source: "Demo payer", amount: 3240.5 },
  { id: "demo-tx-499", date: "Demo day −3", description: "Patient copay", source: "Demo processor", amount: 35.0 },
  { id: "demo-tx-498", date: "Demo day −4", description: "Accounting journal entry: insurance premium", source: "Demo ledger", amount: -680.0 },
];

function DemoValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="billing-demo-value">
      <span className="billing-demo-tag">Demo</span>
      {children}
    </span>
  );
}

export default function BillingPrototypePreview() {
  const [filter, setFilter] = useState<"all" | PrototypeClaimStatus>("all");
  const [selectedClaimId, setSelectedClaimId] = useState<string>("DEMO-9042");
  const [inertNotice, setInertNotice] = useState<string | null>(null);

  const filteredClaims = DEMO_CLAIMS.filter((claim) => filter === "all" || claim.status === filter);
  const selectedClaim = DEMO_CLAIMS.find((claim) => claim.id === selectedClaimId);

  /**
   * The only thing any control in this file does.
   *
   * It deliberately reports that nothing happened. The previous version of this
   * screen flipped rows to "submitted" and showed a success banner, which is the
   * specific behaviour P9-0 exists to remove — a demo that simulates a successful
   * outcome is indistinguishable from a product that achieved one.
   */
  function explainInert(label: string) {
    setInertNotice(
      `"${label}" does nothing. This is a design preview: no claim was prepared, transmitted or paid, and no record was written.`,
    );
  }

  return (
    <div className="billing-preview" data-preview="billing">
      <div className="dash-preview-banner" role="note" data-preview-banner="true">
        <Icon name="science" size="sm" />
        <strong>Design preview — not a live billing system.</strong>
        <span>
          Every patient, claim, code, dollar figure and payer below is invented for this prototype.
          Nothing here reads or writes the database, no claim can be transmitted, and no control
          performs a financial action. The working Billing destination is in the workspace.
        </span>
      </div>

      <section className="practice-subworkspace billing-workspace" aria-label="Claims prototype">
        <header className="workspace-page-header">
          <div>
            <h2>Claims workspace prototype</h2>
            <p>
              Layout study for the P9 revenue cycle. Retained for design reference after P9-0
              removed it from the workspace.
            </p>
          </div>
        </header>

        {inertNotice && (
          <div className="ui-state ui-state-error" role="status">
            <Icon name="info" />
            <p>{inertNotice}</p>
            <Button variant="secondary" size="sm" onClick={() => setInertNotice(null)}>
              Dismiss
            </Button>
          </div>
        )}

        <div className="billing-metrics-grid">
          <div className="billing-metric-card">
            <span className="metric-label">Ready for batch (unbilled)</span>
            <span className="metric-value"><DemoValue>$285.00</DemoValue></span>
            <span className="metric-sub">Invented figure — illustrates the tile only</span>
          </div>
          <div className="billing-metric-card">
            <span className="metric-label">A/R in process</span>
            <span className="metric-value"><DemoValue>$185.00</DemoValue></span>
            <span className="metric-sub">Invented figure — no claim is in process</span>
          </div>
          <div className="billing-metric-card">
            <span className="metric-label">Settled / paid</span>
            <span className="metric-value"><DemoValue>$155.00</DemoValue></span>
            <span className="metric-sub">Invented figure — no money has moved</span>
          </div>
          <div className="billing-metric-card">
            <span className="metric-label">Denials &amp; exceptions</span>
            <span className="metric-value"><DemoValue>1</DemoValue></span>
            <span className="metric-sub">Invented figure — no payer has responded</span>
          </div>
        </div>

        <div className="billing-main-layout">
          <div className="billing-table-pane">
            <div className="billing-toolbar">
              <div className="filter-pill-group">
                {(["all", "ready", "submitted", "denied", "paid"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`filter-pill ${filter === value ? "active" : ""}`}
                    onClick={() => setFilter(value)}
                  >
                    {value === "all"
                      ? `All (${DEMO_CLAIMS.length})`
                      : `${value} (${DEMO_CLAIMS.filter((claim) => claim.status === value).length})`}
                  </button>
                ))}
              </div>
              <Button size="sm" icon="send" onClick={() => explainInert("Transmit batch (837P)")}>
                Transmit batch (837P) — demo
              </Button>
            </div>

            <div className="billing-claims-list">
              <table className="billing-table">
                <caption className="billing-demo-caption">
                  Demo rows. No patient, claim or amount below is real.
                </caption>
                <thead>
                  <tr>
                    <th>Claim ID</th>
                    <th>Patient</th>
                    <th>Date</th>
                    <th>CPT codes</th>
                    <th>Payer</th>
                    <th>Billed</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClaims.map((claim) => (
                    <tr
                      key={claim.id}
                      className={`claim-row ${claim.id === selectedClaimId ? "selected" : ""}`}
                      onClick={() => setSelectedClaimId(claim.id)}
                    >
                      <td><strong>{claim.id}</strong></td>
                      <td>
                        <div className="patient-cell-name">{claim.patientName}</div>
                        <div className="patient-cell-mrn">{claim.mrn}</div>
                      </td>
                      <td>{claim.serviceDate}</td>
                      <td>
                        <div className="cpt-chips">
                          {claim.cptCodes.map((code) => (
                            <span key={code} className="cpt-chip">{code}</span>
                          ))}
                        </div>
                      </td>
                      <td>{claim.payer}</td>
                      <td><DemoValue>${claim.billedAmount.toFixed(2)}</DemoValue></td>
                      <td>
                        <span className={`claim-status-badge status-${claim.status}`}>{claim.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {selectedClaim && (
            <aside className="billing-inspector-pane">
              <div className="inspector-header">
                <h3>Claim {selectedClaim.id}</h3>
                <span className={`claim-status-badge status-${selectedClaim.status}`}>
                  {selectedClaim.status}
                </span>
              </div>

              <div className="inspector-field">
                <label>Patient</label>
                <p>{selectedClaim.patientName} ({selectedClaim.mrn})</p>
              </div>

              <div className="inspector-field">
                <label>Primary diagnosis (ICD-10)</label>
                <p>{selectedClaim.diagnosis}</p>
              </div>

              <div className="inspector-field">
                <label>Payer</label>
                <p>{selectedClaim.payer}</p>
              </div>

              <div className="inspector-field">
                <label>Financials</label>
                <div className="inspector-financial-row">
                  <span>Charge billed:</span>
                  <DemoValue>${selectedClaim.billedAmount.toFixed(2)}</DemoValue>
                </div>
                <div className="inspector-financial-row">
                  <span>Expected remittance:</span>
                  <DemoValue>${selectedClaim.expectedAmount.toFixed(2)}</DemoValue>
                </div>
              </div>

              {selectedClaim.notes && (
                <div className="inspector-alert">
                  <Icon name="info" />
                  <span>{selectedClaim.notes}</span>
                </div>
              )}

              <div className="inspector-actions">
                <Button size="sm" icon="replay" onClick={() => explainInert("Fix auth & resubmit claim")}>
                  Fix auth &amp; resubmit — demo
                </Button>
                <Button size="sm" icon="print" onClick={() => explainInert("Generate superbill (CMS-1500)")}>
                  Generate superbill — demo
                </Button>
              </div>
            </aside>
          )}
        </div>
      </section>

      <section className="practice-subworkspace financial-workspace" aria-label="Financial integration prototype">
        <header className="workspace-page-header">
          <div>
            <h2>Financial integration prototype</h2>
            <p>
              Layout study for an accounting and banking ledger. No accounting, payment-processor or
              banking integration exists in this product, and none is configured.
            </p>
          </div>
          <div className="header-actions">
            <Button size="sm" icon="sync" onClick={() => explainInert("Sync accounting & payments")}>
              Sync accounting &amp; payments — demo
            </Button>
          </div>
        </header>

        <div className="billing-metrics-grid">
          <div className="billing-metric-card">
            <span className="metric-label">Monthly gross revenue</span>
            <span className="metric-value"><DemoValue>$42,850.00</DemoValue></span>
            <span className="metric-sub">Invented figure — this practice&apos;s revenue is not known here</span>
          </div>
          <div className="billing-metric-card">
            <span className="metric-label">Processor balance</span>
            <span className="metric-value"><DemoValue>$3,415.50</DemoValue></span>
            <span className="metric-sub">Invented figure — no processor is connected</span>
          </div>
          <div className="billing-metric-card">
            <span className="metric-label">Accounting sync</span>
            <span className="metric-value"><DemoValue>Illustrative only</DemoValue></span>
            <span className="metric-sub">No accounting system is connected</span>
          </div>
        </div>

        <table className="billing-table">
          <caption className="billing-demo-caption">
            Demo ledger. No deposit, payout or remittance below occurred.
          </caption>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Source</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_LEDGER.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.date}</td>
                <td>{entry.description}</td>
                <td>{entry.source}</td>
                <td><DemoValue>${entry.amount.toFixed(2)}</DemoValue></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
