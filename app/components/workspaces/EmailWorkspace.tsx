"use client";

import { useState } from "react";
import Icon from "../ui/Icon";
import Button from "../ui/Button";

interface EmailMessage {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string;
  preview: string;
  date: string;
  unread: boolean;
  folder: "inbox" | "referrals" | "sent" | "archive";
  body: string;
}

const INITIAL_EMAILS: EmailMessage[] = [
  {
    id: "em-1",
    sender: "Dr. Sarah Jenkins, MD (Bay Area Family Medicine)",
    senderEmail: "sjenkins@bayareafamilymed.org",
    subject: "Psychiatric Consultation Referral: Elena Rostova",
    preview: "Attaching recent metabolic lab panels and previous SSRI trials for Elena Rostova ahead of your intake...",
    date: "10:14 AM",
    unread: true,
    folder: "referrals",
    body: "Dear Dr. Carton,\n\nI am referring Elena Rostova (DOB: 04/12/1988) for comprehensive psychiatric evaluation regarding recurrent depressive symptoms. Attached please find her recent CBC, CMP, and thyroid panel from last week, which were all within normal limits.\n\nShe was previously on Escitalopram 10mg with mild fatigue. Looking forward to your consultation notes.\n\nBest regards,\nDr. Sarah Jenkins, MD\nBay Area Family Medicine",
  },
  {
    id: "em-2",
    sender: "Walgreens Specialty Pharmacy #1402",
    senderEmail: "rxsutter@walgreens.com",
    subject: "Prior Authorization Clarification - Lamotrigine 100mg (Jordan Reed)",
    preview: "Electronic prior authorization question regarding titration starter pack quantity override...",
    date: "09:30 AM",
    unread: true,
    folder: "inbox",
    body: "Attention: Dr. Logan Carton\n\nRegarding patient Jordan Reed (DOB: 08/22/1991):\nThe e-prescription for Lamotrigine Starter Kit was received. Aetna requires an explicit ICD-10 indication code on file to approve the 30-day starter pack dispensation. Please confirm F31.81 via reply or CoverMyMeds.\n\nThank you,\nPharmacy Staff, Walgreens #1402",
  },
  {
    id: "em-3",
    sender: "Labcorp Client Services",
    senderEmail: "results@labcorp.com",
    subject: "Urgent: Critical Lab Result Notification - Lithium Level (Marcus Vance)",
    preview: "Serum Lithium level report for Marcus Vance has been posted to your electronic provider portal...",
    date: "Yesterday",
    unread: false,
    folder: "inbox",
    body: "CLINICAL NOTIFICATION:\n\nLab results for patient Marcus Vance (MRN-55104) drawn on 09/11/2026:\n\nTest: Lithium Level, Serum\nResult: 0.9 mEq/L (Target therapeutic range: 0.6 - 1.2 mEq/L)\nStatus: Normal / Therapeutic\n\nFull PDF report accessible in your EHR documents tab.",
  },
  {
    id: "em-4",
    sender: "Northern California Psychiatric Society",
    senderEmail: "events@ncps-psychiatry.org",
    subject: "CME Symposium: Advances in Ketamine & Neuromodulation for MDD",
    preview: "Registration details and keynote speaker announcements for the upcoming autumn clinical conference...",
    date: "Sep 10",
    unread: false,
    folder: "inbox",
    body: "Colleagues,\n\nRegistration is now open for the 2026 NCPS Autumn Clinical Symposium focusing on novel glutamate modulators, TMS protocols, and precision psychopharmacology.\n\nApproved for 12.0 AMA PRA Category 1 Credits.",
  },
];

