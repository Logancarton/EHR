"use client";

import { useEffect, useRef, useState } from "react";
import { type Patient, type Section } from "../../domain/patient";
import { usePatientRoster } from "../../lib/patient-roster";
import {
  type ProviderPreferences,
  defaultPreferences,
  parseAiPreferenceCommand,
} from "../../lib/preference-engine";
import type { OmniboxPlan, OmniboxSurface } from "../../domain/omnibox";
import { omniboxPlanFailureMessage, requestOmniboxPlan } from "../../lib/omnibox-plan-client";
import OmniboxPlanCard, { type OmniboxDeferConfirmation } from "../omnibox/OmniboxPlanCard";
import type { CareCompletionDeferralReasonCode } from "../../domain/care-completion";
import { announceCareCompletionChange, careCompletionApi } from "../../lib/care-completion-api";
import {
  navigateToLocation,
  navigateToPatientLocation,
} from "../../lib/workspace-navigation";
import Icon from "../ui/Icon";
import CompanionPanelFrame from "./CompanionPanelFrame";

function surfaceFromSection(section: Section | undefined): OmniboxSurface {
  switch (section) {
    case "Encounter":
      return "encounter";
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
}) {
  const { patients: roster } = usePatientRoster();
  const [customAiText, setCustomAiText] = useState("");
  const [plan, setPlan] = useState<OmniboxPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [layoutFeedback, setLayoutFeedback] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const activeScopeRef = useRef({ patientId: patient.id, isScheduleView });
  activeScopeRef.current = { patientId: patient.id, isScheduleView };
  const requestIdRef = useRef(0);

  // Target context isolation: drop plan and reset state whenever patient or schedule view switches (RIGHT-04)
  useEffect(() => {
    requestIdRef.current++;
    setPlan(null);
    setPlanError("");
    setPlanLoading(false);
    setLayoutFeedback(null);
  }, [patient.id, isScheduleView]);

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

    const currentReqId = ++requestIdRef.current;
    const currentReqScope = {
      patientId: isScheduleView ? undefined : patient.id,
      isScheduleView,
    };

    setCustomAiText("");
    setPlan(null);
    setPlanError("");
    setLayoutFeedback(null);

    // 1. Workspace Layout Operator (deterministic, client-side)
    if (preferences && onUpdatePreferences) {
      const prefRes = parseAiPreferenceCommand(input, preferences);
      if (prefRes.recognized && prefRes.updatedPreferences) {
        onUpdatePreferences(prefRes.updatedPreferences);
        setLayoutFeedback(prefRes.feedback);
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

      if (!otherPatient) {
        setLayoutFeedback("No second patient in your accessible roster to open beside this chart.");
        return;
      }

      setLayoutFeedback(
        `Opening ${otherPatient.name} in a detached side-by-side workspace alongside ${patient.name}.`,
      );
      if (onSplitScreen) {
        onSplitScreen(otherPatient.id);
      }
      return;
    }

    // 3. Clinical & Schedule Queries via Authenticated Server Planner Boundary (D-064)
    setPlanLoading(true);
    try {
      const activePatientId = currentReqScope.patientId;
      const activeSurface = isScheduleView ? "general" : surfaceFromSection(section);
      const result = await requestOmniboxPlan({
        query: input,
        activePatientId,
        activeSurface,
      });

      // Drop stale async responses if user switched patients or scope while in-flight
      if (
        currentReqId !== requestIdRef.current ||
        activeScopeRef.current.isScheduleView !== currentReqScope.isScheduleView ||
        (!currentReqScope.isScheduleView &&
          activeScopeRef.current.patientId !== currentReqScope.patientId)
      ) {
        return;
      }

      setPlan(result);
    } catch (cause: unknown) {
      if (
        currentReqId !== requestIdRef.current ||
        activeScopeRef.current.isScheduleView !== currentReqScope.isScheduleView ||
        (!currentReqScope.isScheduleView &&
          activeScopeRef.current.patientId !== currentReqScope.patientId)
      ) {
        return;
      }
      setPlanError(omniboxPlanFailureMessage(cause));
    } finally {
      if (currentReqId === requestIdRef.current) {
        setPlanLoading(false);
      }
    }
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
          : `Target: ${patient.name} (${patient.id}) · ${section}`
      }
      contextId="ai-target-context-label"
      icon="auto_awesome"
      iconStyle={{ color: "#1a73e8" }}
      onClose={onClose ?? (() => {})}
      onUnpin={onUnpin}
      unpinLabel="Unpin Clinical AI"
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
          <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 500 }}>
            {isScheduleView ? "Practice View" : `${patient.status || "Active"} Patient`}
          </span>
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

      {/* Workspace Operator Layout Feedback */}
      {layoutFeedback && (
        <div
          role="status"
          style={{
            margin: "12px 16px",
            padding: "12px",
            background: "#f0fdf4",
            border: "1px solid #86efac",
            borderRadius: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
            <span style={{ color: "#16a34a" }}><Icon name="auto_awesome" /></span>
            <strong style={{ fontSize: "12px", color: "#166534" }}>Workspace Operator</strong>
          </div>
          <p style={{ margin: 0, fontSize: "12px", color: "#1e293b" }}>{layoutFeedback}</p>
        </div>
      )}

      {/* Shared Omnibox Plan Card (D-064) */}
      {(plan || planLoading || planError) && (
        <div style={{ margin: "12px 16px", flexShrink: 0 }}>
          <OmniboxPlanCard
            plan={plan}
            loading={planLoading}
            error={planError}
            title={isScheduleView ? "Practice AI Plan" : `AI Plan · ${patient.name}`}
            onClose={() => {
              setPlan(null);
              setPlanError("");
            }}
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

          {plan?.answer && !isScheduleView && onInsertToNote && (
            <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
              <button
                type="button"
                id="ai-insert-note-btn"
                onClick={() => {
                  onInsertToNote(plan.answer!);
                  triggerToast("Inserted clinical answer into note.");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  background: "#2563eb",
                  color: "#ffffff",
                  border: 0,
                  borderRadius: "6px",
                  padding: "6px 12px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
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
                style={{
                  background: "#f1f5f9",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  padding: "6px 10px",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                Copy
              </button>
            </div>
          )}
        </div>
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
      {!plan && !planLoading && !planError && !layoutFeedback && (
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
