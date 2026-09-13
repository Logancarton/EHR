"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import Icon from "../ui/Icon";
import Button from "../ui/Button";

export type HomeShortcutId =
  | "ehr"
  | "billing"
  | "website"
  | "social_media"
  | "email"
  | "hr"
  | "patient_communication"
  | "financial_integration";

interface ZenHomeWindowProps {
  onNavigateShortcut: (shortcut: HomeShortcutId) => void;
  onOpenPatientChart?: (patientId: string) => void;
}

interface AiChatInteraction {
  query: string;
  response: string;
  actionLabel?: string;
  actionType?: "ehr" | "patient" | "billing" | "labs";
  patientId?: string;
}

const SHORTCUTS: Array<{ id: HomeShortcutId; label: string; icon: string }> = [
  { id: "ehr", label: "EHR", icon: "medical_services" },
  { id: "billing", label: "Billing", icon: "payments" },
  { id: "website", label: "Website", icon: "language" },
  { id: "social_media", label: "Social Media", icon: "campaign" },
  { id: "email", label: "Email", icon: "mail" },
  { id: "hr", label: "HR", icon: "badge" },
  { id: "patient_communication", label: "Patient communication", icon: "forum" },
  { id: "financial_integration", label: "Financial integration", icon: "account_balance" },
];

const SUGGESTION_CHIPS = [
  { label: "📅 Who is my next patient?", query: "Who is my next patient?" },
  { label: "⚠️ Any abnormal labs?", query: "Any abnormal lab results?" },
  { label: "💊 Check refill queue", query: "Check medication refill requests" },
  { label: "💵 Today's billing total", query: "What is today's billing total?" },
  { label: "📝 Summarize yesterday's visits", query: "Summarize yesterday's visits" },
];

