"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { type Patient } from "../../domain/patient";
import {
  type PatientMessageThread,
  type PatientMessage,
  type MessageCategory,
  loadPatientThreads,
  savePatientThreads,
} from "../../domain/messages";
import { type BrowserSpeechRecognition, type SpeechRecognitionEventLike } from "../../domain/speech";

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

  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    return patientThreads[0]?.id || "";
  });

  const [categoryFilter, setCategoryFilter] = useState<"all" | MessageCategory>("all");
  const [replyText, setReplyText] = useState("");
  const [isDictating, setIsDictating] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  // Sync activeThreadId if patient changes
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

  // Voice speech recognition setup
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
      if (onToast) onToast("Voice dictation is not supported in this browser.");
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

  function handleSendReply() {
    if (!replyText.trim() || !activeThread) return;

    const newMessage: PatientMessage = {
      id: `msg-${Date.now()}`,
      threadId: activeThread.id,
      senderRole: "provider",
      senderName: "Dr. Logan Carton, MD",
      content: replyText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      channel: activeThread.messages[0]?.channel || "portal",
      status: "delivered",
    };

    const updatedThreads = patientThreads.map((t) => {
      if (t.id === activeThread.id) {
        return {
          ...t,
          unreadCount: 0,
          lastMessageAt: "Just now",
          messages: [...t.messages, newMessage],
        };
      }
      return t;
    });

    const updatedAll = { ...threadsByPatient, [patient.id]: updatedThreads };
    setThreadsByPatient(updatedAll);
    savePatientThreads(updatedAll);
    setReplyText("");

    if (onToast) {
      onToast(`Message sent to ${patient.name} via ${newMessage.channel === "sms" ? "Twilio SMS" : "Patient Portal"}!`);
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
      {/* LEFT PANE: THREAD LIST */}
      <div className="messages-sidebar">
        <div className="sidebar-top-bar">
          <div className="sidebar-heading">
            <span className="eyebrow">Communication Portal</span>
            <h3>Messages</h3>
          </div>
          <button
            type="button"
            className="btn-new-thread"
            onClick={() => {
              if (onToast) onToast("Drafting new patient message thread...");
            }}
          >
            ＋ Compose
          </button>
        </div>

        {/* Category Filters */}
        <div className="messages-filter-pills">
          <button
            type="button"
            className={`filter-pill ${categoryFilter === "all" ? "active" : ""}`}
            onClick={() => setCategoryFilter("all")}
          >
            All ({patientThreads.length})
          </button>
          <button
            type="button"
            className={`filter-pill ${categoryFilter === "refill" ? "active" : ""}`}
            onClick={() => setCategoryFilter("refill")}
          >
            💊 Refills
          </button>
          <button
            type="button"
            className={`filter-pill ${categoryFilter === "symptom-check" ? "active" : ""}`}
            onClick={() => setCategoryFilter("symptom-check")}
          >
            🩺 Symptom Checks
          </button>
          <button
            type="button"
            className={`filter-pill ${categoryFilter === "general" ? "active" : ""}`}
            onClick={() => setCategoryFilter("general")}
          >
            General
          </button>
        </div>

        {/* Thread List */}
        <div className="thread-list">
          {filteredThreads.length === 0 ? (
            <div className="no-threads-message">No messages in this category.</div>
          ) : (
            filteredThreads.map((thread) => (
              <div
                key={thread.id}
                className={`thread-item ${activeThreadId === thread.id ? "active" : ""} ${
                  thread.unreadCount > 0 ? "unread" : ""
                }`}
                onClick={() => setActiveThreadId(thread.id)}
              >
                <div className="thread-item-top">
                  <div className="thread-tags">
                    <span className={`urgency-badge ${thread.urgency}`}>
                      {thread.urgency === "high" && "High Priority"}
                      {thread.urgency === "urgent" && "⚠️ Urgent"}
                      {thread.urgency === "routine" && "Routine"}
                    </span>
                    <span className="channel-tag">
                      {thread.messages[0]?.channel === "sms" ? "SMS (Twilio)" : "Portal"}
                    </span>
                  </div>
                  <time className="thread-time">{thread.lastMessageAt}</time>
                </div>
                <strong className="thread-subject">{thread.subject}</strong>
                <p className="thread-preview">
                  {thread.messages[thread.messages.length - 1]?.content}
                </p>
                {thread.unreadCount > 0 && <span className="unread-dot" />}
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT PANE: ACTIVE CONVERSATION */}
      {activeThread ? (
        <div className="messages-main-pane">
          {/* Active Thread Header */}
          <div className="thread-header">
            <div className="thread-header-info">
              <h2>{activeThread.subject}</h2>
              <div className="thread-meta-row">
                <span>Patient: <strong>{patient.name}</strong> ({patient.mrn})</span>
                <span>·</span>
                <span>Delivery: <strong>{activeThread.messages[0]?.channel === "sms" ? "Twilio SMS (HIPAA BAA)" : "Patient Portal Direct"}</strong></span>
                <span>·</span>
                <span className={`urgency-pill ${activeThread.urgency}`}>
                  {activeThread.urgency.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Ambient AI Triage Summary Card */}
          <div className="ai-triage-card">
            <div className="triage-card-header">
              <span className="spark">✦</span>
              <strong>Ambient AI Clinical Triage &amp; Intent Detection</strong>
            </div>
            <div className="triage-body">
              <p className="triage-summary-text">{activeThread.aiTriageSummary}</p>
              <div className="triage-intent-line">
                <strong>Extracted Clinical Intent:</strong> {activeThread.clinicalIntent}
              </div>
            </div>

            {/* Actionable Suggested Action Chips */}
            {activeThread.suggestedActions.length > 0 && (
              <div className="triage-action-chips">
                {activeThread.suggestedActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="action-chip-btn"
                    onClick={() => {
                      if (action.type === "stage-refill") {
                        if (onOpenOrderCart) onOpenOrderCart("prescribe");
                        if (onToast) onToast(`Opened Prescription Composer for ${patient.name}`);
                      } else if (action.type === "create-task" && action.payload?.text) {
                        if (onAddTask) onAddTask(action.payload.text);
                        if (onToast) onToast(`Created task: "${action.payload.text}"`);
                      } else {
                        if (onToast) onToast(`Action: ${action.label}`);
                      }
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Message Bubbles Feed */}
          <div className="messages-conversation-feed">
            {activeThread.messages.map((msg) => (
              <div
                key={msg.id}
                className={`message-bubble-row ${msg.senderRole === "provider" ? "from-provider" : "from-patient"}`}
              >
                <div className="bubble-avatar">
                  {msg.senderRole === "provider" ? "LC" : patient.initials}
                </div>
                <div className="bubble-content-box">
                  <div className="bubble-sender-line">
                    <strong>{msg.senderName}</strong>
                    <time>{msg.timestamp}</time>
                  </div>
                  <p className="bubble-text">{msg.content}</p>
                  <span className="bubble-delivery-status">✓ {msg.status}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Google Workspace Smart Reply Pills */}
          {activeThread.smartReplies.length > 0 && (
            <div className="smart-replies-tray">
              <span className="smart-reply-label">✦ Suggested Quick Replies:</span>
              <div className="smart-replies-scroll">
                {activeThread.smartReplies.map((reply, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="smart-reply-pill"
                    onClick={() => handleApplySmartReply(reply)}
                  >
                    {reply}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reply Composer */}
          <div className="message-composer">
            <div className="composer-toolbar">
              <button
                type="button"
                className="btn-ai-draft"
                onClick={handleGenerateAiDraft}
                title="Generate clinically grounded draft reply with AI"
              >
                ✦ AI Draft Reply
              </button>
              <button
                type="button"
                className={`btn-mic-dictate ${isDictating ? "listening" : ""}`}
                onClick={toggleDictation}
                title="Dictate response via microphone"
              >
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
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    handleSendReply();
                  }
                }}
              />
              <button
                type="button"
                className="primary btn-send-message"
                disabled={!replyText.trim()}
                onClick={handleSendReply}
              >
                Send ➔
              </button>
            </div>
            <small className="composer-shortcut-hint">Press Ctrl+Enter to send</small>
          </div>
        </div>
      ) : (
        <div className="messages-empty-selection">
          <p>Select a message thread to view conversation.</p>
        </div>
      )}
    </div>
  );
}
