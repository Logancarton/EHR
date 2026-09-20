"use client";

import { useState } from "react";
import Icon from "../ui/Icon";
import Button from "../ui/Button";

interface SmsThread {
  id: string;
  patientName: string;
  phone: string;
  mrn: string;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
  messages: Array<{
    id: string;
    sender: "patient" | "clinic";
    text: string;
    time: string;
  }>;
}

const INITIAL_THREADS: SmsThread[] = [
  {
    id: "th-1",
    patientName: "Elena Rostova",
    phone: "(415) 309-8812",
    mrn: "MRN-84920",
    lastMessage: "Thank you Dr. Taylor, I clicked the telehealth link and will be in the waiting room at 10.",
    timestamp: "09:48 AM",
    unread: false,
    messages: [
      {
        id: "m1",
        sender: "clinic",
        text: "Hi Elena, this is Clinical Bond Psychiatry reminding you of your visit today at 10:00 AM with Dr. Taylor. Join here: https://telehealth.clinicalbond.com/v/elena",
        time: "09:00 AM",
      },
      {
        id: "m2",
        sender: "patient",
        text: "Thank you Dr. Taylor, I clicked the telehealth link and will be in the waiting room at 10.",
        time: "09:48 AM",
      },
    ],
  },
  {
    id: "th-2",
    patientName: "Jordan Reed",
    phone: "(510) 924-1185",
    mrn: "MRN-77312",
    lastMessage: "Can you confirm if my pharmacy received the updated Lamictal dose?",
    timestamp: "Yesterday",
    unread: true,
    messages: [
      {
        id: "m3",
        sender: "patient",
        text: "Can you confirm if my pharmacy received the updated Lamictal dose?",
        time: "Yesterday, 4:12 PM",
      },
    ],
  },
  {
    id: "th-3",
    patientName: "Maya Chen",
    phone: "(650) 482-9031",
    mrn: "MRN-64219",
    lastMessage: "Automated confirmation: Maya confirmed appointment for Sep 18 at 02:00 PM.",
    timestamp: "Sep 11",
    unread: false,
    messages: [
      {
        id: "m4",
        sender: "clinic",
        text: "Hi Maya, please reply YES to confirm your psychiatric medication check on Sep 18 at 2:00 PM.",
        time: "Sep 11, 11:00 AM",
      },
      {
        id: "m5",
        sender: "patient",
        text: "YES",
        time: "Sep 11, 11:04 AM",
      },
    ],
  },
  {
    id: "th-4",
    patientName: "Marcus Vance",
    phone: "(415) 781-2294",
    mrn: "MRN-55104",
    lastMessage: "I completed the blood draw at Quest this morning.",
    timestamp: "Sep 10",
    unread: false,
    messages: [
      {
        id: "m6",
        sender: "clinic",
        text: "Marcus, Dr. Taylor ordered your lithium surveillance lab. Please visit any Quest Diagnostics this week.",
        time: "Sep 09, 10:15 AM",
      },
      {
        id: "m7",
        sender: "patient",
        text: "I completed the blood draw at Quest this morning.",
        time: "Sep 10, 08:30 AM",
      },
    ],
  },
];

