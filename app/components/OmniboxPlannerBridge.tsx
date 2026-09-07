"use client";

import { useEffect, useState } from "react";
import type { OmniboxPlan, OmniboxProposal, OmniboxSurface } from "../domain/omnibox";
import { activeNavigationLocation, navigateToPatientLocation } from "../lib/workspace-navigation";

function surfaceFromWorkspace(section: string | undefined): OmniboxSurface {
  switch ((section || "").toLowerCase()) {
    case "encounter": return "encounter";
    case "labs": return "labs";
    case "meds":
    case "medications": return "medications";
    case "messages": return "messages";
    case "history": return "history";
    case "orders": return "orders";
    case "tasks": return "tasks";
    default: return "general";
  }
}

function workspaceSection(surface: OmniboxSurface): string {
  switch (surface) {
    case "encounter": return "Encounter";
    case "labs": return "Labs";
    case "medications": return "Meds";
    case "messages": return "Messages";
    case "history": return "History";
    default: return "Overview";
  }
}

function localWorkspaceCommand(query: string): boolean {
  return /\b(?:zen|balanced|cockpit|density|layout|sidebar|preset)\b/i.test(query);
}

function proposalReviewSection(proposal: OmniboxProposal): string {
  if (proposal.type === "stage_order") return proposal.parameters.orderType === "lab" ? "Labs" : "Meds";
  if (proposal.type === "draft_patient_message") return "Messages";
  return "Overview";
}

export default function OmniboxPlannerBridge() {
  const [plan, setPlan] = useState<OmniboxPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function submit(query: string) {
      const location = activeNavigationLocation();
      const activePatientId = location?.kind === "patient" ? location.patientId : undefined;
      const activeSurface = surfaceFromWorkspace(location?.kind === "patient" ? location.section : undefined);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (activePatientId) headers["x-ehr-patient-id"] = activePatientId;

      setLoading(true);
      setError("");
      setPlan(null);
      try {
        const response = await fetch("/api/ai/omnibox/plan", {
          method: "POST",
          headers,
          body: JSON.stringify({ query, activePatientId, activeSurface }),
        });
        const payload: unknown = await response.json();
        if (!payload || typeof payload !== "object") throw new Error("Omnibox planner returned an invalid response.");
        const record = payload as Record<string, unknown>;
        if (!response.ok || record.success === false) {
          throw new Error(typeof record.error === "string" ? record.error : "Omnibox planning failed.");
        }
        if (!record.plan || typeof record.plan !== "object") throw new Error("Omnibox planner returned no plan.");
        setPlan(record.plan as OmniboxPlan);
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "Omnibox planning failed.");
      } finally {
        setLoading(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.isComposing) return;
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.getAttribute("aria-label") !== "Ask AI or search the EHR") return;
      const query = input.value.trim();
      if (!query || localWorkspaceCommand(query)) return;

      // Capture Enter before the legacy local omnibox command handler so every
      // patient/clinical request crosses the authenticated server planning boundary.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void submit(query);
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  if (!loading && !error && !plan) return null;

  return (
    <aside className="omnibox-plan-overlay" aria-live="polite" aria-label="Clinical AI plan">
      <div className="omnibox-plan-card">
        <div className="omnibox-plan-header">
          <div>
            <span className="omnibox-plan-kicker">✦ Clinical AI · review boundary</span>
            <strong>{loading ? "Understanding request…" : "Review planned intent"}</strong>
          </div>
          <button type="button" onClick={() => { setPlan(null); setError(""); }} aria-label="Close AI plan">×</button>
        </div>

        {error ? <div className="omnibox-plan-error">{error}</div> : null}
        {plan ? (
          <div className="omnibox-plan-body">
            <div className="omnibox-plan-meta">
              <span>Intent: {plan.intent.kind.replaceAll("_", " ")}</span>
              <span>Confidence: {Math.round(plan.confidence * 100)}%</span>
              <span>Execution: not executed</span>
            </div>

            {plan.patient.resolved ? (
              <div className="omnibox-plan-patient">
                <strong>Patient: {plan.patient.resolved.name}</strong>
                <span>{plan.patient.resolved.source === "mentioned_patient" ? "Explicitly resolved from request" : "Using active patient workspace"}</span>
                {plan.patient.switchRequired ? <em>Different from the active patient. Any future mutation remains blocked until patient context is confirmed.</em> : null}
              </div>
            ) : null}

            {plan.clarification ? (
              <div className="omnibox-plan-blocked">
                <strong>Clarification required</strong>
                <p>{plan.clarification.message}</p>
                {plan.clarification.candidates?.length ? (
                  <small>Possible matches: {plan.clarification.candidates.map(candidate => candidate.name).join(", ")}</small>
                ) : null}
              </div>
            ) : null}

            {plan.answer ? (
              <div className="omnibox-plan-answer">
                <strong>Answer</strong>
                <p>{plan.answer}</p>
                {plan.evidence.length ? (
                  <div className="omnibox-plan-evidence">
                    {plan.evidence.slice(0, 4).map((item) => (
                      <span key={`${item.sourceRef}:${item.label}`}>{item.label} · {item.sourceRef}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {plan.navigation ? (
              <div className="omnibox-plan-action-row">
                <div><strong>Suggested navigation</strong><span>{plan.navigation.label}</span></div>
                <button
                  type="button"
                  onClick={() => {
                    const section = plan.navigation?.target === "last_encounter" ? "History" : workspaceSection(plan.navigation!.section);
                    void navigateToPatientLocation(plan.navigation!.patientId, section);
                  }}
                >Open</button>
              </div>
            ) : null}

            {plan.proposals.map((proposal) => (
              <div className={`omnibox-plan-action-row ${proposal.blockedReason ? "blocked" : ""}`} key={proposal.id}>
                <div>
                  <strong>{proposal.description}</strong>
                  <span>{proposal.permission === "allowed" ? "Review required" : `Permission denied · ${proposal.requiredPermission}`}</span>
                  {proposal.blockedReason ? <small>{proposal.blockedReason.replaceAll("_", " ")}</small> : null}
                </div>
                <button
                  type="button"
                  disabled={proposal.permission === "denied"}
                  onClick={() => {
                    if (proposal.type === "create_task") {
                      window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "tasks" } }));
                      return;
                    }
                    void navigateToPatientLocation(proposal.resolvedPatientId, proposalReviewSection(proposal));
                  }}
                >Review</button>
              </div>
            ))}

            {plan.restrictedAction ? (
              <div className="omnibox-plan-restricted">
                <strong>Restricted consequential action</strong>
                <p>{plan.restrictedAction.description}</p>
                <span>{plan.restrictedAction.permission === "denied" ? "You do not have the required permission." : "The request was understood, but AI planning cannot perform this action. Explicit human confirmation remains required in the authoritative workflow."}</span>
              </div>
            ) : null}

            <div className="omnibox-plan-safety">
              <span>Clinical mutation: none</span>
              {plan.context ? <span>Context: {plan.context.surface} · {plan.context.estimatedTokens} est. tokens{plan.context.isTruncated ? " · bounded/truncated" : ""}</span> : <span>Clinical context: not assembled</span>}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
