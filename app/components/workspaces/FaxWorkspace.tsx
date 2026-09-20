"use client";

import { useState } from "react";
import Icon from "../ui/Icon";
import Button from "../ui/Button";

export interface FaxRecord {
  id: string;
  direction: "inbound" | "outbound";
  recipientOrSender: string;
  organization: string;
  faxNumber: string;
  pages: number;
  subject: string;
  timestamp: string;
  status: "delivered" | "received" | "sending" | "failed";
  confirmationId?: string;
  patientName?: string;
  previewUrl?: string;
  summary: string;
}

const INITIAL_FAXES: FaxRecord[] = [
  {
    id: "fax-001",
    direction: "inbound",
    recipientOrSender: "Labcorp Northern California",
    organization: "Labcorp Client Services",
    faxNumber: "(800) 555-0199",
    pages: 3,
    subject: "Diagnostic Report: Comprehensive Metabolic & Lithium Panel",
    timestamp: "Today, 11:22 AM",
    status: "received",
    confirmationId: "CONF-LBC-88219",
    patientName: "Marcus Vance",
    summary: "Critical diagnostic report indicating serum lithium levels within therapeutic target range (0.9 mEq/L). Signed by pathologist Dr. A. Vance.",
  },
  {
    id: "fax-002",
    direction: "outbound",
    recipientOrSender: "Dr. Sarah Jenkins, MD",
    organization: "Bay Area Family Medicine",
    faxNumber: "(415) 555-3810",
    pages: 2,
    subject: "Consultation Note & Treatment Plan: Elena Rostova",
    timestamp: "Today, 09:15 AM",
    status: "delivered",
    confirmationId: "CONF-BAFM-44102",
    patientName: "Elena Rostova",
    summary: "Comprehensive psychiatric intake summary, diagnostic formulation (MDD, recurrent), and psychopharmacology recommendations.",
  },
  {
    id: "fax-003",
    direction: "inbound",
    recipientOrSender: "Walgreens Pharmacy #1402",
    organization: "Walgreens Specialty Pharmacy",
    faxNumber: "(415) 555-0144",
    pages: 1,
    subject: "Prior Authorization Clarification - Lamotrigine Starter Pack",
    timestamp: "Yesterday, 3:45 PM",
    status: "received",
    confirmationId: "CONF-WLG-10928",
    patientName: "Jordan Reed",
    summary: "Refill clearance notice requesting clinician signature and ICD-10 indication documentation for 30-day titration starter pack.",
  },
  {
    id: "fax-004",
    direction: "outbound",
    recipientOrSender: "Quest Diagnostics Specimen Lab",
    organization: "Quest Regional Lab",
    faxNumber: "(510) 555-9012",
    pages: 1,
    subject: "Lab Order Requisition: TSH, CBC with Differential, Hepatic Panel",
    timestamp: "Sep 11, 2026",
    status: "delivered",
    confirmationId: "CONF-QST-77192",
    patientName: "Maya Chen",
    summary: "Official lab requisition order for annual psychiatric psychopharmacology surveillance panel.",
  },
];

const DIRECTORY_CONTACTS = [
  { name: "Dr. Sarah Jenkins, MD", org: "Bay Area Family Medicine", fax: "(415) 555-3810" },
  { name: "Walgreens Pharmacy #1402", org: "Walgreens Sutter St", fax: "(415) 555-0144" },
  { name: "Labcorp Client Services", org: "Labcorp NCAL", fax: "(800) 555-0199" },
  { name: "Quest Regional Lab", org: "Quest Diagnostics", fax: "(510) 555-9012" },
  { name: "Sutter Health Records", org: "Sutter Health Release of Info", fax: "(415) 555-6677" },
];

