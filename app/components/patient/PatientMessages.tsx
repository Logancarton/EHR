"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { type Patient } from "../../domain/patient";
import {
  type PatientMessageThread,
  type MessageCategory,
} from "../../domain/messages";
import { type BrowserSpeechRecognition, type SpeechRecognitionEventLike } from "../../domain/speech";
import { api, newIdempotencyKey } from "../../lib/api-client";
import { chartCommunicationApi } from "../../lib/chart-communication-api";
import AsyncSection from "../ui/AsyncSection";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import { type ScopedDraftStore, textDraft, useScopedDrafts } from "../../lib/use-scoped-drafts";
import { inFlightKey, useInFlight } from "../../lib/use-in-flight";
import { hasUnsentDraft, useWarnBeforeLeaving } from "../../lib/use-warn-before-leaving";
import {
  WORKSPACE_SELECT_MESSAGE_THREAD_EVENT,
  subscribeWorkspaceEvent,
} from "../../lib/workspace-events";
import { useDismissible } from "../../lib/use-dismissible";
import { useAuthSession } from "../auth/AuthSessionGate";
import { AttachmentDraftChips, AttachmentPicker, SentAttachmentList, type AttachmentDraft } from "./MessageAttachments";
import FormRequestDialog from "./FormRequestDialog";
import { formatClinicalDateTime } from "../../lib/clinical-date";
import { threadTimeLabel } from "../../lib/message-recency";

/**
 * Who a conversation is with: a chart, or an intake contact who has no chart yet
 * (their thread moves into the chart when they are promoted). Only what the
 * conversation shows is needed, so an intake contact is not dressed up as a
 * `Patient`.
 */
export type MessageSubject = Pick<Patient, "id" | "name" | "initials"> & { mrn?: string };

/**
 * Plain words for a message's state. No portal or SMS transport is connected, so
 * a message the practice writes is recorded in the thread and nowhere else.
 */
function messageStatusLabel(status: string, senderRole: string): string {
  if (senderRole !== "patient") return status === "read" ? "Read" : "Recorded · not delivered";
  return status === "read" ? "Read" : "Received";
}

/** The writer's initials — not a fixed "LC" for every practice member. */
function senderInitials(name: string): string {
  const words = name.replace(/,.*$/, "").split(/\s+/).filter((word) => /^[A-Za-z]/.test(word) && !/^(dr|mr|ms|mrs)\.?$/i.test(word));
  return words.slice(0, 2).map((word) => word[0]!.toUpperCase()).join("") || "?";
}

