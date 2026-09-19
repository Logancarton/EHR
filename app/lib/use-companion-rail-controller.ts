"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { RIGHT_RAIL } from "./rail-resize";
import {
  COMPANION_MIN_WIDTH,
  readStoredCompanionWidth,
  storeCompanionWidth,
} from "../components/ui/CompanionResizeHandle";
import type { WorkspaceTool } from "./workspace-tools";
import { formatTargetDateDisplay } from "./schedule-data";
import {
  WORKSPACE_CALENDAR_JUMP_DATE_EVENT,
  dispatchWorkspaceEvent,
} from "./workspace-events";
import type { WorkspaceView } from "./use-patient-tabs";

export type CompanionToolId = string;

export interface UseCompanionRailControllerOptions {
  showCompanionRail: boolean;
  companionToolIds: readonly CompanionToolId[];
  onNotify?: (message: string, holdMs?: number) => void;
  activeView?: WorkspaceView;
}

export interface CompanionContextMenuState {
  x: number;
  y: number;
  tool: WorkspaceTool;
}

export interface CompanionRailController {
  activeCompanionPanel: CompanionToolId | null;
  setActiveCompanionPanel: React.Dispatch<React.SetStateAction<CompanionToolId | null>>;
  companionRailWidth: number;
  setCompanionRailWidth: React.Dispatch<React.SetStateAction<number>>;
  companionPanelWidth: number;
  setCompanionPanelWidth: React.Dispatch<React.SetStateAction<number>>;
  addToolMenuOpen: boolean;
  setAddToolMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  companionContextMenu: CompanionContextMenuState | null;
  setCompanionContextMenu: React.Dispatch<React.SetStateAction<CompanionContextMenuState | null>>;
  calendarJumpDate: string | null;
  setCalendarJumpDate: React.Dispatch<React.SetStateAction<string | null>>;
  companionAddRef: RefObject<HTMLDivElement | null>;
  openCompanionPanel: (id: CompanionToolId) => void;
  closeCompanionPanel: () => void;
  toggleCompanionPanel: (id: CompanionToolId) => void;
  handleCompanionWidth: (width: number) => void;
  handlePanelWidthChange: (newWidth: number) => void;
  handleJumpCalendarDate: (targetDate: string, daysLater?: number) => void;
}

/**
 * Owns companion rail state (active panel, widths, menus, calendar jumps, and CSS variables).
 */
