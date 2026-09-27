"use client";

import { useCallback, useState, useRef, useMemo, type FormEvent } from "react";
import Icon from "../ui/Icon";
import type { Section } from "../../domain/patient";
import type { OmniboxPlan } from "../../domain/omnibox";
import { isGlobalModuleAvailable } from "../../lib/workspace-navigation";
import { omniboxPlanFailureMessage, requestOmniboxPlan } from "../../lib/omnibox-plan-client";
import { useDismissible } from "../../lib/use-dismissible";
import OmniboxPlanCard, { type OmniboxDeferConfirmation } from "../omnibox/OmniboxPlanCard";
import type { CareCompletionDeferralReasonCode } from "../../domain/care-completion";
import { announceCareCompletionChange, careCompletionApi } from "../../lib/care-completion-api";
import { usePatientRoster } from "../../lib/patient-roster";
import { usePracticeSchedule } from "../../lib/schedule-store";

import {
  getHomeWorkspaceDestinations,
  type WorkspaceDestinationId,
} from "../../lib/workspace-catalog";

export type HomeShortcutId = WorkspaceDestinationId | "ehr";

interface ZenHomeWindowProps {
  onNavigateShortcut: (shortcut: HomeShortcutId) => void;
  onOpenPatientChart?: (patientId: string, section?: Section) => void;
}

/**
 * Home is the suite launcher presenting the three major entities:
 * Clinical, Billing, and Brand (D-085, LEFT-01, UI-2).
 *
 * It consumes the canonical shared workspace catalog. Staff/HR is excluded
 * from major-app launchers and planned/withdrawn destinations cannot leak through.
 * Filtered additionally through isGlobalModuleAvailable.
 */
const SHORTCUTS = getHomeWorkspaceDestinations().filter(
  (shortcut) =>
    shortcut.id === "clinical" ||
    (shortcut.targetModule ? isGlobalModuleAvailable(shortcut.targetModule) : true),
);

/** The placeholder a chip leaves behind for the clinician to replace with a name. */
const PATIENT_PLACEHOLDER = "[patient]";

/**
 * Executes a confirmed deferral from the home launcher.
 *
 * Shares the workspace bridge's contract exactly: the card resolves nothing, it
 * only shows what the server resolved, and the confirmed `itemKey` is
 * re-validated against the patient's live board before anything is written.
 */
async function confirmDeferral(confirmation: OmniboxDeferConfirmation) {
  await careCompletionApi.defer({
    patientId: confirmation.patientId,
    itemKey: confirmation.itemKey,
    reasonCode: confirmation.reasonCode as CareCompletionDeferralReasonCode,
    reasonText: confirmation.reasonText,
  });
  announceCareCompletionChange({ patientId: confirmation.patientId });
}

