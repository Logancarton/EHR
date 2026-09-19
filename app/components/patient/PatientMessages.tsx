"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { type Patient } from "../../domain/patient";
import {
  type PatientMessageThread,
  type MessageCategory,
} from "../../domain/messages";
import { type BrowserSpeechRecognition, type SpeechRecognitionEventLike } from "../../domain/speech";
import { api } from "../../lib/api-client";
import { chartCommunicationApi } from "../../lib/chart-communication-api";
import AsyncSection from "../ui/AsyncSection";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

export default function PatientMessages({
  patient,
  onOpenOrderCart,
  onAddTask,
  onToast,
}: {
  patient: Patient;
  onOpenOrderCart?: (tab?: "cart" | "prescribe" | "labs", prefill?: string) => void;
  onAddTask?: (text: string) => void;
  onToast?: (msg: string) => void;
}) {
  const [threadsByPatient, setThreadsByPatient] = useState<Record<string, PatientMessageThread[]>>({});
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [loadedPatientId, setLoadedPatientId] = useState<string | null>(null);
  const threadLoadRequestRef = useRef(0);

  const patientThreads = useMemo(() => {
    return threadsByPatient[patient.id] || [];
  }, [threadsByPatient, patient.id]);

  const [activeThreadId, setActiveThreadId] = useState<string>(() => patientThreads[0]?.id || "");
  const [categoryFilter, setCategoryFilter] = useState<"all" | MessageCategory>("all");
  const [replyText, setReplyText] = useState("");
  const [isDictating, setIsDictating] = useState(false);
  const [chartingKey, setChartingKey] = useState<string | null>(null);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

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
    if (loadedPatientId !== patient.id) return;
    if (patientThreads.length === 0) {
      setActiveThreadId("");
      return;
    }
    if (!patientThreads.some((thread) => thread.id === activeThreadId)) {
      setActiveThreadId(patientThreads[0].id);
    }
  }, [patientThreads, activeThreadId, loadedPatientId, patient.id]);

  const filteredThreads = useMemo(() => {
    if (categoryFilter === "all") return patientThreads;
    return patientThreads.filter((t) => t.category === categoryFilter);
  }, [patientThreads, categoryFilter]);

  const activeThread = useMemo(() => {
    return patientThreads.find((t) => t.id === activeThreadId) || patientThreads[0];
  }, [patientThreads, activeThreadId]);

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
          setReplyText((prev) => (prev ? `${prev} ${transcript}` : transcript));
          setIsDictating(false);
        };
        recog.onerror = () => setIsDictating(false);
        recog.onend = () => setIsDictating(false);
        recognitionRef.current = recog;
      }
    }
  }, []);

  function toggleDictation() {
    if (!recognitionRef.current) {
      onToast?.("Voice dictation is not supported in this browser.");
      return;
    }
    if (isDictating) {
      recognitionRef.current.stop();
      setIsDictating(false);
    } else {
      setIsDictating(true);
      recognitionRef.current.start();
    }
  }

  async function handleSendReply() {
    if (!replyText.trim() || !activeThread) return;
    const content = replyText.trim();
    try {
      await api.messages.sendReply(
        patient.id,
        activeThread.id,
        content,
        "Dr. Logan Carton, MD",
        "physician",
      );
      setReplyText("");
      const refreshed = await refreshThreads();
      onToast?.(
        refreshed
          ? `Message sent to ${patient.name} and stored in the authoritative message thread.`
          : "Message was sent, but the thread could not be refreshed. Retry the message list.",
      );
    } catch {
      onToast?.("Message was not sent. Try again.");
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

  function handleGenerateAiDraft() {
    if (!activeThread) return;
    if (activeThread.category === "refill") {
      setReplyText(
        `Hi ${patient.name.split(" ")[0]}, I have reviewed your chart and authorized your 30-day refill of Sertraline 100mg. It has been electronically submitted via Surescripts to your preferred CVS Pharmacy #1042 so you will be fully stocked for your travel. Have a wonderful and restful trip!`
      );
    } else if (activeThread.category === "symptom-check") {
      setReplyText(
        `Hi ${patient.name.split(" ")[0]}, thank you for the detailed update! These tolerability markers are very reassuring and consistent with good medication adherence. Let's continue this current regimen and we will do our comprehensive evaluation at your next visit.`
      );
    } else {
      setReplyText(
        `Hi ${patient.name.split(" ")[0]}, yes, that sounds like a great plan. Please continue with the protocol as discussed and let me know if any other questions arise before our upcoming appointment.`
      );
    }
  }

  return (
    <div className="patient-messages-container">
      <div className="messages-sidebar">
        <div className="sidebar-top-bar">
          <div className="sidebar-heading">
            <span className="eyebrow">Communication Portal</span>
            <h3>Messages</h3>
          </div>
          <Button className="btn-new-thread" size="sm" icon="add" onClick={() => onToast?.("Drafting new patient message thread...")}>
            ＋ Compose
          </Button>
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
                    <span className="channel-tag">{thread.messages[0]?.channel === "sms" ? "SMS (Twilio)" : "Portal"}</span>
                  </div>
                  <time className="thread-time">{thread.lastMessageAt}</time>
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
                <span>Patient: <strong>{patient.name}</strong> ({patient.mrn})</span>
                <span>·</span>
                <span>Delivery: <strong>{activeThread.messages[0]?.channel === "sms" ? "Twilio SMS (HIPAA BAA)" : "Patient Portal Direct"}</strong></span>
                <span>·</span>
                <span className={`urgency-pill ${activeThread.urgency}`}>{activeThread.urgency.toUpperCase()}</span>
              </div>
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
            </div>
          </div>

          <div className="ai-triage-card">
            <div className="triage-card-header">
              <span className="spark"><Icon name="auto_awesome" /></span>
              <strong>Ambient AI Clinical Triage &amp; Intent Detection</strong>
            </div>
            <div className="triage-body">
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

          <div className="messages-conversation-feed">
            {activeThread.messages.map((msg) => (
              <div key={msg.id} className={`message-bubble-row ${msg.senderRole === "provider" ? "from-provider" : "from-patient"}`}>
                <div className="bubble-avatar">{msg.senderRole === "provider" ? "LC" : patient.initials}</div>
                <div className="bubble-content-box">
                  <div className="bubble-sender-line">
                    <strong>{msg.senderName}</strong>
                    <time>{msg.timestamp}</time>
                  </div>
                  <p className="bubble-text">{msg.content}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="bubble-delivery-status"><Icon name="check" /> {msg.status}</span>
                    <Button
                      className="action-chip-btn"
                      size="sm"
                      loading={chartingKey === `message:${msg.id}`}
                      loadingLabel="Saving…"
                      onClick={() => saveSingleMessage(msg.id)}
                    >
                      Save to Chart
                    </Button>
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
                  <Button key={idx} className="smart-reply-pill" size="sm" onClick={() => handleApplySmartReply(reply)}>
                    {reply}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="message-composer">
            <div className="composer-toolbar">
              <Button className="btn-ai-draft" size="sm" onClick={handleGenerateAiDraft} title="Generate clinically grounded draft reply with AI">
                <Icon name="auto_awesome" /> AI Draft Reply
              </Button>
              <Button className="btn-mic-dictate" size="sm" pressed={isDictating} onClick={toggleDictation} title="Dictate response via microphone">
                <Icon name="mic" /> {isDictating ? "Listening..." : "Dictate"}
              </Button>
            </div>
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
              {replyText.trim() ? (
                <Button className="btn-send-message" variant="primary" icon="send" onClick={handleSendReply}>
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

      {summaryModalOpen && activeThread && (
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
        </div>
      )}
    </div>
  );
}
