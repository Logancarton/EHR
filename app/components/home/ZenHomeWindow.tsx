"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import Icon from "../ui/Icon";
import type { Section } from "../../domain/patient";
import type { OmniboxPlan } from "../../domain/omnibox";
import { isGlobalModuleAvailable } from "../../lib/workspace-navigation";
import { omniboxPlanFailureMessage, requestOmniboxPlan } from "../../lib/omnibox-plan-client";
import OmniboxPlanCard from "../omnibox/OmniboxPlanCard";

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
  onOpenPatientChart?: (patientId: string, section?: Section) => void;
}

const ALL_SHORTCUTS: Array<{ id: HomeShortcutId; label: string; icon: string }> = [
  { id: "ehr", label: "EHR", icon: "medical_services" },
  { id: "billing", label: "Billing", icon: "payments" },
  { id: "website", label: "Website", icon: "language" },
  { id: "social_media", label: "Social Media", icon: "campaign" },
  { id: "email", label: "Email", icon: "mail" },
  { id: "hr", label: "HR", icon: "badge" },
  { id: "patient_communication", label: "Patient communication", icon: "forum" },
  { id: "financial_integration", label: "Financial integration", icon: "account_balance" },
];

/**
 * The launcher only offers destinations that open something.
 *
 * This list used to be its own hard-coded set, so it kept offering a tile after the
 * registry withdrew the destination behind it — which is how the withdrawn
 * Financials prototype stayed one click from the home screen. It is filtered
 * through the same registry the rails and the app drawer use (P9-0). `ehr` is not a
 * module; it is the tile that opens the schedule.
 */
const SHORTCUTS = ALL_SHORTCUTS.filter(
  (shortcut) => shortcut.id === "ehr" || isGlobalModuleAvailable(shortcut.id),
);

/**
 * Templates, not questions.
 *
 * These used to be questions this screen answered from a hard-coded script — "Any
 * abnormal labs?" returned an invented lithium level for a named patient — so the
 * chips doubled as a demonstration of findings that did not exist. They are now
 * shapes the server planner actually supports, each carrying a `[patient]`
 * placeholder the clinician replaces, and clicking one fills the box rather than
 * submitting it.
 *
 * Nothing here promises a practice-wide answer. The planner works per chart, and a
 * request naming no patient comes back asking which one rather than guessing.
 */
const SUGGESTION_CHIPS = [
  { label: "🗂️ Open [patient]'s last encounter", query: "Open [patient]'s last encounter" },
  { label: "🧪 What was [patient]'s last lithium level?", query: "What was [patient]'s last lithium level?" },
  { label: "💊 What medications is [patient] taking?", query: "What medications is [patient] taking?" },
  { label: "📋 Draft a CMP for [patient]", query: "Draft a CMP for [patient]" },
  { label: "✅ Create a follow-up task for [patient]", query: "Create a follow-up task for [patient]" },
];

/** The placeholder a chip leaves behind for the clinician to replace with a name. */
const PATIENT_PLACEHOLDER = "[patient]";

