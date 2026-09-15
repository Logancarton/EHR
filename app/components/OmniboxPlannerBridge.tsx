"use client";

import { useEffect, useState } from "react";
import type { OmniboxPlan, OmniboxSurface } from "../domain/omnibox";
import { activeNavigationLocation, navigateToPatientLocation } from "../lib/workspace-navigation";
import { omniboxPlanFailureMessage, requestOmniboxPlan } from "../lib/omnibox-plan-client";
import OmniboxPlanCard from "./omnibox/OmniboxPlanCard";

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

function localWorkspaceCommand(query: string): boolean {
  return /\b(?:zen|balanced|cockpit|density|layout|sidebar|preset)\b/i.test(query);
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

      setLoading(true);
      setError("");
      setPlan(null);
      try {
        setPlan(await requestOmniboxPlan({ query, activePatientId, activeSurface }));
      } catch (cause: unknown) {
        setError(omniboxPlanFailureMessage(cause));
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
      <OmniboxPlanCard
        plan={plan}
        loading={loading}
        error={error}
        onClose={() => { setPlan(null); setError(""); }}
        onOpenPatient={(patientId, section) => { void navigateToPatientLocation(patientId, section); }}
        onOpenTasks={() => {
          window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "tasks" } }));
        }}
      />
    </aside>
  );
}