export default function PatientCommunicationWorkspace() {
  const [threads, setThreads] = useState<SmsThread[]>(INITIAL_THREADS);
  const [selectedThreadId, setSelectedThreadId] = useState<string>("th-1");
  const [replyText, setReplyText] = useState("");
  const [notice, setNotice] = useState<{ type: "warning" | "info" | "error"; text: string } | null>(null);

  const selectedThread = threads.find((t) => t.id === selectedThreadId);

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedThread) return;
    const newMsg = {
      id: `m-${Date.now()}`,
      sender: "clinic" as const,
      text: replyText.trim(),
      time: "Draft (Offline)",
    };
    setThreads((prev) =>
      prev.map((t) =>
        t.id === selectedThread.id
          ? {
              ...t,
              lastMessage: newMsg.text,
              timestamp: "Just now",
              messages: [...t.messages, newMsg],
            }
          : t,
      ),
    );
    setReplyText("");
    setNotice({
      type: "warning",
      text: "SMS transport unavailable: Telephony integration (Twilio / AWS SNS) is not configured. Message saved locally as draft; no SMS was sent.",
    });
  };

  const handleSendBroadcast = () => {
    setNotice({
      type: "error",
      text: "Broadcast SMS unavailable: Telephony integration is not configured. No broadcast was sent.",
    });
  };

  return (
    <div className="practice-subworkspace communication-workspace">
      <div data-sms-transport="unavailable" className="practice-banner-notice">
        <Icon name="info" />
        <span>Two-way SMS telephony gateway is unconfigured. Text messaging operates in local draft mode; external SMS delivery is unavailable.</span>
      </div>

      {notice && (
        <div className={`practice-banner-${notice.type}`}>
          <Icon name={notice.type === "warning" ? "warning" : notice.type === "error" ? "error" : "check_circle"} /> {notice.text}
        </div>
      )}

      <div className="workspace-page-header">
        <div>
          <h2>Patient Communication &amp; Two-Way SMS Portal</h2>
          <p>Direct HIPAA-compliant text messaging, automated visit reminders, broadcast announcements, and intake form links.</p>
        </div>
        <div className="header-actions">
          <Button size="sm" icon="campaign" onClick={handleSendBroadcast}>
            Send Clinic Broadcast
          </Button>
        </div>
      </div>

      <div className="comm-layout-grid">
        {/* Threads List */}
        <div className="comm-threads-card">
          <div className="comm-threads-header">
            <h3>Recent Patient Messages</h3>
            <span>{threads.filter((t) => t.unread).length} unread</span>
          </div>

          <div className="comm-threads-list">
            {threads.map((thread) => (
              <div
                key={thread.id}
                className={`comm-thread-item ${thread.id === selectedThreadId ? "selected" : ""} ${thread.unread ? "unread" : ""}`}
                onClick={() => {
                  setThreads((prev) =>
                    prev.map((t) => (t.id === thread.id ? { ...t, unread: false } : t))
                  );
                  setSelectedThreadId(thread.id);
                }}
              >
                <div className="thread-avatar">{thread.patientName[0]}</div>
                <div className="thread-content">
                  <div className="thread-top">
                    <strong>{thread.patientName}</strong>
                    <span className="thread-time">{thread.timestamp}</span>
                  </div>
                  <span className="thread-sub">{thread.phone} · {thread.mrn}</span>
                  <p className="thread-snippet">{thread.lastMessage}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Chat Box */}
        {selectedThread ? (
          <div className="comm-chat-card">
            <div className="chat-header">
              <div>
                <h3>{selectedThread.patientName}</h3>
                <span className="chat-sub">{selectedThread.phone} · {selectedThread.mrn}</span>
              </div>
              <div className="chat-actions">
                <Button size="sm" icon="videocam">
                  Launch Telehealth
                </Button>
              </div>
            </div>

            <div className="chat-bubbles-container">
              {selectedThread.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`chat-bubble-row ${msg.sender === "clinic" ? "sent-by-clinic" : "sent-by-patient"}`}
                >
                  <div className="chat-bubble">
                    <p>{msg.text}</p>
                    <span className="bubble-time">{msg.time}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="quick-template-bar">
              <span className="template-label">Quick Templates:</span>
              <button
                type="button"
                className="template-chip"
                onClick={() => setReplyText("Hi, Dr. Taylor sent the prescription to your pharmacy on file. It should be ready in 1 hour.")}
              >
                Rx Sent to Pharmacy
              </button>
              <button
                type="button"
                className="template-chip"
                onClick={() => setReplyText("Here is your telehealth room link: https://telehealth.clinicalbond.com/v/session")}
              >
                Telehealth Link
              </button>
              <button
                type="button"
                className="template-chip"
                onClick={() => setReplyText("Please confirm your scheduled medication review appointment.")}
              >
                Confirm Visit
              </button>
            </div>

            <div className="chat-input-bar">
              <textarea
                rows={2}
                placeholder={`Type secure SMS to ${selectedThread.patientName}...`}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendReply();
                  }
                }}
              />
              {!replyText.trim() ? (
                <Button size="sm" icon="save" disabled disabledReason="Type a message to draft">
                  Save as Draft
                </Button>
              ) : (
                <Button size="sm" icon="save" onClick={handleSendReply}>
                  Save as Draft (Transport Unavailable)
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="comm-empty-state">Select a conversation to reply</div>
        )}
      </div>
    </div>
  );
}
