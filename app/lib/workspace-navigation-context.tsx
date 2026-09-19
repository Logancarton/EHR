"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GlobalWorkspaceModule } from "./workspace-navigation";
import {
  GLOBAL_WORKSPACE_MODULES,
  isTabEligibleModule,
  registerNavigationController,
  type NavigationLocation,
} from "./workspace-navigation";
import {
  WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT,
  WORKSPACE_OPEN_COMMUNICATIONS_EVENT,
  WORKSPACE_SIDEBAR_CLEAR_ACTIVE_EVENT,
  WORKSPACE_SWITCH_VIEW_EVENT,
  dispatchWorkspaceEvent,
  subscribeWorkspaceEvent,
} from "./workspace-events";

export type WorkspaceView = "home" | "today" | "calendar" | "patient";

export interface PatientNavigationHandler {
  openPatient: (
    patientId: string,
    section?: string,
    options?: { documentId?: string; threadSubject?: string },
  ) => void;
  activePatientId?: string | null;
  activePatientSection?: string;
}

export interface WorkspaceNavigationController {
  activeView: WorkspaceView;
  activeModule: GlobalWorkspaceModule | null;
  openModuleTabs: GlobalWorkspaceModule[];
  activeSidebarTool: string | null;
  communicationsOpen: boolean;
  communicationsChannel: string | null;

  // Authoritative navigation commands
  openHome: () => void;
  openToday: () => void;
  openCalendar: () => void;
  openPatient: (
    patientId: string,
    section?: string,
    options?: { documentId?: string; threadSubject?: string },
  ) => void;
  openGlobalModule: (module: GlobalWorkspaceModule) => void;
  closeGlobalModule: () => void;
  closeModuleTab: (module: GlobalWorkspaceModule) => void;

  // Communications & UI coordination
  openCommunications: (channel?: string) => void;
  toggleCommunications: () => void;
  closeCommunications: () => void;
  setSidebarActiveTool: (toolId: string | null) => void;

  // Registration for patient chart surface
  registerPatientHandler: (handler: PatientNavigationHandler | null) => void;

  // Headless / programatic navigation helper
  navigateToLocation: (location: NavigationLocation) => Promise<boolean>;
}

const WorkspaceNavigationContext = createContext<WorkspaceNavigationController | null>(null);

export function useWorkspaceNavigation(): WorkspaceNavigationController {
  const context = useContext(WorkspaceNavigationContext);
  if (!context) {
    throw new Error("useWorkspaceNavigation must be used within a WorkspaceNavigationProvider");
  }
  return context;
}

export function useOptionalWorkspaceNavigation(): WorkspaceNavigationController | null {
  return useContext(WorkspaceNavigationContext);
}

