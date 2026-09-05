"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SidebarTool = {
  id: string;
  label: string;
  icon: string;
  badge?: number;
};

type DropPosition = "before" | "after";

const STORAGE_KEY = "ehr-sidebar-tools-v1";

const toolCatalog: SidebarTool[] = [
  { id: "today", label: "Today", icon: "⌂" },
  { id: "patients", label: "Patients", icon: "◉" },
  { id: "schedule", label: "Schedule", icon: "□" },
  { id: "inbox", label: "Inbox", icon: "✉", badge: 3 },
  { id: "tasks", label: "Tasks", icon: "✓", badge: 5 },
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

    return parsed.filter(
      (value): value is string =>
        typeof value === "string" && toolCatalog.some((tool) => tool.id === value),
    );
  } catch {
    return defaultToolIds;
  }
}

export default function DynamicSidebar() {
  const [toolIds, setToolIds] = useState<string[]>(defaultToolIds);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [activeTool, setActiveTool] = useState("today");
  const [statusMessage, setStatusMessage] = useState("");
  const [draggedToolId, setDraggedToolId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition>("before");
  const [dropAtEnd, setDropAtEnd] = useState(false);
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

  const selectedTools = useMemo(
    () => toolIds.map((id) => toolCatalog.find((tool) => tool.id === id)).filter(Boolean) as SidebarTool[],
    [toolIds],
  );

  function toggleTool(id: string) {
    const removing = toolIds.includes(id);
    const next = removing ? toolIds.filter((toolId) => toolId !== id) : [...toolIds, id];

    setToolIds(next);
    if (removing && activeTool === id) setActiveTool(next[0] ?? "");
  }

  function activateTool(tool: SidebarTool) {
    setActiveTool(tool.id);
    setStatusMessage(tool.id === "today" ? "" : `${tool.label} workspace is not connected yet.`);
    window.setTimeout(() => setStatusMessage(""), 1800);
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
      <div className="rail-launcher-anchor" ref={launcherRef}>
        <button
          type="button"
          className={`app-launcher-button ${launcherOpen ? "active" : ""}`}
          aria-label="Customize sidebar"
          aria-expanded={launcherOpen}
          title="Customize sidebar"
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
                <small>Add or remove tools from your personal dock. Drag dock items to change their order.</small>
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

      <div className="rail-divider" />

      <div className="dynamic-rail-tools">
        {selectedTools.map((tool) => (
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
              const nextPosition: DropPosition = event.clientY >= rect.top + rect.height / 2 ? "after" : "before";
              setDropTargetId(tool.id);
              setDropPosition(nextPosition);
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
            {tool.badge ? <em>{tool.badge}</em> : null}
          </button>
        ))}

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

      {statusMessage && <div className="rail-status-message">{statusMessage}</div>}
    </aside>
  );
}
