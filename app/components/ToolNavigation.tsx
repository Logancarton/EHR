"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { findTool, isAvailableTool } from "../lib/workspace-tools";
import {
  WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT,
  WORKSPACE_NAVIGATION_MENU_OPEN_EVENT,
  WORKSPACE_SIDEBAR_BADGES_EVENT,
  WORKSPACE_SWITCH_VIEW_EVENT,
  dispatchWorkspaceEvent,
  subscribeWorkspaceEvent,
} from "../lib/workspace-events";
import Icon from "./ui/Icon";

type Destination = { id: string; label: string; icon: string };

type ToolGroup = {
  id: string;
  label: string;
  icon: string;
  directTarget?: string;
  items?: Destination[];
};
const GROUPS: ToolGroup[] = [
  { id: "clinical", label: "Clinical", icon: "medical_services", items: [
    { id: "patients", label: "Patients", icon: "person" },
    { id: "tasks", label: "Tasks", icon: "check" },
    { id: "labs", label: "Labs", icon: "labs" },
    { id: "prescribing", label: "Prescribing", icon: "prescriptions" },
    { id: "documents", label: "Documents", icon: "folder_open" },
  ] },
  { id: "calendar", label: "Calendar", icon: "calendar_month", directTarget: "calendar" },
  { id: "intake", label: "Intake", icon: "edit_note", directTarget: "intake" },
  { id: "practice", label: "Practice", icon: "business", items: [
    { id: "billing", label: "Billing", icon: "payments" },
    { id: "hr", label: "Staff directory", icon: "badge" },
    { id: "settings", label: "Practice settings", icon: "settings" },
    { id: "website", label: "Website", icon: "language" },
    { id: "social_media", label: "Social media", icon: "campaign" },
    { id: "reports", label: "Reports", icon: "monitoring" },
  ] },
  { id: "today", label: "Dashboard", icon: "dashboard", directTarget: "today" },
];

/** Navigation changes workspace focus only; clinical actions stay in their owning surfaces. */
export default function ToolNavigation({ onNavigate, activeDestination, children }: {
  onNavigate: (id: string) => void;
  activeDestination?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [position, setPosition] = useState({ left: 12, top: 120 });
  const [badges, setBadges] = useState<Record<string, number>>({});
  const [activeDirectTarget, setActiveDirectTarget] = useState<string | undefined>(activeDestination);
  const root = useRef<HTMLElement>(null);
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});
  const panel = useRef<HTMLDivElement>(null);
  const group = GROUPS.find((item) => item.id === open && item.items && item.items.length > 0);

  function place(id: string) {
    const rect = triggers.current[id]?.getBoundingClientRect();
    if (rect) setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)), top: rect.bottom + 6 });
  }

  useEffect(() => {
    setActiveDirectTarget(activeDestination);
  }, [activeDestination]);

  useEffect(() => {
    const unsubSwitch = subscribeWorkspaceEvent(
      WORKSPACE_SWITCH_VIEW_EVENT,
      (detail) => {
        const view = detail?.view;
        if (!view) return;
        if (view === "schedule") {
          setActiveDirectTarget("calendar");
          return;
        }
        if (view === "calendar" || view === "intake" || view === "today") {
          setActiveDirectTarget(view);
          return;
        }
        setActiveDirectTarget(undefined);
      },
    );

    const unsubClose = subscribeWorkspaceEvent(
      WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT,
      () => {
        setActiveDirectTarget(activeDestination);
      },
    );

    return () => {
      unsubSwitch();
      unsubClose();
    };
  }, [activeDestination]);

  useEffect(() => {
    const unsubMenu = subscribeWorkspaceEvent(
      WORKSPACE_NAVIGATION_MENU_OPEN_EVENT,
      (detail) => {
        if (detail?.id === "workspace") setOpen(null);
      },
    );
    const unsubBadges = subscribeWorkspaceEvent(
      WORKSPACE_SIDEBAR_BADGES_EVENT,
      (detail) => {
        if (detail) setBadges((previous) => ({ ...previous, ...detail }));
      },
    );
    return () => {
      unsubMenu();
      unsubBadges();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    // Capture Escape before workspace listeners: closing a menu must not close the chart beneath it.
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(null);
      triggers.current[open]?.focus();
    };
    const reposition = () => place(open);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", key, true);
    window.addEventListener("resize", reposition);
    root.current?.addEventListener("scroll", reposition, true);
    const nav = root.current;
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", reposition);
      nav?.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  return (
    <nav className="tool-navigation" aria-label="Workspace tools" ref={root}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(null); }}>
      <div className="tool-navigation-row">
        {GROUPS.map((item) => (
          <button key={item.id} ref={(node) => { triggers.current[item.id] = node; }}
            type="button" className={`tool-menu-trigger ${open === item.id || item.directTarget === activeDirectTarget ? "active" : ""}`}
            data-workspace-view={item.directTarget || undefined}
            aria-label={item.label}
            aria-expanded={item.directTarget ? undefined : open === item.id}
            aria-controls={item.directTarget ? undefined : `tools-${item.id}`}
            onClick={() => {
              if (item.directTarget) {
                setOpen(null);
                setActiveDirectTarget(item.directTarget);
                onNavigate(item.directTarget);
                return;
              }
              dispatchWorkspaceEvent(WORKSPACE_NAVIGATION_MENU_OPEN_EVENT, { id: item.id });
              place(item.id);
              setOpen(open === item.id ? null : item.id);
            }}
            onKeyDown={(event) => {
              if (item.directTarget) {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setActiveDirectTarget(item.directTarget);
                  onNavigate(item.directTarget);
                }
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                dispatchWorkspaceEvent(WORKSPACE_NAVIGATION_MENU_OPEN_EVENT, { id: item.id });
                place(item.id); setOpen(item.id);
                requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>("button")?.focus());
              }
            }}>
            <Icon name={item.icon} size="sm" /><span>{item.label}</span>
          </button>
        ))}
        {children}
      </div>
      {group && group.items && (
        <div ref={panel} id={`tools-${group.id}`} className="tool-menu-panel" role="region"
          aria-label={`${group.label} options`} style={position}
          onKeyDown={(event) => {
            const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
            if (!keys.includes(event.key)) return;
            event.preventDefault();
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
              : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          }}>
          <div className="tool-menu-heading">{group.label}</div>
          {group.items.filter((item) => { const tool = findTool(item.id); return !tool || isAvailableTool(tool); }).map((item) => (
            <button type="button" key={item.id} aria-label={item.label} aria-description={badges[item.id] > 0 ? `${badges[item.id]} items` : undefined} onClick={() => {
              setOpen(null);
              setActiveDirectTarget(undefined);
              triggers.current[group.id]?.focus();
              onNavigate(item.id);
            }}>
              <Icon name={item.icon} size="sm" /><span>{item.label}</span>
              {badges[item.id] > 0 && <span className="tool-menu-count">{badges[item.id]}</span>}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
