"use client";

import { useState } from "react";
import Icon from "../ui/Icon";
import Button from "../ui/Button";

interface CaseDiscussion {
  id: string;
  author: string;
  role: string;
  avatar: string;
  specialty: string;
  title: string;
  content: string;
  timestamp: string;
  upvotes: number;
  repliesCount: number;
  tags: string[];
  replies: Array<{
    id: string;
    author: string;
    role: string;
    avatar: string;
    text: string;
    timestamp: string;
  }>;
}

interface PeerProvider {
  id: string;
  name: string;
  title: string;
  specialty: string;
  organization: string;
  location: string;
  acceptingReferrals: boolean;
  avatar: string;
  phone: string;
  email: string;
}

const INITIAL_DISCUSSIONS: CaseDiscussion[] = [
  {
    id: "disc-1",
    author: "Dr. Rebecca Lin, MD, PhD",
    role: "Neuropsychiatrist",
    avatar: "RL",
    specialty: "Treatment-Resistant Depression & Neuromodulation",
    title: "Protocols for Lithium vs. Atypical Antipsychotic Augmentation in TRD with High Anxiety",
    content: "Colleagues, looking for clinical consensus regarding secondary augmentation in a 38yo patient with recurrent MDD failing dual-mechanism SNRIs (Venlafaxine 225mg) and cognitive behavioral therapy. Mild tremor history on SSRIs. Weighing low-dose lithium augmentation (targeting 0.5-0.7 mEq/L) versus Brexpiprazole 1mg. Any observed differences in tolerability and executive function?",
    timestamp: "2 hours ago",
    upvotes: 14,
    repliesCount: 3,
    tags: ["Psychopharmacology", "TRD", "Lithium", "Augmentation"],
    replies: [
      {
        id: "rep-1",
        author: "Dr. Marcus Vance, DO",
        role: "Consultation-Liaison Psychiatry",
        avatar: "MV",
        text: "In my CL practice, low-dose lithium (300mg-600mg QHS) has consistently demonstrated superior anti-suicidal and neuroprotective properties without cognitive blunting, provided thyroid and renal function are tracked at baseline and Q6M.",
        timestamp: "1 hour ago",
      },
      {
        id: "rep-2",
        author: "Dr. Logan Carton, MD",
        role: "Attending Psychiatrist",
        avatar: "LC",
        text: "Agreed with Dr. Vance. In patients with anxiety comorbidity and tremor vulnerability, Brexpiprazole also carries akathisia risk. If starting lithium, check baseline TSH, BUN/Cr, and calcium.",
        timestamp: "35 mins ago",
      },
    ],
  },
  {
    id: "disc-2",
    author: "Dr. Aaron Miller, PsyD",
    role: "Clinical Psychologist",
    avatar: "AM",
    specialty: "Adult ADHD & Executive Coaching",
    title: "Integrating Executive Dysfunction Behavioral Protocols Alongside Stimulant Titration",
    content: "Sharing our multidisciplinary team's updated workflow for coordinating weekly executive functioning coaching sessions with psychiatric medication titration. Early data shows 42% greater sustained adherence when medication checks occur within 48 hours of CBT skills rehearsal.",
    timestamp: "Yesterday",
    upvotes: 21,
    repliesCount: 5,
    tags: ["ADHD", "Executive Dysfunction", "Psychotherapy", "Adherence"],
    replies: [
      {
        id: "rep-3",
        author: "Dr. Sarah Jenkins, MD",
        role: "Family Medicine",
        avatar: "SJ",
        text: "This interdisciplinary model is fantastic for primary care handoffs. Would love to review the clinical handout templates.",
        timestamp: "Yesterday, 5:30 PM",
      },
    ],
  },
  {
    id: "disc-3",
    author: "Dr. Elena Vasquez, MD",
    role: "Addiction Psychiatrist",
    avatar: "EV",
    specialty: "Co-occurring Disorders & Micro-induction",
    title: "Buprenorphine Rapid Micro-Induction Strategies in Outpatient Psychiatry",
    content: "Observing increased outpatient success with 0.5mg SL overlapping micro-titration protocols without precipitating withdrawal in patients transitioning from full opioid agonists for chronic pain with comorbid depression.",
    timestamp: "2 days ago",
    upvotes: 38,
    repliesCount: 8,
    tags: ["Addiction Medicine", "Buprenorphine", "Outpatient", "Protocols"],
    replies: [],
  },
];

