"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type Patient, type Section } from "../../domain/patient";
import { usePatientRoster } from "../../lib/patient-roster";
import {
  type ProviderPreferences,
  defaultPreferences,
  parseAiPreferenceCommand,
} from "../../lib/preference-engine";
import type { OmniboxSurface, OmniboxWorkspaceTarget } from "../../domain/omnibox";
import { omniboxPlanFailureMessage, requestOmniboxPlan } from "../../lib/omnibox-plan-client";
import OmniboxPlanCard, {
  type OmniboxDeferConfirmation,
  workspaceSectionForSurface,
} from "../omnibox/OmniboxPlanCard";
import type { CareCompletionDeferralReasonCode } from "../../domain/care-completion";
import { announceCareCompletionChange, careCompletionApi } from "../../lib/care-completion-api";
import {
  navigateToLocation,
  navigateToPatientLocation,
} from "../../lib/workspace-navigation";
import {
  WORKSPACE_OPEN_COMMUNICATIONS_EVENT,
  WORKSPACE_SWITCH_VIEW_EVENT,
  dispatchWorkspaceEvent,
} from "../../lib/workspace-events";
import { api } from "../../lib/api-client";
import Icon from "../ui/Icon";
import CompanionPanelFrame from "./CompanionPanelFrame";
import {
  type ClinicalAiTurn,
  beginClinicalAiTurn,
  clearClinicalAiThread,
  clinicalAiThreadFor,
  dismissClinicalAiTurn,
  settleClinicalAiTurn,
  subscribeClinicalAiThreads,
  threadHasPendingTurn,
  turnAnswersForAnotherPatient,
  turnSummary,
} from "../../lib/clinical-ai-thread";

/** Thread key for the practice schedule view, which has no patient. */
const PRACTICE_THREAD_KEY = "practice";

function surfaceFromSection(section: Section | undefined): OmniboxSurface {
  switch (section) {
    case "Encounter":
      return "encounter";
    case "Documents":
      return "documents";
    case "Labs":
      return "labs";
    case "Meds":
      return "medications";
    case "Messages":
      return "messages";
    case "History":
      return "history";
    default:
      return "general";
  }
}

