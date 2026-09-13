"use client";

import { useState } from "react";
import Icon from "../ui/Icon";
import Button from "../ui/Button";

type ClaimStatus = "paid" | "submitted" | "ready" | "denied";

interface Claim {
  id: string;
  patientName: string;
  mrn: string;
  serviceDate: string;
  cptCodes: string[];
  diagnosis: string;
  payer: string;
  billedAmount: number;
  expectedAmount: number;
  status: ClaimStatus;
  notes?: string;
}

const INITIAL_CLAIMS: Claim[] = [
  {
    id: "CLM-9042",
    patientName: "Elena Rostova",
    mrn: "MRN-84920",
    serviceDate: "Today, 10:00 AM",
    cptCodes: ["99214", "90833"],
    diagnosis: "F33.1 Major Depressive Disorder, Recurrent, Moderate",
    payer: "Blue Cross Blue Shield",
    billedAmount: 285.0,
    expectedAmount: 215.0,
    status: "ready",
    notes: "Requires clinician note signature before EDI batch",
  },
  {
    id: "CLM-9038",
    patientName: "Jordan Reed",
    mrn: "MRN-77312",
    serviceDate: "Yesterday, 02:15 PM",
    cptCodes: ["99213", "90833"],
    diagnosis: "F31.81 Bipolar II Disorder",
    payer: "Aetna Behavioral Health",
    billedAmount: 240.0,
    expectedAmount: 185.0,
    status: "submitted",
    notes: "EDI batch 837P transmitted to clearinghouse",
  },
  {
    id: "CLM-9015",
    patientName: "Maya Chen",
    mrn: "MRN-64219",
    serviceDate: "Sep 11, 2026",
    cptCodes: ["99214"],
    diagnosis: "F41.1 Generalized Anxiety Disorder",
    payer: "UnitedHealthcare Optum",
    billedAmount: 195.0,
    expectedAmount: 155.0,
    status: "paid",
    notes: "ERA 835 received; EFT deposited $155.00",
  },
  {
    id: "CLM-8984",
    patientName: "Marcus Vance",
    mrn: "MRN-55104",
    serviceDate: "Sep 09, 2026",
    cptCodes: ["99214", "90833"],
    diagnosis: "F10.20 Alcohol Use Disorder, In Remission",
    payer: "Cigna Health",
    billedAmount: 285.0,
    expectedAmount: 210.0,
    status: "denied",
    notes: "CO-16: Prior auth number mismatch. Resubmission ready.",
  },
  {
    id: "CLM-8960",
    patientName: "Chloe Bennett",
    mrn: "MRN-91024",
    serviceDate: "Sep 08, 2026",
    cptCodes: ["90792"],
    diagnosis: "F90.2 ADHD, Combined Presentation",
    payer: "Medicare Part B",
    billedAmount: 350.0,
    expectedAmount: 265.0,
    status: "paid",
    notes: "Electronic remittance advice settled",
  },
];