export function WorkspaceNavigationProvider({
  children,
  initialView = "today",
}: {
  children: React.ReactNode;
  initialView?: WorkspaceView;
}) {
  const [activeView, setActiveView] = useState<WorkspaceView>(initialView);
  const [activeModule, setActiveModule] = useState<GlobalWorkspaceModule | null>(null);
  const [openModuleTabs, setOpenModuleTabs] = useState<GlobalWorkspaceModule[]>([]);
  const [activeSidebarTool, setActiveSidebarTool] = useState<string | null>(null);
  const [communicationsOpen, setCommunicationsOpen] = useState(false);
  const [communicationsChannel, setCommunicationsChannel] = useState<string | null>(null);

  const patientHandlerRef = useRef<PatientNavigationHandler | null>(null);

  const registerPatientHandler = useCallback((handler: PatientNavigationHandler | null) => {
    patientHandlerRef.current = handler;
  }, []);

  const openHome = useCallback(() => {
    setActiveView("home");
    setActiveModule(null);
    setActiveSidebarTool(null);
    dispatchWorkspaceEvent(WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT);
  }, []);

  const openToday = useCallback(() => {
    setActiveView("today");
    setActiveModule(null);
    setActiveSidebarTool(null);
    dispatchWorkspaceEvent(WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT);
  }, []);

  const openCalendar = useCallback(() => {
    setActiveView("calendar");
    setActiveModule(null);
    setActiveSidebarTool(null);
    dispatchWorkspaceEvent(WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT);
  }, []);

  const openGlobalModule = useCallback((module: GlobalWorkspaceModule) => {
    // Documents and labs are chart surfaces or queue overlays
    setActiveModule(module);
    setActiveSidebarTool(module);
    if (isTabEligibleModule(module)) {
      setOpenModuleTabs((prev) => (prev.includes(module) ? prev : [...prev, module]));
    }
  }, []);

  const closeGlobalModule = useCallback(() => {
    setActiveModule(null);
    setActiveSidebarTool(null);
    dispatchWorkspaceEvent(WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT);
    dispatchWorkspaceEvent(WORKSPACE_SIDEBAR_CLEAR_ACTIVE_EVENT);
  }, []);

  const closeModuleTab = useCallback(
    (mod: GlobalWorkspaceModule) => {
      setOpenModuleTabs((prev) => prev.filter((m) => m !== mod));
      if (activeModule === mod) {
        closeGlobalModule();
      }
    },
    [activeModule, closeGlobalModule],
  );

  const openPatient = useCallback(
    (
      patientId: string,
      section = "Overview",
      options?: { documentId?: string; threadSubject?: string },
    ) => {
      setActiveModule(null);
      setActiveSidebarTool(null);
      setActiveView("patient");
      dispatchWorkspaceEvent(WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT);
      if (patientHandlerRef.current) {
        patientHandlerRef.current.openPatient(patientId, section, options);
      }
    },
    [],
  );

  const openCommunications = useCallback((channel?: string) => {
    if (channel) setCommunicationsChannel(channel);
    setCommunicationsOpen(true);
    dispatchWorkspaceEvent(WORKSPACE_OPEN_COMMUNICATIONS_EVENT, { channel });
  }, []);

  const toggleCommunications = useCallback(() => {
    setCommunicationsOpen((prev) => !prev);
  }, []);

  const closeCommunications = useCallback(() => {
    setCommunicationsOpen(false);
  }, []);

  const navigateToLocation = useCallback(
    async (location: NavigationLocation): Promise<boolean> => {
      if (location.kind === "today") {
        openToday();
        return true;
      }
      if (location.kind === "module") {
        openGlobalModule(location.module);
        return true;
      }
      if (location.kind === "patient") {
        openPatient(location.patientId, location.section, {
          documentId: location.documentId,
          threadSubject: location.threadSubject,
        });
        return true;
      }
      return false;
    },
    [openToday, openGlobalModule, openPatient],
  );

  // Synchronize incoming external/test events to authoritative state
  useEffect(() => {
    const unsubSwitch = subscribeWorkspaceEvent(WORKSPACE_SWITCH_VIEW_EVENT, (detail) => {
      const view = detail.view;
      if (view === "home") {
        openHome();
      } else if (view === "today") {
        openToday();
      } else if (view === "calendar" || view === "schedule") {
        openCalendar();
      } else if (view === "patients" || view === "patient") {
        setActiveModule(null);
        setActiveView("patient");
      } else if (GLOBAL_WORKSPACE_MODULES.has(view as GlobalWorkspaceModule)) {
        openGlobalModule(view as GlobalWorkspaceModule);
      }
    });

    const unsubClose = subscribeWorkspaceEvent(WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT, () => {
      setActiveModule(null);
      setActiveSidebarTool(null);
    });

    const unsubClear = subscribeWorkspaceEvent(WORKSPACE_SIDEBAR_CLEAR_ACTIVE_EVENT, () => {
      setActiveSidebarTool(null);
    });

    const unsubOpenComm = subscribeWorkspaceEvent(WORKSPACE_OPEN_COMMUNICATIONS_EVENT, (detail) => {
      if (detail.channel) setCommunicationsChannel(detail.channel);
      setCommunicationsOpen(true);
    });

    return () => {
      unsubSwitch();
      unsubClose();
      unsubClear();
      unsubOpenComm();
    };
  }, [openHome, openToday, openCalendar, openGlobalModule]);

  const controller: WorkspaceNavigationController = useMemo(
    () => ({
      activeView,
      activeModule,
      openModuleTabs,
      activeSidebarTool,
      communicationsOpen,
      communicationsChannel,
      openHome,
      openToday,
      openCalendar,
      openPatient,
      openGlobalModule,
      closeGlobalModule,
      closeModuleTab,
      openCommunications,
      toggleCommunications,
      closeCommunications,
      setSidebarActiveTool: setActiveSidebarTool,
      registerPatientHandler,
      navigateToLocation,
    }),
    [
      activeView,
      activeModule,
      openModuleTabs,
      activeSidebarTool,
      communicationsOpen,
      communicationsChannel,
      openHome,
      openToday,
      openCalendar,
      openPatient,
      openGlobalModule,
      closeGlobalModule,
      closeModuleTab,
      openCommunications,
      toggleCommunications,
      closeCommunications,
      navigateToLocation,
    ],
  );

  // Expose controller globally for workspace-navigation.ts bridge
  useEffect(() => {
    registerNavigationController(controller);
    return () => {
      registerNavigationController(null);
    };
  }, [controller]);

  return (
    <WorkspaceNavigationContext.Provider value={controller}>
      {children}
    </WorkspaceNavigationContext.Provider>
  );
}
