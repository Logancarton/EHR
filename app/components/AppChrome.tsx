"use client";

import { usePathname } from "next/navigation";
import FloatingPaneController from "./FloatingPaneController";
import GlobalWorkspaceShell from "./GlobalWorkspaceShell";
import OmniboxPlannerBridge from "./OmniboxPlannerBridge";
import PracticeQueueWorkspaceShell from "./PracticeQueueWorkspaceShell";
import ScrollExperienceManager from "./ScrollExperienceManager";
import TabPointerController from "./TabPointerController";
import WorkspaceNavigationHistory from "./WorkspaceNavigationHistory";
import WorkspaceStateManager from "./WorkspaceStateManager";
import WorkspaceWindowManager from "./WorkspaceWindowManager";
import WorkspaceKeyboardShortcuts from "./WorkspaceKeyboardShortcuts";
import { isPreviewRoute } from "../lib/preview/preview-route";

/**
 * The live workspace chrome: rails, window managers, workspace restoration.
 *
 * It is gathered here so one rule can be stated in one place — a design preview does
 * not get it. The preview routes render their own synthetic shell, and mounting the
 * real chrome underneath would put a rail over the prototype and, worse, set the
 * workspace restorer looking for tabs that are not on the page. Suppressing it is
 * also what keeps a preview visibly separate from a live record view, which DASH-12
 * asks for.
 *
 * Nothing else changes: on every ordinary route this renders exactly what the root
 * layout rendered before.
 */
export default function AppChrome() {
  if (isPreviewRoute(usePathname())) return null;

  return (
    <>
      <FloatingPaneController />
      <WorkspaceWindowManager />
      <WorkspaceStateManager />
      <WorkspaceNavigationHistory />
      <GlobalWorkspaceShell />
      <PracticeQueueWorkspaceShell />
      <ScrollExperienceManager />
      <WorkspaceKeyboardShortcuts />
      <TabPointerController />
      <OmniboxPlannerBridge />
    </>
  );
}
