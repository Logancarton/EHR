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
export type CompanionPresentation = "docked" | "expanded";

export interface UseCompanionRailControllerOptions {
  showCompanionRail: boolean;
  companionToolIds: readonly CompanionToolId[];
  onNotify?: (message: string, holdMs?: number) => void;
  activeView?: WorkspaceView;
  initialCompanionPanel?: CompanionToolId | null;
  initialCompanionPanelOpen?: boolean;
  initialCompanionPresentation?: CompanionPresentation;
  onCompanionPanelStateChange?: (panelId: CompanionToolId | null, open: boolean) => void;
}

export interface CompanionContextMenuState {
  x: number;
  y: number;
  tool: WorkspaceTool;
}

export interface CompanionRailController {
  activeCompanionPanel: CompanionToolId | null;
  setActiveCompanionPanel: React.Dispatch<React.SetStateAction<CompanionToolId | null>>;
  companionPresentation: CompanionPresentation;
  setCompanionPresentation: React.Dispatch<React.SetStateAction<CompanionPresentation>>;
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
  expandCompanionPanel: () => void;
  redockCompanionPanel: () => void;
  toggleExpandCompanionPanel: () => void;
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
  initialCompanionPanel = null,
  initialCompanionPanelOpen = false,
  initialCompanionPresentation = "docked",
  onCompanionPanelStateChange,
}: UseCompanionRailControllerOptions): CompanionRailController {
  const initialSelectedPanel =
    initialCompanionPanel && companionToolIds.includes(initialCompanionPanel)
      ? initialCompanionPanel
      : companionToolIds[0] ?? null;
  const [lastCompanionPanel, setLastCompanionPanel] =
    useState<CompanionToolId | null>(initialSelectedPanel);
  const [activeCompanionPanel, setActiveCompanionPanel] = useState<CompanionToolId | null>(
    showCompanionRail && initialCompanionPanelOpen ? initialSelectedPanel : null,
  );
  const [companionPresentation, setCompanionPresentation] =
    useState<CompanionPresentation>(initialCompanionPresentation);
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

  const expandCompanionPanel = useCallback(() => {
    setCompanionPresentation("expanded");
  }, []);

  const redockCompanionPanel = useCallback(() => {
    setCompanionPresentation("docked");
  }, []);

  const toggleExpandCompanionPanel = useCallback(() => {
    setCompanionPresentation((prev) => (prev === "expanded" ? "docked" : "expanded"));
  }, []);

  /**
   * Selecting a tool opens the companion panel overlay at the clinician's preferred width;
   * de-selecting closes the panel back to the icon strip. Selection and open/closed
   * state are persisted by the owning workspace preferences rather than a second cache.
   */
  const closeCompanionPanel = useCallback(() => {
    const selected = activeCompanionPanel ?? lastCompanionPanel;
    setActiveCompanionPanel(null);
    setCompanionPresentation("docked");
    setCompanionRailWidth(RIGHT_RAIL.min);
    onCompanionPanelStateChange?.(selected, false);
  }, [activeCompanionPanel, lastCompanionPanel, onCompanionPanelStateChange]);

  const openCompanionPanel = useCallback(
    (id: CompanionToolId) => {
      setLastCompanionPanel(id);
      setActiveCompanionPanel(id);
      setCompanionRailWidth(RIGHT_RAIL.min + companionPanelWidth);
      onCompanionPanelStateChange?.(id, true);
    },
    [companionPanelWidth, onCompanionPanelStateChange],
  );

  const toggleCompanionPanel = useCallback(
    (id: CompanionToolId) => {
      if (activeCompanionPanel === id) {
        closeCompanionPanel();
        return;
      }
      openCompanionPanel(id);
    },
    [activeCompanionPanel, closeCompanionPanel, openCompanionPanel],
  );

  /** Pulling open or shutting the rail edge directly scales the companion panel. */
  const handleCompanionWidth = useCallback(
    (width: number) => {
      setCompanionRailWidth(width);
      if (width <= RIGHT_RAIL.min + 20) {
        if (activeCompanionPanel) {
          setActiveCompanionPanel(null);
          onCompanionPanelStateChange?.(lastCompanionPanel, false);
        }
        return;
      }
      const derivedW = Math.max(COMPANION_MIN_WIDTH, width - RIGHT_RAIL.min);
      setCompanionPanelWidth(derivedW);
      storeCompanionWidth(derivedW);
      if (!activeCompanionPanel) {
        const selected =
          (lastCompanionPanel && companionToolIds.includes(lastCompanionPanel)
            ? lastCompanionPanel
            : companionToolIds[0]) ?? "ai";
        setLastCompanionPanel(selected);
        setActiveCompanionPanel(selected);
        onCompanionPanelStateChange?.(selected, true);
      }
    },
    [
      activeCompanionPanel,
      companionToolIds,
      lastCompanionPanel,
      onCompanionPanelStateChange,
    ],
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

  // Keep remote/session preference hydration and rail hide/show in sync without
  // treating a hidden rail as the clinician closing their selected panel.
  useEffect(() => {
    const selected =
      initialCompanionPanel && companionToolIds.includes(initialCompanionPanel)
        ? initialCompanionPanel
        : lastCompanionPanel && companionToolIds.includes(lastCompanionPanel)
          ? lastCompanionPanel
          : companionToolIds[0] ?? null;
    setLastCompanionPanel(selected);

    if (!showCompanionRail || !initialCompanionPanelOpen || !selected) {
      setActiveCompanionPanel(null);
      setCompanionRailWidth(RIGHT_RAIL.min);
      return;
    }

    setActiveCompanionPanel(selected);
    setCompanionRailWidth(RIGHT_RAIL.min + companionPanelWidth);
  }, [
    companionPanelWidth,
    companionToolIds,
    initialCompanionPanel,
    initialCompanionPanelOpen,
    lastCompanionPanel,
    showCompanionRail,
  ]);

  // Unpinning the selected tool cannot leave a hidden active panel identity behind.
  useEffect(() => {
    if (lastCompanionPanel && !companionToolIds.includes(lastCompanionPanel)) {
      const next = companionToolIds[0] ?? null;
      setLastCompanionPanel(next);
      setActiveCompanionPanel(null);
      setCompanionRailWidth(RIGHT_RAIL.min);
      onCompanionPanelStateChange?.(next, false);
    }
  }, [
    companionToolIds,
    lastCompanionPanel,
    onCompanionPanelStateChange,
  ]);

  // Pressing Escape cleanly redocks an expanded panel, or dismisses a docked companion panel.
  useEffect(() => {
    if (!activeCompanionPanel) return;
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (companionPresentation === "expanded") {
          setCompanionPresentation("docked");
        } else {
          closeCompanionPanel();
        }
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [activeCompanionPanel, companionPresentation, closeCompanionPanel]);

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
    companionPresentation,
    setCompanionPresentation,
    expandCompanionPanel,
    redockCompanionPanel,
    toggleExpandCompanionPanel,
    handleCompanionWidth,
    handlePanelWidthChange,
    handleJumpCalendarDate,
  };
}