const PEER_PROVIDERS: PeerProvider[] = [
  {
    id: "p1",
    name: "Dr. Rebecca Lin, MD, PhD",
    title: "Associate Professor of Psychiatry",
    specialty: "Neuropsychiatry & TMS",
    organization: "UCSF Health / Bay Neurosciences",
    location: "San Francisco, CA (Telehealth available)",
    acceptingReferrals: true,
    avatar: "RL",
    phone: "(415) 555-8910",
    email: "rlin@bayneuro.org",
  },
  {
    id: "p2",
    name: "Dr. Aaron Miller, PsyD",
    title: "Licensed Clinical Psychologist",
    specialty: "Adult ADHD & Cognitive Remediation",
    organization: "Pacific CBT & Executive Center",
    location: "Oakland, CA (In-person & Virtual)",
    acceptingReferrals: true,
    avatar: "AM",
    phone: "(510) 555-3211",
    email: "amiller@pacificcbt.com",
  },
  {
    id: "p3",
    name: "Dr. Sarah Jenkins, MD",
    title: "Attending Physician",
    specialty: "Family Medicine & Collaborative Care",
    organization: "Bay Area Family Medicine",
    location: "San Francisco, CA",
    acceptingReferrals: true,
    avatar: "SJ",
    phone: "(415) 555-3800",
    email: "sjenkins@bayareafamilymed.org",
  },
  {
    id: "p4",
    name: "Dr. Elena Vasquez, MD",
    title: "Medical Director, Dual Diagnosis",
    specialty: "Addiction & Geriatric Psychiatry",
    organization: "Marin Behavioral Health",
    location: "San Rafael, CA",
    acceptingReferrals: false,
    avatar: "EV",
    phone: "(415) 555-7744",
    email: "evasquez@marinbehavioral.org",
  },
];