export default function ZenHomeWindow({
  onNavigateShortcut,
  onOpenPatientChart,
}: ZenHomeWindowProps) {
  const { patients } = usePatientRoster();
  const { appointments } = usePracticeSchedule();
  const recentPatients = useMemo(() => patients.slice(0, 4), [patients]);

  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [plan, setPlan] = useState<OmniboxPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [planOpen, setPlanOpen] = useState(false);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const planCardRef = useRef<HTMLDivElement | null>(null);

  const dismissPlan = useCallback(() => {
    setPlanOpen(false);
    setPlan(null);
    setPlanError("");
    setSubmittedQuery("");
  }, []);

  /**
   * Escape retires the card; clicking past it deliberately does not.
   *
   * The workspace's version of this card is an overlay, so dismissing it moves
   * nothing and a click past it is safe. This one is in the flow: it pushes the
   * shortcut grid down while it is open. Dismissing on the press would pull that
   * grid back up between press and release, so the click would land on whatever
   * slid under the cursor — clicking the EHR tile with an answer open opened
   * something else entirely. The cursor is still in the box that asked the
   * question, hence `dismissFromTextEntry`.
   */
  useDismissible({
    active: planOpen,
    onDismiss: dismissPlan,
    dismissFromTextEntry: true,
  });

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
    else onNavigateShortcut("clinical");
  };

  return (
    <div className="zen-home-viewport">
      {/* Clinical Zen uses a restrained tonal field, never consumer wallpaper. */}
      <div className="zen-clinical-backdrop" aria-hidden="true" />

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
              cardRef={planCardRef}
              onClose={dismissPlan}
              onOpenPatient={openPlanPatient}
              onOpenTasks={() => onNavigateShortcut("clinical")}
              onConfirmDefer={confirmDeferral}
            />
          </div>
        )}

        {/* Major Suite Entities: Clinical / Billing / Brand (UI-2, D-085, LEFT-01) */}
        <div className="zen-shortcuts-grid">
          {SHORTCUTS.map((shortcut) => (
            <button
              key={shortcut.id}
              type="button"
              className="zen-shortcut-item"
              data-workspace-id={shortcut.id}
              // The Clinical tile is how the launcher reaches the primary clinical environment / schedule,
              // so it carries [data-workspace-view="today"] for 1-click restore to Today.
              data-workspace-view={shortcut.id === "clinical" ? "today" : undefined}
              onClick={() => onNavigateShortcut(shortcut.id)}
            >
              <div className="zen-shortcut-circle">
                <Icon name={shortcut.icon} />
              </div>
              <span className="zen-shortcut-label">{shortcut.label}</span>
            </button>
          ))}
        </div>

        {/* Home Activity Hub: Schedule Glance & Recent Patient Workspaces */}
        <div className="zen-hub-section">
          {/* Quick Schedule Banner / Glance */}
          <div className="zen-pulse-banner">
            <div className="zen-pulse-info">
              <div className="zen-pulse-icon">
                <Icon name="calendar_today" />
              </div>
              <div className="zen-pulse-text">
                <span className="zen-pulse-eyebrow">Practice Schedule Glance</span>
                <span className="zen-pulse-title">
                  {appointments.length > 0
                    ? `${appointments.length} appointment${appointments.length === 1 ? "" : "s"} scheduled for today`
                    : "No appointments scheduled today"}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="zen-pulse-action-btn"
              onClick={() => onNavigateShortcut("clinical")}
            >
              <span>Open Schedule</span>
              <Icon name="arrow_forward" size="sm" />
            </button>
          </div>

          {/* Recent Patients */}
          {recentPatients.length > 0 && (
            <div className="zen-recent-patients-container">
              <div className="zen-section-header">
                <div className="zen-section-title-wrap">
                  <Icon name="person" size="sm" />
                  <h2 className="zen-section-title">Recent Patient Workspaces</h2>
                </div>
                <span className="zen-section-subtitle">Click to jump directly into clinical chart</span>
              </div>

              <div className="zen-patient-cards-grid">
                {recentPatients.map((patient) => {
                  const initials = patient.name
                    .split(" ")
                    .filter(Boolean)
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  const primaryDiagnosis = patient.diagnoses?.[0] || "Active Chart";
                  return (
                    <div
                      key={patient.id}
                      className="zen-patient-card"
                      onClick={() => {
                        if (onOpenPatientChart) onOpenPatientChart(patient.id);
                        else onNavigateShortcut("clinical");
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (onOpenPatientChart) onOpenPatientChart(patient.id);
                          else onNavigateShortcut("clinical");
                        }
                      }}
                    >
                      <div className="zen-patient-card-top">
                        <div className="zen-patient-avatar">{initials}</div>
                        <div className="zen-patient-meta">
                          <span className="zen-patient-name">{patient.name}</span>
                          <span className="zen-patient-mrn">MRN: {patient.mrn}</span>
                        </div>
                      </div>
                      <div className="zen-patient-card-body">
                        <div className="zen-patient-condition-chip" title={primaryDiagnosis}>
                          <Icon name="medical_services" size="sm" />
                          <span>{primaryDiagnosis}</span>
                        </div>
                      </div>
                      <div className="zen-patient-card-footer">
                        <span className="zen-patient-open-link">
                          <span>Open Chart</span>
                          <Icon name="chevron_right" size="sm" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

    </div>
  );
}