export default function FaxWorkspace() {
  const [faxes, setFaxes] = useState<FaxRecord[]>(INITIAL_FAXES);
  const [selectedFaxId, setSelectedFaxId] = useState<string>("fax-001");
  const [filter, setFilter] = useState<"all" | "inbound" | "outbound">("all");
  const [composeOpen, setComposeOpen] = useState(false);

  // New Fax State
  const [recipientFax, setRecipientFax] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [patientName, setPatientName] = useState("");
  const [subject, setSubject] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);

  const selectedFax = faxes.find((f) => f.id === selectedFaxId) || faxes[0];

  const filteredFaxes = faxes.filter((f) => {
    if (filter === "inbound") return f.direction === "inbound";
    if (filter === "outbound") return f.direction === "outbound";
    return true;
  });

  function handleSendFax(e: React.FormEvent) {
    e.preventDefault();
    if (!recipientFax.trim() || !subject.trim()) return;

    const newDraft: FaxRecord = {
      id: `fax-${Date.now().toString().slice(-4)}`,
      direction: "outbound",
      recipientOrSender: recipientName || "Healthcare Provider",
      organization: recipientName || "Clinical Recipient",
      faxNumber: recipientFax,
      pages: 2,
      subject,
      timestamp: "Draft (Not Transmitted)",
      status: "failed",
      patientName: patientName || "Practice General",
      summary: coverNote || "Clinical documentation saved locally as draft.",
    };

    setFaxes([newDraft, ...faxes]);
    setSelectedFaxId(newDraft.id);
    setComposeOpen(false);
    setNotice("e-Fax transport unavailable: No digital fax gateway configured. Fax saved locally as draft; no external transmission occurred.");
  }

  function handleSelectContact(contact: typeof DIRECTORY_CONTACTS[0]) {
    setRecipientFax(contact.fax);
    setRecipientName(`${contact.name} (${contact.org})`);
  }

  return (
    <div className="module-workspace-container" style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f8f9fa", overflow: "hidden" }}>
      {/* Transport Unavailable Banner */}
      <div data-fax-transport="unavailable" className="practice-banner-notice" style={{ padding: "10px 24px", background: "#fffbeb", borderBottom: "1px solid #fde68a", color: "#b45309", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
        <Icon name="info" size="sm" />
        <span>e-Fax transport is unconfigured. Digital fax gateway is unavailable; outbound faxes are retained locally as drafts.</span>
      </div>

      {notice && (
        <div style={{ padding: "10px 24px", background: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#b91c1c", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
          <Icon name="warning" size="sm" />
          <span>{notice}</span>
        </div>
      )}

      {/* Top Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: "#ffffff", borderBottom: "1px solid #e0e0e0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#ede7f6", color: "#5e35b1", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="description" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: "#1e293b" }}>Digital Fax & e-Fax Records</h2>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
              Digital e-Fax queue · Gateway integration unconfigured
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Button
            variant="primary"
            onClick={() => setComposeOpen(true)}
            icon="add"
          >
            Draft New Fax
          </Button>
        </div>
      </div>

      {/* Workspace Body */}
      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Left Column: List & Filter */}
        <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid #e0e0e0", background: "#ffffff", overflow: "hidden" }}>
          {/* Filters */}
          <div style={{ display: "flex", gap: "6px", padding: "12px 16px", borderBottom: "1px solid #f1f5f9" }}>
            <button
              type="button"
              onClick={() => setFilter("all")}
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: "20px",
                border: "none",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                background: filter === "all" ? "#ede7f6" : "#f1f5f9",
                color: filter === "all" ? "#5e35b1" : "#64748b",
              }}
            >
              All ({faxes.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("inbound")}
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: "20px",
                border: "none",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                background: filter === "inbound" ? "#ede7f6" : "#f1f5f9",
                color: filter === "inbound" ? "#5e35b1" : "#64748b",
              }}
            >
              Inbound ({faxes.filter((f) => f.direction === "inbound").length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("outbound")}
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: "20px",
                border: "none",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                background: filter === "outbound" ? "#ede7f6" : "#f1f5f9",
                color: filter === "outbound" ? "#5e35b1" : "#64748b",
              }}
            >
              Outbound ({faxes.filter((f) => f.direction === "outbound").length})
            </button>
          </div>

          {/* List of Faxes */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {filteredFaxes.map((fax) => {
              const isSelected = fax.id === selectedFaxId;
              const isInbound = fax.direction === "inbound";

              return (
                <div
                  key={fax.id}
                  onClick={() => setSelectedFaxId(fax.id)}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    marginBottom: "6px",
                    cursor: "pointer",
                    background: isSelected ? "#f3e8ff" : "#ffffff",
                    border: isSelected ? "1px solid #d8b4fe" : "1px solid #f1f5f9",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "10px",
                        background: isInbound ? "#e0f2fe" : "#ecfdf5",
                        color: isInbound ? "#0369a1" : "#047857",
                      }}
                    >
                      <Icon name={isInbound ? "arrow_downward" : "arrow_upward"} size="sm" />
                      {isInbound ? "Received" : "Sent"}
                    </span>
                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>{fax.timestamp}</span>
                  </div>

                  <div style={{ fontWeight: 600, fontSize: "13px", color: "#1e293b", marginBottom: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {fax.recipientOrSender}
                  </div>

                  <div style={{ fontSize: "12px", color: "#475569", marginBottom: "6px", lineHeight: 1.3 }}>
                    {fax.subject}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px", color: "#64748b" }}>
                    <span>{fax.pages} page{fax.pages > 1 ? "s" : ""}</span>
                    {fax.patientName && (
                      <span style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "6px" }}>
                        {fax.patientName}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Fax Detail Viewer */}
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#ffffff", overflowY: "auto", padding: "24px 32px" }}>
          {selectedFax ? (
            <div>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", paddingBottom: "18px", borderBottom: "1px solid #e2e8f0", marginBottom: "20px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        fontWeight: 600,
                        background: selectedFax.direction === "inbound" ? "#e0f2fe" : "#ecfdf5",
                        color: selectedFax.direction === "inbound" ? "#0369a1" : "#047857",
                      }}
                    >
                      {selectedFax.direction === "inbound" ? "Inbound Transmission" : "Outbound Transmission"}
                    </span>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                      Confirmation: <strong>{selectedFax.status === "failed" ? "Unsent (Draft)" : selectedFax.confirmationId || "Sample Record"}</strong>
                    </span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>
                    {selectedFax.subject}
                  </h3>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>Transmitted</div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>{selectedFax.timestamp}</div>
                </div>
              </div>

              {/* Metadata Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", background: "#f8fafc", padding: "16px", borderRadius: "12px", marginBottom: "24px" }}>
                <div>
                  <small style={{ display: "block", fontSize: "11px", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                    {selectedFax.direction === "inbound" ? "From Sender" : "To Recipient"}
                  </small>
                  <strong style={{ fontSize: "13px", color: "#1e293b" }}>{selectedFax.recipientOrSender}</strong>
                  <div style={{ fontSize: "12px", color: "#475569" }}>{selectedFax.faxNumber}</div>
                </div>

                <div>
                  <small style={{ display: "block", fontSize: "11px", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                    Associated Patient
                  </small>
                  <strong style={{ fontSize: "13px", color: "#1e293b" }}>{selectedFax.patientName || "Practice Wide"}</strong>
                  <div style={{ fontSize: "12px", color: "#475569" }}>Confidential Medical Record</div>
                </div>

                <div>
                  <small style={{ display: "block", fontSize: "11px", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                    Status & Verification
                  </small>
                  {selectedFax.status === "failed" ? (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#b45309", fontWeight: 600, fontSize: "13px" }}>
                      <Icon name="warning" size="sm" /> Draft / Unsent (No Gateway)
                    </div>
                  ) : (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#0369a1", fontWeight: 600, fontSize: "13px" }}>
                      <Icon name="info" size="sm" /> Demonstration Record
                    </div>
                  )}
                  <div style={{ fontSize: "12px", color: "#64748b" }}>{selectedFax.pages} pages</div>
                </div>
              </div>

              {/* Fax Document Preview Container */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "24px", background: "#ffffff", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px dashed #cbd5e1" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Icon name="description" />
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
                      Cover Page & Clinical Summary
                    </span>
                  </div>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>HIPAA Notice Encrypted</span>
                </div>

                <div style={{ fontSize: "14px", lineHeight: "1.6", color: "#1e293b", whiteSpace: "pre-wrap", background: "#fbfcfd", padding: "16px", borderRadius: "8px", border: "1px solid #f1f5f9" }}>
                  {selectedFax.summary}
                </div>

                <div style={{ marginTop: "24px", padding: "16px", background: "#f8fafc", borderRadius: "8px", borderLeft: "3px solid #6366f1" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#475569", textTransform: "uppercase", marginBottom: "4px" }}>
                    Confidentiality Warning
                  </div>
                  <p style={{ margin: 0, fontSize: "11px", color: "#64748b", lineHeight: 1.4 }}>
                    This facsimile contains confidential healthcare information intended only for the use of the individual or entity named above. If you are not the intended recipient, please immediately notify the sender and destroy all transmitted copies.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8" }}>
              Select a fax to view transmission details
            </div>
          )}
        </div>
      </div>

      {/* Compose Fax Modal */}
      {composeOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setComposeOpen(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              width: "560px",
              maxWidth: "92vw",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Icon name="description" />
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Send HIPAA Digital e-Fax</h3>
              </div>
              <button
                type="button"
                onClick={() => setComposeOpen(false)}
                style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", color: "#64748b" }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSendFax} style={{ padding: "20px" }}>
              {/* Directory Quick-Select */}
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", marginBottom: "6px" }}>
                  Quick Select Directory Contact
                </label>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {DIRECTORY_CONTACTS.map((c) => (
                    <button
                      key={c.fax}
                      type="button"
                      onClick={() => handleSelectContact(c)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        background: recipientFax === c.fax ? "#ede7f6" : "#f8fafc",
                        color: recipientFax === c.fax ? "#5e35b1" : "#475569",
                        fontSize: "11px",
                        cursor: "pointer",
                      }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                    Recipient Fax Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="(415) 555-0199"
                    value={recipientFax}
                    onChange={(e) => setRecipientFax(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                    Recipient Name / Clinic
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Bay Area Family Med"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                    Subject / Requisition *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Psychiatric Consultation Note"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                    Patient Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Elena Rostova"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                  Cover Sheet Notes & Clinical Message
                </label>
                <textarea
                  rows={4}
                  placeholder="Transmitting clinical documentation. Please confirm receipt..."
                  value={coverNote}
                  onChange={(e) => setCoverNote(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px" }}>
                <Button variant="secondary" onClick={() => setComposeOpen(false)}>
                  Cancel
                </Button>
                <button
                  type="submit"
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    background: "#5e35b1",
                    color: "#ffffff",
                    border: "none",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Save as Draft (Transport Unavailable)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
