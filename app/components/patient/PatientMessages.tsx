"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { type Patient } from "../../domain/patient";
import {
  type PatientMessageThread,
  type MessageCategory,
  loadPatientThreads,
  savePatientThreads,
} from "../../domain/messages";
import { type BrowserSpeechRecognition, type SpeechRecognitionEventLike } from "../../domain/speech";
import { api } from "../../lib/api-client";
import { chartCommunicationApi } from "../../lib/chart-communication-api";

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
  const [threadsByPatient, setThreadsByPatient] = useState<Record<string, PatientMessageThread[]>>(() =>
    loadPatientThreads()
  );

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

  useEffect(() => {
    let cancelled = false;
    api.messages
      .list(patient.id)
      .then((threads) => {
        if (cancelled) return;
        setThreadsByPatient((prev) => {
          const next = { ...prev, [patient.id]: threads };
          savePatientThreads(next);
          return next;
        });
      })
      .catch(() => {
        // Existing local fixture remains as an offline/development fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [patient.id]);

  useEffect(() => {
    if (patientThreads.length > 0 && !patientThreads.some((t) => t.id === activeThreadId)) {
      setActiveThreadId(patientThreads[0].id);
    }
  }, [patientThreads, activeThreadId]);

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

  async function refreshThreads() {
    const threads = await api.messages.list(patient.id);
    setThreadsByPatient((prev) => {
      const next = { ...prev, [patient.id]: threads };
      savePatientThreads(next);
      return next;
    });
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
      await refreshThreads();
      onToast?.(`Message sent to ${patient.name} and stored in the authoritative message thread.`);
    } catch (error) {
      onToast?.(`Could not send message: ${error instanceof Error ? error.message : String(error)}`);
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
          <button type="button" className="btn-new-thread" onClick={() => onToast?.("Drafting new patient message thread...")}>
            ＋ Compose
          </button>
        </div>

        <div className="messages-filter-pills">
          <button type="button" className={`filter-pill ${categoryFilter === "all" ? "active" : ""}`} onClick={() => setCategoryFilter("all")}>
            All ({patientThreads.length})
          </button>
          <button type="button" className={`filter-pill ${categoryFilter === "refill" ? "active" : ""}`} onClick={() => setCategoryFilter("refill")}>
            💊 Refills
          </button>
          <button type="button" className={`filter-pill ${categoryFilter === "symptom-check" ? "active" : ""}`} onClick={() => setCategoryFilter("symptom-check")}>
            🩺 Symptom Checks
          </button>
          <button type="button" className={`filter-pill ${categoryFilter === "general" ? "active" : ""}`} onClick={() => setCategoryFilter("general")}>
            General
          </button>
        </div>

        <div className="thread-list">
          {filteredThreads.length === 0 ? (
            <div className="no-threads-message">No messages in this category.</div>
          ) : (
            filteredThreads.map((thread) => (
              <div
                key={thread.id}
                className={`thread-item ${activeThreadId === thread.id ? "active" : ""} ${thread.unreadCount > 0 ? "unread" : ""}`}
                onClick={() => setActiveThreadId(thread.id)}
              >
                <div className="thread-item-top">
                  <div className="thread-tags">
                    <span className={`urgency-badge ${thread.urgency}`}>
                      {thread.urgency === "high" && "High Priority"}
                      {thread.urgency === "urgent" && "⚠️ Urgent"}
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
            ))
          )}
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
                <button
                  type="button"
                  className="action-chip-btn"
                  disabled={chartingKey === `conversation:${activeThread.id}`}
                  onClick={saveConversation}
                >
                  {chartingKey === `conversation:${activeThread.id}` ? "Saving…" : "📋 Save Conversation to Chart"}
                </button>
                <button type="button" className="action-chip-btn" onClick={openSummaryModal}>
                  ✦ Chart Clinical Summary
                </button>
              </div>
            </div>
          </div>

          <div className="ai-triage-card">
            <div className="triage-card-header">
              <span className="spark">✦</span>
              <strong>Ambient AI Clinical Triage &amp; Intent Detection</strong>
            </div>
            <div className="triage-body">
              <p className="triage-summary-text">{activeThread.aiTriageSummary}</p>
              <div className="triage-intent-line"><strong>Extracted Clinical Intent:</strong> {activeThread.clinicalIntent}</div>
            </div>
            {activeThread.suggestedActions.length > 0 && (
              <div className="triage-action-chips">
                {activeThread.suggestedActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="action-chip-btn"
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
                  </button>
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
                    <span className="bubble-delivery-status">✓ {msg.status}</span>
                    <button
                      type="button"
                      className="action-chip-btn"
                      style={{ padding: "3px 8px", fontSize: 11 }}
                      disabled={chartingKey === `message:${msg.id}`}
                      onClick={() => saveSingleMessage(msg.id)}
                    >
                      {chartingKey === `message:${msg.id}` ? "Saving…" : "Save to Chart"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {activeThread.smartReplies.length > 0 && (
            <div className="smart-replies-tray">
              <span className="smart-reply-label">✦ Suggested Quick Replies:</span>
              <div className="smart-replies-scroll">
                {activeThread.smartReplies.map((reply, idx) => (
                  <button key={idx} type="button" className="smart-reply-pill" onClick={() => handleApplySmartReply(reply)}>
                    {reply}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="message-composer">
            <div className="composer-toolbar">
              <button type="button" className="btn-ai-draft" onClick={handleGenerateAiDraft} title="Generate clinically grounded draft reply with AI">
                ✦ AI Draft Reply
              </button>
              <button type="button" className={`btn-mic-dictate ${isDictating ? "listening" : ""}`} onClick={toggleDictation} title="Dictate response via microphone">
                🎤 {isDictating ? "Listening..." : "Dictate"}
              </button>
            </div>
            <div className="composer-input-row">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Reply to ${patient.name}...`}
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSendReply();
                }}
              />
              <button type="button" className="primary btn-send-message" disabled={!replyText.trim()} onClick={handleSendReply}>
                Send ➔
              </button>
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
                <h3>✦ Save Clinical Communication Summary</h3>
                <p style={{ margin: "4px 0 0", fontSize: 12 }}>
                  AI triage is only a draft. Edit and approve the exact text that becomes part of the legal chart.
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setSummaryModalOpen(false)}>✕</button>
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
              <button type="button" className="modal-cancel-btn" onClick={() => setSummaryModalOpen(false)}>Cancel</button>
              <button
                type="button"
                className="modal-submit-btn"
                disabled={!summaryText.trim() || chartingKey === `summary:${activeThread.id}`}
                onClick={saveSummary}
              >
                {chartingKey === `summary:${activeThread.id}` ? "Saving…" : "Approve & Save to Chart"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
