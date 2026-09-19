"use client";

import { useCallback, useEffect, useState } from "react";
import type { Patient } from "../domain/patient";
import { SYSTEM_DEFAULT_LANDING_VIEW } from "./preference-engine";
import {
  GLOBAL_WORKSPACE_MODULES,
  isTabEligibleModule,
  type GlobalWorkspaceModule,
} from "./workspace-navigation";
import {
  WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT,
  WORKSPACE_SWITCH_VIEW_EVENT,
  dispatchWorkspaceEvent,
  subscribeWorkspaceEvent,
} from "./workspace-events";
import type { WorkspaceView } from "./use-patient-tabs";

export interface UsePersistentWorkspaceTabsOptions {
  activeView: WorkspaceView;
  setActiveView: (view: WorkspaceView) => void;
  activePatient: Patient | null | undefined;
  preferences: { defaultLandingView?: string };
}

export interface PersistentWorkspaceTabs {
  openModuleView: GlobalWorkspaceModule | null;
  globalModuleOpen: boolean;
  openModuleTabs: GlobalWorkspaceModule[];
  dashboardTabOpen: boolean;
  calendarTabOpen: boolean;
  setDashboardTabOpen: (open: boolean) => void;
  setCalendarTabOpen: (open: boolean) => void;
  goToWorkspaceView: (view: WorkspaceView) => void;
  closeModuleTab: (mod: GlobalWorkspaceModule) => void;
  closeCalendarTab: () => void;
  closeDashboardTab: () => void;
}

/**
 * Coordinates persistent non-patient workspace tabs (Dashboard, Calendar, and
 * global-module overlays like Inbox, Tasks, Billing) and workspace-level view changes.
 *
 * Extracted from PatientWorkspace to cleanly separate application-level tab/module
 * lifecycle from chart-specific state.
 */
export function usePersistentWorkspaceTabs({
  activeView,
  setActiveView,
  activePatient,
  preferences,
}: UsePersistentWorkspaceTabsOptions): PersistentWorkspaceTabs {
  const [openModuleView, setOpenModuleView] = useState<GlobalWorkspaceModule | null>(null);
  const globalModuleOpen = Boolean(openModuleView);
  const [openModuleTabs, setOpenModuleTabs] = useState<GlobalWorkspaceModule[]>([]);

  /**
   * Dashboard and Calendar are independent workspace tabs. Opening either keeps it
   * available while the clinician moves through patient charts, just like an open
   * browser tab.
   */
  const [dashboardTabOpen, setDashboardTabOpen] = useState(
    () => (preferences.defaultLandingView ?? SYSTEM_DEFAULT_LANDING_VIEW) === "today",
  );
  const [calendarTabOpen, setCalendarTabOpen] = useState(false);

  useEffect(() => {
    if (activeView === "today") setDashboardTabOpen(true);
    if (activeView === "calendar") setCalendarTabOpen(true);
  }, [activeView]);

  /**
   * Going to a workspace view also leaves whatever global module is open.
   * Dispatches ehr-global-module-close so any active overlay drops its presentation
   * and the rail drops its highlight.
   */
  const goToWorkspaceView = useCallback(
    (view: WorkspaceView) => {
      setActiveView(view);
      dispatchWorkspaceEvent(WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT);
    },
    [setActiveView],
  );

  /**
   * If an active patient is closed or unavailable, safe landing is Home rather
   * than an empty chart shell.
   */
  useEffect(() => {
    if (activeView === "patient" && !activePatient) {
      setActiveView("home");
    }
  }, [activeView, activePatient, setActiveView]);

  /**
   * Falls back to whichever other persistent tab is actually open, in fixed priority order:
   * Dashboard -> Calendar -> Patient -> Home.
   */
  const fallbackFromClosedModuleTab = useCallback(() => {
    if (dashboardTabOpen) goToWorkspaceView("today");
    else if (calendarTabOpen) goToWorkspaceView("calendar");
    else if (activePatient) goToWorkspaceView("patient");
    else goToWorkspaceView("home");
  }, [dashboardTabOpen, calendarTabOpen, activePatient, goToWorkspaceView]);

  /**
   * Closes a module tab. If it was the active one, the overlay itself is closed
   * via fallback navigation; otherwise it was already in the background.
   */
  const closeModuleTab = useCallback(
    (mod: GlobalWorkspaceModule) => {
      setOpenModuleTabs((prev) => prev.filter((m) => m !== mod));
      if (openModuleView === mod) fallbackFromClosedModuleTab();
    },
    [openModuleView, fallbackFromClosedModuleTab],
  );

  const closeCalendarTab = useCallback(() => {
    setCalendarTabOpen(false);
    if (activeView === "calendar") {
      if (dashboardTabOpen) goToWorkspaceView("today");
      else if (activePatient) goToWorkspaceView("patient");
      else goToWorkspaceView("home");
    }
  }, [activeView, dashboardTabOpen, activePatient, goToWorkspaceView]);

  const closeDashboardTab = useCallback(() => {
    setDashboardTabOpen(false);
    goToWorkspaceView("home");
  }, [goToWorkspaceView]);

  useEffect(() => {
    const unsubSwitch = subscribeWorkspaceEvent(
      WORKSPACE_SWITCH_VIEW_EVENT,
      (detail) => {
        const view = detail?.view;
        if (!view) return;

        if (view === "home") {
          setActiveView("home");
        } else if (view === "today") {
          setActiveView("today");
        } else if (view === "calendar" || view === "schedule") {
          setActiveView("calendar");
        } else if (view === "patients") {
          setActiveView("patient");
        }

        // Documents and labs are chart surfaces reached through the same event, not
        // module workspaces, and they close any module rather than being one.
        if (view === "documents" || view === "labs") {
          setOpenModuleView(null);
          return;
        }

        if (!GLOBAL_WORKSPACE_MODULES.has(view as GlobalWorkspaceModule)) return;
        const moduleId = view as GlobalWorkspaceModule;
        setOpenModuleView(moduleId);
        if (isTabEligibleModule(moduleId)) {
          setOpenModuleTabs((prev) => (prev.includes(moduleId) ? prev : [...prev, moduleId]));
        }
      },
    );

    const unsubClose = subscribeWorkspaceEvent(
      WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT,
      () => {
        setOpenModuleView(null);
      },
    );

    return () => {
      unsubSwitch();
      unsubClose();
    };
  }, [setActiveView]);

  return {
    openModuleView,
    globalModuleOpen,
    openModuleTabs,
    dashboardTabOpen,
    calendarTabOpen,
    setDashboardTabOpen,
    setCalendarTabOpen,
    goToWorkspaceView,
    closeModuleTab,
    closeCalendarTab,
    closeDashboardTab,
  };
}
