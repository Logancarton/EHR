"use client";

import { useEffect, useMemo, useState } from "react";
import CompanionPanelHeader from "./CompanionPanelHeader";
import Icon from "../ui/Icon";
import { teamApi } from "../../lib/team-api";
import { api } from "../../lib/api-client";
import type {
  TeamMessage,
  TeamPartner,
  TeamTaskAssignment,
  TeamWorkspaceSnapshot,
} from "../../domain/team-collaboration";
import type { Patient } from "../../domain/patient";
import type { PatientMessageThread, MessageCategory } from "../../domain/messages";
import type { GlobalWorkspaceModule } from "../../lib/workspace-navigation";
import type { WorkspaceCanvasContext } from "../../lib/workspace-canvas-context";
import { useWorkspaceNavigation } from "../../lib/workspace-navigation-context";
import { useDismissible } from "../../lib/use-dismissible";
import {
  readStoredCommunicationDrafts,
  writeStoredCommunicationDrafts,
} from "../../lib/use-communication-drafts";

export type CommunicationChannel =
  | "team"
  | "inbox"
  | "patient"
  | "email"
  | "fax"
  | "community";

export interface CommunicationCompanionPanelProps {
  initialChannel?: CommunicationChannel;
  activePatient?: Patient | null;
  workspaceContext: WorkspaceCanvasContext;
  roster?: readonly Patient[];
  onClose: () => void;
  onUnpin?: () => void;
  onOpenPatient?: (patientId: string) => void;
  onOpenGlobalModule?: (moduleId: GlobalWorkspaceModule) => void;
  onNotify?: (message: string, holdMs?: number) => void;
  isExpanded?: boolean;
  onExpand?: () => void;
  onRedock?: () => void;
}