export function useCompanionRailController({
  showCompanionRail,
  companionToolIds,
  onNotify,
  activeView,
}: UseCompanionRailControllerOptions): CompanionRailController {
  const [activeCompanionPanel, setActiveCompanionPanel] = useState<CompanionToolId | null>(null);
  const [addToolMenuOpen, setAddToolMenuOpen] = useState(false);
  const [companionContextMenu, setCompanionContextMenu] = useState<CompanionContextMenuState | null>(null);
  const [companionRailWidth, setCompanionRailWidth] = useState(RIGHT_RAIL.min);
  const [companionPanelWidth, setCompanionPanelWidth] = useState(() => readStoredCompanionWidth());
  const [calendarJumpDate, setCalendarJumpDate] = useState<string | null>(null);
  const companionAddRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stored = readStoredCompanionWidth();
    if (stored >= COMPANION_MIN_WIDTH) {
      setCompanionPanelWidth(stored);
    }
  }, []);

  /**
   * Selecting a tool opens the companion panel overlay at the clinician's preferred width;
   * de-selecting closes the panel back to the icon strip.
   */
  const closeCompanionPanel = useCallback(() => {
    setActiveCompanionPanel(null);
    setCompanionRailWidth(RIGHT_RAIL.min);
  }, []);

  const openCompanionPanel = useCallback(
    (id: CompanionToolId) => {
      setActiveCompanionPanel(id);
      setCompanionRailWidth(RIGHT_RAIL.min + companionPanelWidth);
    },
    [companionPanelWidth],
  );

  const toggleCompanionPanel = useCallback(
    (id: CompanionToolId) => {
      setActiveCompanionPanel((current) => {
        const next = current === id ? null : id;
        setCompanionRailWidth(next ? RIGHT_RAIL.min + companionPanelWidth : RIGHT_RAIL.min);
        return next;
      });
    },
    [companionPanelWidth],
  );

  /** Pulling open or shutting the rail edge directly scales the companion panel. */
  const handleCompanionWidth = useCallback(
    (width: number) => {
      setCompanionRailWidth(width);
      if (width <= RIGHT_RAIL.min + 20) {
        setActiveCompanionPanel(null);
        return;
      }
      const derivedW = Math.max(COMPANION_MIN_WIDTH, width - RIGHT_RAIL.min);
      setCompanionPanelWidth(derivedW);
      storeCompanionWidth(derivedW);
      setActiveCompanionPanel((current) => current ?? companionToolIds[0] ?? "ai");
    },
    [companionToolIds],
  );

  const handlePanelWidthChange = useCallback((newWidth: number) => {
    setCompanionPanelWidth(newWidth);
    setCompanionRailWidth(RIGHT_RAIL.min + newWidth);
    storeCompanionWidth(newWidth);
  }, []);

  /**
   * Jumps the practice calendar or right-rail companion panel to a target date,
   * keeping the clinician in their current patient chart context if desired.
   */
  const handleJumpCalendarDate = useCallback(
    (targetDate: string, daysLater?: number) => {
      setCalendarJumpDate(targetDate);
      if (activeView === "calendar") {
        dispatchWorkspaceEvent(WORKSPACE_CALENDAR_JUMP_DATE_EVENT, { date: targetDate, daysLater });
      } else {
        openCompanionPanel("calendar");
        dispatchWorkspaceEvent(WORKSPACE_CALENDAR_JUMP_DATE_EVENT, { date: targetDate, daysLater });
      }
      const formatted = formatTargetDateDisplay(targetDate);
      const daysHint = daysLater ? ` (${daysLater} days later)` : "";
      onNotify?.(`Pulled up calendar for ${formatted}${daysHint}`, 4000);
    },
    [activeView, openCompanionPanel, onNotify],
  );

  // Synchronize CSS custom properties for companion panel overlay width and rail strip
  useEffect(() => {
    const isPanelOpen = activeCompanionPanel !== null && showCompanionRail;
    const totalW = showCompanionRail
      ? (isPanelOpen ? RIGHT_RAIL.min + companionPanelWidth : RIGHT_RAIL.min)
      : 22;
    document.documentElement.style.setProperty("--right-rail-w", `${totalW}px`);
    document.documentElement.style.setProperty("--companion-w", `${companionPanelWidth}px`);
  }, [activeCompanionPanel, companionPanelWidth, showCompanionRail]);

  // Unpinning the tool whose panel is open would otherwise leave the panel up
  // with no rail button to close it.
  useEffect(() => {
    if (activeCompanionPanel && !companionToolIds.includes(activeCompanionPanel)) {
      setActiveCompanionPanel(null);
      setCompanionRailWidth(RIGHT_RAIL.min);
    }
  }, [companionToolIds, activeCompanionPanel]);

  // Pressing Escape anywhere cleanly dismisses the active companion panel unless a modal is open.
  useEffect(() => {
    if (!activeCompanionPanel) return;
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeCompanionPanel();
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [activeCompanionPanel, closeCompanionPanel]);

  // Hiding the companion tools means hiding the tools, not just their launcher.
  useEffect(() => {
    if (!showCompanionRail) {
      setActiveCompanionPanel(null);
      setCompanionRailWidth(RIGHT_RAIL.min);
    }
  }, [showCompanionRail]);

  // Click outside and escape handling for Add Tool dropdown
  useEffect(() => {
    if (!addToolMenuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!companionAddRef.current?.contains(event.target as Node)) {
        setAddToolMenuOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAddToolMenuOpen(false);
      }
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKey);
    };
  }, [addToolMenuOpen]);

  return {
    activeCompanionPanel,
    setActiveCompanionPanel,
    companionRailWidth,
    setCompanionRailWidth,
    companionPanelWidth,
    setCompanionPanelWidth,
    addToolMenuOpen,
    setAddToolMenuOpen,
    companionContextMenu,
    setCompanionContextMenu,
    calendarJumpDate,
    setCalendarJumpDate,
    companionAddRef,
    openCompanionPanel,
    closeCompanionPanel,
    toggleCompanionPanel,
    handleCompanionWidth,
    handlePanelWidthChange,
    handleJumpCalendarDate,
  };
}
