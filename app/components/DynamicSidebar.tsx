"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./ui/Icon";
import RailResizeHandle from "./ui/RailResizeHandle";
import ToolPinMenu from "./ui/ToolPinMenu";
import { LEFT_RAIL, isRailRevealed, readStoredRailWidth } from "../lib/rail-resize";
import { useToolPins } from "../lib/use-tool-pins";
import { type WorkspaceTool, findTool, pinnedTools } from "../lib/workspace-tools";

type DropPosition = "before" | "after";

type HistoryState = {
  canBack: boolean;
  canForward: boolean;
};

/**
 * The sidebar renders in the root layout, outside the workspace's preference tree,
 * so visibility crosses that boundary through the same custom-event channel the
 * badge and navigation updates already use. Preferences remain the single source of
 * truth: this component asks to be collapsed and renders whatever answer comes back,
 * rather than keeping a second copy of the setting.
 */
export const SIDEBAR_VISIBILITY_EVENT = "ehr-sidebar-visibility";
export const SIDEBAR_VISIBILITY_REQUEST_EVENT = "ehr-sidebar-visibility-request";


export default function DynamicSidebar() {
  const { pins, toggle: togglePinnedTool, setSide } = useToolPins();
  const toolIds = pins.left;
  const setToolIds = (next: string[] | ((current: string[]) => string[])) =>
    setSide("left", typeof next === "function" ? next(pins.left) : next);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [activeTool, setActiveTool] = useState("today");
  const [draggedToolId, setDraggedToolId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition>("before");
  const [dropAtEnd, setDropAtEnd] = useState(false);
  const [badges, setBadges] = useState<Record<string, number>>({});
  const [historyState, setHistoryState] = useState<HistoryState>({ canBack: false, canForward: false });
  const [visible, setVisible] = useState(true);
  // Starts at the resting width on the server and on first paint, then adopts
  // the stored width — reading localStorage during render would not match the
  // server-rendered markup.
  const [railWidth, setRailWidth] = useState(LEFT_RAIL.min);
  const railRevealed = isRailRevealed(railWidth, LEFT_RAIL);
  const launcherRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setRailWidth(readStoredRailWidth("left", LEFT_RAIL));
  }, []);

  // The rail is fixed-position, but the shell reserves its column in a grid, so
  // the width has to reach the stylesheet too — otherwise the content slides
  // under the rail as it grows.
  useEffect(() => {
    document.documentElement.style.setProperty("--left-rail-w", `${railWidth}px`);
  }, [railWidth]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!launcherRef.current?.contains(event.target as Node)) {
        setLauncherOpen(false);
      }
    }

    if (launcherOpen) document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [launcherOpen]);

  useEffect(() => {
    function handleSwitch(event: Event) {
      const view = (event as CustomEvent<{ view?: string }>).detail?.view;
      if (view && findTool(view)) setActiveTool(view);
    }

    function handleClearActive() {
      setActiveTool("");
    }

    function handleBadges(event: Event) {
      const next = (event as CustomEvent<Record<string, number>>).detail || {};
      setBadges((current) => ({ ...current, ...next }));
    }

    function handleHistory(event: Event) {
      const next = (event as CustomEvent<HistoryState>).detail;
      if (next) setHistoryState(next);
    }

    function handleVisibility(event: Event) {
      const next = (event as CustomEvent<{ visible?: boolean }>).detail;
      if (typeof next?.visible === "boolean") setVisible(next.visible);
    }

    window.addEventListener("ehr-switch-view", handleSwitch);
    window.addEventListener("ehr-sidebar-clear-active", handleClearActive);
    window.addEventListener("ehr-sidebar-badges", handleBadges);
    window.addEventListener("ehr-navigation-history-state", handleHistory);
    window.addEventListener(SIDEBAR_VISIBILITY_EVENT, handleVisibility);
    return () => {
      window.removeEventListener("ehr-switch-view", handleSwitch);
      window.removeEventListener("ehr-sidebar-clear-active", handleClearActive);
      window.removeEventListener("ehr-sidebar-badges", handleBadges);
      window.removeEventListener("ehr-navigation-history-state", handleHistory);
      window.removeEventListener(SIDEBAR_VISIBILITY_EVENT, handleVisibility);
    };
  }, []);

  const selectedTools = useMemo(() => pinnedTools(pins, "left"), [pins]);

  function activateTool(tool: WorkspaceTool) {
    setActiveTool(tool.id);
    window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: tool.id } }));
  }

  function clearDragState() {
    setDraggedToolId(null);
    setDropTargetId(null);
    setDropAtEnd(false);
  }

  function moveTool(targetId: string, position: DropPosition) {
    if (!draggedToolId || draggedToolId === targetId) {
      clearDragState();
      return;
    }

    setToolIds((current) => {
      const withoutDragged = current.filter((id) => id !== draggedToolId);
      const targetIndex = withoutDragged.indexOf(targetId);
      if (targetIndex < 0) return current;

      const insertionIndex = position === "after" ? targetIndex + 1 : targetIndex;
      const next = [...withoutDragged];
      next.splice(insertionIndex, 0, draggedToolId);
      return next;
    });
    clearDragState();
  }

  function moveToolToEnd() {
    if (!draggedToolId) return;
    setToolIds((current) => [...current.filter((id) => id !== draggedToolId), draggedToolId]);
    clearDragState();
  }

  // The shell reserves a fixed column for the rail, so the layout has to know the
  // rail is gone or the space it occupied stays empty.
  useEffect(() => {
    document.body.dataset.sidebarHidden = visible ? "false" : "true";
    return () => { delete document.body.dataset.sidebarHidden; };
  }, [visible]);

  function requestVisibility(next: boolean) {
    window.dispatchEvent(
      new CustomEvent(SIDEBAR_VISIBILITY_REQUEST_EVENT, { detail: { visible: next } }),
    );
  }

  // Collapsing must never be a one-way door: a hidden sidebar leaves behind a slim
  // handle rather than disappearing with no way back.
  if (!visible) {
    return (
      <button
        type="button"
        className="sidebar-reopen-handle"
        title="Show sidebar"
        aria-label="Show sidebar"
        onClick={() => requestVisibility(true)}
      >
        ›
      </button>
    );
  }

  return (
    <aside
      className={`dynamic-left-rail ${railRevealed ? "revealed" : ""} ${launcherOpen ? "menu-open" : ""}`}
      aria-label="Customizable EHR sidebar"
      style={{ width: `${railWidth}px` }}
    >
      <RailResizeHandle
        side="left"
        width={railWidth}
        geometry={LEFT_RAIL}
        onWidth={setRailWidth}
        label="Resize sidebar"
      />
      <div className="dynamic-rail-tools">
        <div className="rail-launcher-anchor rail-launcher-top" ref={launcherRef}>
          <button
            type="button"
            className={`app-launcher-button ${launcherOpen ? "active" : ""}`}
            aria-label="Customize sidebar"
            aria-expanded={launcherOpen}
            title="Add or remove workspace tools"
            onClick={() => setLauncherOpen((value) => !value)}
          >
            <span className="nine-dot-grid" aria-hidden="true">
              {Array.from({ length: 9 }).map((_, index) => <i key={index} />)}
            </span>
          </button>

          {launcherOpen && (
            <div className="app-launcher-panel">
              <div className="launcher-heading">
                <div>
                  <strong>Workspaces &amp; tools</strong>
                  <small>Pin anything to either rail. Patient charts are opened from search rather than occupying permanent rail space.</small>
                </div>
                <button type="button" aria-label="Close" onClick={() => setLauncherOpen(false)}><Icon name="close" /></button>
              </div>

              <ToolPinMenu
                pins={pins}
                onToggle={togglePinnedTool}
                origin="left"
                onOpenTool={(id) => {
                  const tool = findTool(id);
                  if (!tool) return;
                  activateTool(tool);
                  setLauncherOpen(false);
                }}
              />
            </div>
          )}
        </div>

        <div className="rail-history-controls" aria-label="Workspace navigation history">
          <button
            type="button"
            disabled={!historyState.canBack}
            title="Back"
            aria-label="Back"
            onClick={() => window.dispatchEvent(new CustomEvent("ehr-nav-back"))}
          >←</button>
          <button
            type="button"
            disabled={!historyState.canForward}
            title="Forward"
            aria-label="Forward"
            onClick={() => window.dispatchEvent(new CustomEvent("ehr-nav-forward"))}
          >→</button>
        </div>

        <button
          type="button"
          className="rail-collapse-btn"
          title="Hide sidebar"
          aria-label="Hide sidebar"
          onClick={() => requestVisibility(false)}
        >
          ‹
        </button>

        <div className="rail-divider" />

        {selectedTools.map((tool) => {
          const badge = badges[tool.id] || 0;
          return (
            <button
              type="button"
              key={tool.id}
              draggable
              className={`rail-item ${activeTool === tool.id ? "active" : ""} ${draggedToolId === tool.id ? "dragging" : ""} ${dropTargetId === tool.id && draggedToolId !== tool.id ? `drop-${dropPosition}` : ""}`}
              title={`Open ${tool.label}. Drag to reorder.`}
              onClick={() => activateTool(tool)}
              onDragStart={(event) => {
                setDraggedToolId(tool.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", tool.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const rect = event.currentTarget.getBoundingClientRect();
                setDropTargetId(tool.id);
                setDropPosition(event.clientY >= rect.top + rect.height / 2 ? "after" : "before");
                setDropAtEnd(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                moveTool(tool.id, dropPosition);
              }}
              onDragEnd={clearDragState}
            >
              <span><Icon name={tool.icon} /></span>
              {tool.label}
              {badge > 0 ? <em>{badge > 99 ? "99+" : badge}</em> : null}
            </button>
          );
        })}

        <div
          className={`rail-end-drop-zone ${draggedToolId ? "visible" : ""} ${dropAtEnd ? "active" : ""}`}
          onDragEnter={(event) => {
            if (!draggedToolId) return;
            event.preventDefault();
            setDropAtEnd(true);
            setDropTargetId(null);
          }}
          onDragOver={(event) => {
            if (!draggedToolId) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropAtEnd(true);
          }}
          onDragLeave={() => setDropAtEnd(false)}
          onDrop={(event) => {
            event.preventDefault();
            moveToolToEnd();
          }}
        >
          {draggedToolId ? "Move to bottom" : ""}
        </div>
      </div>
    </aside>
  );
}
