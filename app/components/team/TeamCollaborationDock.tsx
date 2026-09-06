"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  TeamMessage,
  TeamPartner,
  TeamTaskAssignment,
  TeamWorkspaceSnapshot,
} from "../../domain/team-collaboration";
import { teamApi } from "../../lib/team-api";
import styles from "./TeamCollaborationDock.module.css";

function timeLabel(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function TeamCollaborationDock() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "tasks">("chat");
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

  const selectedPartner = useMemo(
    () => snapshot?.partners.find((partner) => partner.member.id === selectedPartnerId) || null,
    [snapshot, selectedPartnerId],
  );

  const unreadTotal = useMemo(
    () => snapshot?.partners.reduce((sum, partner) => sum + partner.unreadCount, 0) || 0,
    [snapshot],
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
    if (!open || snapshot) return;
    setLoading(true);
    setError("");
    refreshSnapshot()
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load team workspace."))
      .finally(() => setLoading(false));
  }, [open, snapshot]);

  useEffect(() => {
    if (!open || !selectedPartnerId) return;
    setError("");
    teamApi
      .conversation(selectedPartnerId)
      .then((next) => {
        setMessages(next);
        setSnapshot((current) =>
          current
            ? {
                ...current,
                partners: current.partners.map((partner) =>
                  partner.member.id === selectedPartnerId ? { ...partner, unreadCount: 0 } : partner,
                ),
              }
            : current,
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load conversation."));
  }, [open, selectedPartnerId]);

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
      setMessages((current) => [...current, message]);
      setMessageText("");
      setMessagePatientId("");
      await refreshSnapshot(selectedPartner.member.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send team message.");
    } finally {
      setBusy(false);
    }
  }

  async function requestAgreement() {
    if (!selectedPartner || busy) return;
    setBusy(true);
    setError("");
    try {
      await teamApi.requestAgreement(selectedPartner.member.id);
      await refreshSnapshot(selectedPartner.member.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request task sharing.");
    } finally {
      setBusy(false);
    }
  }

  async function updateAgreement(action: "accept" | "revoke") {
    if (!selectedPartner || busy) return;
    setBusy(true);
    setError("");
    try {
      await teamApi.updateAgreement(selectedPartner.member.id, action);
      await refreshSnapshot(selectedPartner.member.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update task sharing.");
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
    window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "patients" } }));
    window.dispatchEvent(new CustomEvent("ehr-linked-patient", { detail: { patientId } }));
  }

  return (
    <>
      <button type="button" className={styles.launcher} onClick={() => setOpen((value) => !value)}>
        <span>👥</span>
        Team
        {unreadTotal > 0 && <span className={styles.launcherBadge}>{unreadTotal}</span>}
      </button>

      {open && (
        <aside className={styles.panel} aria-label="Internal team collaboration">
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <span className={styles.headerIcon}>👥</span>
              <div>
                <strong>Team</strong>
                <small>Internal collaboration · patient links stay permission-aware</small>
              </div>
            </div>
            <button type="button" className={styles.closeButton} onClick={() => setOpen(false)} aria-label="Close team panel">
              ×
            </button>
          </div>

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
                    <span className={styles.patientCount}>
                      {selectedPartner.sharedPatients.length} mutual patient{selectedPartner.sharedPatients.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {tab === "chat" ? (
                    <>
                      <div className={styles.body}>
                        <div className={styles.messageList}>
                          {messages.length === 0 && <div className={styles.empty}>No internal messages yet.</div>}
                          {messages.map((message) => (
                            <div
                              key={message.id}
                              className={`${styles.message} ${message.senderId === snapshot?.actorId ? styles.messageMine : ""}`}
                            >
                              <div className={styles.messageMeta}>
                                <strong>{message.senderId === snapshot?.actorId ? "You" : message.senderName}</strong>
                                <small>{timeLabel(message.createdAt)}</small>
                              </div>
                              <div>{message.content}</div>
                              {message.linkedPatient && (
                                <button
                                  type="button"
                                  className={styles.patientChip}
                                  onClick={() => surfacePatient(message.linkedPatient!.id)}
                                  title="Open patient workspace"
                                >
                                  ◉ {message.linkedPatient.name} · {message.linkedPatient.mrn}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className={styles.composer}>
                        <textarea
                          className={styles.textarea}
                          value={messageText}
                          onChange={(event) => setMessageText(event.target.value)}
                          placeholder={`Message ${selectedPartner.member.displayName}…`}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              void sendMessage();
                            }
                          }}
                        />
                        <div className={styles.metaControls}>
                          <select
                            className={styles.select}
                            value={messagePatientId}
                            onChange={(event) => setMessagePatientId(event.target.value)}
                          >
                            <option value="">No patient link</option>
                            {selectedPartner.sharedPatients.map((patient) => (
                              <option key={patient.id} value={patient.id}>
                                Link {patient.name}
                              </option>
                            ))}
                          </select>
                          <button type="button" className={styles.sendButton} onClick={() => void sendMessage()} disabled={busy || !messageText.trim()}>
                            Send
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <TaskWorkspace
                      actorId={snapshot?.actorId || ""}
                      partner={selectedPartner}
                      tasks={partnerTasks}
                      taskText={taskText}
                      setTaskText={setTaskText}
                      taskPatientId={taskPatientId}
                      setTaskPatientId={setTaskPatientId}
                      taskDueDate={taskDueDate}
                      setTaskDueDate={setTaskDueDate}
                      busy={busy}
                      onRequestAgreement={() => void requestAgreement()}
                      onAcceptAgreement={() => void updateAgreement("accept")}
                      onRevokeAgreement={() => void updateAgreement("revoke")}
                      onAssignTask={() => void assignTask()}
                      onUpdateTask={updateTask}
                      onOpenPatient={surfacePatient}
                    />
                  )}
                </>
              ) : (
                <div className={styles.empty}>No other active team members yet.</div>
              )}
            </>
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
  onSelect: (id: string) => void;
}) {
  return (
    <div className={styles.partnerStrip}>
      {snapshot?.partners.map((partner) => (
        <button
          key={partner.member.id}
          type="button"
          className={styles.partnerButton}
          onClick={() => onSelect(partner.member.id)}
          title={partner.member.displayName}
        >
          <span className={`${styles.avatar} ${selectedPartnerId === partner.member.id ? styles.avatarActive : ""}`}>
            {partner.member.initials}
          </span>
          <span
            className={`${styles.presence} ${partner.member.presence === "online" ? styles.online : partner.member.presence === "away" ? styles.away : ""}`}
          />
          {partner.unreadCount > 0 && <span className={styles.unread}>{partner.unreadCount}</span>}
          <span className={styles.partnerName}>{partner.member.displayName.split(" ")[0]}</span>
        </button>
      ))}
    </div>
  );
}

function TaskWorkspace({
  actorId,
  partner,
  tasks,
  taskText,
  setTaskText,
  taskPatientId,
  setTaskPatientId,
  taskDueDate,
  setTaskDueDate,
  busy,
  onRequestAgreement,
  onAcceptAgreement,
  onRevokeAgreement,
  onAssignTask,
  onUpdateTask,
  onOpenPatient,
}: {
  actorId: string;
  partner: TeamPartner;
  tasks: TeamTaskAssignment[];
  taskText: string;
  setTaskText: (value: string) => void;
  taskPatientId: string;
  setTaskPatientId: (value: string) => void;
  taskDueDate: string;
  setTaskDueDate: (value: string) => void;
  busy: boolean;
  onRequestAgreement: () => void;
  onAcceptAgreement: () => void;
  onRevokeAgreement: () => void;
  onAssignTask: () => void;
  onUpdateTask: (task: TeamTaskAssignment, status: "done" | "cancelled") => void;
  onOpenPatient: (patientId: string) => void;
}) {
  const agreement = partner.taskAgreement;
  const active = agreement?.status === "active";
  const incomingPending = agreement?.status === "pending" && agreement.requestedBy !== actorId;
  const outgoingPending = agreement?.status === "pending" && agreement.requestedBy === actorId;

  return (
    <div className={styles.body}>
      <div className={styles.agreementCard}>
        <div className={styles.agreementHeader}>
          <strong>Task sharing</strong>
          <span className={styles.statusPill}>{agreement?.status || "not enabled"}</span>
        </div>
        {active ? (
          <>
            <div className={styles.muted}>Both of you agreed to assign tasks to each other. Either person can revoke this permission.</div>
            <div className={styles.taskActions}>
              <button type="button" className={styles.dangerButton} onClick={onRevokeAgreement} disabled={busy}>
                Revoke agreement
              </button>
            </div>
          </>
        ) : incomingPending ? (
          <>
            <div className={styles.muted}>{partner.member.displayName} requested mutual task sharing. Accepting enables assignments in both directions.</div>
            <div className={styles.taskActions}>
              <button type="button" className={styles.primaryButton} onClick={onAcceptAgreement} disabled={busy}>
                Accept task sharing
              </button>
            </div>
          </>
        ) : outgoingPending ? (
          <div className={styles.muted}>Waiting for {partner.member.displayName} to accept your task-sharing request.</div>
        ) : (
          <>
            <div className={styles.muted}>Assignments are blocked until both team members agree.</div>
            <div className={styles.taskActions}>
              <button type="button" className={styles.secondaryButton} onClick={onRequestAgreement} disabled={busy}>
                Request task sharing
              </button>
            </div>
          </>
        )}
      </div>

      {active && (
        <div className={styles.taskComposer}>
          <textarea
            className={styles.textarea}
            value={taskText}
            onChange={(event) => setTaskText(event.target.value)}
            placeholder={`Assign a task to ${partner.member.displayName}…`}
          />
          <div className={styles.metaControls}>
            <select className={styles.select} value={taskPatientId} onChange={(event) => setTaskPatientId(event.target.value)}>
              <option value="">No patient link</option>
              {partner.sharedPatients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name}
                </option>
              ))}
            </select>
            <input className={styles.input} type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} />
          </div>
          <div className={styles.taskActions}>
            <button type="button" className={styles.primaryButton} onClick={onAssignTask} disabled={busy || !taskText.trim()}>
              Assign task
            </button>
          </div>
        </div>
      )}

      <div className={styles.taskList}>
        {tasks.length === 0 && <div className={styles.empty}>No shared tasks between you yet.</div>}
        {tasks.map((task) => (
          <div key={task.id} className={styles.taskItem}>
            <div className={styles.taskTop}>
              <div>
                <strong>{task.text}</strong>
                <small>
                  {task.assignerId === actorId ? `You → ${task.assigneeName}` : `${task.assignerName} → You`}
                  {task.dueDate ? ` · Due ${task.dueDate}` : ""}
                </small>
              </div>
              <span className={styles.statusPill}>{task.status}</span>
            </div>
            {task.linkedPatient && (
              <button type="button" className={styles.patientChip} onClick={() => onOpenPatient(task.linkedPatient!.id)}>
                ◉ {task.linkedPatient.name} · {task.linkedPatient.mrn}
              </button>
            )}
            {task.status === "open" && (
              <div className={styles.taskActions}>
                {task.assigneeId === actorId && (
                  <button type="button" className={styles.primaryButton} onClick={() => onUpdateTask(task, "done")} disabled={busy}>
                    Mark done
                  </button>
                )}
                {task.assignerId === actorId && (
                  <button type="button" className={styles.dangerButton} onClick={() => onUpdateTask(task, "cancelled")} disabled={busy}>
                    Cancel
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
