"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import CompanionPanelFrame from "./CompanionPanelFrame";
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
import { type GlobalWorkspaceModule } from "../../lib/workspace-navigation";
import type { WorkspaceCanvasContext } from "../../lib/workspace-canvas-context";
import PatientMessages from "../patient/PatientMessages";
import MessagesRecipientPanel from "./MessagesRecipientPanel";
import type { CompanionWorkingData } from "../../lib/use-companion-working-data";
import type { PatientSectionActions } from "../workspace/PatientSectionRouter";
import { useCompanionPatientSelection } from "../../lib/use-companion-patient-selection";
import { WORKSPACE_OPEN_COMMUNICATIONS_EVENT, subscribeWorkspaceEvent } from "../../lib/workspace-events";
import { useWorkspaceNavigation } from "../../lib/workspace-navigation-context";
import {
  readStoredCommunicationDrafts,
  writeStoredCommunicationDrafts,
} from "../../lib/use-communication-drafts";
import { formatDateOfBirth } from "../../domain/patient-administration";

export type CommunicationChannel =
  | "team"
  | "inbox"
  | "patient"
  | "email"
  | "fax"
  | "community";

export interface CommunicationCompanionPanelProps {
  initialChannel?: CommunicationChannel;
  workingData: CompanionWorkingData;
  actionsForPatient: (patientId: string) => PatientSectionActions;
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
  initialChannel,
  workingData,
  actionsForPatient,
  activePatient,
  workspaceContext,
  roster = [],
  onClose,
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