export default function ZenHomeWindow({
  onNavigateShortcut,
  onOpenPatientChart,
}: ZenHomeWindowProps) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [chatHistory, setChatHistory] = useState<AiChatInteraction | null>(null);
  const [wallpaperUrl, setWallpaperUrl] = useState<string>("/wallpapers/zen-reef.jpg");
  const [wallpaperPickerOpen, setWallpaperPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hydrate custom wallpaper from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ehr_zen_home_wallpaper");
      if (saved) setWallpaperUrl(saved);
    } catch {}
  }, []);

  const handleSetWallpaper = (url: string) => {
    setWallpaperUrl(url);
    setWallpaperPickerOpen(false);
    try {
      if (url) localStorage.setItem("ehr_zen_home_wallpaper", url);
      else localStorage.removeItem("ehr_zen_home_wallpaper");
    } catch {}
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const result = loadEvent.target?.result;
      if (typeof result === "string") {
        handleSetWallpaper(result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle AI queries
  const handleQuerySubmit = (e?: FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    const lower = trimmed.toLowerCase();
    let responseText = "";
    let actionLabel: string | undefined;
    let actionType: AiChatInteraction["actionType"] | undefined;
    let patientId: string | undefined;

    if (lower.includes("next") || lower.includes("elena") || lower.includes("who is")) {
      responseText =
        "Your next appointment is Elena Rostova (38y, F33.1 MDD) at 10:00 AM for a 30-min Medication Follow-up. Her vital signs are stable, PHQ-9 is 14 (moderate), and Escitalopram 10mg was started 4 weeks ago.";
      actionLabel = "Open Elena's Chart";
      actionType = "patient";
      patientId = "elena-rostova";
    } else if (lower.includes("lab") || lower.includes("abnormal") || lower.includes("result")) {
      responseText =
        "Marcus Vance's Serum Lithium drawn on 09/11 returned 0.9 mEq/L (therapeutic range: 0.6–1.2 mEq/L). Jordan Reed is due for baseline CBC & hepatic enzymes next week for Lamotrigine surveillance.";
      actionLabel = "View Clinical Labs";
      actionType = "labs";
    } else if (lower.includes("refill") || lower.includes("med") || lower.includes("sertraline")) {
      responseText =
        "Maya Chen requested a 30-day refill of Sertraline 50mg with 2 refills. Last visit was on 08/14 with GAD-7 improving from 16 to 9. Safety surveillance protocols are satisfied.";
      actionLabel = "Review in Order Cart";
      actionType = "patient";
      patientId = "maya-chen";
    } else if (lower.includes("billing") || lower.includes("claim") || lower.includes("dollar") || lower.includes("money")) {
      responseText =
        "Current billing status: 1 claim ($285.00) is ready to batch for Elena Rostova. 1 claim ($210.00) for Marcus Vance has a prior-auth clarification. Total month-to-date settled revenue is $42,850.00.";
      actionLabel = "Open Billing Hub";
      actionType = "billing";
    } else if (lower.includes("yesterday") || lower.includes("summar")) {
      responseText =
        "Yesterday: 4 visits completed and signed. Jordan Reed's Lamotrigine titration was advanced to 100mg daily. Marcus Vance reported 6 months of sobriety with no side effects. All encounter notes signed and locked.";
      actionLabel = "Open Schedule Roster";
      actionType = "ehr";
    } else {
      responseText = `Clinical AI analyzed "${trimmed}". Found 2 related records across active roster. No urgent safety contraindications identified. How would you like to proceed?`;
      actionLabel = "Open EHR Schedule";
      actionType = "ehr";
    }

    setChatHistory({
      query: trimmed,
      response: responseText,
      actionLabel,
      actionType,
      patientId,
    });
    setQuery("");
  };

  const handleVoiceToggle = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      alert("Speech recognition is supported in modern browsers like Chrome.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => setIsListening(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setQuery(transcript);
        setIsListening(false);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleActionClick = (item: AiChatInteraction) => {
    if (item.actionType === "patient" && item.patientId && onOpenPatientChart) {
      onOpenPatientChart(item.patientId);
    } else if (item.actionType === "billing") {
      onNavigateShortcut("billing");
    } else {
      onNavigateShortcut("ehr");
    }
  };

  return (
    <div className="zen-home-viewport">
      {/* Background Picture Spot Container */}
      <div
        className="zen-picture-spot"
        style={{
          backgroundImage: wallpaperUrl ? `url(${wallpaperUrl})` : "none",
        }}
      />

      {/* Main Center Stage */}
      <main className="zen-main-stage">
        {/* Brand Wordmark */}
        <h1 className="zen-brand-title">
          Clinical Bond<span className="brand-dot">.</span>
        </h1>

        {/* AI Chat Omnibar (replaces Google Search Bar) */}
        <div className="zen-omnibar-shell">
          <form
            onSubmit={handleQuerySubmit}
            className={`zen-omnibar-pill ${isFocused ? "focused" : ""}`}
          >
            <span className="zen-pill-sparkle">
              <Icon name="auto_awesome" />
            </span>

            <input
              ref={inputRef}
              type="text"
              className="zen-pill-input"
              placeholder="Ask Clinical AI anything about patients, schedule, billing, or practice..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />

            <div className="zen-pill-actions">
              <button
                type="button"
                className={`zen-pill-btn ${isListening ? "listening" : ""}`}
                title="Voice dictation"
                aria-label="Voice dictation"
                onClick={handleVoiceToggle}
              >
                <Icon name="mic" />
              </button>

              <button
                type="button"
                className="zen-pill-btn"
                title="Attach document or lab"
                aria-label="Attach clinical document"
                onClick={() => {
                  setQuery("Review attached clinical record");
                  inputRef.current?.focus();
                }}
              >
                <Icon name="attachment" />
              </button>

              <button
                type="submit"
                className="zen-ai-mode-pill"
                title="Ask Clinical AI"
              >
                <Icon name="auto_awesome" size="sm" />
                <span>AI Mode</span>
              </button>
            </div>
          </form>
        </div>

        {/* Suggestion Chips */}
        <div className="zen-chips-row">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className="zen-chip"
              onClick={() => {
                setQuery(chip.query);
                setTimeout(() => {
                  // Direct trigger
                  setQuery(chip.query);
                  inputRef.current?.focus();
                }, 50);
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* AI Response Output Card (when conversation is active) */}
        {chatHistory && (
          <div className="zen-ai-response-card">
            <div className="zen-response-header">
              <span>✦ Clinical AI Response</span>
              <button
                type="button"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#64748b" }}
                onClick={() => setChatHistory(null)}
              >
                ×
              </button>
            </div>
            <p className="zen-response-body">{chatHistory.response}</p>
            {chatHistory.actionLabel && (
              <div className="zen-response-actions">
                <Button
                  size="sm"
                  icon="arrow_forward"
                  onClick={() => handleActionClick(chatHistory)}
                >
                  {chatHistory.actionLabel}
                </Button>
                <Button
                  size="sm"
                  icon="close"
                  onClick={() => setChatHistory(null)}
                >
                  Dismiss
                </Button>
              </div>
            )}
          </div>
        )}

        {/* 8 Menu Shortcuts (Google Chrome New Tab Style) */}
        <div className="zen-shortcuts-grid">
          {SHORTCUTS.map((shortcut) => (
            <button
              key={shortcut.id}
              type="button"
              className="zen-shortcut-item"
              onClick={() => onNavigateShortcut(shortcut.id)}
            >
              <div className="zen-shortcut-circle">
                <Icon name={shortcut.icon} />
              </div>
              <span className="zen-shortcut-label">{shortcut.label}</span>
            </button>
          ))}
        </div>
      </main>

      {/* Picture Spot Customizer (bottom right) */}
      <footer className="zen-bottom-bar">
        <button
          type="button"
          className="zen-wallpaper-btn"
          onClick={() => setWallpaperPickerOpen((prev) => !prev)}
        >
          <Icon name="wallpaper" size="sm" />
          <span>Picture Spot</span>
        </button>

        {wallpaperPickerOpen && (
          <div
            style={{
              position: "absolute",
              bottom: "3.5rem",
              right: "1.75rem",
              background: "rgba(15, 23, 42, 0.92)",
              backdropFilter: "blur(12px)",
              padding: "0.85rem",
              borderRadius: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
              fontSize: "0.8rem",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileUpload}
            />
            <strong>Customize Picture Spot:</strong>
            <button
              type="button"
              className="zen-nav-link"
              style={{ textAlign: "left", padding: "0.35rem 0.6rem", background: "rgba(66, 133, 244, 0.25)" }}
              onClick={() => fileInputRef.current?.click()}
            >
              📁 Upload Your Picture...
            </button>
            <button
              type="button"
              className="zen-nav-link"
              style={{ textAlign: "left", padding: "0.3rem 0.5rem" }}
              onClick={() => handleSetWallpaper("/wallpapers/zen-reef.jpg")}
            >
              🌊 Tropical Reef (Default)
            </button>
            <button
              type="button"
              className="zen-nav-link"
              style={{ textAlign: "left", padding: "0.3rem 0.5rem" }}
              onClick={() =>
                handleSetWallpaper(
                  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80"
                )
              }
            >
              🏖️ Tropical Coast &amp; Palms
            </button>
            <button
              type="button"
              className="zen-nav-link"
              style={{ textAlign: "left", padding: "0.3rem 0.5rem" }}
              onClick={() => handleSetWallpaper("")}
            >
              🌑 Minimalist Dark Studio
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