export default function ZenHomeWindow({
  onNavigateShortcut,
  onOpenPatientChart,
}: ZenHomeWindowProps) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [plan, setPlan] = useState<OmniboxPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [planOpen, setPlanOpen] = useState(false);
  const [submittedQuery, setSubmittedQuery] = useState("");
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

  /**
   * Ask the server planner. Nothing is answered in this component.
   *
   * What this replaced was a `query.includes(...)` ladder that returned invented
   * clinical findings for named patients: a serum lithium of 0.9 mEq/L with a
   * therapeutic range, a PHQ-9 of 14, a refill request with a GAD-7 trajectory, a
   * four-visit summary with a titration, and a fallback that asserted "No urgent
   * safety contraindications identified". None of it read a record, and because no
   * request was made, no permission or patient-access check could have stopped it.
   *
   * Every request now crosses `/api/ai/omnibox/plan`, which authenticates the
   * caller, resolves patients only within the charts they may reach, assembles
   * bounded context with provenance, and refuses rather than inventing. When it
   * cannot answer, this screen says so; it never substitutes an example.
   */
  const handleQuerySubmit = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    if (trimmed.includes(PATIENT_PLACEHOLDER)) {
      // A template the clinician did not finish. Sending it would make the planner
      // look for a patient literally named "[patient]" and answer "not found",
      // which reads as a failure of the chart rather than an unfinished request.
      setPlanError(
        `Replace ${PATIENT_PLACEHOLDER} with a patient's name before asking. Nothing was looked up.`,
      );
      setPlan(null);
      setPlanOpen(true);
      return;
    }

    setPlanOpen(true);
    setPlanLoading(true);
    setPlanError("");
    setPlan(null);
    setSubmittedQuery(trimmed);
    // Cleared before the await, not after: the box is ready for the next question
    // while this one is in flight, and the question being answered stays visible
    // above the card rather than only in the input.
    setQuery("");
    try {
      // No active patient: the launcher is not a chart. The planner asks which
      // patient is meant rather than picking one.
      setPlan(await requestOmniboxPlan({ query: trimmed, activeSurface: "general" }));
    } catch (cause: unknown) {
      setPlanError(omniboxPlanFailureMessage(cause));
    } finally {
      setPlanLoading(false);
    }
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

  /**
   * Navigation the plan asked for.
   *
   * The launcher is not a chart, so opening one is the host's job rather than the
   * card's. A plan that names a patient this clinician cannot reach never gets
   * here: patient resolution happens server-side against their own accessible
   * roster, so an unreachable chart comes back as "not found", not as a link.
   */
  const openPlanPatient = (patientId: string, section: Section) => {
    if (onOpenPatientChart) onOpenPatientChart(patientId, section);
    else onNavigateShortcut("ehr");
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
            onSubmit={(event) => { void handleQuerySubmit(event); }}
            className={`zen-omnibar-pill ${isFocused ? "focused" : ""}`}
          >
            <span className="zen-pill-sparkle">
              <Icon name="auto_awesome" />
            </span>

            <input
              ref={inputRef}
              type="text"
              className="zen-pill-input"
              // Names a patient on purpose. The planner answers per chart and says
              // so when a request does not identify one; promising "anything about
              // the practice" invited exactly the questions it cannot ground.
              placeholder="Ask Clinical AI about a patient's chart — name the patient"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // Enter submits explicitly rather than relying on the browser's
              // implicit form submission. The default was not reaching the handler
              // here, so the box could only be submitted by clicking AI Mode — and
              // a search field that ignores Enter reads as a broken assistant, not
              // as a design choice. `preventDefault` keeps the native path from
              // firing a second submit on browsers where it does work.
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                void handleQuerySubmit();
              }}
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
              // Fills the box and selects the placeholder so the next keystroke
              // replaces it. It deliberately does not submit: the template is
              // incomplete until a clinician names the patient, and submitting it
              // would produce a "patient not found" that reads like a fact about
              // the chart. (The previous version set the same value twice behind a
              // 50ms timer, which did nothing either time.)
              onClick={() => {
                setQuery(chip.query);
                window.requestAnimationFrame(() => {
                  const input = inputRef.current;
                  if (!input) return;
                  input.focus();
                  const start = chip.query.indexOf(PATIENT_PLACEHOLDER);
                  if (start >= 0) input.setSelectionRange(start, start + PATIENT_PLACEHOLDER.length);
                });
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/*
          The planner's own answer, rendered by the same card the workspace omnibox
          uses. One answer surface, one truth standard: this screen previously had
          its own card fed by a local script, which is how invented findings came to
          look exactly like retrieved ones.
        */}
        {planOpen && (
          <div className="zen-ai-plan-card">
            {submittedQuery ? (
              <p className="zen-plan-query">
                <Icon name="search" size="sm" /> {submittedQuery}
              </p>
            ) : null}
            <OmniboxPlanCard
              plan={plan}
              loading={planLoading}
              error={planError}
              title="Clinical AI answer"
              onClose={() => {
                setPlanOpen(false);
                setPlan(null);
                setPlanError("");
                setSubmittedQuery("");
              }}
              onOpenPatient={openPlanPatient}
              onOpenTasks={() => onNavigateShortcut("ehr")}
            />
          </div>
        )}

        {/* 8 Menu Shortcuts (Google Chrome New Tab Style) */}
        <div className="zen-shortcuts-grid">
          {SHORTCUTS.map((shortcut) => (
            <button
              key={shortcut.id}
              type="button"
              className="zen-shortcut-item"
              // The EHR tile is how the launcher reaches the schedule, so it is also
              // the control a workspace restore clicks when the saved view is Today
              // and no Dashboard tab has been opened yet.
              data-workspace-view={shortcut.id === "ehr" ? "today" : undefined}
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