export default function BillingWorkspace() {
  const [claims, setClaims] = useState<Claim[]>(INITIAL_CLAIMS);
  const [filter, setFilter] = useState<"all" | ClaimStatus>("all");
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>("CLM-9042");
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const filteredClaims = claims.filter((c) => filter === "all" || c.status === filter);

  const selectedClaim = claims.find((c) => c.id === selectedClaimId);

  const handleBatchSubmit = () => {
    setClaims((prev) =>
      prev.map((c) => (c.status === "ready" ? { ...c, status: "submitted" } : c))
    );
    setActionSuccess("Batch 837P transmitted 1 claim to Availity clearinghouse");
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const handleResubmit = (claimId: string) => {
    setClaims((prev) =>
      prev.map((c) =>
        c.id === claimId
          ? { ...c, status: "submitted", notes: "Corrected claim re-transmitted with updated auth ID" }
          : c
      )
    );
    setActionSuccess(`Claim ${claimId} resubmitted successfully`);
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const totalUnbilled = claims
    .filter((c) => c.status === "ready")
    .reduce((sum, c) => sum + c.billedAmount, 0);

  const totalSubmitted = claims
    .filter((c) => c.status === "submitted")
    .reduce((sum, c) => sum + c.expectedAmount, 0);

  const totalPaidMonth = claims
    .filter((c) => c.status === "paid")
    .reduce((sum, c) => sum + c.expectedAmount, 0);

  return (
    <div className="practice-subworkspace billing-workspace">
      {actionSuccess && (
        <div className="practice-banner-success">
          <Icon name="check_circle" /> {actionSuccess}
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="billing-metrics-grid">
        <div className="billing-metric-card">
          <span className="metric-label">Ready for Batch (Unbilled)</span>
          <span className="metric-value">${totalUnbilled.toFixed(2)}</span>
          <span className="metric-sub">{claims.filter((c) => c.status === "ready").length} encounters queued</span>
        </div>
        <div className="billing-metric-card">
          <span className="metric-label">A/R In Process (Clearinghouse)</span>
          <span className="metric-value">${totalSubmitted.toFixed(2)}</span>
          <span className="metric-sub">Expected payout within 14 days</span>
        </div>
        <div className="billing-metric-card">
          <span className="metric-label">Settled / Paid (This Month)</span>
          <span className="metric-value" style={{ color: "var(--success)" }}>${totalPaidMonth.toFixed(2)}</span>
          <span className="metric-sub">98.2% clean claim rate</span>
        </div>
        <div className="billing-metric-card">
          <span className="metric-label">Denials &amp; Exceptions</span>
          <span className="metric-value" style={{ color: "var(--warning)" }}>1</span>
          <span className="metric-sub">1 actionable prior-auth mismatch</span>
        </div>
      </div>

      {/* Main Billing Canvas */}
      <div className="billing-main-layout">
        {/* Claims Table */}
        <div className="billing-table-pane">
          <div className="billing-toolbar">
            <div className="filter-pill-group">
              <button
                type="button"
                className={`filter-pill ${filter === "all" ? "active" : ""}`}
                onClick={() => setFilter("all")}
              >
                All ({claims.length})
              </button>
              <button
                type="button"
                className={`filter-pill ${filter === "ready" ? "active" : ""}`}
                onClick={() => setFilter("ready")}
              >
                Ready to Batch ({claims.filter((c) => c.status === "ready").length})
              </button>
              <button
                type="button"
                className={`filter-pill ${filter === "submitted" ? "active" : ""}`}
                onClick={() => setFilter("submitted")}
              >
                Submitted ({claims.filter((c) => c.status === "submitted").length})
              </button>
              <button
                type="button"
                className={`filter-pill ${filter === "denied" ? "active" : ""}`}
                onClick={() => setFilter("denied")}
              >
                Denied ({claims.filter((c) => c.status === "denied").length})
              </button>
              <button
                type="button"
                className={`filter-pill ${filter === "paid" ? "active" : ""}`}
                onClick={() => setFilter("paid")}
              >
                Paid ({claims.filter((c) => c.status === "paid").length})
              </button>
            </div>
            <Button size="sm" icon="send" onClick={handleBatchSubmit}>
              Transmit Batch (837P)
            </Button>
          </div>

          <div className="billing-claims-list">
            <table className="billing-table">
              <thead>
                <tr>
                  <th>Claim ID</th>
                  <th>Patient</th>
                  <th>Date</th>
                  <th>CPT Codes</th>
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
                        {claim.cptCodes.map((c) => (
                          <span key={c} className="cpt-chip">{c}</span>
                        ))}
                      </div>
                    </td>
                    <td>{claim.payer}</td>
                    <td><strong>${claim.billedAmount.toFixed(2)}</strong></td>
                    <td>
                      <span className={`claim-status-badge status-${claim.status}`}>
                        {claim.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Claim Inspector */}
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
              <label>Primary Diagnosis (ICD-10)</label>
              <p>{selectedClaim.diagnosis}</p>
            </div>

            <div className="inspector-field">
              <label>Payer &amp; Policy</label>
              <p>{selectedClaim.payer}</p>
            </div>

            <div className="inspector-field">
              <label>CPT Service Breakdown</label>
              <ul className="cpt-breakdown-list">
                {selectedClaim.cptCodes.map((code) => (
                  <li key={code}>
                    <strong>CPT {code}</strong>
                    <span>{code === "99214" ? "E&M Outpatient (30-39 min)" : code === "90833" ? "Psychotherapy Add-on (30 min)" : code === "90792" ? "Psychiatric Diagnostic Eval" : "Office Visit"}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="inspector-field">
              <label>Financials</label>
              <div className="inspector-financial-row">
                <span>Charge Billed:</span>
                <strong>${selectedClaim.billedAmount.toFixed(2)}</strong>
              </div>
              <div className="inspector-financial-row">
                <span>Expected Remittance:</span>
                <strong>${selectedClaim.expectedAmount.toFixed(2)}</strong>
              </div>
            </div>

            {selectedClaim.notes && (
              <div className="inspector-alert">
                <Icon name="info" />
                <span>{selectedClaim.notes}</span>
              </div>
            )}

            <div className="inspector-actions">
              {selectedClaim.status === "denied" && (
                <Button size="sm" icon="replay" onClick={() => handleResubmit(selectedClaim.id)}>
                  Fix Auth &amp; Resubmit Claim
                </Button>
              )}
              {selectedClaim.status === "ready" && (
                <Button size="sm" icon="send" onClick={handleBatchSubmit}>
                  Submit to Clearinghouse
                </Button>
              )}
              <Button size="sm" icon="print">
                Generate Superbill (CMS-1500)
              </Button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