export default function ClinicalAiPanel({
  patient,
  section,
  isScheduleView = false,
  command,
  preferences = defaultPreferences,
  onUpdatePreferences,
  onOpenCustomizer,
  onClose,
  onUnpin,
  onNavigateSection,
  onInsertToNote,
  onSplitScreen,
  isExpanded = false,
  onExpand,
  onRedock,
}: {
  patient: Patient;
  section: Section;
  isScheduleView?: boolean;
  command: string;
  preferences?: ProviderPreferences;
  onUpdatePreferences?: (updated: ProviderPreferences) => void;
  onOpenCustomizer?: () => void;
  onClose?: () => void;
  onUnpin?: () => void;
  onNavigateSection?: (section: Section) => void;
  onInsertToNote?: (text: string) => void;
  onSplitScreen?: (targetPatientId: string) => void;
  /** The shared companion lifecycle: docked -> expanded canvas -> redocked (CB-6). */
  isExpanded?: boolean;
  onExpand?: () => void;
  onRedock?: () => void;
}) {
  const { patients: roster } = usePatientRoster();
  const [customAiText, setCustomAiText] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // Earlier turns the clinician reopened; the latest turn is always open.
  const [expandedTurnIds, setExpandedTurnIds] = useState<ReadonlySet<string>>(() => new Set());
  // One thread per patient (D-132). The practice schedule view keeps its own.
  const threadKey = isScheduleView ? PRACTICE_THREAD_KEY : patient.id;
  const turns = useSyncExternalStore(
    subscribeClinicalAiThreads,
    () => clinicalAiThreadFor(threadKey),
    () => clinicalAiThreadFor(threadKey),
  );
  const planLoading = turns.some((turn) => turn.status === "pending");
  const latestTurnRef = useRef<HTMLLIElement | null>(null);
  const latestTurnId = turns.at(-1)?.id;
  const [aiEngineStatus, setAiEngineStatus] = useState<{
    provider: string;
    activeModel: string;
    connected: boolean;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    api.ai.status()
      .then((data) => {
        if (isMounted && data?.success) {
          setAiEngineStatus({
            provider: data.provider,
            activeModel: data.activeModel,
            connected: Boolean(data.connected),
          });
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Bring a new turn into view as it is asked and again when it settles.
  const latestTurnStatus = turns.at(-1)?.status;
  useEffect(() => {
    latestTurnRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [latestTurnId, latestTurnStatus]);

  // If initial command passed in, execute it automatically
  useEffect(() => {
    if (command && command.trim().length > 0) {
      void handleAiSubmit(command);
    }
  }, [command]);

  function triggerToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  }

  async function handleAiSubmit(promptText: string) {
    const input = promptText.trim();
    if (!input) return;
    // One question at a time per thread, so answers stay in the order asked.
    if (threadHasPendingTurn(threadKey)) return;

    // Captured at submit: the answer belongs to the thread it was asked in even
    // if the panel has moved to another patient by the time it arrives.
    const askedInThread = threadKey;
    const threadPatientId = isScheduleView ? undefined : patient.id;

    setCustomAiText("");

    // 1. Workspace Layout Operator (deterministic, client-side)
    if (preferences && onUpdatePreferences) {
      const prefRes = parseAiPreferenceCommand(input, preferences);
      if (prefRes.recognized && prefRes.updatedPreferences) {
        onUpdatePreferences(prefRes.updatedPreferences);
        const turnId = beginClinicalAiTurn(askedInThread, input);
        settleClinicalAiTurn(askedInThread, turnId, { status: "workspace", feedback: prefRes.feedback });
        triggerToast("Workspace layout updated.");
        return;
      }
    }

    // 2. Split Screen Operator (client-side)
    const lower = input.toLowerCase();
    if (lower.includes("split") || lower.includes("side by side") || lower.includes("dual chart")) {
      const otherPatient =
        roster.find((p) => p.id !== patient.id && lower.includes(p.name.toLowerCase().split(" ")[0])) ||
        roster.find((p) => p.id !== patient.id);

      const turnId = beginClinicalAiTurn(askedInThread, input);
      if (!otherPatient) {
        settleClinicalAiTurn(askedInThread, turnId, {
          status: "workspace",
          feedback: "No second patient in your accessible roster to open beside this chart.",
        });
        return;
      }

      settleClinicalAiTurn(askedInThread, turnId, {
        status: "workspace",
        feedback: `Opening ${otherPatient.name} in a detached side-by-side workspace alongside ${patient.name}.`,
      });
      if (onSplitScreen) {
        onSplitScreen(otherPatient.id);
      }
      return;
    }

    // 3. Clinical & Schedule Queries via Authenticated Server Planner Boundary (D-064).
    // The thread's patient is sent as the active one, so an unqualified "her" or
    // "that level" can only resolve to this thread's patient.
    const turnId = beginClinicalAiTurn(askedInThread, input);
    try {
      const result = await requestOmniboxPlan({
        query: input,
        activePatientId: threadPatientId,
        activeSurface: isScheduleView ? "general" : surfaceFromSection(section),
      });
      settleClinicalAiTurn(askedInThread, turnId, { status: "answered", plan: result });
    } catch (cause: unknown) {
      settleClinicalAiTurn(askedInThread, turnId, {
        status: "failed",
        error: omniboxPlanFailureMessage(cause),
      });
    }
  }

  function toggleTurn(turnId: string) {
    setExpandedTurnIds((current) => {
      const next = new Set(current);
      if (next.has(turnId)) next.delete(turnId);
      else next.add(turnId);
      return next;
    });
  }

  function openWorkspaceTarget(target: OmniboxWorkspaceTarget) {
    const destination = target.navigation;
    if (destination.kind === "patient") {
      void navigateToPatientLocation(
        destination.patientId,
        workspaceSectionForSurface(destination.section),
        undefined,
        destination.documentId,
      );
    } else if (destination.kind === "module") {
      void navigateToLocation({ kind: "module", module: destination.module });
    } else if (destination.kind === "communication") {
      dispatchWorkspaceEvent(WORKSPACE_OPEN_COMMUNICATIONS_EVENT, {
        partnerId: destination.partnerId,
      });
    } else {
      dispatchWorkspaceEvent(WORKSPACE_SWITCH_VIEW_EVENT, {
        view:
          destination.view === "today"
            ? "today"
            : destination.view === "patient"
              ? "patients"
              : destination.view,
      });
    }
  }

  function renderTurnResponse(turn: ClinicalAiTurn, isLatest: boolean) {
    if (turn.status === "workspace") {
      return (
        <div
          className="ai-turn-workspace"
          role={isLatest ? "status" : undefined}
        >
          <strong><Icon name="auto_awesome" /> Workspace Operator</strong>
          <p>{turn.feedback}</p>
        </div>
      );
    }

    const plan = turn.plan ?? null;
    const otherPatient = isScheduleView ? null : turnAnswersForAnotherPatient(turn);
    return (
      <>
        {otherPatient && (
          <p className="ai-turn-other-patient" data-ai-turn-other-patient={otherPatient.id}>
            <Icon name="swap_horiz" /> This answer is about {otherPatient.name}, not {patient.name}. The
            conversation stays with {patient.name}.
          </p>
        )}
        <OmniboxPlanCard
          plan={plan}
          loading={turn.status === "pending"}
          error={turn.status === "failed" ? (turn.error ?? "The request failed.") : ""}
          title={isScheduleView ? "Practice AI Plan" : `AI Plan · ${plan?.patient.resolved?.name ?? patient.name}`}
          onClose={() => dismissClinicalAiTurn(threadKey, turn.id)}
          onOpenPatient={(targetPatientId, targetSection) => {
            if (targetPatientId === patient.id && onNavigateSection) {
              onNavigateSection(targetSection);
            } else {
              void navigateToPatientLocation(targetPatientId, targetSection);
            }
          }}
          onOpenTasks={() => {
            void navigateToLocation({ kind: "module", module: "tasks" });
          }}
          onOpenWorkspaceTarget={openWorkspaceTarget}
          onConfirmDefer={async (confirmation: OmniboxDeferConfirmation) => {
            await careCompletionApi.defer({
              patientId: confirmation.patientId,
              itemKey: confirmation.itemKey,
              reasonCode: confirmation.reasonCode as CareCompletionDeferralReasonCode,
              reasonText: confirmation.reasonText,
            });
            announceCareCompletionChange({ patientId: confirmation.patientId });
            triggerToast(`Deferred item for ${confirmation.patientName}.`);
          }}
        />

        {/* Insert only an answer about this thread's patient into this patient's note. */}
        {plan?.answer && !plan.workspaceTargets?.length && !otherPatient && !isScheduleView && onInsertToNote && (
          <div className="ai-turn-actions">
            <button
              type="button"
              id={isLatest ? "ai-insert-note-btn" : undefined}
              className="ai-turn-insert"
              onClick={() => {
                onInsertToNote(plan.answer!);
                triggerToast("Inserted clinical answer into note.");
              }}
            >
              <Icon name="content_paste" /> Insert into Note
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(plan.answer!);
                triggerToast("Copied to clipboard!");
              }}
            >
              Copy
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <CompanionPanelFrame
      className="companion-ai-panel"
      ariaLabel="Clinical AI Companion"
      title="Clinical AI Companion"
      // Header with explicit target context binding (RIGHT-04).
      context={
        isScheduleView
          ? "Target: Practice Schedule & Daily Cockpit"
          : `Target: ${patient.name} · ${section ? section.charAt(0).toUpperCase() + section.slice(1) : "Overview"}`
      }
      contextId="ai-target-context-label"
      icon="auto_awesome"
      iconStyle={{ color: "#1a73e8" }}
      onClose={onClose ?? (() => {})}
      onUnpin={onUnpin}
      unpinLabel="Unpin Clinical AI"
      isExpanded={isExpanded}
      onExpand={onExpand}
      onRedock={onRedock}
      overlay={
        toastMessage ? (
          <div role="status" className="companion-frame-toast">
            {toastMessage}
          </div>
        ) : null
      }
      // Composer stays reachable while the context and answer scroll.
      footer={
        <div className="ai-composer">
          <textarea
            id="ai-composer-input"
            aria-label="Ask Clinical AI"
            placeholder={
              isScheduleView
                ? "Ask about schedule, or give workspace commands..."
                : `Ask about ${patient.name.split(" ")[0]} or give workspace commands...`
            }
            value={customAiText}
            disabled={planLoading}
            onChange={(e) => setCustomAiText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleAiSubmit(customAiText);
              }
            }}
          />
          <div className="ai-composer-row">
            <span>{planLoading ? "Planning request…" : "Press Enter ↵ to send"}</span>
            <button
              type="button"
              id="ai-send-btn"
              aria-label="Send"
              title="Send"
              disabled={planLoading || !customAiText.trim()}
              onClick={() => void handleAiSubmit(customAiText)}
            >
              <Icon name="arrow_upward" size="sm" />
            </button>
          </div>
        </div>
      }
    >
      {/* Live Context Card & Target Context Isolation */}
      <div
        className="ai-context"
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--m3-border, #e2e8f0)",
          background: "#fafafa",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "6px",
          }}
        >
          <span
            id="ai-context-isolation-badge"
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.5px",
              color: isScheduleView ? "#1e40af" : "#0369a1",
              background: isScheduleView ? "#dbeafe" : "#e0f2fe",
              padding: "2px 6px",
              borderRadius: "4px",
            }}
          >
            {isScheduleView
              ? "● PRACTICE COCKPIT CONTEXT"
              : `● ISOLATED TO CHART (${patient.id})`}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {aiEngineStatus?.connected && (
              <span
                id="ai-engine-status-badge"
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "#15803d",
                  background: "#dcfce7",
                  padding: "1px 5px",
                  borderRadius: "4px",
                }}
                title={`Local Ollama inference active: ${aiEngineStatus.activeModel}`}
              >
                ⚡ {aiEngineStatus.activeModel}
              </span>
            )}
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 500 }}>
              {isScheduleView ? "Practice View" : `${patient.status || "Active"} Patient`}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {isScheduleView ? (
            <span
              style={{
                background: "#e0f2fe",
                color: "#0369a1",
                fontSize: "11px",
                padding: "2px 6px",
                borderRadius: "4px",
                fontWeight: 500,
              }}
            >
              Schedule Context
            </span>
          ) : (
            <>
              <span
                style={{
                  background: "#e0f2fe",
                  color: "#0369a1",
                  fontSize: "11px",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontWeight: 500,
                }}
              >
                Rx: {patient.meds.length} active
              </span>
              {patient.alert && (
                <span
                  style={{
                    background: "#fee2e2",
                    color: "#dc2626",
                    fontSize: "11px",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    fontWeight: 600,
                  }}
                >
                  <Icon name="warning" /> {patient.alert}
                </span>
              )}
              <span
                style={{
                  background: "#f1f5f9",
                  color: "#475569",
                  fontSize: "11px",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontWeight: 400,
                }}
              >
                {patient.diagnoses.length > 0
                  ? `${patient.diagnoses.length} active problem(s)`
                  : "No problems on file"}
              </span>
            </>
          )}
        </div>
      </div>

      {/* The conversation with this patient's chart (D-132, CONV-1). Earlier
          turns collapse to one line; the latest stays open. */}
      {turns.length > 0 && (
        <section className="ai-thread" aria-label={isScheduleView ? "Practice conversation" : `Conversation about ${patient.name}`}>
          <div className="ai-thread-header">
            <span>
              {turns.length} {turns.length === 1 ? "question" : "questions"} · kept for this session only, not saved to the chart
            </span>
            <button
              type="button"
              className="ai-thread-clear"
              disabled={planLoading}
              onClick={() => {
                clearClinicalAiThread(threadKey);
                setExpandedTurnIds(new Set());
              }}
            >
              Clear conversation
            </button>
          </div>
          <ol className="ai-thread-turns">
            {turns.map((turn) => {
              const isLatest = turn.id === latestTurnId;
              const isOpen = isLatest || expandedTurnIds.has(turn.id);
              return (
                <li
                  key={turn.id}
                  ref={isLatest ? latestTurnRef : undefined}
                  className="ai-turn"
                  data-ai-turn-status={turn.status}
                  data-ai-turn-latest={isLatest ? "true" : undefined}
                >
                  <p className="ai-turn-question">
                    <span className="ai-sr-label">You asked: </span>
                    {turn.query}
                  </p>
                  {isOpen ? (
                    <div className="ai-turn-response">
                      {renderTurnResponse(turn, isLatest)}
                      {!isLatest && (
                        <button type="button" className="ai-turn-toggle" onClick={() => toggleTurn(turn.id)}>
                          Collapse
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="ai-turn-summary"
                      aria-expanded="false"
                      onClick={() => toggleTurn(turn.id)}
                    >
                      <span>{turnSummary(turn)}</span>
                      <small>Show</small>
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Suggestion Chips */}
      <div
        className="suggestion-chips"
        style={{ padding: "0 16px 12px 16px", display: "flex", flexWrap: "wrap", gap: "6px" }}
      >
        {isScheduleView ? (
          <>
            <button
              type="button"
              id="ai-chip-schedule-summary"
              onClick={() => void handleAiSubmit("Show schedule")}
            >
              <Icon name="content_paste" /> Show schedule
            </button>
            <button
              type="button"
              id="ai-chip-schedule-labs"
              onClick={() => void handleAiSubmit("Overdue surveillance labs")}
            >
              <Icon name="warning" /> Overdue labs
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              id="ai-chip-summarize"
              onClick={() => void handleAiSubmit("Summarize chart")}
            >
              <Icon name="content_paste" /> Summarize chart
            </button>
            <button
              type="button"
              id="ai-chip-what-changed"
              onClick={() => void handleAiSubmit("What changed since last visit?")}
            >
              <Icon name="sync" /> What changed?
            </button>
            <button
              type="button"
              id="ai-chip-medications"
              onClick={() => void handleAiSubmit(`What medications is ${patient.name} taking?`)}
            >
              <Icon name="medication" /> Active medications
            </button>
            <button
              type="button"
              id="ai-chip-check-labs"
              onClick={() => void handleAiSubmit("Check surveillance labs")}
            >
              <Icon name="biotech" /> Check labs
            </button>
          </>
        )}
        {onOpenCustomizer && (
          <button type="button" onClick={onOpenCustomizer}>
            <Icon name="tune" /> Customize layout
          </button>
        )}
      </div>

      {/* Welcoming AI empty state when no query is active */}
      {turns.length === 0 && (
        <div
          className="ai-empty-state"
          style={{
            margin: "8px 16px 16px 16px",
            padding: "18px 16px",
            background: "#ffffff",
            border: "1px dashed #cbd5e1",
            borderRadius: "12px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.02)",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #e0f2fe, #f0f9ff)",
              display: "grid",
              placeItems: "center",
              fontSize: "16px",
              color: "#0284c7",
              border: "1px solid #bae6fd",
            }}
          >
            <Icon name="auto_awesome" />
          </div>
          <div>
            <strong
              style={{ fontSize: "13px", color: "#0f172a", display: "block", marginBottom: "4px" }}
            >
              {isScheduleView ? "Practice AI Companion Ready" : "Clinical AI Companion Ready"}
            </strong>
            <p
              style={{
                margin: 0,
                fontSize: "11.5px",
                color: "#64748b",
                lineHeight: 1.45,
                maxWidth: "260px",
              }}
            >
              {isScheduleView
                ? "Select a prompt chip above to query the schedule, or type a command to reconfigure workspace density."
                : `Select a prompt chip above, ask a clinical question about ${patient.name.split(" ")[0]}, or type a command to reconfigure your workspace.`}
            </p>
          </div>
        </div>
      )}
    </CompanionPanelFrame>
  );
}
