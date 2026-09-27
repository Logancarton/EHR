"use client";

import { useEffect, useState } from "react";
import type {
  TeamPartner,
  TeamTaskAssignment,
  TeamWorkspaceSnapshot,
} from "../../domain/team-collaboration";
import { api } from "../../lib/api-client";
import { applyConfirmedAppointment } from "../../lib/schedule-store";
import { teamApi } from "../../lib/team-api";
import {
  WORKSPACE_OPEN_COMMUNICATIONS_EVENT,
  dispatchWorkspaceEvent,
} from "../../lib/workspace-events";
import { useWorkspaceNavigation } from "../../lib/workspace-navigation-context";
import AsyncSection from "../ui/AsyncSection";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

export type TeamDashboardWindowProps = {
  onOpenChart?: (patientId: string, targetSection?: string) => void;
  onOpenTeamDock?: () => void;
  onFilterProviderSchedule?: (providerId: string, providerName?: string) => void;
  onToast?: (message: string) => void;
  currentDate?: string;
};

const INVITE_TIME_SLOTS = [
  "08:00 AM",
  "08:30 AM",
  "09:00 AM",
  "09:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "12:00 PM",
  "12:30 PM",
  "01:00 PM",
  "01:30 PM",
  "02:00 PM",
  "02:30 PM",
  "03:00 PM",
  "03:30 PM",
  "04:00 PM",
  "04:30 PM",
  "05:00 PM",
];

