"use client";

import { useState } from "react";
import Icon from "../ui/Icon";
import Button from "../ui/Button";

interface StaffMember {
  id: string;
  name: string;
  role: string;
  npi: string;
  dea: string;
  licenseStatus: "active" | "expiring_soon" | "verified";
  licenseExp: string;
  malpracticeExp: string;
  fte: string;
  email: string;
}

const STAFF_ROSTER: StaffMember[] = [
  {
    id: "st-1",
    name: "Logan Carton, MD",
    role: "Attending Psychiatrist & Medical Director",
    npi: "1841920391",
    dea: "BC8921045 (Sched II-V)",
    licenseStatus: "verified",
    licenseExp: "10/31/2028 (CA Med Board A140291)",
    malpracticeExp: "12/31/2026 (Norcal Mutual $1M/$3M)",
    fte: "1.0 FTE (Full Time)",
    email: "lcarton@clinicalbondpsych.com",
  },
  {
    id: "st-2",
    name: "Dr. Rebecca Vance, PsyD",
    role: "Clinical Psychologist (Adult CBT & DBT)",
    npi: "1920481723",
    dea: "N/A (Non-prescriber)",
    licenseStatus: "active",
    licenseExp: "05/15/2027 (CA Board of Psych PSY29841)",
    malpracticeExp: "08/30/2027 (TrustCP $1M/$3M)",
    fte: "0.8 FTE (Part Time)",
    email: "rvance@clinicalbondpsych.com",
  },
  {
    id: "st-3",
    name: "Samantha Reed, PMHNP-BC",
    role: "Psychiatric Nurse Practitioner",
    npi: "1679042188",
    dea: "FR9012480 (Sched II-V)",
    licenseStatus: "expiring_soon",
    licenseExp: "11/30/2026 (CA RN/NP #948210)",
    malpracticeExp: "04/15/2027 (Proliance $1M/$3M)",
    fte: "1.0 FTE (Full Time)",
    email: "sreed@clinicalbondpsych.com",
  },
  {
    id: "st-4",
    name: "Marcus Holloway",
    role: "Practice Administrator & Billing Coordinator",
    npi: "N/A (Administrative)",
    dea: "N/A",
    licenseStatus: "verified",
    licenseExp: "CPB Certified Professional Biller",
    malpracticeExp: "Covered under clinic general liability",
    fte: "1.0 FTE (Full Time)",
    email: "mholloway@clinicalbondpsych.com",
  },
];

export default function HRStaffWorkspace() {
  const [staff, setStaff] = useState<StaffMember[]>(STAFF_ROSTER);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("st-1");
  const [notice, setNotice] = useState<string | null>(null);

  const selectedStaff = staff.find((s) => s.id === selectedStaffId);

  const handleRenewAlert = (name: string) => {
    setNotice(`Automated CAQH credentialing renewal notice dispatched for ${name}`);
    setTimeout(() => setNotice(null), 3000);
  };

  return (
    <div className="practice-subworkspace hr-workspace">
      {notice && (
        <div className="practice-banner-success">
          <Icon name="check_circle" /> {notice}
        </div>
      )}

      <div className="workspace-page-header">
        <div>
          <h2>Practice HR, Staff Directory &amp; Provider Credentialing</h2>
          <p>Supervise clinic physicians, clinicians, staff credentials, DEA / NPI registrations, and state medical board compliance.</p>
        </div>
        <Button size="sm" icon="person_add">
          Onboard New Clinician
        </Button>
      </div>

      {/* KPI stats */}
      <div className="billing-metrics-grid">
        <div className="billing-metric-card">
          <span className="metric-label">Active Clinicians</span>
          <span className="metric-value">4 Providers</span>
          <span className="metric-sub">3.8 Total Clinical FTEs</span>
        </div>
        <div className="billing-metric-card">
          <span className="metric-label">Medical Board Status</span>
          <span className="metric-value" style={{ color: "var(--success)" }}>100% Active</span>
          <span className="metric-sub">All licenses verified in good standing</span>
        </div>
        <div className="billing-metric-card">
          <span className="metric-label">Credentialing Action Items</span>
          <span className="metric-value" style={{ color: "var(--warning)" }}>1 Expiring</span>
          <span className="metric-sub">Samantha Reed NP license renews Nov 2026</span>
        </div>
        <div className="billing-metric-card">
          <span className="metric-label">EPCS Two-Factor Token</span>
          <span className="metric-value" style={{ color: "var(--success)" }}>Active</span>
          <span className="metric-sub">DrFirst IdenTrust hard tokens active</span>
        </div>
      </div>

      <div className="hr-layout-grid">
        {/* Staff Directory List */}
        <div className="staff-directory-card">
          <div className="staff-table-header">
            <h3>Staff &amp; Clinicians</h3>
            <span>{staff.length} team members</span>
          </div>

          <div className="staff-roster-list">
            {staff.map((member) => (
              <div
                key={member.id}
                className={`staff-row-item ${member.id === selectedStaffId ? "selected" : ""}`}
                onClick={() => setSelectedStaffId(member.id)}
              >
                <div className="staff-avatar">
                  {member.name.split(" ")[0][0]}{member.name.split(" ")[1]?.[0]}
                </div>
                <div className="staff-details">
                  <div className="staff-name-row">
                    <strong>{member.name}</strong>
                    <span className={`license-badge ${member.licenseStatus}`}>
                      {member.licenseStatus === "verified" ? "Verified" : member.licenseStatus === "expiring_soon" ? "Renewal Due" : "Active"}
                    </span>
                  </div>
                  <span className="staff-role">{member.role}</span>
                  <span className="staff-contact">{member.email} · {member.fte}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Member Credentialing Inspector */}
        {selectedStaff && (
          <aside className="staff-inspector-card">
            <div className="inspector-header">
              <div>
                <h3>{selectedStaff.name}</h3>
                <span className="inspector-sub">{selectedStaff.role}</span>
              </div>
            </div>

            <div className="credential-block">
              <h4>Regulatory Identifiers</h4>
              <div className="cred-row">
                <span>National Provider ID (NPI):</span>
                <strong>{selectedStaff.npi}</strong>
              </div>
              <div className="cred-row">
                <span>DEA Controlled Substances:</span>
                <strong>{selectedStaff.dea}</strong>
              </div>
            </div>

            <div className="credential-block">
              <h4>State Licensure &amp; Malpractice</h4>
              <div className="cred-row">
                <span>State Board License:</span>
                <span className="cred-detail">{selectedStaff.licenseExp}</span>
              </div>
              <div className="cred-row">
                <span>Malpractice Policy:</span>
                <span className="cred-detail">{selectedStaff.malpracticeExp}</span>
              </div>
            </div>

            <div className="credential-block">
              <h4>Security &amp; Prescribing Entitlements</h4>
              <ul className="entitlements-list">
                <li>✓ Full EHR Medical Record Access</li>
                <li>✓ EPCS Schedule II-V Digital Signing</li>
                <li>✓ HIPAA Security Officer Authorization</li>
                <li>✓ Lab Orders &amp; Results Attestation</li>
              </ul>
            </div>

            <div className="inspector-actions">
              <Button
                size="sm"
                icon="autorenew"
                onClick={() => handleRenewAlert(selectedStaff.name)}
              >
                Trigger CAQH Re-Attestation
              </Button>
              <Button size="sm" icon="badge">
                Download Credential Dossier
              </Button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
