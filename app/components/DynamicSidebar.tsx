"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SidebarTool = {
  id: string;
  label: string;
  icon: string;
};

type DropPosition = "before" | "after";

type HistoryState = {
  canBack: boolean;
  canForward: boolean;
};

const STORAGE_KEY = "ehr-sidebar-tools-v1";

const toolCatalog: SidebarTool[] = [
  { id: "today", label: "Today", icon: "⌂" },
  { id: "schedule", label: "Schedule", icon: "□" },
  { id: "inbox", label: "Inbox", icon: "✉" },
  { id: "tasks", label: "Tasks", icon: "✓" },
  { id: "documents", label: "Documents", icon: "▤" },
  { id: "labs", label: "Labs", icon: "⌁" },
  { id: "billing", label: "Billing", icon: "$" },
  { id: "reports", label: "Reports", icon: "▥" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

const defaultToolIds = ["today", "schedule", "inbox", "tasks"];

function readStoredTools() {
  if (typeof window === "undefined") return defaultToolIds;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultToolIds;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return defaultToolIds;

    const filtered = parsed.filter(
      (value): value is string =>
        typeof value === "string" && toolCatalog.some((tool) => tool.id === value),
    );
    return filtered.length ? filtered : defaultToolIds;
  } catch {
    return defaultToolIds;
  }
}

export default function DynamicSidebar() {
  const [toolIds, setToolIds] = useState<string[]>(defaultToolIds);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [activeTool, setActiveTool] = useState("today");
  const [draggedToolId, setDraggedToolId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition>("before");
  const [dropAtEnd, setDropAtEnd] = useState(false);
  const [badges, setBadges] = useState<Record<string, number>>({});
  const [historyState, setHistoryState] = useState<HistoryState>({ canBack: false, canForward: false });
  const launcherRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedStoredTools = useRef(false);

  useEffect(() => {
    setToolIds(readStoredTools());
    hasLoadedStoredTools.current = true;
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredTools.current) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toolIds));
  }, [toolIds]);

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
      if (view && toolCatalog.some((tool) => tool.id === view)) setActiveTool(view);
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

    window.addEventListener("ehr-switch-view", handleSwitch);
    window.addEventListener("ehr-sidebar-clear-active", handleClearActive);
    window.addEventListener("ehr-sidebar-badges", handleBadges);
    window.addEventListener("ehr-navigation-history-state", handleHistory);
    return () => {
      window.removeEventListener("ehr-switch-view", handleSwitch);
      window.removeEventListener("ehr-sidebar-clear-active", handleClearActive);
      window.removeEventListener("ehr-sidebar-badges", handleBadges);
      window.removeEventListener("ehr-navigation-history-state", handleHistory);
    };
  }, []);

  const selectedTools = useMemo(
    () => toolIds.map((id) => toolCatalog.find((tool) => tool.id === id)).filter(Boolean) as SidebarTool[],
    [toolIds],
  );

  function toggleTool(id: string) {
    const removing = toolIds.includes(id);
    const next = removing ? toolIds.filter((toolId) => toolId !== id) : [...toolIds, id];
    setToolIds(next.length ? next : defaultToolIds);
    if (removing && activeTool === id) setActiveTool("");
  }

  function activateTool(tool: SidebarTool) {
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

  return (
    <aside className="dynamic-left-rail" aria-label="Customizable EHR sidebar">
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
                  <strong>Customize sidebar</strong>
                  <small>Add or remove global workspaces. Patient charts are opened from search instead of occupying permanent sidebar space.</small>
                </div>
                <button type="button" aria-label="Close" onClick={() => setLauncherOpen(false)}>×</button>
              </div>

              <div className="launcher-grid">
                {toolCatalog.map((tool) => {
                  const selected = toolIds.includes(tool.id);
                  return (
                    <button
                      type="button"
                      key={tool.id}
                      className={`launcher-tool ${selected ? "selected" : ""}`}
                      aria-pressed={selected}
                      onClick={() => toggleTool(tool.id)}
                    >
                      <span className="launcher-tool-icon">{tool.icon}</span>
                      <span>
                        <strong>{tool.label}</strong>
                        <small>{selected ? "Remove" : "Add"}</small>
                      </span>
                      <span className="launcher-action">{selected ? "−" : "+"}</span>
                    </button>
                  );
                })}
              </div>
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
              <span>{tool.icon}</span>
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