function timeLabel(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function CommunicationCompanionPanel({
  initialChannel = "team",
  activePatient,
  workspaceContext,
  roster = [],
  onClose,
  onUnpin,
  onOpenPatient,
  onOpenGlobalModule,
  onNotify,
  isExpanded = false,
  onExpand,
  onRedock,
}: CommunicationCompanionPanelProps) {
  const nav = useWorkspaceNavigation();
  const handleOpenPatient = onOpenPatient ?? ((id: string) => nav.openPatient(id));
  const handleOpenGlobalModule = onOpenGlobalModule ?? ((mod: GlobalWorkspaceModule) => nav.openGlobalModule(mod));

  const initialDrafts = useMemo(() => readStoredCommunicationDrafts(), []);

  const [channel, setChannel] = useState<CommunicationChannel>(
    initialDrafts.channel ?? initialChannel
  );

  // ── Team Channel State ──────────────────────────────────────────────────
  const [teamTab, setTeamTab] = useState<"chat" | "tasks">(
    initialDrafts.teamTab ?? "chat"
  );
  const [snapshot, setSnapshot] = useState<TeamWorkspaceSnapshot | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(
    initialDrafts.selectedPartnerId ?? null
  );
  const [teamMessages, setTeamMessages] = useState<TeamMessage[]>([]);
  const [messageText, setMessageText] = useState(
    initialDrafts.messageText ?? ""
  );
  const [messagePatientId, setMessagePatientId] = useState(
    initialDrafts.messagePatientId ?? (activePatient?.id ?? "")
  );
  const [taskText, setTaskText] = useState(
    initialDrafts.taskText ?? ""
  );
  const [taskPatientId, setTaskPatientId] = useState(
    initialDrafts.taskPatientId ?? (activePatient?.id ?? "")
  );
  const [taskDueDate, setTaskDueDate] = useState(
    initialDrafts.taskDueDate ?? ""
  );
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamError, setTeamError] = useState("");

  // ── Inbox Channel State ─────────────────────────────────────────────────
  const [inboxFilter, setInboxFilter] = useState<"all" | "unread" | "priority" | "refill">(
    initialDrafts.inboxFilter ?? "all"
  );
  const [inboxCategory, setInboxCategory] = useState<"all" | MessageCategory>(
    initialDrafts.inboxCategory ?? "all"
  );
  const [inboxRows, setInboxRows] = useState<
    Array<{ patientId: string; patientName: string; patientMrn: string; thread: PatientMessageThread }>
  >([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState("");

  // ── Patient SMS State ───────────────────────────────────────────────────
  const [patientThreads, setPatientThreads] = useState([
    {
      id: "pt-1",
      name: "Elena Rostova",
      phone: "(415) 309-8812",
      messages: [
        { sender: "clinic", text: "Hi Elena, this is Clinical Bond Psychiatry reminding you of your visit today at 10:00 AM.", time: "09:00 AM" },
        { sender: "patient", text: "Thank you Dr. Taylor, I clicked the telehealth link and will be in the waiting room at 10.", time: "09:48 AM" },
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
  const [activeSmsThreadId, setActiveSmsThreadId] = useState(
    initialDrafts.activeSmsThreadId ?? "pt-1"
  );
  const [smsInput, setSmsInput] = useState(
    initialDrafts.smsInput ?? ""
  );

  // ── Email State ─────────────────────────────────────────────────────────
  const [emails] = useState([
    {
      id: "em-1",
      from: "Dr. Sarah Jenkins, MD (Bay Area Family Med)",
      subject: "Psychiatric Consultation Referral: Elena Rostova",
      snippet: "Attaching recent metabolic lab panels and previous SSRI trials for Elena Rostova ahead of intake...",
      time: "10:14 AM",
      unread: true,
      body: "Dear Dr. Taylor,\n\nI am referring Elena Rostova (DOB: 04/12/1988) for comprehensive psychiatric evaluation regarding recurrent depressive symptoms. Her CBC, CMP, and thyroid panel from last week are normal. Looking forward to your consultation notes.\n\nBest regards,\nDr. Sarah Jenkins, MD",
    },
    {
      id: "em-2",
      from: "Walgreens Specialty Pharmacy #1402",
      subject: "Prior Authorization Clarification - Lamotrigine 100mg (Jordan Reed)",
      snippet: "Electronic prior authorization question regarding titration starter pack quantity override...",
      time: "09:30 AM",
      unread: true,
      body: "Attention: Dr. Taylor Smith, MD\n\nRegarding patient Jordan Reed (DOB: 08/22/1991):\nThe e-prescription for Lamotrigine Starter Kit was received. Aetna requires an explicit ICD-10 indication code on file to approve the 30-day starter pack dispensation. Please confirm F31.81 via reply.\n\nThank you,\nPharmacy Staff, Walgreens #1402",
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
  const [selectedEmailId, setSelectedEmailId] = useState(
    initialDrafts.selectedEmailId ?? "em-1"
  );
  const [emailReplyText, setEmailReplyText] = useState(
    initialDrafts.emailReplyText ?? ""
  );

  // ── Fax State ───────────────────────────────────────────────────────────
  const [recentFaxes, setRecentFaxes] = useState([
    { id: "fx-1", to: "Bay Area Family Medicine", number: "(415) 555-3810", subject: "Consultation Note: Elena Rostova", time: "Today, 09:15 AM", status: "Delivered", pages: 2 },
    { id: "fx-2", to: "Walgreens Pharmacy #1402", number: "(415) 555-0144", subject: "Lamotrigine Titration Prior-Auth", time: "Yesterday, 3:45 PM", status: "Received", pages: 1 },
    { id: "fx-3", to: "Labcorp Northern California", number: "(800) 555-0199", subject: "Lab Requisition: Marcus Vance", time: "Sep 11, 2026", status: "Delivered", pages: 3 },
  ]);
  const [faxTo, setFaxTo] = useState(
    initialDrafts.faxTo ?? ""
  );
  const [faxSubject, setFaxSubject] = useState(
    initialDrafts.faxSubject ?? ""
  );

  // ── Community State ─────────────────────────────────────────────────────
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
  const [communityReplyText, setCommunityReplyText] = useState(
    initialDrafts.communityReplyText ?? ""
  );

  // Synchronize drafts to session storage
  useEffect(() => {
    writeStoredCommunicationDrafts({
      channel,
      teamTab,
      selectedPartnerId,
      messageText,
      messagePatientId,
      taskText,
      taskPatientId,
      taskDueDate,
      inboxFilter,
      inboxCategory,
      activeSmsThreadId,
      smsInput,
      selectedEmailId,
      emailReplyText,
      faxTo,
      faxSubject,
      communityReplyText,
    });
  }, [
    channel,
    teamTab,
    selectedPartnerId,
    messageText,
    messagePatientId,
    taskText,
    taskPatientId,
    taskDueDate,
    inboxFilter,
    inboxCategory,
    activeSmsThreadId,
    smsInput,
    selectedEmailId,
    emailReplyText,
    faxTo,
    faxSubject,
    communityReplyText,
  ]);

  // Escape key handling: redock when expanded, or close when docked
  useDismissible({
    active: true,
    onDismiss: () => {
      if (isExpanded && onRedock) {
        onRedock();
      } else {
        onClose();
      }
    },
  });

  // ── Refresh Team Data ───────────────────────────────────────────────────
  async function refreshTeamSnapshot(preferredPartnerId?: string) {
    const next = await teamApi.snapshot();
    setSnapshot(next);
    setSelectedPartnerId((current) => {
      const wanted = preferredPartnerId || current;
      if (wanted && next.partners.some((p) => p.member.id === wanted)) return wanted;
      return next.partners[0]?.member.id || null;
    });
  }

  useEffect(() => {
    if (channel !== "team" || snapshot) return;
    setTeamLoading(true);
    setTeamError("");
    refreshTeamSnapshot()
      .catch((err) => setTeamError(err instanceof Error ? err.message : "Unable to load team workspace."))
      .finally(() => setTeamLoading(false));
  }, [channel, snapshot]);

  useEffect(() => {
    if (channel !== "team" || !selectedPartnerId) return;
    setTeamError("");
    teamApi
      .conversation(selectedPartnerId)
      .then((msgs) => setTeamMessages(msgs))
      .catch((err) => setTeamError(err instanceof Error ? err.message : "Unable to load conversation."));
  }, [channel, selectedPartnerId]);

  // ── Refresh Inbox Data ──────────────────────────────────────────────────
  async function loadInboxRows() {
    setInboxLoading(true);
    setInboxError("");
    try {
      const targets = roster.length > 0 ? roster : activePatient ? [activePatient] : [];
      if (targets.length === 0) {
        setInboxRows([]);
        return;
      }
      const results = await Promise.allSettled(
        targets.map(async (p) => ({ patient: p, threads: await api.messages.list(p.id) })),
      );
      const rows: Array<{ patientId: string; patientName: string; patientMrn: string; thread: PatientMessageThread }> = [];
      for (const res of results) {
        if (res.status === "fulfilled") {
          for (const th of res.value.threads) {
            rows.push({
              patientId: res.value.patient.id,
              patientName: res.value.patient.name,
              patientMrn: res.value.patient.mrn,
              thread: th,
            });
          }
        }
      }
      rows.sort((a, b) => new Date(b.thread.lastMessageAt).getTime() - new Date(a.thread.lastMessageAt).getTime());
      setInboxRows(rows);
    } catch (err) {
      setInboxError(err instanceof Error ? err.message : "Unable to load inbox messages.");
    } finally {
      setInboxLoading(false);
    }
  }

  useEffect(() => {
    if (channel === "inbox") {
      void loadInboxRows();
    }
  }, [channel, roster, activePatient]);

  // ── Selected Team Partner & Tasks ───────────────────────────────────────
  const selectedPartner = useMemo(
    () => snapshot?.partners.find((p) => p.member.id === selectedPartnerId) || null,
    [snapshot, selectedPartnerId],
  );

  const partnerTasks = useMemo(() => {
    if (!snapshot || !selectedPartnerId) return [];
    return snapshot.assignedTasks.filter(
      (task) => task.assignerId === selectedPartnerId || task.assigneeId === selectedPartnerId,
    );
  }, [snapshot, selectedPartnerId]);

  // ── Team Actions ────────────────────────────────────────────────────────
  async function handleSendTeamMessage() {
    if (!selectedPartner || !messageText.trim() || teamBusy) return;
    setTeamBusy(true);
    setTeamError("");
    try {
      const message = await teamApi.sendMessage({
        partnerId: selectedPartner.member.id,
        content: messageText.trim(),
        patientId: messagePatientId || undefined,
      });
      setTeamMessages((prev) => [...prev, message]);
      setMessageText("");
      setMessagePatientId(activePatient?.id ?? "");
      await refreshTeamSnapshot(selectedPartner.member.id);
      onNotify?.("Message sent to team member.", 2000);
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : "Unable to send team message.");
    } finally {
      setTeamBusy(false);
    }
  }

  async function handleAssignTeamTask() {
    if (!selectedPartner || !taskText.trim() || teamBusy) return;
    setTeamBusy(true);
    setTeamError("");
    try {
      await teamApi.assignTask({
        assigneeId: selectedPartner.member.id,
        text: taskText.trim(),
        patientId: taskPatientId || undefined,
        dueDate: taskDueDate || undefined,
      });
      setTaskText("");
      setTaskPatientId(activePatient?.id ?? "");
      setTaskDueDate("");
      await refreshTeamSnapshot(selectedPartner.member.id);
      onNotify?.("Task delegated to team member.", 2000);
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : "Unable to assign team task.");
    } finally {
      setTeamBusy(false);
    }
  }

  async function handleUpdateTeamTask(task: TeamTaskAssignment, status: "done" | "cancelled") {
    if (teamBusy) return;
    setTeamBusy(true);
    setTeamError("");
    try {
      await teamApi.updateTaskStatus(task.id, status);
      await refreshTeamSnapshot(selectedPartnerId || undefined);
      onNotify?.(`Task marked as ${status}.`, 2000);
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : "Unable to update team task.");
    } finally {
      setTeamBusy(false);
    }
  }

  // ── Contained Patient SMS Action ────────────────────────────────────────
  function handleSendPatientSms(e: React.FormEvent) {
    e.preventDefault();
    if (!smsInput.trim()) return;

    setPatientThreads((prev) =>
      prev.map((th) =>
        th.id === activeSmsThreadId
          ? {
              ...th,
              messages: [
                ...th.messages,
                { sender: "clinic", text: smsInput.trim(), time: "Draft (Offline)" },
              ],
            }
          : th,
      ),
    );
    setSmsInput("");
    onNotify?.("SMS saved locally as draft (telephony unconfigured).", 3000);
  }

  // ── Contained Fax Action ────────────────────────────────────────────────
  function handleSendFax(e: React.FormEvent) {
    e.preventDefault();
    if (!faxTo.trim() || !faxSubject.trim()) return;

    const newFax = {
      id: `fx-${Date.now().toString().slice(-4)}`,
      to: faxTo,
      number: faxTo,
      subject: faxSubject,
      time: "Draft (Not Sent)",
      status: "Draft",
      pages: 1,
    };
    setRecentFaxes([newFax, ...recentFaxes]);
    setFaxTo("");
    setFaxSubject("");
    onNotify?.("Fax saved locally as draft (no gateway configured).", 3000);
  }

  // ── Inbox Filter Calculations ───────────────────────────────────────────
  const filteredInboxRows = useMemo(() => {
    return inboxRows.filter((row) => {
      const { thread } = row;
      if (inboxFilter === "unread" && thread.unreadCount <= 0) return false;
      if (inboxFilter === "priority" && thread.urgency !== "urgent" && thread.urgency !== "high") return false;
      if (inboxFilter === "refill" && thread.category !== "refill") return false;
      if (inboxCategory !== "all" && thread.category !== inboxCategory) return false;
      return true;
    });
  }, [inboxRows, inboxFilter, inboxCategory]);

  const inboxCounts = useMemo(() => {
    return {
      all: inboxRows.length,
      unread: inboxRows.filter((r) => r.thread.unreadCount > 0).length,
      priority: inboxRows.filter((r) => r.thread.urgency === "urgent" || r.thread.urgency === "high").length,
      refill: inboxRows.filter((r) => r.thread.category === "refill").length,
    };
  }, [inboxRows]);

  const activeSmsThread = patientThreads.find((t) => t.id === activeSmsThreadId) || patientThreads[0];
  const selectedEmail = emails.find((e) => e.id === selectedEmailId) || emails[0];

  return (
    <aside
      className={`companion-panel communication-companion-panel ${isExpanded ? "companion-expanded-canvas" : ""}`}
      data-companion-panel="communication"
      data-companion-presentation={isExpanded ? "expanded" : "docked"}
      data-context-tab={workspaceContext.tabId}
      aria-label="Communication"
    >
      <CompanionPanelHeader
        title="Communication"
        context={`Context: ${workspaceContext.label}`}
        icon="forum"
        iconStyle={{ background: "#e0f2fe", color: "#0284c7" }}
        onClose={onClose}
        onUnpin={onUnpin}
        unpinLabel="Unpin Communication"
        isExpanded={isExpanded}
        onExpand={onExpand}
        onRedock={onRedock}
      />

      {/* 6-Channel Navigation Strip */}
      <div className="comm-channel-bar" role="tablist" aria-label="Communication channels">
        <button
          type="button"
          role="tab"
          aria-selected={channel === "team"}
          data-channel="team"
          className={`comm-channel-tab ${channel === "team" ? "active" : ""}`}
          onClick={() => setChannel("team")}
        >
          <Icon name="group" size="sm" />
          <span>Team</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={channel === "inbox"}
          data-channel="inbox"
          className={`comm-channel-tab ${channel === "inbox" ? "active" : ""}`}
          onClick={() => setChannel("inbox")}
        >
          <Icon name="inbox" size="sm" />
          <span>Inbox</span>
          {inboxCounts.unread > 0 && <span className="comm-channel-count">{inboxCounts.unread}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={channel === "patient"}
          data-channel="patient"
          className={`comm-channel-tab ${channel === "patient" ? "active" : ""}`}
          onClick={() => setChannel("patient")}
        >
          <Icon name="chat_bubble" size="sm" />
          <span>Patient SMS</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={channel === "email"}
          data-channel="email"
          className={`comm-channel-tab ${channel === "email" ? "active" : ""}`}
          onClick={() => setChannel("email")}
        >
          <Icon name="mail" size="sm" />
          <span>Email</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={channel === "fax"}
          data-channel="fax"
          className={`comm-channel-tab ${channel === "fax" ? "active" : ""}`}
          onClick={() => setChannel("fax")}
        >
          <Icon name="description" size="sm" />
          <span>Fax</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={channel === "community"}
          data-channel="community"
          className={`comm-channel-tab ${channel === "community" ? "active" : ""}`}
          onClick={() => setChannel("community")}
        >
          <Icon name="groups" size="sm" />
          <span>Community</span>
        </button>
      </div>

      <div className="comm-panel-body">
        {/* ── CHANNEL 1: TEAM ────────────────────────────────────────────── */}
        {channel === "team" && (
          <div className="comm-section-container comm-team-workspace-wrap" data-comm-section="team">
            <div className="comm-subtabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={teamTab === "chat"}
                className={`comm-subtab ${teamTab === "chat" ? "active" : ""}`}
                onClick={() => setTeamTab("chat")}
              >
                Chat
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={teamTab === "tasks"}
                className={`comm-subtab ${teamTab === "tasks" ? "active" : ""}`}
                onClick={() => setTeamTab("tasks")}
              >
                Shared Tasks
              </button>
            </div>

            {teamError && <div className="comm-inline-error">{teamError}</div>}

            {teamLoading ? (
              <div className="comm-loading-state">Loading team workspace…</div>
            ) : (
              <>
                {snapshot && (
                  <div className="comm-partner-strip" aria-label="Team members">
                    {snapshot.partners.map((partner) => {
                      const isSelected = partner.member.id === selectedPartnerId;
                      return (
                        <button
                          key={partner.member.id}
                          type="button"
                          className={`comm-partner-chip ${isSelected ? "active" : ""}`}
                          onClick={() => setSelectedPartnerId(partner.member.id)}
                          title={`${partner.member.displayName} (${partner.member.role})`}
                        >
                          <span className="comm-partner-avatar">{partner.member.initials}</span>
                          <span className="comm-partner-name">{partner.member.displayName.split(" ")[0]}</span>
                          <span
                            className={`comm-presence-dot ${partner.member.presence === "online" ? "online" : "busy"}`}
                            title={partner.member.presence}
                          />
                          {partner.unreadCount > 0 && (
                            <span className="comm-partner-unread">{partner.unreadCount}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedPartner ? (
                  <>
                    <div className="comm-partner-banner">
                      <div>
                        <strong>{selectedPartner.member.displayName}</strong>
                        {selectedPartner.member.credentials ? ` (${selectedPartner.member.credentials})` : ""}
                        <small> · {selectedPartner.member.role.replace("_", " ")}</small>
                      </div>
                      <span className={`comm-status-badge ${selectedPartner.member.presence === "online" ? "online" : "busy"}`}>
                        {selectedPartner.member.presence}
                      </span>
                    </div>

                    {teamTab === "chat" ? (
                      <div className="comm-chat-view">
                        <div className="comm-messages-scroll">
                          {teamMessages.length === 0 ? (
                            <div className="comm-empty-state">No messages yet. Send a message to coordinate care.</div>
                          ) : (
                            teamMessages.map((msg) => (
                              <div
                                key={msg.id}
                                className={`comm-msg-bubble ${msg.senderId === "current-user" ? "outgoing" : "incoming"}`}
                              >
                                <div className="comm-msg-meta">
                                  <span>{msg.senderId === "current-user" ? "You" : selectedPartner.member.displayName}</span>
                                  <span>{timeLabel(msg.createdAt)}</span>
                                </div>
                                <div className="comm-msg-text">{msg.content}</div>
                                {msg.linkedPatient && (
                                  <button
                                    type="button"
                                    className="comm-patient-tag-btn"
                                    onClick={() => handleOpenPatient(msg.linkedPatient!.id)}
                                  >
                                    <Icon name="person" size="sm" />
                                    <span>{msg.linkedPatient.name}</span>
                                  </button>
                                )}
                              </div>
                            ))
                          )}
                        </div>

                        <div className="comm-composer">
                          <textarea
                            rows={2}
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            placeholder={`Message ${selectedPartner.member.displayName}…`}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void handleSendTeamMessage();
                              }
                            }}
                          />
                          <div className="comm-composer-actions">
                            {roster.length > 0 && (
                              <select
                                value={messagePatientId}
                                onChange={(e) => setMessagePatientId(e.target.value)}
                                className="comm-patient-select"
                                aria-label="Tag patient chart"
                              >
                                <option value="">Tag patient chart…</option>
                                {roster.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            <button
                              type="button"
                              className="comm-btn-primary"
                              disabled={!messageText.trim() || teamBusy}
                              onClick={() => void handleSendTeamMessage()}
                            >
                              Send
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="comm-tasks-view">
                        <div className="comm-task-compose-box">
                          <input
                            type="text"
                            value={taskText}
                            onChange={(e) => setTaskText(e.target.value)}
                            placeholder="Delegate a task (e.g. Schedule lab follow-up)…"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleAssignTeamTask();
                            }}
                          />
                          <div className="comm-task-compose-controls">
                            {roster.length > 0 && (
                              <select
                                value={taskPatientId}
                                onChange={(e) => setTaskPatientId(e.target.value)}
                                className="comm-patient-select"
                                aria-label="Link task to patient"
                              >
                                <option value="">Link patient chart…</option>
                                {roster.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            <button
                              type="button"
                              className="comm-btn-primary"
                              disabled={!taskText.trim() || teamBusy}
                              onClick={() => void handleAssignTeamTask()}
                            >
                              Assign Task
                            </button>
                          </div>
                        </div>

                        <div className="comm-task-list">
                          {partnerTasks.length === 0 ? (
                            <div className="comm-empty-state">No shared tasks with {selectedPartner.member.displayName}.</div>
                          ) : (
                            partnerTasks.map((task) => (
                              <div key={task.id} className={`comm-task-card ${task.status}`}>
                                <div className="comm-task-header">
                                  <strong>{task.text}</strong>
                                  <span className={`comm-task-pill ${task.status}`}>{task.status}</span>
                                </div>
                                {task.linkedPatient && (
                                  <button
                                    type="button"
                                    className="comm-patient-tag-btn"
                                    onClick={() => handleOpenPatient(task.linkedPatient!.id)}
                                  >
                                    <Icon name="person" size="sm" />
                                    <span>{task.linkedPatient.name}</span>
                                  </button>
                                )}
                                {task.status === "open" && (
                                  <div className="comm-task-actions">
                                    <button
                                      type="button"
                                      className="comm-action-btn complete"
                                      onClick={() => void handleUpdateTeamTask(task, "done")}
                                    >
                                      Mark Done
                                    </button>
                                    <button
                                      type="button"
                                      className="comm-action-btn cancel"
                                      onClick={() => void handleUpdateTeamTask(task, "cancelled")}
                                    >
                                      Cancel
                                    </button>
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
                  <div className="comm-empty-state">Select a team member to collaborate.</div>
                )}
              </>
            )}

            {handleOpenGlobalModule && (
              <button
                type="button"
                className="comm-launch-workspace-btn"
                onClick={() => handleOpenGlobalModule("tasks")}
              >
                <Icon name="fullscreen" size="sm" />
                <span>Open Full Tasks Workspace</span>
              </button>
            )}
          </div>
        )}

        {/* ── CHANNEL 2: INBOX ───────────────────────────────────────────── */}
        {channel === "inbox" && (
          <div className="comm-section-container comm-inbox-workspace-wrap" data-comm-section="inbox">
            <div className="comm-inbox-toolbar">
              <div className="comm-filter-chips">
                <button
                  type="button"
                  className={`comm-filter-chip ${inboxFilter === "all" ? "active" : ""}`}
                  onClick={() => setInboxFilter("all")}
                >
                  All ({inboxCounts.all})
                </button>
                <button
                  type="button"
                  className={`comm-filter-chip ${inboxFilter === "unread" ? "active" : ""}`}
                  onClick={() => setInboxFilter("unread")}
                >
                  Unread ({inboxCounts.unread})
                </button>
                <button
                  type="button"
                  className={`comm-filter-chip ${inboxFilter === "priority" ? "active" : ""}`}
                  onClick={() => setInboxFilter("priority")}
                >
                  Priority ({inboxCounts.priority})
                </button>
                <button
                  type="button"
                  className={`comm-filter-chip ${inboxFilter === "refill" ? "active" : ""}`}
                  onClick={() => setInboxFilter("refill")}
                >
                  Refills ({inboxCounts.refill})
                </button>
              </div>

              <select
                value={inboxCategory}
                onChange={(e) => setInboxCategory(e.target.value as typeof inboxCategory)}
                className="comm-category-select"
                aria-label="Filter inbox by category"
              >
                <option value="all">All categories</option>
                <option value="refill">Refills</option>
                <option value="symptom-check">Symptom checks</option>
                <option value="scheduling">Scheduling</option>
                <option value="general">General</option>
              </select>
            </div>

            {inboxError && <div className="comm-inline-error">{inboxError}</div>}

            {inboxLoading ? (
              <div className="comm-loading-state">Loading messages…</div>
            ) : filteredInboxRows.length === 0 ? (
              <div className="comm-empty-state">No messages matching current filter.</div>
            ) : (
              <div className="comm-inbox-list">
                {filteredInboxRows.map((row) => (
                  <button
                    key={row.thread.id}
                    type="button"
                    className={`comm-inbox-row ${row.thread.unreadCount > 0 ? "unread" : ""}`}
                    onClick={() => handleOpenPatient(row.patientId)}
                    title={`Open chart for ${row.patientName}`}
                  >
                    <div className="comm-inbox-row-top">
                      <strong>{row.patientName}</strong>
                      <span className="comm-inbox-time">{timeLabel(row.thread.lastMessageAt)}</span>
                    </div>
                    <div className="comm-inbox-row-subject">{row.thread.subject}</div>
                    {row.thread.aiTriageSummary && (
                      <div className="comm-inbox-row-snippet">{row.thread.aiTriageSummary}</div>
                    )}
                    <div className="comm-inbox-badges">
                      <span className={`comm-category-badge ${row.thread.category}`}>{row.thread.category}</span>
                      {(row.thread.urgency === "urgent" || row.thread.urgency === "high") && (
                        <span className={`comm-urgency-badge ${row.thread.urgency}`}>{row.thread.urgency}</span>
                      )}
                      {row.thread.unreadCount > 0 && (
                        <span className="comm-unread-badge">{row.thread.unreadCount} unread</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {handleOpenGlobalModule && (
              <button
                type="button"
                className="comm-launch-workspace-btn"
                onClick={() => handleOpenGlobalModule("inbox")}
              >
                <Icon name="fullscreen" size="sm" />
                <span>Open Full Inbox Workspace</span>
              </button>
            )}
          </div>
        )}

        {/* ── CHANNEL 3: PATIENT SMS ─────────────────────────────────────── */}
        {channel === "patient" && (
          <div className="comm-section-container comm-sms-workspace-wrap" data-comm-section="patient">
            <div className="comm-notice-banner" data-sms-transport="unconfigured">
              <Icon name="info" size="sm" />
              <span>SMS transport unavailable: Telephony integration is not configured. Messages saved locally as draft.</span>
            </div>

            <div className="comm-sms-thread-selector">
              {patientThreads.map((th) => (
                <button
                  key={th.id}
                  type="button"
                  className={`comm-sms-thread-chip ${th.id === activeSmsThreadId ? "active" : ""}`}
                  onClick={() => setActiveSmsThreadId(th.id)}
                >
                  <Icon name="person" size="sm" />
                  <span>{th.name}</span>
                </button>
              ))}
            </div>

            <div className="comm-sms-view">
              <div className="comm-sms-header">
                <strong>{activeSmsThread.name}</strong>
                <small>{activeSmsThread.phone}</small>
              </div>

              <div className="comm-messages-scroll">
                {activeSmsThread.messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`comm-msg-bubble ${msg.sender === "clinic" ? "outgoing" : "incoming"}`}
                  >
                    <div className="comm-msg-meta">
                      <span>{msg.sender === "clinic" ? "Clinic" : activeSmsThread.name}</span>
                      <span>{msg.time}</span>
                    </div>
                    <div className="comm-msg-text">{msg.text}</div>
                  </div>
                ))}
              </div>

              <form className="comm-sms-composer" onSubmit={handleSendPatientSms}>
                <input
                  type="text"
                  value={smsInput}
                  onChange={(e) => setSmsInput(e.target.value)}
                  placeholder="Draft patient SMS…"
                />
                <button type="submit" className="comm-btn-primary" disabled={!smsInput.trim()}>
                  Save Draft
                </button>
              </form>
            </div>

            {handleOpenGlobalModule && (
              <button
                type="button"
                className="comm-launch-workspace-btn"
                onClick={() => handleOpenGlobalModule("patient_communication")}
              >
                <Icon name="fullscreen" size="sm" />
                <span>Open Full Patient Comms Workspace</span>
              </button>
            )}
          </div>
        )}

        {/* ── CHANNEL 4: EMAIL ───────────────────────────────────────────── */}
        {channel === "email" && (
          <div className="comm-section-container comm-email-workspace-wrap" data-comm-section="email">
            <div className="comm-notice-banner" data-email-transport="unconfigured">
              <Icon name="info" size="sm" />
              <span>Email transport unavailable: Inbound/outbound email integration is not configured. Reply saved locally as draft.</span>
            </div>

            <div className="comm-email-list">
              {emails.map((em) => (
                <button
                  key={em.id}
                  type="button"
                  className={`comm-email-row ${em.id === selectedEmailId ? "active" : ""}`}
                  onClick={() => setSelectedEmailId(em.id)}
                >
                  <div className="comm-email-from">{em.from}</div>
                  <div className="comm-email-subj">{em.subject}</div>
                  <div className="comm-email-snip">{em.snippet}</div>
                  <div className="comm-email-time">{em.time}</div>
                </button>
              ))}
            </div>

            {selectedEmail && (
              <div className="comm-email-detail">
                <div className="comm-email-detail-header">
                  <strong>{selectedEmail.subject}</strong>
                  <small>From: {selectedEmail.from}</small>
                </div>
                <div className="comm-email-body">{selectedEmail.body}</div>

                <div className="comm-email-reply">
                  <textarea
                    rows={2}
                    value={emailReplyText}
                    onChange={(e) => setEmailReplyText(e.target.value)}
                    placeholder="Compose draft reply…"
                  />
                  <button
                    type="button"
                    className="comm-btn-primary"
                    disabled={!emailReplyText.trim()}
                    onClick={() => {
                      setEmailReplyText("");
                      onNotify?.("Email reply saved locally as draft.", 3000);
                    }}
                  >
                    Save Reply Draft
                  </button>
                </div>
              </div>
            )}

            {handleOpenGlobalModule && (
              <button
                type="button"
                className="comm-launch-workspace-btn"
                onClick={() => handleOpenGlobalModule("email")}
              >
                <Icon name="fullscreen" size="sm" />
                <span>Open Full Email Workspace</span>
              </button>
            )}
          </div>
        )}

        {/* ── CHANNEL 5: FAX ─────────────────────────────────────────────── */}
        {channel === "fax" && (
          <div className="comm-section-container comm-fax-workspace-wrap" data-comm-section="fax">
            <div className="comm-notice-banner" data-fax-transport="unconfigured">
              <Icon name="info" size="sm" />
              <span>e-Fax transport unavailable: No digital fax gateway configured. Fax saved locally as draft.</span>
            </div>

            <form className="comm-fax-compose" onSubmit={handleSendFax}>
              <div className="comm-fax-inputs">
                <input
                  type="text"
                  value={faxTo}
                  onChange={(e) => setFaxTo(e.target.value)}
                  placeholder="Recipient clinic or pharmacy…"
                />
                <input
                  type="text"
                  value={faxSubject}
                  onChange={(e) => setFaxSubject(e.target.value)}
                  placeholder="Fax subject (e.g. Consult note, Prior auth)…"
                />
              </div>
              <button
                type="submit"
                className="comm-btn-primary"
                disabled={!faxTo.trim() || !faxSubject.trim()}
              >
                Save as Draft (No Gateway)
              </button>
            </form>

            <div className="comm-fax-history">
              <div className="comm-fax-heading">Recent Faxes</div>
              {recentFaxes.map((fx) => (
                <div key={fx.id} className="comm-fax-row">
                  <div>
                    <strong>{fx.to}</strong>
                    <small> · {fx.subject}</small>
                  </div>
                  <div className="comm-fax-meta">
                    <span>{fx.time}</span>
                    <span className={`comm-fax-status ${fx.status.toLowerCase()}`}>{fx.status}</span>
                  </div>
                </div>
              ))}
            </div>

            {handleOpenGlobalModule && (
              <button
                type="button"
                className="comm-launch-workspace-btn"
                onClick={() => handleOpenGlobalModule("fax")}
              >
                <Icon name="fullscreen" size="sm" />
                <span>Open Full Fax Workspace</span>
              </button>
            )}
          </div>
        )}

        {/* ── CHANNEL 6: COMMUNITY ───────────────────────────────────────── */}
        {channel === "community" && (
          <div className="comm-section-container comm-community-workspace-wrap" data-comm-section="community">
            <div className="comm-notice-banner" data-community-network="unconfigured">
              <Icon name="info" size="sm" />
              <span>Provider community in demonstration mode: Posts are saved locally and not syndicated to external networks.</span>
            </div>

            <div className="comm-community-list">
              {discussions.map((dc) => (
                <div key={dc.id} className="comm-community-card">
                  <div className="comm-community-header">
                    <strong>{dc.title}</strong>
                    <small>by {dc.author}</small>
                  </div>
                  <p>{dc.content}</p>
                  <div className="comm-community-tags">
                    {dc.tags.map((tag) => (
                      <span key={tag} className="comm-community-tag">
                        #{tag}
                      </span>
                    ))}
                    <span className="comm-community-replies">{dc.replies} replies</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="comm-community-compose">
              <textarea
                rows={2}
                value={communityReplyText}
                onChange={(e) => setCommunityReplyText(e.target.value)}
                placeholder="Share a clinical case insight or consult reply…"
              />
              <button
                type="button"
                className="comm-btn-primary"
                disabled={!communityReplyText.trim()}
                onClick={() => {
                  setCommunityReplyText("");
                  onNotify?.("Consult response saved locally.", 2500);
                }}
              >
                Post Response
              </button>
            </div>

            {handleOpenGlobalModule && (
              <button
                type="button"
                className="comm-launch-workspace-btn"
                onClick={() => handleOpenGlobalModule("community")}
              >
                <Icon name="fullscreen" size="sm" />
                <span>Open Full Community Workspace</span>
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
