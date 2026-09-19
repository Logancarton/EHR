"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  TeamMessage,
  TeamPartner,
  TeamTaskAssignment,
  TeamWorkspaceSnapshot,
} from "../../domain/team-collaboration";
import { teamApi } from "../../lib/team-api";
import { useWorkspaceNavigation } from "../../lib/workspace-navigation-context";
import {
  WORKSPACE_OPEN_COMMUNICATIONS_EVENT,
  subscribeWorkspaceEvent,
} from "../../lib/workspace-events";
import type { GlobalWorkspaceModule } from "../../lib/workspace-navigation";
import styles from "./TeamCollaborationDock.module.css";
import Icon from "../ui/Icon";

export type CommChannel = "team" | "patient" | "email" | "fax" | "community";

function timeLabel(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function TeamCollaborationDock() {
  const nav = useWorkspaceNavigation();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<CommChannel>("team");
  const [tab, setTab] = useState<"chat" | "tasks">("chat");

  // --- Team State ---
  const [snapshot, setSnapshot] = useState<TeamWorkspaceSnapshot | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [messagePatientId, setMessagePatientId] = useState("");
  const [taskText, setTaskText] = useState("");
  const [taskPatientId, setTaskPatientId] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // --- Patient SMS State ---
  const [patientThreads, setPatientThreads] = useState([
    {
      id: "pt-1",
      name: "Elena Rostova",
      phone: "(415) 309-8812",
      messages: [
        { sender: "clinic", text: "Hi Elena, this is Clinical Bond Psychiatry reminding you of your visit today at 10:00 AM.", time: "09:00 AM" },
        { sender: "patient", text: "Thank you Dr. Carton, I clicked the telehealth link and will be in the waiting room at 10.", time: "09:48 AM" },
      ],
    },
    {
      id: "pt-2",
      name: "Jordan Reed",
      phone: "(510) 924-1185",
      messages: [
        { sender: "patient", text: "Can you confirm if my pharmacy received the updated Lamictal dose?", time: "Yesterday, 4:12 PM" },
      ],
    },
    {
      id: "pt-3",
      name: "Maya Chen",
      phone: "(650) 482-9031",
      messages: [
        { sender: "clinic", text: "Hi Maya, please reply YES to confirm your psychiatric medication check on Sep 18 at 2:00 PM.", time: "Sep 11, 11:00 AM" },
        { sender: "patient", text: "YES, confirmed. See you then.", time: "Sep 11, 11:04 AM" },
      ],
    },
  ]);
  const [activeThreadId, setActiveThreadId] = useState("pt-1");
  const [patientInput, setPatientInput] = useState("");

  // --- Email State ---
  const [emails] = useState([
    {
      id: "em-1",
      from: "Dr. Sarah Jenkins, MD (Bay Area Family Med)",
      subject: "Psychiatric Consultation Referral: Elena Rostova",
      snippet: "Attaching recent metabolic lab panels and previous SSRI trials for Elena Rostova ahead of intake...",
      time: "10:14 AM",
      unread: true,
      body: "Dear Dr. Carton,\n\nI am referring Elena Rostova (DOB: 04/12/1988) for comprehensive psychiatric evaluation regarding recurrent depressive symptoms. Her CBC, CMP, and thyroid panel from last week are normal. Looking forward to your consultation notes.\n\nBest regards,\nDr. Sarah Jenkins, MD",
    },
    {
      id: "em-2",
      from: "Walgreens Specialty Pharmacy #1402",
      subject: "Prior Authorization Clarification - Lamotrigine 100mg (Jordan Reed)",
      snippet: "Electronic prior authorization question regarding titration starter pack quantity override...",
      time: "09:30 AM",
      unread: true,
      body: "Attention: Dr. Logan Carton\n\nRegarding patient Jordan Reed (DOB: 08/22/1991):\nThe e-prescription for Lamotrigine Starter Kit was received. Aetna requires an explicit ICD-10 indication code on file to approve the 30-day starter pack dispensation. Please confirm F31.81 via reply.\n\nThank you,\nPharmacy Staff, Walgreens #1402",
    },
    {
      id: "em-3",
      from: "Labcorp Client Services",
      subject: "Critical Lab Result Notification - Lithium Level (Marcus Vance)",
      snippet: "Serum Lithium level report for Marcus Vance: 0.9 mEq/L (Therapeutic range: 0.6 - 1.2 mEq/L)...",
      time: "Yesterday",
      unread: false,
      body: "CLINICAL NOTIFICATION:\n\nLab results for patient Marcus Vance (MRN-55104) drawn on 09/11/2026:\nTest: Lithium Level, Serum\nResult: 0.9 mEq/L\nStatus: Normal / Therapeutic.",
    },
  ]);
  const [selectedEmailId, setSelectedEmailId] = useState("em-1");
  const [emailReplyText, setEmailReplyText] = useState("");

  // --- Fax State ---
  const [recentFaxes, setRecentFaxes] = useState([
    { id: "fx-1", to: "Bay Area Family Medicine", number: "(415) 555-3810", subject: "Consultation Note: Elena Rostova", time: "Today, 09:15 AM", status: "Delivered", pages: 2 },
    { id: "fx-2", to: "Walgreens Pharmacy #1402", number: "(415) 555-0144", subject: "Lamotrigine Titration Prior-Auth", time: "Yesterday, 3:45 PM", status: "Received", pages: 1 },
    { id: "fx-3", to: "Labcorp Northern California", number: "(800) 555-0199", subject: "Lab Requisition: Marcus Vance", time: "Sep 11, 2026", status: "Delivered", pages: 3 },
  ]);
  const [faxTo, setFaxTo] = useState("");
  const [faxSubject, setFaxSubject] = useState("");
  const [faxSending, setFaxSending] = useState(false);
  const [faxSuccess, setFaxSuccess] = useState(false);

  // --- Community State ---
  const [discussions] = useState([
    {
      id: "dc-1",
      author: "Dr. Rebecca Lin, MD",
      title: "Lithium vs. Atypical Augmentation in TRD with High Anxiety",
      content: "Weighing low-dose lithium augmentation (0.5-0.7 mEq/L) versus Brexpiprazole in recurrent MDD failing SNRIs...",
      tags: ["TRD", "Lithium", "Augmentation"],
      replies: 3,
    },
    {
      id: "dc-2",
      author: "Dr. Aaron Miller, PsyD",
      title: "Executive Dysfunction Behavioral Protocols with Stimulant Titration",
      content: "Coordinating weekly executive coaching sessions with psychiatric medication titration in adult ADHD...",
      tags: ["ADHD", "Executive Function"],
      replies: 5,
    },
  ]);

  const selectedPartner = useMemo(
    () => snapshot?.partners.find((partner) => partner.member.id === selectedPartnerId) || null,
    [snapshot, selectedPartnerId],
  );

  const partnerTasks = useMemo(() => {
    if (!snapshot || !selectedPartnerId) return [];
    return snapshot.assignedTasks.filter(
      (task) => task.assignerId === selectedPartnerId || task.assigneeId === selectedPartnerId,
    );
  }, [snapshot, selectedPartnerId]);

  async function refreshSnapshot(preferredPartnerId?: string) {
    const next = await teamApi.snapshot();
    setSnapshot(next);
    setSelectedPartnerId((current) => {
      const wanted = preferredPartnerId || current;
      if (wanted && next.partners.some((partner) => partner.member.id === wanted)) return wanted;
      return next.partners[0]?.member.id || null;
    });
  }

  useEffect(() => {
    if (!open || channel !== "team" || snapshot) return;
    setLoading(true);
    setError("");
    refreshSnapshot()
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load team workspace."))
      .finally(() => setLoading(false));
  }, [open, channel, snapshot]);

  useEffect(() => {
    if (!open || channel !== "team" || !selectedPartnerId) return;
    setError("");
    teamApi
      .conversation(selectedPartnerId)
      .then((next) => {
        setMessages(next);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load conversation."));
  }, [open, channel, selectedPartnerId]);

  async function sendMessage() {
    if (!selectedPartner || !messageText.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const message = await teamApi.sendMessage({
        partnerId: selectedPartner.member.id,
        content: messageText.trim(),
        patientId: messagePatientId || undefined,
      });
      setMessages((prev) => [...prev, message]);
      setMessageText("");
      setMessagePatientId("");
      await refreshSnapshot(selectedPartner.member.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send team message.");
    } finally {
      setBusy(false);
    }
  }

  async function assignTask() {
    if (!selectedPartner || !taskText.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await teamApi.assignTask({
        assigneeId: selectedPartner.member.id,
        text: taskText.trim(),
        patientId: taskPatientId || undefined,
        dueDate: taskDueDate || undefined,
      });
      setTaskText("");
      setTaskPatientId("");
      setTaskDueDate("");
      await refreshSnapshot(selectedPartner.member.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to assign team task.");
    } finally {
      setBusy(false);
    }
  }

  async function updateTask(task: TeamTaskAssignment, status: "done" | "cancelled") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await teamApi.updateTaskStatus(task.id, status);
      await refreshSnapshot(selectedPartnerId || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update team task.");
    } finally {
      setBusy(false);
    }
  }

  function surfacePatient(patientId: string) {
    nav.openPatient(patientId);
  }

  // Event listeners for channel open
  useEffect(() => {
    return subscribeWorkspaceEvent(WORKSPACE_OPEN_COMMUNICATIONS_EVENT, (detail) => {
      if (detail?.channel) {
        setChannel(detail.channel as CommChannel);
      }
      setOpen(true);
    });
  }, []);

  function handleFullscreen() {
    setOpen(false);
    const targetMap: Record<CommChannel, GlobalWorkspaceModule> = {
      team: "tasks",
      patient: "patient_communication",
      email: "email",
      fax: "fax",
      community: "community",
    };
    nav.openGlobalModule(targetMap[channel]);
  }

  function handleSendPatientSms(e: React.FormEvent) {
    e.preventDefault();
    if (!patientInput.trim()) return;

    setPatientThreads((prev) =>
      prev.map((th) =>
        th.id === activeThreadId
          ? {
              ...th,
              messages: [
                ...th.messages,
                { sender: "clinic", text: patientInput.trim(), time: "Just now" },
              ],
            }
          : th,
      ),
    );
    setPatientInput("");
  }

  function handleSendFax(e: React.FormEvent) {
    e.preventDefault();
    if (!faxTo.trim() || !faxSubject.trim()) return;

    setFaxSending(true);
    setTimeout(() => {
      const newFax = {
        id: `fx-${Date.now().toString().slice(-4)}`,
        to: faxTo,
        number: faxTo,
        subject: faxSubject,
        time: "Just now",
        status: "Delivered",
        pages: 2,
      };
      setRecentFaxes([newFax, ...recentFaxes]);
      setFaxSending(false);
      setFaxSuccess(true);
      setTimeout(() => {
        setFaxSuccess(false);
        setFaxTo("");
        setFaxSubject("");
      }, 1200);
    }, 500);
  }

  const activeThread = patientThreads.find((t) => t.id === activeThreadId) || patientThreads[0];
  const selectedEmail = emails.find((e) => e.id === selectedEmailId) || emails[0];

  return (
    <>
      {open && (
        <aside className={styles.panel} aria-label="Communications and collaboration dock">
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <span className={styles.headerIcon}>
                <Icon
                  name={
                    channel === "team"
                      ? "group"
                      : channel === "patient"
                      ? "chat_bubble"
                      : channel === "email"
                      ? "mail"
                      : channel === "fax"
                      ? "description"
                      : "groups"
                  }
                />
              </span>
              <div>
                <strong>
                  {channel === "team"
                    ? "Team Chat"
                    : channel === "patient"
                    ? "Patient Communication"
                    : channel === "email"
                    ? "Practice Email"
                    : channel === "fax"
                    ? "Digital Fax"
                    : "Provider Community"}
                </strong>
                <small>
                  {channel === "team"
                    ? "Internal care coordination & tasks"
                    : channel === "patient"
                    ? "Two-way patient SMS & reminders"
                    : channel === "email"
                    ? "Clinical inbox & referrals"
                    : channel === "fax"
                    ? "HIPAA e-Fax in/outbox line"
                    : "Peer network & case consults"}
                </small>
              </div>
            </div>

            <div className={styles.channelHeaderActions}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={handleFullscreen}
                title={`Open full ${channel} workspace`}
                aria-label="Open full workspace"
              >
                <Icon name="fullscreen" />
              </button>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => setOpen(false)}
                aria-label="Close communications dock"
              >
                ×
              </button>
            </div>
          </div>

          {/* 5-Channel Navigation Bar */}
          <div className={styles.channelBar}>
            <button
              type="button"
              className={`${styles.channelTab} ${channel === "team" ? styles.channelTabActive : ""}`}
              onClick={() => setChannel("team")}
            >
              <Icon name="group" size="sm" /> Team
            </button>
            <button
              type="button"
              className={`${styles.channelTab} ${channel === "patient" ? styles.channelTabActive : ""}`}
              onClick={() => setChannel("patient")}
            >
              <Icon name="chat_bubble" size="sm" /> Patient SMS
            </button>
            <button
              type="button"
              className={`${styles.channelTab} ${channel === "email" ? styles.channelTabActive : ""}`}
              onClick={() => setChannel("email")}
            >
              <Icon name="mail" size="sm" /> Email
            </button>
            <button
              type="button"
              className={`${styles.channelTab} ${channel === "fax" ? styles.channelTabActive : ""}`}
              onClick={() => setChannel("fax")}
            >
              <Icon name="description" size="sm" /> Fax
            </button>
            <button
              type="button"
              className={`${styles.channelTab} ${channel === "community" ? styles.channelTabActive : ""}`}
              onClick={() => setChannel("community")}
            >
              <Icon name="groups" size="sm" /> Community
            </button>
          </div>

          {/* CHANNEL 1: TEAM */}
          {channel === "team" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
              <div className={styles.tabs}>
                <button
                  type="button"
                  className={`${styles.tab} ${tab === "chat" ? styles.tabActive : ""}`}
                  onClick={() => setTab("chat")}
                >
                  Chat
                </button>
                <button
                  type="button"
                  className={`${styles.tab} ${tab === "tasks" ? styles.tabActive : ""}`}
                  onClick={() => setTab("tasks")}
                >
                  Shared Tasks
                </button>
              </div>

              {error && <div className={styles.error}>{error}</div>}

              {loading ? (
                <div className={styles.loading}>Loading team workspace…</div>
              ) : (
                <>
                  <PartnerStrip
                    snapshot={snapshot}
                    selectedPartnerId={selectedPartnerId}
                    onSelect={(partnerId) => {
                      setSelectedPartnerId(partnerId);
                      setMessagePatientId("");
                      setTaskPatientId("");
                    }}
                  />

                  {selectedPartner ? (
                    <>
                      <div className={styles.partnerHeader}>
                        <div className={styles.partnerInfo}>
                          <strong>
                            {selectedPartner.member.displayName}
                            {selectedPartner.member.credentials ? `, ${selectedPartner.member.credentials}` : ""}
                          </strong>
                          <small>{selectedPartner.member.role.replace("_", " ")}</small>
                        </div>
                        <span className={selectedPartner.member.presence === "online" ? styles.statusOnline : styles.statusBusy}>
                          {selectedPartner.member.presence}
                        </span>
                      </div>

                      {tab === "chat" ? (
                        <div className={styles.conversation}>
                          <div className={styles.messageList}>
                            {messages.length === 0 ? (
                              <div className={styles.emptyState}>No messages yet. Coordinate clinical care or delegate tasks.</div>
                            ) : (
                              messages.map((message) => (
                                <div
                                  key={message.id}
                                  className={`${styles.message} ${
                                    message.senderId === "current-user" ? styles.messageOut : styles.messageIn
                                  }`}
                                >
                                  <div className={styles.messageMeta}>
                                    <span>{message.senderId === "current-user" ? "You" : selectedPartner.member.displayName}</span>
                                    <span>{timeLabel(message.createdAt)}</span>
                                  </div>
                                  <p>{message.content}</p>
                                  {message.linkedPatient && (
                                    <button
                                      type="button"
                                      className={styles.patientLink}
                                      onClick={() => surfacePatient(message.linkedPatient!.id)}
                                    >
                                      Open Chart ({message.linkedPatient.name})
                                    </button>
                                  )}
                                </div>
                              ))
                            )}
                          </div>

                          <div className={styles.composer}>
                            <textarea
                              rows={2}
                              value={messageText}
                              onChange={(e) => setMessageText(e.target.value)}
                              placeholder={`Message ${selectedPartner.member.displayName}…`}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  void sendMessage();
                                }
                              }}
                            />
                            <div className={styles.composerControls}>
                              <button
                                type="button"
                                className={styles.sendButton}
                                disabled={!messageText.trim() || busy}
                                onClick={() => void sendMessage()}
                              >
                                Send
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.tasksSection}>
                          <div className={styles.taskComposer}>
                            <input
                              type="text"
                              value={taskText}
                              onChange={(e) => setTaskText(e.target.value)}
                              placeholder="Delegate task (e.g. Schedule follow-up, vitals check)…"
                            />
                            <div className={styles.taskInputs}>
                              <button
                                type="button"
                                className={styles.assignButton}
                                disabled={!taskText.trim() || busy}
                                onClick={() => void assignTask()}
                              >
                                Assign
                              </button>
                            </div>
                          </div>

                          <div className={styles.taskList}>
                            {partnerTasks.length === 0 ? (
                              <div className={styles.emptyState}>No shared tasks pending with {selectedPartner.member.displayName}.</div>
                            ) : (
                              partnerTasks.map((task) => (
                                <div key={task.id} className={styles.taskItem}>
                                  <div className={styles.taskTop}>
                                    <strong>{task.text}</strong>
                                    <span className={styles.taskStatus}>{task.status}</span>
                                  </div>
                                  {task.linkedPatient && (
                                    <button
                                      type="button"
                                      className={styles.patientLink}
                                      onClick={() => surfacePatient(task.linkedPatient!.id)}
                                    >
                                      Linked Chart ({task.linkedPatient.name})
                                    </button>
                                  )}
                                  {task.status === "open" && (
                                    <div className={styles.taskActions}>
                                      <button type="button" onClick={() => void updateTask(task, "done")}>Mark Done</button>
                                      <button type="button" onClick={() => void updateTask(task, "cancelled")}>Cancel</button>
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className={styles.emptyState}>Select a team member to start collaborating.</div>
                  )}
                </>
              )}
            </div>
          )}

          {/* CHANNEL 2: PATIENT SMS */}
          {channel === "patient" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
              {/* Thread switcher */}
              <div style={{ display: "flex", gap: "6px", padding: "8px 12px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc", overflowX: "auto" }}>
                {patientThreads.map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => setActiveThreadId(th.id)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "14px",
                      border: "1px solid",
                      borderColor: th.id === activeThreadId ? "#0284c7" : "#e2e8f0",
                      background: th.id === activeThreadId ? "#e0f2fe" : "#ffffff",
                      color: th.id === activeThreadId ? "#0369a1" : "#475569",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {th.name}
                  </button>
                ))}
              </div>

              {/* Active Thread Banner */}
              <div style={{ padding: "8px 12px", background: "#ffffff", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong style={{ fontSize: "12px", color: "#1e293b", display: "block" }}>{activeThread.name}</strong>
                  <small style={{ fontSize: "11px", color: "#64748b" }}>📱 {activeThread.phone} (Two-way SMS)</small>
                </div>
                <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "10px", background: "#ecfdf5", color: "#047857", fontWeight: 600 }}>
                  Active
                </span>
              </div>

              {/* Messages list */}
              <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "8px", background: "#fbfcfd" }}>
                {activeThread.messages.map((m, idx) => (
                  <div
                    key={idx}
                    style={{
                      alignSelf: m.sender === "clinic" ? "flex-end" : "flex-start",
                      maxWidth: "85%",
                      padding: "8px 12px",
                      borderRadius: "12px",
                      background: m.sender === "clinic" ? "#0284c7" : "#f1f5f9",
                      color: m.sender === "clinic" ? "#ffffff" : "#1e293b",
                      fontSize: "12px",
                      lineHeight: 1.4,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                    }}
                  >
                    <p style={{ margin: 0 }}>{m.text}</p>
                    <small style={{ display: "block", textAlign: "right", marginTop: "3px", fontSize: "10px", opacity: 0.8 }}>
                      {m.time}
                    </small>
                  </div>
                ))}
              </div>

              {/* Quick Template Chips */}
              <div style={{ padding: "6px 10px", background: "#f8fafc", borderTop: "1px solid #f1f5f9", display: "flex", gap: "6px", overflowX: "auto" }}>
                <button
                  type="button"
                  onClick={() => setPatientInput(`Hi ${activeThread.name.split(" ")[0]}, here is your telehealth session link: https://telehealth.clinicalbond.com/v/session`)}
                  style={{ fontSize: "10px", padding: "3px 8px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#ffffff", color: "#475569", cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  🔗 Telehealth Link
                </button>
                <button
                  type="button"
                  onClick={() => setPatientInput(`Hi ${activeThread.name.split(" ")[0]}, confirming your medication refill was sent to your pharmacy.`)}
                  style={{ fontSize: "10px", padding: "3px 8px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#ffffff", color: "#475569", cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  💊 Refill Confirmed
                </button>
              </div>

              {/* SMS Input Composer */}
              <form onSubmit={handleSendPatientSms} style={{ padding: "8px 12px", background: "#ffffff", borderTop: "1px solid #e2e8f0", display: "flex", gap: "6px" }}>
                <input
                  type="text"
                  placeholder="Text patient via SMS…"
                  value={patientInput}
                  onChange={(e) => setPatientInput(e.target.value)}
                  style={{ flex: 1, padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                />
                <button
                  type="submit"
                  disabled={!patientInput.trim()}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    background: "#0284c7",
                    color: "#ffffff",
                    border: "none",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    opacity: patientInput.trim() ? 1 : 0.6,
                  }}
                >
                  Send
                </button>
              </form>
            </div>
          )}

          {/* CHANNEL 3: EMAIL */}
          {channel === "email" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
              {/* Emails List */}
              <div style={{ maxHeight: "200px", overflowY: "auto", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", padding: "6px 8px" }}>
                {emails.map((e) => (
                  <div
                    key={e.id}
                    onClick={() => setSelectedEmailId(e.id)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: "8px",
                      marginBottom: "4px",
                      cursor: "pointer",
                      background: e.id === selectedEmailId ? "#ede9fe" : "#ffffff",
                      border: e.id === selectedEmailId ? "1px solid #c4b5fd" : "1px solid #f1f5f9",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 600, color: "#1e293b", marginBottom: "2px" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "230px" }}>{e.from}</span>
                      <span style={{ color: "#94a3b8" }}>{e.time}</span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.subject}
                    </div>
                  </div>
                ))}
              </div>

              {/* Selected Email Body */}
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", background: "#ffffff" }}>
                <div style={{ marginBottom: "10px", paddingBottom: "8px", borderBottom: "1px solid #f1f5f9" }}>
                  <strong style={{ fontSize: "13px", color: "#0f172a", display: "block" }}>{selectedEmail.subject}</strong>
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>From: {selectedEmail.from}</div>
                </div>
                <div style={{ fontSize: "12px", lineHeight: 1.5, color: "#334155", whiteSpace: "pre-wrap" }}>
                  {selectedEmail.body}
                </div>
              </div>

              {/* Quick Reply Form */}
              <div style={{ padding: "8px 12px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input
                    type="text"
                    placeholder="Quick reply to sender…"
                    value={emailReplyText}
                    onChange={(e) => setEmailReplyText(e.target.value)}
                    style={{ flex: 1, padding: "7px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!emailReplyText.trim()) return;
                      alert(`Email response dispatched.`);
                      setEmailReplyText("");
                    }}
                    style={{ padding: "7px 12px", borderRadius: "8px", background: "#6366f1", color: "#ffffff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Reply
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CHANNEL 4: DIGITAL FAX */}
          {channel === "fax" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 14px", background: "#ffffff" }}>
              <div style={{ background: "#ede7f6", color: "#5e35b1", padding: "8px 12px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, marginBottom: "12px" }}>
                📠 Clinic Digital Fax: (415) 555-0100 (HIPAA Verified)
              </div>

              <form onSubmit={handleSendFax} style={{ background: "#f8fafc", padding: "12px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "14px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b", marginBottom: "8px" }}>Send Quick e-Fax</div>

                <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                  <input
                    type="text"
                    required
                    placeholder="Fax # or Clinic (e.g. Walgreens, Quest)"
                    value={faxTo}
                    onChange={(e) => setFaxTo(e.target.value)}
                    style={{ flex: 1, padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "11px" }}
                  />
                </div>

                <input
                  type="text"
                  required
                  placeholder="Subject / Patient note attachment"
                  value={faxSubject}
                  onChange={(e) => setFaxSubject(e.target.value)}
                  style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "11px", marginBottom: "8px" }}
                />

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="submit"
                    disabled={faxSending}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      background: "#5e35b1",
                      color: "#ffffff",
                      border: "none",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {faxSending ? "Transmitting…" : faxSuccess ? "Fax Sent!" : "Send Fax"}
                  </button>
                </div>
              </form>

              {/* Recent Faxes */}
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b", marginBottom: "8px" }}>Recent Transmissions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {recentFaxes.map((f) => (
                  <div key={f.id} style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#ffffff", fontSize: "11px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, color: "#0f172a", marginBottom: "2px" }}>
                      <span>{f.to}</span>
                      <span style={{ color: "#047857" }}>{f.status}</span>
                    </div>
                    <div style={{ color: "#64748b" }}>{f.subject}</div>
                    <div style={{ color: "#94a3b8", fontSize: "10px", marginTop: "2px" }}>{f.time} · {f.pages} pages</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CHANNEL 5: COMMUNITY */}
          {channel === "community" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 14px", background: "#ffffff" }}>
              <div style={{ background: "#e0f2fe", color: "#0369a1", padding: "8px 12px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, marginBottom: "12px" }}>
                🌐 Verified Provider Peer Consult Network
              </div>

              <div style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b", marginBottom: "8px" }}>Active Case Discussions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                {discussions.map((dc) => (
                  <div key={dc.id} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#0f172a", marginBottom: "3px" }}>{dc.title}</div>
                    <div style={{ fontSize: "11px", color: "#475569", lineHeight: 1.4, marginBottom: "6px" }}>{dc.content}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#64748b" }}>
                      <span>By {dc.author}</span>
                      <span>💬 {dc.replies} replies</span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleFullscreen}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#0369a1",
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                Browse Full Specialist Directory & Case Forum →
              </button>
            </div>
          )}
        </aside>
      )}
    </>
  );
}

function PartnerStrip({
  snapshot,
  selectedPartnerId,
  onSelect,
}: {
  snapshot: TeamWorkspaceSnapshot | null;
  selectedPartnerId: string | null;
  onSelect: (partnerId: string) => void;
}) {
  if (!snapshot) return null;

  return (
    <div className={styles.partnerStrip}>
      {snapshot.partners.map((partner) => {
        const selected = partner.member.id === selectedPartnerId;
        return (
          <button
            key={partner.member.id}
            type="button"
            className={`${styles.partnerChip} ${selected ? styles.partnerChipActive : ""}`}
            onClick={() => onSelect(partner.member.id)}
          >
            <span className={styles.partnerAvatar}>{partner.member.initials}</span>
            <span className={styles.partnerName}>{partner.member.displayName.split(" ")[0]}</span>
            {partner.unreadCount > 0 && <span className={styles.unreadCount}>{partner.unreadCount}</span>}
          </button>
        );
      })}
    </div>
  );
}