export default function EmailWorkspace() {
  const [emails, setEmails] = useState<EmailMessage[]>(INITIAL_EMAILS);
  const [activeFolder, setActiveFolder] = useState<"inbox" | "referrals" | "sent" | "archive">("inbox");
  const [selectedEmailId, setSelectedEmailId] = useState<string>("em-1");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const filteredEmails = emails.filter((e) => activeFolder === "inbox" ? e.folder !== "sent" && e.folder !== "archive" : e.folder === activeFolder);
  const selectedEmail = emails.find((e) => e.id === selectedEmailId);

  const handleSend = () => {
    if (!composeTo.trim()) return;
    const newSent: EmailMessage = {
      id: `em-${Date.now()}`,
      sender: "Logan Carton, MD",
      senderEmail: "lcarton@clinicalbondpsych.com",
      subject: composeSubject || "(No subject)",
      preview: composeBody.slice(0, 80),
      date: "Just now",
      unread: false,
      folder: "sent",
      body: composeBody,
    };
    setEmails([newSent, ...emails]);
    setComposeOpen(false);
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
    setNotice("Secure email dispatched successfully");
    setTimeout(() => setNotice(null), 3000);
  };

  const markRead = (id: string) => {
    setEmails((prev) => prev.map((e) => e.id === id ? { ...e, unread: false } : e));
    setSelectedEmailId(id);
  };

  return (
    <div className="practice-subworkspace email-workspace">
      {notice && (
        <div className="practice-banner-success">
          <Icon name="check_circle" /> {notice}
        </div>
      )}

      <div className="email-layout-grid">
        {/* Mail Folders Sidebar */}
        <aside className="email-folder-sidebar">
          <Button
            size="md"
            icon="edit"
            className="compose-btn"
            onClick={() => setComposeOpen(true)}
          >
            Compose Email
          </Button>

          <nav className="folder-nav">
            <button
              type="button"
              className={`folder-item ${activeFolder === "inbox" ? "active" : ""}`}
              onClick={() => setActiveFolder("inbox")}
            >
              <Icon name="inbox" size="sm" />
              <span>Inbox</span>
              <span className="folder-count">{emails.filter((e) => e.folder === "inbox" && e.unread).length}</span>
            </button>
            <button
              type="button"
              className={`folder-item ${activeFolder === "referrals" ? "active" : ""}`}
              onClick={() => setActiveFolder("referrals")}
            >
              <Icon name="assignment_ind" size="sm" />
              <span>Referrals</span>
              <span className="folder-count">{emails.filter((e) => e.folder === "referrals" && e.unread).length}</span>
            </button>
            <button
              type="button"
              className={`folder-item ${activeFolder === "sent" ? "active" : ""}`}
              onClick={() => setActiveFolder("sent")}
            >
              <Icon name="send" size="sm" />
              <span>Sent</span>
            </button>
            <button
              type="button"
              className={`folder-item ${activeFolder === "archive" ? "active" : ""}`}
              onClick={() => setActiveFolder("archive")}
            >
              <Icon name="archive" size="sm" />
              <span>Archive</span>
            </button>
          </nav>
        </aside>

        {/* Email List */}
        <div className="email-list-column">
          <div className="email-list-header">
            <h3>{activeFolder.toUpperCase()}</h3>
            <span>{filteredEmails.length} messages</span>
          </div>

          <div className="email-items-container">
            {filteredEmails.map((email) => (
              <div
                key={email.id}
                className={`email-item-row ${email.id === selectedEmailId ? "selected" : ""} ${email.unread ? "unread" : ""}`}
                onClick={() => markRead(email.id)}
              >
                <div className="email-item-top">
                  <span className="email-item-sender">{email.sender}</span>
                  <span className="email-item-date">{email.date}</span>
                </div>
                <div className="email-item-subject">{email.subject}</div>
                <div className="email-item-preview">{email.preview}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Email Reading / Viewing Pane */}
        <div className="email-reading-pane">
          {composeOpen ? (
            <div className="email-compose-box">
              <div className="compose-header">
                <h4>New Secure Email</h4>
                <button type="button" className="close-btn" onClick={() => setComposeOpen(false)}>×</button>
              </div>
              <div className="compose-field">
                <label>To:</label>
                <input
                  type="text"
                  placeholder="colleague@domain.org or patient"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                />
              </div>
              <div className="compose-field">
                <label>Subject:</label>
                <input
                  type="text"
                  placeholder="Regarding patient consultation or clinical inquiry"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                />
              </div>
              <textarea
                rows={10}
                className="compose-body"
                placeholder="Write message... (Encrypted HIPAA transport)"
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
              />
              <div className="compose-footer">
                <Button size="sm" icon="send" onClick={handleSend}>Send Message</Button>
                <Button size="sm" icon="close" onClick={() => setComposeOpen(false)}>Discard</Button>
              </div>
            </div>
          ) : selectedEmail ? (
            <div className="email-view-box">
              <div className="email-view-header">
                <h2>{selectedEmail.subject}</h2>
                <div className="email-view-meta">
                  <div className="sender-avatar">{selectedEmail.sender[0]}</div>
                  <div>
                    <strong>{selectedEmail.sender}</strong>
                    <div className="sender-email">&lt;{selectedEmail.senderEmail}&gt; · {selectedEmail.date}</div>
                  </div>
                </div>
              </div>

              <div className="email-body-content">
                {selectedEmail.body.split("\n").map((line, idx) => (
                  <p key={idx}>{line}</p>
                ))}
              </div>

              <div className="email-view-actions">
                <Button size="sm" icon="reply" onClick={() => {
                  setComposeTo(selectedEmail.senderEmail);
                  setComposeSubject(`Re: ${selectedEmail.subject}`);
                  setComposeOpen(true);
                }}>
                  Reply
                </Button>
                <Button size="sm" icon="forward">Forward</Button>
                <Button size="sm" icon="archive">Archive</Button>
              </div>
            </div>
          ) : (
            <div className="email-empty-state">Select an email to view</div>
          )}
        </div>
      </div>
    </div>
  );
}