export default function TeamDashboardWindow({
  onOpenChart,
  onOpenTeamDock,
  onFilterProviderSchedule,
  onToast,
  currentDate,
}: TeamDashboardWindowProps) {
  const nav = useWorkspaceNavigation();
  const [snapshot, setSnapshot] = useState<TeamWorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadIndex, setReloadIndex] = useState(0);

  // Active Member Modal State
  const [activePartner, setActivePartner] = useState<TeamPartner | null>(null);
  const [activeTab, setActiveTab] = useState<"message" | "schedule" | "invite">("message");

  // Message State
  const [quickMessage, setQuickMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageSuccess, setMessageSuccess] = useState(false);

  // Calendar Invite State
  const [inviteTitle, setInviteTitle] = useState("");
  const [inviteDate, setInviteDate] = useState(currentDate || new Date().toISOString().split("T")[0]);
  const [inviteTime, setInviteTime] = useState("01:00 PM");
  const [inviteDuration, setInviteDuration] = useState("30 min");
  const [inviteModality, setInviteModality] = useState<"video" | "in-person">("video");
  const [inviteNotes, setInviteNotes] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    teamApi
      .snapshot()
      .then((data) => {
        if (!active) return;
        setSnapshot(data);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : "Failed to load team data.");
      });

    return () => {
      active = false;
    };
  }, [reloadIndex]);

  async function handleToggleTaskStatus(task: TeamTaskAssignment) {
    const nextStatus = task.status === "open" ? "done" : "open";
    try {
      const updated = await teamApi.updateTaskStatus(
        task.id,
        nextStatus,
        task.linkedPatient?.id,
      );
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          assignedTasks: prev.assignedTasks.map((t) =>
            t.id === updated.id ? updated : t,
          ),
        };
      });
    } catch {
      // Reload on failure to reconcile with server
      setReloadIndex((c) => c + 1);
    }
  }

  function handleSelectPartner(partner: TeamPartner) {
    setActivePartner(partner);
    setActiveTab("message");
    setQuickMessage("");
    setMessageSuccess(false);
    setInviteTitle(`Meeting with ${partner.member.displayName}`);
    setInviteDate(currentDate || new Date().toISOString().split("T")[0]);
    setInviteTime("01:00 PM");
    setInviteDuration("30 min");
    setInviteModality("video");
    setInviteNotes("");
    setInviteSuccess(false);
  }

  async function handleSendQuickMessage() {
    if (!activePartner || !quickMessage.trim() || sendingMessage) return;
    setSendingMessage(true);
    try {
      await teamApi.sendMessage({
        partnerId: activePartner.member.id,
        content: quickMessage.trim(),
      });
      setMessageSuccess(true);
      setQuickMessage("");
      onToast?.(`Sent message to ${activePartner.member.displayName}`);
      setTimeout(() => {
        setMessageSuccess(false);
      }, 3000);
    } catch {
      onToast?.("Unable to send message.");
    } finally {
      setSendingMessage(false);
    }
  }

  function handleOpenInTeamChat() {
    if (!activePartner) return;
    dispatchWorkspaceEvent(WORKSPACE_OPEN_COMMUNICATIONS_EVENT, {
      channel: "team",
      partnerId: activePartner.member.id,
    });
    setActivePartner(null);
  }

  function handleFilterProviderSchedule() {
    if (!activePartner) return;
    onFilterProviderSchedule?.(activePartner.member.id, activePartner.member.displayName);
    onToast?.(`Filtered schedule for ${activePartner.member.displayName}`);
    setActivePartner(null);
  }

  function handleOpenCalendarWorkspace() {
    nav.openGlobalModule("calendar");
    setActivePartner(null);
  }

  async function handleSendCalendarInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!activePartner || sendingInvite) return;
    setSendingInvite(true);
    try {
      const title = inviteTitle.trim() || `Meeting with ${activePartner.member.displayName}`;
      const saved = await api.appointments.create({
        patientId: `event-meeting-${Date.now()}`,
        patientName: title,
        date: inviteDate,
        time: inviteTime,
        duration: inviteDuration,
        type: "Team Meeting",
        modality: inviteModality,
        room: inviteModality === "in-person" ? "Conference Room A" : "Virtual Video Conference",
        chiefComplaint: `Team meeting with ${activePartner.member.displayName}: ${inviteNotes.trim() || title}`,
        insurance: "Practice Event",
        dob: "N/A",
        mrn: "MEETING",
        age: 0,
        providerId: activePartner.member.id,
        providerName: activePartner.member.displayName,
      });
      applyConfirmedAppointment(saved);
      setInviteSuccess(true);
      onToast?.(`Calendar invite sent to ${activePartner.member.displayName} for ${saved.date} at ${saved.time}`);
      setTimeout(() => {
        setActivePartner(null);
        setInviteSuccess(false);
      }, 1500);
    } catch {
      onToast?.("Unable to schedule calendar invite.");
    } finally {
      setSendingInvite(false);
    }
  }

  const partners = snapshot?.partners || [];
  const assignedTasks = snapshot?.assignedTasks || [];
  const openTasks = assignedTasks.filter((t) => t.status === "open");

  return (
    <div className="team-window-content">
      <AsyncSection
        loading={loading}
        error={error}
        isEmpty={partners.length === 0 && assignedTasks.length === 0}
        hasLoadedOnce={snapshot !== null}
        loadingMessage="Loading team presence and tasks…"
        emptyMessage="No team members or active tasks found."
        onRetry={() => setReloadIndex((c) => c + 1)}
      >
        {/* Team Members Strip */}
        <div className="team-window-section">
          <div className="team-window-subhead">
            <span className="eyebrow">Practice Team</span>
            <small>{partners.length} members</small>
          </div>
          <div className="team-members-grid">
            {partners.map((partner) => (
              <button
                key={partner.member.id}
                type="button"
                className={`team-member-card interactive ${activePartner?.member.id === partner.member.id ? "is-active" : ""}`}
                onClick={() => handleSelectPartner(partner)}
                aria-haspopup="dialog"
                aria-label={`Collaborate with ${partner.member.displayName}`}
                title={`Click to message, view schedule, or send calendar invite to ${partner.member.displayName}`}
              >
                <div className="team-member-avatar-box">
                  <span className="team-member-avatar">{partner.member.initials}</span>
                  <span
                    className={`team-presence-dot presence-${partner.member.presence}`}
                    title={partner.member.presence}
                  />
                </div>
                <div className="team-member-info">
                  <strong>{partner.member.displayName}</strong>
                  <span className="team-member-role">
                    {partner.member.credentials || partner.member.role}
                  </span>
                </div>
                {partner.sharedPatients.length > 0 && (
                  <span className="team-shared-chip" title="Shared patients">
                    {partner.sharedPatients.length} shared
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Active Handoff Tasks */}
        <div className="team-window-section">
          <div className="team-window-subhead">
            <span className="eyebrow">Handoff Tasks</span>
            <small>{openTasks.length} pending</small>
          </div>
          {assignedTasks.length === 0 ? (
            <p className="team-empty-hint">No active handoff tasks assigned to you.</p>
          ) : (
            <div className="team-tasks-list">
              {assignedTasks.map((task) => (
                <div
                  key={task.id}
                  className={`team-task-item ${task.status === "done" ? "is-done" : ""}`}
                >
                  <button
                    type="button"
                    className="team-task-check-btn"
                    aria-label={`Mark task "${task.text}" as ${task.status === "open" ? "done" : "open"}`}
                    onClick={() => handleToggleTaskStatus(task)}
                  >
                    <Icon
                      name={task.status === "done" ? "check_circle" : "radio_button_unchecked"}
                      size="sm"
                    />
                  </button>
                  <div className="team-task-content">
                    <span className="team-task-text">{task.text}</span>
                    <div className="team-task-meta">
                      <span>From {task.assignerName}</span>
                      {task.linkedPatient && (
                        <button
                          type="button"
                          className="team-patient-link"
                          onClick={() =>
                            onOpenChart?.(task.linkedPatient!.id, "Encounter")
                          }
                        >
                          <Icon name="person" size="sm" />
                          {task.linkedPatient.name}
                        </button>
                      )}
                      {task.dueDate && <span className="team-task-due">Due {task.dueDate}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Launch Dock */}
        <div className="team-window-actions">
          <Button
            size="sm"
            variant="secondary"
            icon="forum"
            onClick={() => {
              if (onOpenTeamDock) {
                onOpenTeamDock();
              } else {
                nav.openCommunications();
              }
            }}
          >
            Open Team Collaboration Dock
          </Button>
        </div>
      </AsyncSection>

      {/* Team Member Collaboration Modal */}
      {activePartner && (
        <div className="team-partner-modal-backdrop" onClick={() => setActivePartner(null)}>
          <div
            className="team-partner-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="partner-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="team-partner-modal-header">
              <div className="team-partner-modal-identity">
                <div className="team-member-avatar-box">
                  <span className="team-member-avatar">{activePartner.member.initials}</span>
                  <span
                    className={`team-presence-dot presence-${activePartner.member.presence}`}
                    title={activePartner.member.presence}
                  />
                </div>
                <div>
                  <h3 id="partner-modal-title">{activePartner.member.displayName}</h3>
                  <p className="team-partner-meta">
                    <span>{activePartner.member.credentials || activePartner.member.role}</span>
                    <span className="meta-sep">•</span>
                    <span className={`presence-text presence-${activePartner.member.presence}`}>
                      {activePartner.member.presence === "online"
                        ? "Active Now"
                        : activePartner.member.presence === "away"
                          ? "Away"
                          : "Offline"}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={() => setActivePartner(null)}
              >
                <Icon name="close" />
              </button>
            </div>

            {/* Action Tabs */}
            <div className="team-action-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "message"}
                className={`team-action-tab ${activeTab === "message" ? "is-active" : ""}`}
                onClick={() => setActiveTab("message")}
              >
                <Icon name="chat" size="sm" />
                <span>Send Message</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "schedule"}
                className={`team-action-tab ${activeTab === "schedule" ? "is-active" : ""}`}
                onClick={() => setActiveTab("schedule")}
              >
                <Icon name="calendar_today" size="sm" />
                <span>See Schedule</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "invite"}
                className={`team-action-tab ${activeTab === "invite" ? "is-active" : ""}`}
                onClick={() => setActiveTab("invite")}
              >
                <Icon name="event" size="sm" />
                <span>Send Calendar Invite</span>
              </button>
            </div>

            <div className="team-partner-modal-body">
              {/* TAB 1: SEND MESSAGE */}
              {activeTab === "message" && (
                <div className="team-tab-panel">
                  <label htmlFor="team-quick-message">
                    Message to {activePartner.member.displayName}
                  </label>
                  <textarea
                    id="team-quick-message"
                    rows={3}
                    placeholder={`Write a direct message to ${activePartner.member.displayName}…`}
                    value={quickMessage}
                    onChange={(e) => setQuickMessage(e.target.value)}
                    autoFocus
                  />
                  {messageSuccess && (
                    <div className="team-action-success">
                      <Icon name="check_circle" size="sm" />
                      <span>Message sent to {activePartner.member.displayName}!</span>
                    </div>
                  )}
                  <div className="team-panel-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon="forum"
                      onClick={handleOpenInTeamChat}
                    >
                      Open in Team Chat
                    </Button>
                    {!quickMessage.trim() || sendingMessage ? (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        icon="send"
                        disabled
                        disabledReason={sendingMessage ? "Sending message…" : "Enter a message before sending"}
                        loading={sendingMessage}
                        loadingLabel="Sending…"
                      >
                        Send Message
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        icon="send"
                        onClick={handleSendQuickMessage}
                      >
                        Send Message
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: SEE SCHEDULE */}
              {activeTab === "schedule" && (
                <div className="team-tab-panel">
                  <div className="team-schedule-summary">
                    <p>
                      View today&apos;s schedule and active visits for{" "}
                      <strong>{activePartner.member.displayName}</strong>.
                    </p>
                  </div>
                  <div className="team-panel-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon="event_note"
                      onClick={handleOpenCalendarWorkspace}
                    >
                      Open Calendar Workspace
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      icon="filter_list"
                      onClick={handleFilterProviderSchedule}
                    >
                      Filter Today&apos;s Schedule
                    </Button>
                  </div>
                </div>
              )}

              {/* TAB 3: SEND CALENDAR INVITE */}
              {activeTab === "invite" && (
                <form className="team-tab-panel" onSubmit={handleSendCalendarInvite}>
                  <div className="team-invite-grid">
                    <div className="form-group span-2">
                      <label htmlFor="invite-title">Meeting Title *</label>
                      <input
                        id="invite-title"
                        type="text"
                        value={inviteTitle}
                        onChange={(e) => setInviteTitle(e.target.value)}
                        placeholder={`e.g. Clinical Case Discussion with ${activePartner.member.displayName}`}
                        required
                        autoFocus
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="invite-date">Date *</label>
                      <input
                        id="invite-date"
                        type="date"
                        value={inviteDate}
                        onChange={(e) => setInviteDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="invite-time">Time *</label>
                      <select
                        id="invite-time"
                        value={inviteTime}
                        onChange={(e) => setInviteTime(e.target.value)}
                      >
                        {INVITE_TIME_SLOTS.map((slot) => (
                          <option key={slot} value={slot}>
                            {slot}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="invite-duration">Duration</label>
                      <select
                        id="invite-duration"
                        value={inviteDuration}
                        onChange={(e) => setInviteDuration(e.target.value)}
                      >
                        <option value="15 min">15 min</option>
                        <option value="30 min">30 min</option>
                        <option value="45 min">45 min</option>
                        <option value="60 min">60 min</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="invite-modality">Location / Modality</label>
                      <select
                        id="invite-modality"
                        value={inviteModality}
                        onChange={(e) =>
                          setInviteModality(e.target.value as "video" | "in-person")
                        }
                      >
                        <option value="video">Virtual Video Conference</option>
                        <option value="in-person">Conference Room A</option>
                      </select>
                    </div>
                    <div className="form-group span-2">
                      <label htmlFor="invite-notes">Notes / Agenda</label>
                      <input
                        id="invite-notes"
                        type="text"
                        placeholder="Optional discussion agenda or case details"
                        value={inviteNotes}
                        onChange={(e) => setInviteNotes(e.target.value)}
                      />
                    </div>
                  </div>

                  {inviteSuccess && (
                    <div className="team-action-success">
                      <Icon name="check_circle" size="sm" />
                      <span>
                        Calendar invite sent to {activePartner.member.displayName}!
                      </span>
                    </div>
                  )}

                  <div className="team-panel-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setActivePartner(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      icon="send"
                      loading={sendingInvite}
                      loadingLabel="Sending Invite…"
                    >
                      Send Calendar Invite
                    </Button>
                  </div>
                </form>
              )}

              {/* Shared patients if any */}
              {activePartner.sharedPatients.length > 0 && (
                <div className="team-shared-patients-section">
                  <span className="eyebrow">
                    Shared Patients ({activePartner.sharedPatients.length})
                  </span>
                  <div className="team-shared-tags">
                    {activePartner.sharedPatients.map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        className="team-shared-patient-btn"
                        onClick={() => {
                          setActivePartner(null);
                          onOpenChart?.(sp.id, "Overview");
                        }}
                        title={`Open ${sp.name}'s chart`}
                      >
                        <Icon name="person" size="sm" />
                        <span>{sp.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
