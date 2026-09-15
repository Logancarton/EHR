"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OmniboxPlan, OmniboxSurface } from "../domain/omnibox";
import { activeNavigationLocation, navigateToPatientLocation } from "../lib/workspace-navigation";
import { omniboxPlanFailureMessage, requestOmniboxPlan } from "../lib/omnibox-plan-client";
import { useDismissible } from "../lib/use-dismissible";
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
  const cardRef = useRef<HTMLDivElement | null>(null);
  /**
   * Dismissal is its own state rather than the absence of a plan.
   *
   * Clearing the plan is not enough to close the card: a request still in flight
   * keeps it up through `loading`, and its answer would then reopen it. Someone who
   * has put the card away has put it away, so a late answer to the question they
   * abandoned stays away too.
   */
  const [dismissed, setDismissed] = useState(false);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setPlan(null);
    setError("");
  }, []);

  const showing = !dismissed && (loading || Boolean(error) || Boolean(plan));

  useEffect(() => {
    async function submit(query: string) {
      const location = activeNavigationLocation();
      const activePatientId = location?.kind === "patient" ? location.patientId : undefined;
      const activeSurface = surfaceFromWorkspace(location?.kind === "patient" ? location.section : undefined);

      setDismissed(false);
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

  // An answer floating over the work is a popover: Escape and a click past it both
  // put it away. It had neither, so the × was the only exit from it.
  // `dismissFromTextEntry`: the card opens while the cursor is still in the omnibox
  // that asked the question, so guarding text fields would make Escape do nothing
  // at the moment it is most wanted.
  useDismissible({
    active: showing,
    onDismiss: dismiss,
    surface: cardRef,
    dismissOnOutsideClick: true,
    dismissFromTextEntry: true,
  });

  if (!showing) return null;

  return (
    <aside className="omnibox-plan-overlay" aria-live="polite" aria-label="Clinical AI plan">
      <OmniboxPlanCard
        plan={plan}
        loading={loading}
        error={error}
        cardRef={cardRef}
        onClose={dismiss}
        onOpenPatient={(patientId, section) => { void navigateToPatientLocation(patientId, section); }}
        onOpenTasks={() => {
          window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "tasks" } }));
        }}
      />
    </aside>
  );
}