export default function CommunityWorkspace() {
  const [activeTab, setActiveTab] = useState<"discussions" | "directory">("discussions");
  const [discussions, setDiscussions] = useState<CaseDiscussion[]>(INITIAL_DISCUSSIONS);
  const [selectedDiscussionId, setSelectedDiscussionId] = useState<string>("disc-1");
  const [replyText, setReplyText] = useState("");
  const [newDiscussionOpen, setNewDiscussionOpen] = useState(false);
  const [referralModalOpen, setReferralModalOpen] = useState(false);
  const [referralRecipient, setReferralRecipient] = useState<PeerProvider | null>(null);

  // New post state
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [postTag, setPostTag] = useState("Psychopharmacology");

  const selectedDiscussion = discussions.find((d) => d.id === selectedDiscussionId) || discussions[0];

  function handleAddReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim() || !selectedDiscussion) return;

    const newReply = {
      id: `rep-${Date.now()}`,
      author: "Dr. Logan Carton, MD",
      role: "Attending Psychiatrist",
      avatar: "LC",
      text: replyText.trim(),
      timestamp: "Just now",
    };

    setDiscussions((prev) =>
      prev.map((d) =>
        d.id === selectedDiscussion.id
          ? {
              ...d,
              repliesCount: d.repliesCount + 1,
              replies: [...d.replies, newReply],
            }
          : d,
      ),
    );
    setReplyText("");
  }

  function handleCreatePost(e: React.FormEvent) {
    e.preventDefault();
    if (!postTitle.trim() || !postContent.trim()) return;

    const newPost: CaseDiscussion = {
      id: `disc-${Date.now()}`,
      author: "Dr. Logan Carton, MD",
      role: "Attending Psychiatrist",
      avatar: "LC",
      specialty: "Psychiatry & Psychopharmacology",
      title: postTitle.trim(),
      content: postContent.trim(),
      timestamp: "Just now",
      upvotes: 1,
      repliesCount: 0,
      tags: [postTag, "Outpatient"],
      replies: [],
    };

    setDiscussions([newPost, ...discussions]);
    setSelectedDiscussionId(newPost.id);
    setPostTitle("");
    setPostContent("");
    setNewDiscussionOpen(false);
  }

  function handleUpvote(id: string) {
    setDiscussions((prev) =>
      prev.map((d) => (d.id === id ? { ...d, upvotes: d.upvotes + 1 } : d)),
    );
  }

  return (
    <div className="module-workspace-container" style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f8f9fa", overflow: "hidden" }}>
      {/* Top Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: "#ffffff", borderBottom: "1px solid #e0e0e0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#e0f2fe", color: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="groups" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: "#1e293b" }}>Clinician Community & Peer Network</h2>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
              Verified medical provider exchange, clinical case consults & specialist referrals
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ display: "flex", background: "#f1f5f9", borderRadius: "20px", padding: "3px" }}>
            <button
              type="button"
              onClick={() => setActiveTab("discussions")}
              style={{
                padding: "6px 14px",
                borderRadius: "16px",
                border: "none",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                background: activeTab === "discussions" ? "#ffffff" : "transparent",
                color: activeTab === "discussions" ? "#0284c7" : "#64748b",
                boxShadow: activeTab === "discussions" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              }}
            >
              Case Discussions ({discussions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("directory")}
              style={{
                padding: "6px 14px",
                borderRadius: "16px",
                border: "none",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                background: activeTab === "directory" ? "#ffffff" : "transparent",
                color: activeTab === "directory" ? "#0284c7" : "#64748b",
                boxShadow: activeTab === "directory" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              }}
            >
              Specialist Directory ({PEER_PROVIDERS.length})
            </button>
          </div>

          <Button
            variant="primary"
            onClick={() => setNewDiscussionOpen(true)}
            icon="add"
          >
            Post Case Discussion
          </Button>
        </div>
      </div>

      {/* Main Body */}
      {activeTab === "discussions" ? (
        <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {/* Discussions List */}
          <div style={{ borderRight: "1px solid #e0e0e0", background: "#ffffff", overflowY: "auto", padding: "12px" }}>
            {discussions.map((d) => {
              const isSelected = d.id === selectedDiscussionId;
              return (
                <div
                  key={d.id}
                  onClick={() => setSelectedDiscussionId(d.id)}
                  style={{
                    padding: "14px",
                    borderRadius: "12px",
                    marginBottom: "8px",
                    cursor: "pointer",
                    background: isSelected ? "#f0f9ff" : "#ffffff",
                    border: isSelected ? "1px solid #7dd3fc" : "1px solid #f1f5f9",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#0284c7", color: "#ffffff", fontSize: "10px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {d.avatar}
                    </div>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                        {d.author}
                      </div>
                      <div style={{ fontSize: "10px", color: "#64748b" }}>{d.role}</div>
                    </div>
                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>{d.timestamp}</span>
                  </div>

                  <h4 style={{ margin: "0 0 6px", fontSize: "13px", fontWeight: 600, color: "#0f172a", lineHeight: 1.3 }}>
                    {d.title}
                  </h4>

                  <p style={{ margin: "0 0 8px", fontSize: "12px", color: "#475569", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {d.content}
                  </p>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", gap: "4px" }}>
                      {d.tags.slice(0, 2).map((t) => (
                        <span key={t} style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "6px", background: "#f1f5f9", color: "#475569" }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "11px", color: "#64748b" }}>
                      <span>▲ {d.upvotes}</span>
                      <span>💬 {d.repliesCount}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Discussion Thread Detail */}
          <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#ffffff", overflowY: "auto", padding: "24px 32px" }}>
            {selectedDiscussion ? (
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                {/* Author Card */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
                  <div style={{ display: "flex", gap: "12px" }}>
                    <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "#0284c7", color: "#ffffff", fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {selectedDiscussion.avatar}
                    </div>
                    <div>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                        {selectedDiscussion.author}
                      </div>
                      <div style={{ fontSize: "12px", color: "#475569" }}>
                        {selectedDiscussion.role} · <span style={{ color: "#0284c7" }}>{selectedDiscussion.specialty}</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                        Posted {selectedDiscussion.timestamp}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUpvote(selectedDiscussion.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 12px",
                      borderRadius: "20px",
                      border: "1px solid #e2e8f0",
                      background: "#f8fafc",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#0369a1",
                    }}
                  >
                    ▲ Agree / Upvote ({selectedDiscussion.upvotes})
                  </button>
                </div>

                <h2 style={{ margin: "0 0 14px", fontSize: "20px", fontWeight: 700, color: "#0f172a", lineHeight: 1.3 }}>
                  {selectedDiscussion.title}
                </h2>

                <div style={{ fontSize: "14px", lineHeight: 1.7, color: "#334155", marginBottom: "20px", background: "#f8fafc", padding: "18px 20px", borderRadius: "12px", border: "1px solid #f1f5f9" }}>
                  {selectedDiscussion.content}
                </div>

                {/* Tags */}
                <div style={{ display: "flex", gap: "6px", marginBottom: "24px" }}>
                  {selectedDiscussion.tags.map((t) => (
                    <span key={t} style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "12px", background: "#e0f2fe", color: "#0369a1", fontWeight: 600 }}>
                      #{t}
                    </span>
                  ))}
                </div>

                {/* Replies Section */}
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "20px", flex: 1 }}>
                  <h4 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 700, color: "#1e293b" }}>
                    Clinical Responses ({selectedDiscussion.replies.length})
                  </h4>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
                    {selectedDiscussion.replies.map((reply) => (
                      <div key={reply.id} style={{ background: "#ffffff", padding: "14px 16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#475569", color: "#ffffff", fontSize: "10px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {reply.avatar}
                            </div>
                            <strong style={{ fontSize: "13px", color: "#0f172a" }}>{reply.author}</strong>
                            <span style={{ fontSize: "11px", color: "#64748b" }}>({reply.role})</span>
                          </div>
                          <span style={{ fontSize: "11px", color: "#94a3b8" }}>{reply.timestamp}</span>
                        </div>
                        <div style={{ fontSize: "13px", color: "#334155", lineHeight: 1.5, paddingLeft: "34px" }}>
                          {reply.text}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add Reply */}
                  <form onSubmit={handleAddReply} style={{ marginTop: "auto" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        placeholder="Contribute clinical perspective or protocol..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        style={{ flex: 1, padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                      />
                      <Button variant="primary" type="submit">
                        Reply
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        /* Specialist Directory */
        <div style={{ padding: "24px 32px", overflowY: "auto", flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
            {PEER_PROVIDERS.map((provider) => (
              <div
                key={provider.id}
                style={{
                  background: "#ffffff",
                  borderRadius: "14px",
                  padding: "20px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#0284c7", color: "#ffffff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {provider.avatar}
                      </div>
                      <div>
                        <strong style={{ fontSize: "14px", color: "#0f172a", display: "block" }}>{provider.name}</strong>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>{provider.title}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: "12px" }}>
                    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "10px", background: "#e0f2fe", color: "#0369a1", fontSize: "11px", fontWeight: 600, marginBottom: "6px" }}>
                      {provider.specialty}
                    </span>
                    <div style={{ fontSize: "12px", color: "#334155" }}>{provider.organization}</div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>📍 {provider.location}</div>
                  </div>
                </div>

                <div style={{ paddingTop: "14px", borderTop: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: provider.acceptingReferrals ? "#047857" : "#b91c1c" }}>
                    {provider.acceptingReferrals ? "● Accepting Consults" : "○ Full Panel"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setReferralRecipient(provider);
                      setReferralModalOpen(true);
                    }}
                    disabled={!provider.acceptingReferrals}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      background: provider.acceptingReferrals ? "#ffffff" : "#f1f5f9",
                      color: provider.acceptingReferrals ? "#0f172a" : "#94a3b8",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: provider.acceptingReferrals ? "pointer" : "not-allowed",
                    }}
                  >
                    Request Consult
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Discussion Modal */}
      {newDiscussionOpen && (
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
          onClick={() => setNewDiscussionOpen(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              width: "540px",
              maxWidth: "92vw",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Start Clinical Case Discussion</h3>
              <button
                type="button"
                onClick={() => setNewDiscussionOpen(false)}
                style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", color: "#64748b" }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreatePost} style={{ padding: "20px" }}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                  Clinical Question / Case Topic *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Augmentation options for TRD with tremor sensitivity"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                  Specialty Domain
                </label>
                <select
                  value={postTag}
                  onChange={(e) => setPostTag(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                >
                  <option value="Psychopharmacology">Psychopharmacology</option>
                  <option value="Neuropsychiatry">Neuropsychiatry & TMS</option>
                  <option value="Adult ADHD">Adult ADHD</option>
                  <option value="Addiction Medicine">Addiction Medicine</option>
                  <option value="Psychotherapy">Psychotherapy</option>
                </select>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                  De-identified Clinical Summary & Inquiry *
                </label>
                <textarea
                  rows={5}
                  required
                  placeholder="Summarize pertinent clinical background (de-identified per HIPAA), prior medication trials, and specific protocol questions..."
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <Button variant="secondary" onClick={() => setNewDiscussionOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit">
                  Publish to Community
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Consult / Referral Request Modal */}
      {referralModalOpen && referralRecipient && (
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
          onClick={() => setReferralModalOpen(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              width: "500px",
              maxWidth: "92vw",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
              padding: "20px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Request Peer Consult</h3>
              <button
                type="button"
                onClick={() => setReferralModalOpen(false)}
                style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", color: "#64748b" }}
              >
                ×
              </button>
            </div>

            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#475569" }}>
              Sending direct consultation inquiry to <strong>{referralRecipient.name}</strong> ({referralRecipient.organization}).
            </p>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                Consultation Type / Urgency
              </label>
              <select style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}>
                <option>Routine Secondary Opinion (Within 2 weeks)</option>
                <option>Specialist Diagnostic Evaluation</option>
                <option>Urgent Psychopharmacology Peer Review (48 hours)</option>
              </select>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <Button variant="secondary" onClick={() => setReferralModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setReferralModalOpen(false);
                  alert(`Consultation request securely routed to ${referralRecipient.name}`);
                }}
              >
                Send Request
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