export default function PatientMessages({
  patient,
  subjectKind = "chart",
  onOpenOrderCart,
  onAddTask,
  onToast,
  replyDraftStore,
  openThreadStore,
  replyAttachmentStore,
}: {
  patient: MessageSubject;
  /** An intake contact has no chart, so chart-only actions are not offered. */
  subjectKind?: "chart" | "intake";
  onOpenOrderCart?: (tab?: "cart" | "prescribe" | "labs", prefill?: string) => void;
  onAddTask?: (text: string) => void;
  onToast?: (msg: string) => void;
  /**
   * Where reply drafts and the open thread are held. The companion passes stores
   * that outlive this panel, so a tool switch does not discard a half-written
   * reply; without them they live as long as this component (CB-6).
   */
  replyDraftStore?: ScopedDraftStore<string>;
  openThreadStore?: ScopedDraftStore<string>;
  /** Attachments chosen for a reply, held beside its text so they survive together. */
  replyAttachmentStore?: ScopedDraftStore<AttachmentDraft[]>;
}) {
  const [threadsByPatient, setThreadsByPatient] = useState<Record<string, PatientMessageThread[]>>({});
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [loadedPatientId, setLoadedPatientId] = useState<string | null>(null);
  const threadLoadRequestRef = useRef(0);

  const patientThreads = useMemo(() => {
    return threadsByPatient[patient.id] || [];
  }, [threadsByPatient, patient.id]);

  // The companion keeps this component mounted while the clinician changes charts,
  // so the open thread and the reply draft are both held per patient (CB-6c). One
  // shared reply string was sent in whichever patient's thread was in front when
  // Send was pressed, under a placeholder that had already changed name.
  const localOpenThreads = useScopedDrafts<string>();
  const localReplyDrafts = useScopedDrafts<string>();
  const { drafts: activeThreadByPatient, write: writeOpenThread } = openThreadStore ?? localOpenThreads;
  const { drafts: replyDrafts, write: writeReplyDraft } = replyDraftStore ?? localReplyDrafts;
  // The chart's Messages section holds its own drafts; the companion's owner warns
  // for the companion's (CB-6h).
  useWarnBeforeLeaving(!replyDraftStore && hasUnsentDraft(localReplyDrafts.drafts));
  const activeThreadId = activeThreadByPatient[patient.id] ?? "";
  const setActiveThreadId = useCallback(
    (threadId: string) => writeOpenThread(patient.id, textDraft(threadId)),
    [patient.id, writeOpenThread],
  );
  // A clinical assistant may read conversations but not write to patients; the
  // server refuses the send, so the controls say so rather than fail on click.
  const { hasPermission } = useAuthSession();
  const canSend = hasPermission("send_message");
  const cannotSendReason = "Your role can read these messages but not send them.";
  const [categoryFilter, setCategoryFilter] = useState<"all" | MessageCategory>("all");
  const [isDictating, setIsDictating] = useState(false);
  const [chartingKey, setChartingKey] = useState<string | null>(null);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  const pendingThreadSelectionRef = useRef<{ threadId?: string; threadSubject?: string } | null>(null);
  const [composeModalOpen, setComposeModalOpen] = useState(false);
  const [formRequestOpen, setFormRequestOpen] = useState(false);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeCategory, setComposeCategory] = useState<MessageCategory>("general");
  const [composeUrgency, setComposeUrgency] = useState<"routine" | "urgent" | "high">("routine");
  const [composeContent, setComposeContent] = useState("");
  const [composeChannel, setComposeChannel] = useState<"portal" | "sms">("portal");
  const [composeSubmitting, setComposeSubmitting] = useState(false);
  const [composeError, setComposeError] = useState("");

  useDismissible({
    active: composeModalOpen,
    onDismiss: () => setComposeModalOpen(false),
  });

  useDismissible({
    active: summaryModalOpen,
    onDismiss: () => setSummaryModalOpen(false),
  });

  const refreshThreads = useCallback(async () => {
    const requestId = ++threadLoadRequestRef.current;
    setThreadsLoading(true);
    setThreadsError(null);
    try {
      const threads = await api.messages.list(patient.id);
      if (requestId !== threadLoadRequestRef.current) return false;
      setThreadsByPatient((prev) => ({ ...prev, [patient.id]: threads }));
      setLoadedPatientId(patient.id);
      return true;
    } catch {
      if (requestId === threadLoadRequestRef.current) {
        setThreadsError("Patient messages could not be loaded. Try again.");
      }
      return false;
    } finally {
      if (requestId === threadLoadRequestRef.current) setThreadsLoading(false);
    }
  }, [patient.id]);

  useEffect(() => {
    void refreshThreads();
    return () => {
      threadLoadRequestRef.current += 1;
    };
  }, [refreshThreads]);

  useEffect(() => {
    return subscribeWorkspaceEvent(WORKSPACE_SELECT_MESSAGE_THREAD_EVENT, (detail) => {
      if (detail.patientId !== patient.id) return;
      pendingThreadSelectionRef.current = { threadId: detail.threadId, threadSubject: detail.threadSubject };
      if (detail.threadId) {
        setActiveThreadId(detail.threadId);
      } else if (detail.threadSubject) {
        const found = (threadsByPatient[patient.id] || []).find((t) => t.subject === detail.threadSubject);
        if (found) setActiveThreadId(found.id);
      }
    });
  }, [patient.id, threadsByPatient, setActiveThreadId]);

  useEffect(() => {
    if (loadedPatientId !== patient.id) return;
    if (patientThreads.length === 0) {
      setActiveThreadId("");
      return;
    }
    const pending = pendingThreadSelectionRef.current;
    if (pending) {
      const match = patientThreads.find(
        (t) =>
          (pending.threadId && t.id === pending.threadId) ||
          (pending.threadSubject && t.subject === pending.threadSubject),
      );
      if (match) {
        setActiveThreadId(match.id);
        pendingThreadSelectionRef.current = null;
        return;
      }
    }
    if (!patientThreads.some((thread) => thread.id === activeThreadId)) {
      setActiveThreadId(patientThreads[0].id);
    }
  }, [patientThreads, activeThreadId, loadedPatientId, patient.id, setActiveThreadId]);

  const filteredThreads = useMemo(() => {
    if (categoryFilter === "all") return patientThreads;
    return patientThreads.filter((t) => t.category === categoryFilter);
  }, [patientThreads, categoryFilter]);

  const activeThread = useMemo(() => {
    return patientThreads.find((t) => t.id === activeThreadId) || patientThreads[0];
  }, [patientThreads, activeThreadId]);

  // A reply belongs to one patient's one thread.
  const replyScope = `patient:${patient.id}:thread:${activeThread?.id ?? ""}`;
  const replyText = replyDrafts[replyScope] ?? "";
  const setReplyText = useCallback(
    (text: string) => writeReplyDraft(replyScope, textDraft(text)),
    [replyScope, writeReplyDraft],
  );
  // One send per reply while it is in flight: a second Send or Ctrl+Enter before the
  // server answers would deliver the same message to the patient twice (CB-6e).
  const { begin: beginSend, end: endSend, isInFlight: isSending } = useInFlight();
  const replySending = isSending(inFlightKey(replyScope, replyText));
  // Attachments belong to the reply they were chosen for: per patient and thread,
  // in a store that outlives this panel when the companion provides one.
  const localReplyAttachments = useScopedDrafts<AttachmentDraft[]>();
  const { drafts: replyAttachmentsByScope, write: writeReplyAttachments } = replyAttachmentStore ?? localReplyAttachments;
  const replyAttachments = replyAttachmentsByScope[replyScope] ?? [];
  const setReplyAttachments = (next: AttachmentDraft[]) =>
    writeReplyAttachments(replyScope, next.length > 0 ? next : undefined);
  const [composeAttachments, setComposeAttachments] = useState<AttachmentDraft[]>([]);
  const canAttach = subjectKind === "chart";
  // A conversation opens at, and follows, its newest message, as any chat does.
  // It opened at the oldest, so a reply just sent was below the fold.
  const feedRef = useRef<HTMLDivElement>(null);
  const newestMessageId = activeThread?.messages[activeThread.messages.length - 1]?.id;
  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [activeThread?.id, newestMessageId]);
  // Dictation finishes asynchronously; its words go to the draft it was started in.
  const dictationScopeRef = useRef(replyScope);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechClass) {
        const recog = new SpeechClass();
        recog.continuous = false;
        recog.interimResults = false;
        recog.lang = "en-US";
        recog.onresult = (e: SpeechRecognitionEventLike) => {
          const transcript = e.results?.[0]?.[0]?.transcript || "";
          writeReplyDraft(dictationScopeRef.current, (prev) =>
            textDraft(prev ? `${prev} ${transcript}` : transcript),
          );
          setIsDictating(false);
        };
        recog.onerror = () => setIsDictating(false);
        recog.onend = () => setIsDictating(false);
        recognitionRef.current = recog;
      }
    }
  }, [writeReplyDraft]);

  function toggleDictation() {
    if (!recognitionRef.current) {
      onToast?.("Voice dictation is not supported in this browser.");
      return;
    }
    if (isDictating) {
      recognitionRef.current.stop();
      setIsDictating(false);
    } else {
      dictationScopeRef.current = replyScope;
      setIsDictating(true);
      recognitionRef.current.start();
    }
  }

  /*
   * One Idempotency-Key per composed draft. A Retry after a lost response resends
   * the same draft with the same key, so the server answers with the message it
   * already recorded instead of recording it twice for the patient.
   */
  const draftKeys = useRef(new Map<string, string>());
  function draftKeyFor(signature: string) {
    let key = draftKeys.current.get(signature);
    if (!key) {
      key = newIdempotencyKey();
      draftKeys.current.set(signature, key);
    }
    return key;
  }

  async function handleSendReply() {
    if (!replyText.trim() || !activeThread) return;
    const content = replyText.trim();
    const sentScope = replyScope;
    const sendKey = inFlightKey(sentScope, content);
    if (!beginSend(sendKey)) return;
    const sentAttachments = replyAttachmentsByScope[sentScope] ?? [];
    const attachmentRefs = sentAttachments.map(({ kind, recordId }) => ({ kind, recordId }));
    const draftSignature = JSON.stringify([activeThread.id, sendKey, attachmentRefs]);
    try {
      await api.messages.sendReply(
        patient.id,
        activeThread.id,
        content,
        "Dr. Logan Carton, MD",
        "physician",
        attachmentRefs,
        draftKeyFor(draftSignature),
      );
      // Confirmed: a later identical message is a new message, with a new key.
      draftKeys.current.delete(draftSignature);
      writeReplyDraft(sentScope, (current) => (current?.trim() === content ? undefined : current));
      writeReplyAttachments(sentScope, undefined);
      const refreshed = await refreshThreads();
      onToast?.(
        refreshed
          ? `Message recorded in ${patient.name}'s thread. It was not delivered: no portal or SMS is connected.`
          : "Message was recorded, but the thread could not be refreshed. Retry the message list.",
      );
    } catch (error) {
      onToast?.(
        // The reason matters when the server refused an attachment; the
        // established wording stays first so the outcome reads the same.
        error instanceof Error && error.message
          ? `Message was not sent. Try again. (${error.message})`
          : "Message was not sent. Try again.",
      );
    } finally {
      endSend(sendKey);
    }
  }

  async function saveSingleMessage(messageId: string) {
    if (!activeThread) return;
    const key = `message:${messageId}`;
    setChartingKey(key);
    try {
      const saved = await chartCommunicationApi.save({
        patientId: patient.id,
        threadId: activeThread.id,
        mode: "message",
        messageId,
      });
      onToast?.(`Saved message to chart as ${saved.title}.`);
    } catch (error) {
      onToast?.(`Could not save message to chart: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setChartingKey(null);
    }
  }

  async function saveConversation() {
    if (!activeThread) return;
    const key = `conversation:${activeThread.id}`;
    setChartingKey(key);
    try {
      const saved = await chartCommunicationApi.save({
        patientId: patient.id,
        threadId: activeThread.id,
        mode: "conversation",
      });
      onToast?.(`Saved conversation snapshot to chart as ${saved.title}.`);
    } catch (error) {
      onToast?.(`Could not save conversation to chart: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setChartingKey(null);
    }
  }

  function openSummaryModal() {
    if (!activeThread) return;
    setSummaryText(activeThread.aiTriageSummary || "");
    setSummaryModalOpen(true);
  }

  async function saveSummary() {
    if (!activeThread || !summaryText.trim()) return;
    const key = `summary:${activeThread.id}`;
    setChartingKey(key);
    try {
      const saved = await chartCommunicationApi.save({
        patientId: patient.id,
        threadId: activeThread.id,
        mode: "summary",
        summaryText: summaryText.trim(),
      });
      setSummaryModalOpen(false);
      onToast?.(`Saved clinician-approved communication summary to chart as ${saved.title}.`);
    } catch (error) {
      onToast?.(`Could not save summary to chart: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setChartingKey(null);
    }
  }

  function handleApplySmartReply(reply: string) {
    setReplyText(reply);
  }

  async function handleCreateThread(e: React.FormEvent) {
    e.preventDefault();
    if (!composeSubject.trim() || !composeContent.trim()) {
      setComposeError("Subject and message content are required.");
      return;
    }
    setComposeSubmitting(true);
    setComposeError("");
    const threadDraft = {
      patientId: patient.id,
      subject: composeSubject.trim(),
      category: composeCategory,
      urgency: composeUrgency,
      content: composeContent.trim(),
      channel: composeChannel,
      attachments: composeAttachments.map(({ kind, recordId }) => ({ kind, recordId })),
    };
    const draftSignature = JSON.stringify(["thread", threadDraft]);
    try {
      const newThread = await api.messages.createThread({ ...threadDraft, idempotencyKey: draftKeyFor(draftSignature) });
      draftKeys.current.delete(draftSignature);
      await refreshThreads();
      setActiveThreadId(newThread.id);
      setComposeModalOpen(false);
      setComposeSubject("");
      setComposeContent("");
      setComposeAttachments([]);
      onToast?.(`Thread "${newThread.subject}" recorded for ${patient.name}. Not delivered: no portal or SMS is connected.`);
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : "Failed to create message thread. Try again.");
    } finally {
      setComposeSubmitting(false);
    }
  }

  return (
    <div className="patient-messages-container">
      <div className="messages-sidebar">
        <div className="sidebar-top-bar">
          <div className="sidebar-heading">
            <h3>Patient threads</h3>
          </div>
          {canSend ? (
            <div className="messages-sidebar-actions">
              {canAttach ? (
                <Button className="btn-new-thread" size="sm" icon="assignment" onClick={() => setFormRequestOpen(true)}>
                  Request forms
                </Button>
              ) : null}
              <Button className="btn-new-thread" size="sm" icon="add" onClick={() => setComposeModalOpen(true)}>
                Compose
              </Button>
            </div>
          ) : (
            <Button className="btn-new-thread" size="sm" icon="add" disabled disabledReason={cannotSendReason}>
              Compose
            </Button>
          )}
        </div>

        <div className="messages-filter-pills">
          <Button className="filter-pill" size="sm" pressed={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>
            All ({patientThreads.length})
          </Button>
          <Button className="filter-pill" size="sm" pressed={categoryFilter === "refill"} onClick={() => setCategoryFilter("refill")}>
            <Icon name="medication" /> Refills
          </Button>
          <Button className="filter-pill" size="sm" pressed={categoryFilter === "symptom-check"} onClick={() => setCategoryFilter("symptom-check")}>
            <Icon name="stethoscope" /> Symptom Checks
          </Button>
          <Button className="filter-pill" size="sm" pressed={categoryFilter === "general"} onClick={() => setCategoryFilter("general")}>
            General
          </Button>
        </div>

        <div className="thread-list">
          <AsyncSection
            loading={threadsLoading}
            error={threadsError}
            isEmpty={filteredThreads.length === 0}
            hasLoadedOnce={loadedPatientId === patient.id}
            loadingMessage="Loading patient messages…"
            emptyMessage={
              patientThreads.length === 0
                ? "No authoritative message threads are on file."
                : "No messages match this category."
            }
            onRetry={() => { void refreshThreads(); }}
          >
            {filteredThreads.map((thread) => (
              <div
                key={thread.id}
                className={`thread-item ${activeThreadId === thread.id ? "active" : ""} ${thread.unreadCount > 0 ? "unread" : ""}`}
                onClick={() => setActiveThreadId(thread.id)}
              >
                <div className="thread-item-top">
                  <div className="thread-tags">
                    <span className={`urgency-badge ${thread.urgency}`}>
                      {thread.urgency === "high" && "High Priority"}
                      {thread.urgency === "urgent" && "Urgent"}
                      {thread.urgency === "routine" && "Routine"}
                    </span>
                    <span className="channel-tag">{thread.messages[0]?.channel === "sms" ? "SMS" : "Portal"}</span>
                  </div>
                  <time className="thread-time">{threadTimeLabel(thread)}</time>
                </div>
                <strong className="thread-subject">{thread.subject}</strong>
                <p className="thread-preview">{thread.messages[thread.messages.length - 1]?.content}</p>
                {thread.unreadCount > 0 && <span className="unread-dot" />}
              </div>
            ))}
          </AsyncSection>
        </div>
      </div>

      {activeThread ? (
        <div className="messages-main-pane">
          <div className="thread-header">
            <div className="thread-header-info">
              <h2>{activeThread.subject}</h2>
              <div className="thread-meta-row">
                <span className="thread-meta-pair">
                  {subjectKind === "intake" ? "Intake contact" : "Patient"}: <strong>{patient.name}</strong>
                  {patient.mrn ? ` (${patient.mrn})` : ""}
                </span>
                <span className="thread-meta-sep" aria-hidden="true">·</span>
                {/* No transport is connected (D-107): nothing here reaches the
                    person until a portal or SMS vendor is, and it must not say so. */}
                <span className="thread-meta-pair">Delivery: <strong>Not connected — recorded in this thread only</strong></span>
                <span className="thread-meta-sep" aria-hidden="true">·</span>
                <span className={`urgency-pill ${activeThread.urgency}`}>{activeThread.urgency.toUpperCase()}</span>
              </div>
              {subjectKind === "chart" && (
              <div className="triage-action-chips" style={{ marginTop: 10 }}>
                <Button
                  className="action-chip-btn"
                  size="sm"
                  loading={chartingKey === `conversation:${activeThread.id}`}
                  loadingLabel="Saving…"
                  onClick={saveConversation}
                >
                  Save Conversation to Chart
                </Button>
                <Button className="action-chip-btn" size="sm" icon="auto_awesome" onClick={openSummaryModal}>
                  Chart Clinical Summary
                </Button>
              </div>
              )}
            </div>
          </div>

          {subjectKind === "chart" && activeThread.aiTriageSummary && (
          <div className="ai-triage-card">
            <div className="triage-card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="spark"><Icon name="auto_awesome" /></span>
                <strong>Ambient Clinical Triage &amp; Intent Detection</strong>
              </div>
              <span style={{ fontSize: 11, background: "var(--surface-muted, #f1f3f4)", padding: "2px 8px", borderRadius: 4, color: "var(--text-secondary, #5f6368)" }}>
                Sample Scenario (D-107 Prototype)
              </span>
            </div>
            <div className="triage-body">
              <p style={{ margin: "4px 0 8px", fontSize: 12, color: "var(--text-secondary, #5f6368)", fontStyle: "italic" }}>
                Pre-configured triage scenario demonstrating ambient summarization and action proposals. Live ambient model execution connects prior to production deployment (D-107).
              </p>
              <p className="triage-summary-text">{activeThread.aiTriageSummary}</p>
              <div className="triage-intent-line"><strong>Extracted Clinical Intent:</strong> {activeThread.clinicalIntent}</div>
            </div>
            {activeThread.suggestedActions.length > 0 && (
              <div className="triage-action-chips">
                {activeThread.suggestedActions.map((action) => (
                  <Button
                    key={action.id}
                    className="action-chip-btn"
                    size="sm"
                    onClick={() => {
                      if (action.type === "stage-refill") {
                        onOpenOrderCart?.("prescribe");
                        onToast?.(`Opened Prescription Composer for ${patient.name}`);
                      } else if (action.type === "create-task" && action.payload?.text) {
                        onAddTask?.(action.payload.text);
                        onToast?.(`Created task: "${action.payload.text}"`);
                      } else {
                        onToast?.(`Action: ${action.label}`);
                      }
                    }}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
          )}

          <div className="messages-conversation-feed" ref={feedRef}>
            {activeThread.messages.map((msg) => (
              <div key={msg.id} className={`message-bubble-row ${msg.senderRole === "provider" ? "from-provider" : "from-patient"}`}>
                <div className="bubble-avatar" aria-hidden="true">{msg.senderRole === "patient" ? patient.initials : senderInitials(msg.senderName)}</div>
                <div className="bubble-content-box">
                  <div className="bubble-sender-line">
                    <strong>{msg.senderName}</strong>
                    <time dateTime={msg.createdAt}>{msg.createdAt ? formatClinicalDateTime(msg.createdAt) : msg.timestamp}</time>
                  </div>
                  <p className="bubble-text">{msg.content}</p>
                  <SentAttachmentList patientId={patient.id} attachments={msg.attachments} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="bubble-delivery-status" data-message-status={msg.status}>
                      <Icon name={msg.senderRole !== "patient" && msg.status !== "read" ? "schedule_send" : "check"} />{" "}
                      {messageStatusLabel(msg.status, msg.senderRole)}
                    </span>
                    {subjectKind === "chart" && (
                      <Button
                        className="action-chip-btn"
                        size="sm"
                        loading={chartingKey === `message:${msg.id}`}
                        loadingLabel="Saving…"
                        onClick={() => saveSingleMessage(msg.id)}
                      >
                        Save to Chart
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {activeThread.smartReplies.length > 0 && (
            <div className="smart-replies-tray">
              <span className="smart-reply-label"><Icon name="auto_awesome" /> Suggested Quick Replies:</span>
              <div className="smart-replies-scroll">
                {activeThread.smartReplies.map((reply, idx) => (
                  <Button key={idx} className="smart-reply-pill" size="sm" onClick={() => handleApplySmartReply(reply)} title={reply}>
                    {reply}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="message-composer">
            <div className="composer-toolbar">
              {/* AI drafting is not connected (D-107). The button used to fill canned
                  replies that claimed a refill had been authorized and sent via
                  Surescripts, one Send away from the patient. It stays as a visible,
                  unavailable seam until a real drafting service is connected. */}
              <Button
                className="btn-ai-draft"
                size="sm"
                disabled
                disabledReason="AI drafting is not connected yet. Write the reply yourself."
              >
                <Icon name="auto_awesome" /> AI Draft Reply
              </Button>
              <Button className="btn-mic-dictate" size="sm" pressed={isDictating} onClick={toggleDictation} title="Dictate response via microphone">
                <Icon name="mic" /> {isDictating ? "Listening..." : "Dictate"}
              </Button>
              {canAttach ? (
                <AttachmentPicker
                  key={replyScope}
                  patientId={patient.id}
                  selected={replyAttachments}
                  onChange={setReplyAttachments}
                  disabled={!canSend}
                  disabledReason={cannotSendReason}
                />
              ) : null}
            </div>
            <AttachmentDraftChips
              attachments={replyAttachments}
              onRemove={(removed) =>
                setReplyAttachments(replyAttachments.filter((item) => !(item.kind === removed.kind && item.recordId === removed.recordId)))
              }
            />
            <div className="composer-input-row">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Reply to ${patient.name}...`}
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleSendReply();
                }}
              />
              {!canSend ? (
                <Button className="btn-send-message" variant="primary" icon="send" disabled disabledReason={cannotSendReason}>
                  Send
                </Button>
              ) : replyText.trim() ? (
                <Button
                  className="btn-send-message"
                  variant="primary"
                  icon="send"
                  loading={replySending}
                  loadingLabel="Sending…"
                  onClick={handleSendReply}
                >
                  Send
                </Button>
              ) : (
                <Button
                  className="btn-send-message"
                  variant="primary"
                  icon="send"
                  disabled
                  disabledReason="Write a reply before sending."
                >
                  Send
                </Button>
              )}
            </div>
            <small className="composer-shortcut-hint">Press Ctrl+Enter to send</small>
          </div>
        </div>
      ) : (
        <div className="messages-empty-selection"><p>Select a message thread to view conversation.</p></div>
      )}

      {/* Rendered at the document root: inside the companion these dialogs sat in
          the companion's stacking layer, under any practice canvas (Intake,
          Billing) drawn above it — the backdrop dimmed the page and the dialog
          itself was hidden. */}
      {summaryModalOpen && activeThread && createPortal(
        <div className="modal-backdrop" onClick={() => setSummaryModalOpen(false)}>
          <div className="walkin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3><Icon name="auto_awesome" /> Save Clinical Communication Summary</h3>
                <p style={{ margin: "4px 0 0", fontSize: 12 }}>
                  AI triage is only a draft. Edit and approve the exact text that becomes part of the legal chart.
                </p>
              </div>
              <Button className="modal-close" variant="icon" icon="close" aria-label="Close" onClick={() => setSummaryModalOpen(false)} />
            </div>
            <div className="form-group">
              <label>Clinician-approved chart summary</label>
              <textarea
                value={summaryText}
                onChange={(e) => setSummaryText(e.target.value)}
                rows={8}
                placeholder="Summarize clinically relevant communication, safety assessment, advice, and resulting plan..."
              />
            </div>
            <div className="modal-actions">
              <Button className="modal-cancel-btn" onClick={() => setSummaryModalOpen(false)}>Cancel</Button>
              {summaryText.trim() ? (
                <Button
                  className="modal-submit-btn"
                  variant="primary"
                  loading={chartingKey === `summary:${activeThread.id}`}
                  loadingLabel="Saving…"
                  onClick={saveSummary}
                >
                  Approve &amp; Save to Chart
                </Button>
              ) : (
                <Button
                  className="modal-submit-btn"
                  variant="primary"
                  disabled
                  disabledReason="There is no summary text to chart yet."
                >
                  Approve &amp; Save to Chart
                </Button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {composeModalOpen && createPortal(
        <div className="modal-backdrop" onClick={() => setComposeModalOpen(false)}>
          <div
            className="walkin-modal"
            role="dialog"
            aria-label={`New message to ${patient.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3><Icon name="mail" /> New Message Thread</h3>
                <p style={{ margin: "4px 0 0", fontSize: 12 }}>
                  To {patient.name}{patient.mrn ? ` (${patient.mrn})` : " (intake contact)"} · recorded in the thread; no portal or SMS is connected to deliver it
                </p>
                {canAttach ? (
                  <button
                    type="button"
                    className="compose-form-request-link"
                    onClick={() => {
                      setComposeModalOpen(false);
                      setFormRequestOpen(true);
                    }}
                  >
                    Need a questionnaire or consent completed? Request forms instead
                  </button>
                ) : null}
              </div>
              <Button
                className="modal-close"
                variant="icon"
                icon="close"
                aria-label="Close"
                onClick={() => setComposeModalOpen(false)}
              />
            </div>
            <form onSubmit={handleCreateThread}>
              {/* `.modal-body` is the shared dialog's padded, scrolling body; without
                  it the fields ran to the dialog's edge. */}
              <div className="modal-body">
              <div className="form-group span-2" style={{ flexDirection: "row", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="compose-category" style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Category
                  </label>
                  <select
                    id="compose-category"
                    value={composeCategory}
                    onChange={(e) => setComposeCategory(e.target.value as MessageCategory)}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid var(--border-color, #ccc)" }}
                  >
                    <option value="general">General</option>
                    <option value="refill">Refill</option>
                    <option value="symptom-check">Symptom Check</option>
                    <option value="scheduling">Scheduling</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="compose-urgency" style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Urgency
                  </label>
                  <select
                    id="compose-urgency"
                    value={composeUrgency}
                    onChange={(e) => setComposeUrgency(e.target.value as "routine" | "urgent" | "high")}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid var(--border-color, #ccc)" }}
                  >
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="compose-channel" style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Channel
                  </label>
                  <select
                    id="compose-channel"
                    value={composeChannel}
                    onChange={(e) => setComposeChannel(e.target.value as "portal" | "sms")}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid var(--border-color, #ccc)" }}
                  >
                    <option value="portal">Portal (not connected)</option>
                    <option value="sms">SMS (Draft mode)</option>
                  </select>
                </div>
              </div>

              <div className="form-group span-2">
                <label htmlFor="compose-subject" style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  Subject
                </label>
                <input
                  id="compose-subject"
                  type="text"
                  required
                  placeholder="e.g. Follow-up regarding medication titration, Lab results review"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: 4, border: "1px solid var(--border-color, #ccc)" }}
                />
              </div>

              <div className="form-group span-2">
                <label htmlFor="compose-content" style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  Message Content
                </label>
                <textarea
                  id="compose-content"
                  required
                  rows={6}
                  placeholder={`Write to ${patient.name}…`}
                  value={composeContent}
                  onChange={(e) => setComposeContent(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: 4, border: "1px solid var(--border-color, #ccc)", resize: "vertical" }}
                />
              </div>

              {canAttach ? (
                <div className="form-group span-2">
                  <AttachmentPicker patientId={patient.id} selected={composeAttachments} onChange={setComposeAttachments} />
                  <AttachmentDraftChips
                    attachments={composeAttachments}
                    onRemove={(removed) =>
                      setComposeAttachments(composeAttachments.filter((item) => !(item.kind === removed.kind && item.recordId === removed.recordId)))
                    }
                  />
                </div>
              ) : null}

              {composeError && (
                <div style={{ color: "var(--danger-color, #d32f2f)", fontSize: 12, marginBottom: 12 }}>
                  {composeError}
                </div>
              )}
              </div>

              <div className="modal-actions">
                {composeSubmitting ? (
                  <Button
                    className="modal-cancel-btn"
                    onClick={() => setComposeModalOpen(false)}
                    disabled
                    disabledReason="Message is currently sending."
                  >
                    Cancel
                  </Button>
                ) : (
                  <Button
                    className="modal-cancel-btn"
                    onClick={() => setComposeModalOpen(false)}
                  >
                    Cancel
                  </Button>
                )}
                {!composeSubject.trim() || !composeContent.trim() ? (
                  <Button
                    className="modal-submit-btn"
                    variant="primary"
                    type="submit"
                    loading={composeSubmitting}
                    loadingLabel="Sending…"
                    disabled
                    disabledReason="Subject and content are required to start a thread."
                  >
                    Send Message
                  </Button>
                ) : (
                  <Button
                    className="modal-submit-btn"
                    variant="primary"
                    type="submit"
                    loading={composeSubmitting}
                    loadingLabel="Sending…"
                  >
                    Send Message
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
      {formRequestOpen ? (
        <FormRequestDialog
          patientId={patient.id}
          patientName={patient.name}
          onClose={() => setFormRequestOpen(false)}
          onCreated={(threadId) => {
            void refreshThreads().then(() => setActiveThreadId(threadId));
          }}
          onOpenThread={(threadId) => {
            void refreshThreads().then(() => setActiveThreadId(threadId));
          }}
        />
      ) : null}
    </div>
  );
}
