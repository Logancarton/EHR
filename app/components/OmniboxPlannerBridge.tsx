"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OmniboxPlan, OmniboxSurface, OmniboxWorkspaceTarget } from "../domain/omnibox";
import { activeNavigationLocation, navigateToPatientLocation } from "../lib/workspace-navigation";
import { OMNIBOX_PLAN_SUBMITTED_EVENT, omniboxPlanFailureMessage, requestOmniboxPlan } from "../lib/omnibox-plan-client";
import { useWorkspaceNavigation } from "../lib/workspace-navigation-context";
import { useDismissible } from "../lib/use-dismissible";
import OmniboxPlanCard, { type OmniboxDeferConfirmation, workspaceSectionForSurface } from "./omnibox/OmniboxPlanCard";
import type { CareCompletionDeferralReasonCode } from "../domain/care-completion";
import { announceCareCompletionChange, careCompletionApi } from "../lib/care-completion-api";
import {
  WORKSPACE_OPEN_COMMUNICATIONS_EVENT,
  WORKSPACE_SWITCH_VIEW_EVENT,
  dispatchWorkspaceEvent,
} from "../lib/workspace-events";

function surfaceFromWorkspace(section: string | undefined): OmniboxSurface {
  switch ((section || "").toLowerCase()) {
    case "encounter": return "encounter";
    case "documents": return "documents";
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


/**
 * Executes a confirmed deferral.
 *
 * The one place the AI path may write, and only after the clinician has looked
 * at the resolved patient, item and reason on the card and pressed the button.
 * The call carries the resolved `itemKey` the server produced from the
 * patient's live board, never a phrase from the transcript, and the server
 * re-validates that the item is still there and still deferrable before it
 * records anything.
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

export default function OmniboxPlannerBridge() {
  const nav = useWorkspaceNavigation();
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


  const openWorkspaceTarget = useCallback(
    (target: OmniboxWorkspaceTarget) => {
      const destination = target.navigation;
      if (destination.kind === "patient") {
        void navigateToPatientLocation(
          destination.patientId,
          workspaceSectionForSurface(destination.section),
          undefined,
          destination.documentId,
        );
      } else if (destination.kind === "module") {
        nav.openGlobalModule(destination.module);
      } else if (destination.kind === "communication") {
        dispatchWorkspaceEvent(WORKSPACE_OPEN_COMMUNICATIONS_EVENT, {
          channel: "team",
          partnerId: destination.partnerId,
        });
      } else if (destination.view === "home") {
        nav.openHome();
      } else if (destination.view === "today") {
        nav.openToday();
      } else if (destination.view === "calendar") {
        nav.openCalendar();
      } else {
        dispatchWorkspaceEvent(WORKSPACE_SWITCH_VIEW_EVENT, { view: "patients" });
      }
      dismiss();
    },
    [dismiss, nav],
  );

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
        const next = await requestOmniboxPlan({ query, activePatientId, activeSurface });
        // Opening a chart is read-only. When the request resolved to exactly one
        // patient and asks for nothing else, Enter goes there instead of showing
        // a card whose only content is an "Open" button.
        if (
          next.intent.kind === "navigate_patient" &&
          next.navigation &&
          next.proposals.length === 0 &&
          !next.answer &&
          !next.clarification &&
          !next.restrictedAction
        ) {
          const navigation = next.navigation;
          const section = navigation.target === "last_encounter" ? "History" : workspaceSectionForSurface(navigation.section);
          (document.activeElement as HTMLElement | null)?.blur?.();
          await navigateToPatientLocation(navigation.patientId, section);
          return;
        }
        setPlan(next);
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
      window.dispatchEvent(new CustomEvent(OMNIBOX_PLAN_SUBMITTED_EVENT, { detail: { query } }));
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
          nav.openGlobalModule("tasks");
        }}
        onOpenWorkspaceTarget={openWorkspaceTarget}
        onConfirmDefer={confirmDeferral}
      />
    </aside>
  );
}