  const initialDrafts = useMemo(() => {
    const stored = readStoredCommunicationDrafts();
    const requestedPartner = nav.communicationsPartnerId;
    if (!requestedPartner || requestedPartner === stored.selectedPartnerId) return stored;
    // An explicit staff shortcut never carries another staff recipient's text.
    const targetDraft = stored.partnerDrafts?.[requestedPartner];
    return { ...stored, selectedPartnerId: requestedPartner, messageText: targetDraft?.messageText ?? "", messagePatientId: targetDraft?.messagePatientId ?? "", taskText: targetDraft?.taskText ?? "", taskPatientId: targetDraft?.taskPatientId ?? "", taskDueDate: targetDraft?.taskDueDate ?? "" };
  // This is the opening request, not a foreground-patient follower.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [channel, setChannel] = useState<CommunicationChannel>(
    initialChannel ?? (nav.communicationsChannel as CommunicationChannel | null) ?? initialDrafts.channel ?? (activePatient ? "patient" : "team")
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
  const [loadedPartnerId, setLoadedPartnerId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState(
    initialDrafts.messageText ?? ""
  );
  const [messagePatientId, setMessagePatientId] = useState(
    initialDrafts.messagePatientId ?? ""
  );
  const [taskText, setTaskText] = useState(
    initialDrafts.taskText ?? ""
  );
  const [taskPatientId, setTaskPatientId] = useState(
    initialDrafts.taskPatientId ?? ""
  );
  const [taskDueDate, setTaskDueDate] = useState(
    initialDrafts.taskDueDate ?? ""
  );
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamError, setTeamError] = useState("");

  const partnerDrafts = useRef(initialDrafts.partnerDrafts ?? {});
  function choosePartner(id: string) {
    if (teamBusy || id === selectedPartnerId) return;
    if (selectedPartnerId) partnerDrafts.current[selectedPartnerId] = { messageText, messagePatientId, taskText, taskPatientId, taskDueDate };
    const draft = partnerDrafts.current[id];
    setMessageText(draft?.messageText ?? "");
    setMessagePatientId(draft?.messagePatientId ?? "");
    setTaskText(draft?.taskText ?? "");
    setTaskPatientId(draft?.taskPatientId ?? "");
    setTaskDueDate(draft?.taskDueDate ?? "");
    setSelectedPartnerId(id);
  }

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

  // Patient replies and selected threads reuse the existing patient/thread-keyed stores.
  const [patientId, selectPatient] = useCompanionPatientSelection(activePatient);
  const patient = roster.find((entry) => entry.id === patientId);
  const actions = patient ? actionsForPatient(patient.id) : null;
  const [emailSubject, setEmailSubject] = useState(initialDrafts.emailSubject ?? "");
  const [faxBody, setFaxBody] = useState(initialDrafts.faxBody ?? "");
  const [emailTo, setEmailTo] = useState(initialDrafts.emailTo ?? "");
  const [emailReplyText, setEmailReplyText] = useState(initialDrafts.emailReplyText ?? "");
  const [faxTo, setFaxTo] = useState(initialDrafts.faxTo ?? "");
  const [faxSubject, setFaxSubject] = useState(initialDrafts.faxSubject ?? "");
  const [communityReplyText, setCommunityReplyText] = useState(initialDrafts.communityReplyText ?? "");

  useEffect(() => subscribeWorkspaceEvent(WORKSPACE_OPEN_COMMUNICATIONS_EVENT, (detail) => {
    if (detail.partnerId) choosePartner(detail.partnerId);
    if (["team", "inbox", "patient", "email", "fax", "community"].includes(detail.channel ?? "")) {
      setChannel(detail.channel as CommunicationChannel);
    }
  }), [selectedPartnerId, messageText, messagePatientId, taskText, taskPatientId, taskDueDate, teamBusy]);

  useEffect(() => {
    if (nav.communicationsPartnerId) nav.closeCommunications();
  }, [nav.communicationsPartnerId, nav.closeCommunications]);

  // Synchronize drafts to session storage
  useEffect(() => {
    if (selectedPartnerId) partnerDrafts.current[selectedPartnerId] = { messageText, messagePatientId, taskText, taskPatientId, taskDueDate };
    writeStoredCommunicationDrafts({
      ...initialDrafts,
      partnerDrafts: partnerDrafts.current,
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
      emailSubject,
      faxBody,
      emailTo,
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
    emailSubject, faxBody,
    emailTo,
    emailReplyText,
    faxTo,
    faxSubject,
    communityReplyText,
  ]);

  // Escape (redock, then close) is answered by the companion controller for every
  // tool, through the shared layer stack (CB-6f); a second listener here made one
  // press act twice.

  // ── Refresh Team Data ───────────────────────────────────────────────────
  async function refreshTeamSnapshot(preferredPartnerId?: string) {
    const next = await teamApi.snapshot();
    setSnapshot(next);
    setSelectedPartnerId((current) => {
      const wanted = preferredPartnerId || current;
      if (wanted) return wanted;
      return next.partners[0]?.member.id || null;
    });
  }

  const [teamRetry, setTeamRetry] = useState(0);
  useEffect(() => {
    if (channel !== "team") return;
    let cancelled = false;
    setTeamLoading(true);
    setTeamError("");
    teamApi.snapshot().then((next) => {
      if (cancelled) return;
      setSnapshot(next);
      setSelectedPartnerId((current) => current ?? next.partners[0]?.member.id ?? null);
    }).catch((err) => { if (!cancelled) setTeamError(err instanceof Error ? err.message : "Unable to load team workspace."); })
      .finally(() => { if (!cancelled) setTeamLoading(false); });
    return () => { cancelled = true; };
  }, [channel, teamRetry]);

  useEffect(() => {
    if (channel !== "team" || !selectedPartnerId) return;
    let cancelled = false;
    setLoadedPartnerId(null);
    setTeamMessages([]);
    setTeamError("");
    teamApi.conversation(selectedPartnerId)
      .then((msgs) => { if (!cancelled) { setTeamMessages(msgs); setLoadedPartnerId(selectedPartnerId); } })
      .catch((err) => { if (!cancelled) setTeamError(err instanceof Error ? err.message : "Unable to load conversation."); });
    return () => { cancelled = true; };
  }, [channel, selectedPartnerId, teamRetry]);

  // ── Refresh Inbox Data ──────────────────────────────────────────────────
  const [inboxRetry, setInboxRetry] = useState(0);
  useEffect(() => {
    if (channel !== "inbox") return;
    let cancelled = false;
    setInboxRows([]);
    setInboxLoading(true);
    setInboxError("");
    api.messages.listAll().then((rows) => {
      if (cancelled) return;
      rows.sort((a, b) => new Date(b.thread.lastMessageAt).getTime() - new Date(a.thread.lastMessageAt).getTime());
      setInboxRows(rows);
    }).catch((err) => {
      if (!cancelled) setInboxError(err instanceof Error ? err.message : "Unable to load inbox messages.");
    }).finally(() => { if (!cancelled) setInboxLoading(false); });
    return () => { cancelled = true; };
  }, [channel, inboxRetry]);

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
    if (!selectedPartner || !messageText.trim() || teamBusy || teamLoading) return;
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
      setMessagePatientId("");
      await refreshTeamSnapshot(selectedPartner.member.id);
      onNotify?.("Message sent to team member.", 2000);
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : "Unable to send team message.");
    } finally {
      setTeamBusy(false);
    }
  }

  async function handleAssignTeamTask() {
    if (!selectedPartner || !taskText.trim() || teamBusy || teamLoading) return;
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
      setTaskPatientId("");
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

  // Expansion is presentation of this owner, never a second conversation workspace.
  const channelFooter = channel === "team" && teamTab === "tasks" ? (
    <button type="button" className="comm-launch-workspace-btn" onClick={() => handleOpenGlobalModule("tasks")}>
      Open Practice Task Queue
    </button>
  ) : undefined;
  const scope = channel === "team" ? "team" : channel === "patient" || channel === "inbox" ? "patient" : "external";

  return (
    <CompanionPanelFrame
      className="communication-companion-panel"
      rootProps={{
        "data-companion-panel": "communication",
        "data-companion-presentation": isExpanded ? "expanded" : "docked",
        "data-context-tab": workspaceContext.tabId,
        "data-communication-scope": scope,
        "data-patient-record-tool": channel === "patient" ? "communication" : undefined,
        "data-bound-patient-id": channel === "patient" ? patient?.id ?? "" : "",
      }}
      ariaLabel="Communication"
      title="Communication"
      context={scope === "patient" ? patient ? `${patient.name} · ${patient.mrn} · DOB ${formatDateOfBirth(patient.dob)}` : "Patient communication · choose a recipient" : scope === "team" ? "Team · explicit staff recipient" : "External · explicit outside recipient"}
      icon="forum"
      iconStyle={{ background: "#e0f2fe", color: "#0284c7" }}
      onClose={onClose}
      isExpanded={isExpanded}
      onExpand={onExpand}
      onRedock={onRedock}
      containBody
      toolbar={
        <>
          <div className="comm-channel-bar" role="tablist" aria-label="Communication scope">
            <button type="button" role="tab" data-channel="patient" aria-selected={scope === "patient"} className={`comm-channel-tab ${scope === "patient" ? "active" : ""}`} onClick={() => setChannel("patient")}>Patient</button>
            <button type="button" role="tab" data-channel="team" aria-selected={scope === "team"} className={`comm-channel-tab ${scope === "team" ? "active" : ""}`} onClick={() => setChannel("team")}>Team</button>
            <button type="button" role="tab" data-scope="external" aria-selected={scope === "external"} className={`comm-channel-tab ${scope === "external" ? "active" : ""}`} onClick={() => setChannel("email")}>External</button>
          </div>
          {scope === "patient" && <div className="comm-channel-bar" role="tablist" aria-label="Patient communication views">
            <button type="button" role="tab" aria-selected={channel === "patient"} className="comm-channel-tab" onClick={() => setChannel("patient")}>Patient threads</button>
            <button type="button" role="tab" data-channel="inbox" aria-selected={channel === "inbox"} className="comm-channel-tab" onClick={() => setChannel("inbox")}>Practice inbox</button>
          </div>}
          {scope === "external" && <div className="comm-channel-bar" role="tablist" aria-label="External communication channels">
            {(["email", "fax", "community"] as const).map((entry) => <button key={entry} type="button" role="tab" data-channel={entry} aria-selected={channel === entry} className={`comm-channel-tab ${channel === entry ? "active" : ""}`} onClick={() => setChannel(entry)}>{entry === "email" ? "Email" : entry === "fax" ? "Fax" : "Community"}</button>)}
          </div>}
        </>
      }
      footer={channelFooter}
    >
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

            {teamError && <div className="comm-inline-error" role="alert">{teamError}<button type="button" onClick={() => setTeamRetry((value) => value + 1)}>Retry</button></div>}

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
                          disabled={teamBusy}
                          onClick={() => choosePartner(partner.member.id)}
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
                          {loadedPartnerId !== selectedPartnerId ? (
                            <div className="comm-loading-state">{teamError ? "Conversation unavailable." : "Loading conversation…"}</div>
                          ) : teamMessages.length === 0 ? (
                            <div className="comm-empty-state">No messages yet. Send a message to coordinate care.</div>
                          ) : (
                            teamMessages.map((msg) => (
                              <div
                                key={msg.id}
                                className={`comm-msg-bubble ${msg.senderId === snapshot?.actorId ? "outgoing" : "incoming"}`}
                              >
                                <div className="comm-msg-meta">
                                  <span>{msg.senderId === snapshot?.actorId ? "You" : msg.senderName}</span>
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
                            disabled={teamBusy}
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
                                disabled={teamBusy}
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
                            disabled={teamBusy}
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
                                disabled={teamBusy}
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

            {inboxError && <div className="comm-inline-error" role="alert">{inboxError}<button type="button" onClick={() => setInboxRetry((value) => value + 1)}>Retry</button></div>}

            {inboxLoading ? (
              <div className="comm-loading-state">Loading messages…</div>
            ) : inboxError ? null : filteredInboxRows.length === 0 ? (
              <div className="comm-empty-state">No messages matching current filter.</div>
            ) : (
              <div className="comm-inbox-list">
                {filteredInboxRows.map((row) => (
                  <button
                    key={row.thread.id}
                    type="button"
                    className={`comm-inbox-row ${row.thread.unreadCount > 0 ? "unread" : ""}`}
                    onClick={() => {
                      selectPatient(row.patientId);
                      workingData.messageOpenThreads.write(row.patientId, row.thread.id);
                      setChannel("patient");
                    }}
                    title={`Open communication for ${row.patientName}`}
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

          </div>
        )}

        {/* Patient scope uses the authoritative messaging surface, not a second SMS demo. */}
        <div hidden={channel !== "patient"} data-comm-section="patient" className="comm-section-container companion-messages-panel">
          <div className="comm-notice-banner" data-sms-transport="unconfigured">
            Patient messages are recorded internally. Portal/SMS delivery is not connected.
          </div>
          {initialDrafts.smsInput && <div role="note">Recovered legacy SMS draft · recipient unverified. Copy only after explicitly choosing the intended recipient.<blockquote>{initialDrafts.smsInput}</blockquote></div>}
          {patient && actions ? <>
            <label className="patient-record-picker">
              <span>Patient</span>
              <select aria-label="Choose patient for communication" value={patient.id} onChange={(event) => selectPatient(event.target.value)}>
                {roster.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.mrn}</option>)}
              </select>
            </label>
            <PatientMessages patient={patient} onOpenOrderCart={actions.onOpenOrderCart}
              onAddTask={actions.onAddTask} onToast={actions.onToast}
              replyDraftStore={workingData.messageReplyDrafts} openThreadStore={workingData.messageOpenThreads} />
          </> : <MessagesRecipientPanel canvasTabId="open-record-tool" roster={roster}
            onSelectPatient={selectPatient} replyDraftStore={workingData.messageReplyDrafts} openThreadStore={workingData.messageOpenThreads} />}
        </div>

        {scope === "external" && (
          <div className="comm-section-container" data-comm-section={channel}>
            <div className="comm-notice-banner" {...(channel === "email" ? { "data-email-transport": "unconfigured" } : channel === "fax" ? { "data-fax-transport": "unconfigured" } : { "data-community-network": "unconfigured" })}>
              External communication is not connected. These are session drafts only; nothing is sent or received.
            </div>
            <div role="group" aria-label="External communication channels">External · {channel}</div>
            {channel === "email" ? <>
              <label>Outside recipient<input aria-label="Email recipient" value={emailTo} onChange={(event) => setEmailTo(event.target.value)} /></label>
              <label>Subject<input aria-label="Email subject" value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} /></label>
              <textarea aria-label="Email draft" value={emailReplyText} onChange={(event) => setEmailReplyText(event.target.value)} placeholder="Compose email draft…" />
            </> : channel === "fax" ? <>
              <label>Outside recipient<input aria-label="Fax recipient" value={faxTo} onChange={(event) => setFaxTo(event.target.value)} /></label>
              <label>Subject<input aria-label="Fax subject" value={faxSubject} onChange={(event) => setFaxSubject(event.target.value)} /></label>
              <textarea aria-label="Fax draft" value={faxBody} onChange={(event) => setFaxBody(event.target.value)} />
            </> : <>
              <p>Community network unavailable. No conversation or recipient is connected.</p>
              <textarea aria-label="Community draft" value={communityReplyText} onChange={(event) => setCommunityReplyText(event.target.value)} />
            </>}
            <p>Draft retained in this session. Changing charts does not change the outside recipient.</p>
          </div>
        )}
      </div>
    </CompanionPanelFrame>
  );
}
