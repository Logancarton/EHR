"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { findTool, isAvailableTool } from "../lib/workspace-tools";
import Icon from "./ui/Icon";

type Destination = { id: string; label: string; icon: string; channel?: string };

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
  { id: "team", label: "Team", icon: "forum", items: [
    { id: "inbox", label: "Inbox", icon: "inbox" },
    { id: "team", label: "Team collaboration", icon: "group", channel: "team" },
    { id: "patient_communication", label: "Patient communication", icon: "chat_bubble", channel: "patient" },
    { id: "email", label: "Email", icon: "mail", channel: "email" },
    { id: "fax", label: "Fax", icon: "description", channel: "fax" },
    { id: "community", label: "Community", icon: "groups", channel: "community" },
  ] },
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
  const root = useRef<HTMLElement>(null);
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});
  const panel = useRef<HTMLDivElement>(null);
  const group = GROUPS.find((item) => item.id === open && item.items && item.items.length > 0);

  function place(id: string) {
    const rect = triggers.current[id]?.getBoundingClientRect();
    if (rect) setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)), top: rect.bottom + 6 });
  }

  useEffect(() => {
    const closeOther = (event: Event) => {
      if ((event as CustomEvent).detail?.id === "workspace") setOpen(null);
    };
    const counts = (event: Event) => setBadges((previous) => ({ ...previous, ...(event as CustomEvent).detail }));
    window.addEventListener("ehr-navigation-menu-open", closeOther);
    window.addEventListener("ehr-sidebar-badges", counts);
    return () => {
      window.removeEventListener("ehr-navigation-menu-open", closeOther);
      window.removeEventListener("ehr-sidebar-badges", counts);
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
            type="button" className={`tool-menu-trigger ${open === item.id || item.directTarget === activeDestination ? "active" : ""}`}
            data-workspace-view={item.directTarget || undefined}
            aria-label={item.label}
            aria-expanded={item.directTarget ? undefined : open === item.id}
            aria-controls={item.directTarget ? undefined : `tools-${item.id}`}
            onClick={() => {
              if (item.directTarget) {
                setOpen(null);
                onNavigate(item.directTarget);
                return;
              }
              window.dispatchEvent(new CustomEvent("ehr-navigation-menu-open", { detail: { id: item.id } }));
              place(item.id);
              setOpen(open === item.id ? null : item.id);
            }}
            onKeyDown={(event) => {
              if (item.directTarget) {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onNavigate(item.directTarget);
                }
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                window.dispatchEvent(new CustomEvent("ehr-navigation-menu-open", { detail: { id: item.id } }));
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
              triggers.current[group.id]?.focus();
              if (item.channel) window.dispatchEvent(new CustomEvent("ehr-open-communications", { detail: { channel: item.channel } }));
              else onNavigate(item.id);
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
