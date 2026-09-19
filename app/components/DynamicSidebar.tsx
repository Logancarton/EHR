"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "./ui/Icon";
import RailResizeHandle from "./ui/RailResizeHandle";
import RailContextMenu from "./ui/RailContextMenu";
import ToolPinMenu from "./ui/ToolPinMenu";
import { LEFT_RAIL, isRailRevealed, readStoredRailWidth } from "../lib/rail-resize";
import { useToolPins } from "../lib/use-tool-pins";
import { type WorkspaceTool, findTool, pinnedTools, toolSupports } from "../lib/workspace-tools";
import {
  WORKSPACE_NAVIGATION_HISTORY_STATE_EVENT,
  WORKSPACE_SIDEBAR_BADGES_EVENT,
  WORKSPACE_SIDEBAR_CLEAR_ACTIVE_EVENT,
  WORKSPACE_SIDEBAR_VISIBILITY_EVENT,
  WORKSPACE_SWITCH_VIEW_EVENT,
  dispatchWorkspaceEvent,
  subscribeWorkspaceEvent,
} from "../lib/workspace-events";
import { useWorkspaceNavigation } from "../lib/workspace-navigation-context";
import type { GlobalWorkspaceModule } from "../lib/workspace-navigation";
import { useDismissible } from "../lib/use-dismissible";

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
  const nav = useWorkspaceNavigation();
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
  // Transient shortcut drawer: collapsed by default, expanded only on request.
  const [expanded, setExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tool: WorkspaceTool;
  } | null>(null);
  // Starts at the resting width on the server and on first paint, then adopts
  // the stored width — reading localStorage during render would not match the
  // server-rendered markup.
  const [railWidth, setRailWidth] = useState(LEFT_RAIL.min);
  const railRevealed = isRailRevealed(railWidth, LEFT_RAIL);
  const launcherRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setRailWidth(readStoredRailWidth("left", LEFT_RAIL));
  }, []);

  // Reserve only a slim launcher gutter while collapsed; opening the rail nudges
  // the workspace right just enough to make room for the pinned shortcuts.
  useEffect(() => {
    const reservedWidth = visible && expanded ? railWidth : 22;
    document.documentElement.style.setProperty("--left-rail-w", `${reservedWidth}px`);
  }, [railWidth, visible, expanded]);

  const closeLauncher = useCallback(() => setLauncherOpen(false), []);

  // Clicking past the menu already closed it; Escape did not, while the right
  // rail's identical menu honoured both. One hook, so the two cannot disagree.
  useDismissible({
    active: launcherOpen,
    onDismiss: closeLauncher,
    surface: launcherRef,
    dismissOnOutsideClick: true,
  });

  useEffect(() => {
    const unsubSwitch = subscribeWorkspaceEvent(
      WORKSPACE_SWITCH_VIEW_EVENT,
      (detail) => {
        const view = detail?.view;
        if (view && findTool(view)) setActiveTool(view);
      },
    );

    const unsubClear = subscribeWorkspaceEvent(
      WORKSPACE_SIDEBAR_CLEAR_ACTIVE_EVENT,
      () => {
        setActiveTool("");
      },
    );

    const unsubBadges = subscribeWorkspaceEvent(
      WORKSPACE_SIDEBAR_BADGES_EVENT,
      (detail) => {
        if (detail) setBadges((current) => ({ ...current, ...detail }));
      },
    );

    const unsubHistory = subscribeWorkspaceEvent(
      WORKSPACE_NAVIGATION_HISTORY_STATE_EVENT,
      (detail) => {
        if (detail) setHistoryState(detail);
      },
    );

    const unsubVisibility = subscribeWorkspaceEvent(
      WORKSPACE_SIDEBAR_VISIBILITY_EVENT,
      (detail) => {
        if (typeof detail?.visible !== "boolean") return;
        setVisible(detail.visible);
        if (!detail.visible) setExpanded(false);
      },
    );

    return () => {
      unsubSwitch();
      unsubClear();
      unsubBadges();
      unsubHistory();
      unsubVisibility();
    };
  }, []);

  const selectedTools = useMemo(() => pinnedTools(pins, "left"), [pins]);

  function activateTool(tool: WorkspaceTool) {
    setActiveTool(tool.id);
    if (tool.id === "today") {
      nav.openToday();
    } else if (tool.id === "calendar" || tool.id === "schedule") {
      nav.openCalendar();
    } else {
      nav.openGlobalModule(tool.id as GlobalWorkspaceModule);
    }
    setLauncherOpen(false);
    setExpanded(false);
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

  // Only an expanded shortcut rail reserves its full column.
  useEffect(() => {
    document.body.dataset.sidebarHidden = visible && expanded ? "false" : "true";
    return () => { delete document.body.dataset.sidebarHidden; };
  }, [visible, expanded]);

  function requestVisibility(next: boolean) {
    window.dispatchEvent(
      new CustomEvent(SIDEBAR_VISIBILITY_REQUEST_EVENT, { detail: { visible: next } }),
    );
  }

  function openShortcuts() {
    if (!visible) requestVisibility(true);
    setExpanded(true);
  }

  if (!visible || !expanded) {
    return (
      <button
        type="button"
        className="sidebar-drawer-trigger"
        title="Open shortcuts"
        aria-label="Open sidebar shortcuts"
        onClick={openShortcuts}
      >
        <Icon name="view_sidebar" />
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

        {selectedTools.map((tool) => {
          const badge = badges[tool.id] || 0;
          return (
            <button
              type="button"
              key={tool.id}
              draggable
              className={`rail-item ${activeTool === tool.id ? "active" : ""} ${draggedToolId === tool.id ? "dragging" : ""} ${dropTargetId === tool.id && draggedToolId !== tool.id ? `drop-${dropPosition}` : ""}`}
              title={`Open ${tool.label}. Right-click for options, drag to reorder.`}
              onClick={() => activateTool(tool)}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  tool,
                });
              }}
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
              <span className="rail-item-label">{tool.label}</span>
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
        {/*
          The add button follows the tools rather than sitting at the foot of the
          rail. It is the end of the list — "put another one here" — so it belongs
          against the last pinned tool and moves with the list as tools are pinned
          and unpinned. Parked at the bottom it floated away from the thing it acts
          on, with a growing gap in between.

          Hiding the rail is chrome for the rail itself, not a list item, so that
          control stays anchored at the foot in `rail-bottom-cluster`.
        */}
        <div className="rail-add-cluster" ref={launcherRef}>
          <button
            type="button"
            className="rail-item-add"
            aria-label="Add or pin tools"
            title="Add or pin tools"
            onClick={() => setLauncherOpen((v) => !v)}
          >
            <Icon name="add" size="sm" />
          </button>

          {launcherOpen && (
            <div className="app-launcher-panel">
              <div className="launcher-heading">
                <div>
                  <strong>Workspaces &amp; tools</strong>
                  <small>Pin anything to this sidebar.</small>
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

        <div className="rail-bottom-cluster">
          <button
            type="button"
            className="rail-item-collapse"
            title="Collapse shortcuts"
            aria-label="Collapse sidebar shortcuts"
            onClick={() => {
              setLauncherOpen(false);
              setExpanded(false);
            }}
          >
            <Icon name="chevron_left" size="sm" />
          </button>
        </div>
      </div>

      {contextMenu && (
        <RailContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          tool={contextMenu.tool}
          side="left"
          canMoveToOpposite={toolSupports(contextMenu.tool.id, "panel")}
          onUnpin={() => togglePinnedTool("left", contextMenu.tool.id)}
          onMoveToOpposite={() => {
            togglePinnedTool("left", contextMenu.tool.id);
            togglePinnedTool("right", contextMenu.tool.id);
          }}
          onOpen={() => activateTool(contextMenu.tool)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </aside>
  );
}
