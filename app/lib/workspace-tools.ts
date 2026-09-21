/**
 * One registry for everything that can be pinned to a rail.
 *
 * The two rails used to keep separate, unrelated lists, so a tool was either a
 * left-rail workspace or a right-rail companion and could never be both. They
 * now share this registry and one pin record, which is what lets the same tool
 * appear on either side — or both — from either nine-dot menu.
 *
 * Which side a tool *can* be pinned to is a property of the tool, not a
 * preference: a rail can only show what there is a renderer for. `surfaces`
 * records that, so a menu can offer the sides that actually work instead of
 * pinning a tool to a rail that would render nothing.
 */

import { scopedStorageKey } from "./local-cache-scope";
import {
  WORKSPACE_TOOL_PINS_CHANGED_EVENT,
  dispatchWorkspaceEvent,
} from "./workspace-events";

/** Where a tool can be shown. `full` takes the main area; `panel` is the right rail. */
export type ToolSurface = "full" | "panel";

export type WorkspaceTool = {
  id: string;
  label: string;
  icon: string;
  hint: string;
  surfaces: ToolSurface[];
  /**
   * `planned` means the destination has no working surface behind it yet.
   *
   * Planned tools are deliberately not offered in the launcher and are stripped
   * from saved rails, because a navigation path that ends in an explanation of
   * what a screen will someday do is worse than no path at all — it costs a
   * clinician a click to learn the product cannot do the thing.
   */
  status?: "available" | "planned";
};

export const WORKSPACE_TOOLS: WorkspaceTool[] = [
  // Global workspaces. These route through `ehr-switch-view` and take the whole
  // content area; none of them has a narrow-rail rendering yet.
  { id: "today", label: "Dashboard", icon: "dashboard", hint: "Practice dashboard, metrics and patient flow", surfaces: ["full"] },
  { id: "inbox", label: "Inbox", icon: "mail", hint: "Results, refills and staff messages", surfaces: ["full"] },
  { id: "documents", label: "Documents", icon: "folder_open", hint: "Faxes, forms and uploads", surfaces: ["full"] },
  { id: "labs", label: "Labs", icon: "labs", hint: "Results across the panel", surfaces: ["full"] },
  { id: "prescribing", label: "Prescribing", icon: "prescriptions", hint: "Queues, renewals and transmissions", surfaces: ["full"] },
  { id: "billing", label: "Billing", icon: "payments", hint: "Charges prepared from signed encounters", surfaces: ["full"] },
  // UI-6: Brand is the workspace Website and Social Media consolidate into (D-085).
  // The two originals stay registered while the migration proves parity.
  { id: "brand", label: "Brand", icon: "campaign", hint: "Clinic website, booking portal & reputation", surfaces: ["full"] },
  { id: "website", label: "Website", icon: "language", hint: "Clinic public website & booking portal", surfaces: ["full"] },
  { id: "social_media", label: "Social Media", icon: "campaign", hint: "Practice reputation & social channels", surfaces: ["full"] },
  { id: "email", label: "Email", icon: "mail", hint: "Practice correspondence and referrals", surfaces: ["full"] },
  // D-086: HR is both a companion and a major workspace. Everyone reaches their own
  // record; the staff directory inside it is gated server-side, not by this registry.
  { id: "hr", label: "HR", icon: "badge", hint: "Your insurance, licensing deadlines, coachings and goals", surfaces: ["full", "panel"] },
  { id: "patient_communication", label: "Patient Comms", icon: "forum", hint: "Direct HIPAA two-way texting & reminders", surfaces: ["full"] },
  // Withdrawn by P9-0. The screen behind this tile was a prototype: invented monthly
  // revenue, an invented processor balance, a "Connected" accounting status for a
  // system nothing talks to, and a Sync button that reported synchronising twelve
  // transactions after a 1.2-second timer. No accounting, payment-processor or
  // banking integration exists. The layout is kept at /preview/billing.
  { id: "financial_integration", label: "Financials", icon: "account_balance", hint: "Accounting and banking reconciliation", surfaces: ["full"], status: "planned" },
  { id: "reports", label: "Reports", icon: "monitoring", hint: "Panel and practice measures", surfaces: ["full"], status: "planned" },
  // UI-6f: this destination is organization administration — provisioning people,
  // clinical and practice roles, membership status, patient-access scope, activation
  // links and lockout clearing. It was called "Settings" and hinted at preferences,
  // which is what made the Practice menu look like it held a preferences screen; the
  // practice's default layouts have always lived under profile/preferences instead.
  // The id stays `settings` because saved rails and the persisted module view name it:
  // renaming what a thing is called is not a reason to invalidate someone's workspace.
  { id: "settings", label: "Organization", icon: "manage_accounts", hint: "People, roles, sign-in access and activation links", surfaces: ["full"] },

  // Dual-surface: a full workspace and a rail panel both exist.
  { id: "calendar", label: "Calendar", icon: "calendar_month", hint: "Calendar and appointment booking", surfaces: ["full", "panel"] },
  { id: "tasks", label: "Tasks", icon: "check", hint: "Follow-ups and reminders", surfaces: ["full", "panel"] },
  { id: "messages", label: "Messages", icon: "chat_bubble", hint: "Patient message threads", surfaces: ["full", "panel"] },

  // Companion tools. Written as rail panels; no full-window rendering yet.
  { id: "ai", label: "Clinical AI", icon: "auto_awesome", hint: "Synthesis, comparisons and chart questions", surfaces: ["panel"] },
  { id: "communication", label: "Communication", icon: "forum", hint: "Team chat, inbox, patient SMS, email, fax and community", surfaces: ["panel"] },
  { id: "scratchpad", label: "Scratchpad", icon: "edit_note", hint: "Working notes that never reach the chart", surfaces: ["panel"] },
  { id: "calc", label: "Calculators", icon: "calculate", hint: "PHQ-9, GAD-7 and other instruments", surfaces: ["panel"] },
];

export type RailSideKey = "left" | "right";

export type ToolPins = {
  /** Order matters: it is the order the rail shows them in. */
  left: string[];
  right: string[];
};

export const DEFAULT_PINS: ToolPins = {
  left: ["today", "calendar", "inbox", "tasks"],
  right: ["calendar", "ai", "communication", "hr", "scratchpad", "tasks", "calc"],
};

/**
 * Rails are stored on the server with the rest of the display preferences, so a
 * saved profile can restore them and they follow the clinician between
 * browsers. These keys are a local cache: they paint the rails correctly on the
 * very first frame, before the preference fetch returns.
 */
const PINS_STORAGE_KEY = "ehr-tool-pins-v1";

export const TOOL_PINS_CHANGED_EVENT = "ehr-tool-pins-changed";

export function findTool(id: string): WorkspaceTool | undefined {
  const normalizedId = id === "schedule" ? "calendar" : id;
  return WORKSPACE_TOOLS.find(
    (tool) => tool.id === normalizedId || (tool.id === "calendar" && id === "schedule") || (tool.id === "schedule" && id === "calendar"),
  );
}

export function toolSupports(id: string, surface: ToolSurface): boolean {
  return Boolean(findTool(id)?.surfaces.includes(surface));
}

/** The surface a rail renders its tools on. */
export function surfaceForSide(side: RailSideKey): ToolSurface {
  return side === "left" ? "full" : "panel";
}

function sanitize(ids: unknown, side: RailSideKey): string[] | null {
  if (!Array.isArray(ids)) return null;
  const surface = surfaceForSide(side);
  const mapped = ids.map((id) => (id === "schedule" ? "calendar" : id));
  const valid = mapped.filter(
    (value): value is string => typeof value === "string" && toolSupports(value, surface),
  );
  // De-duplicate while keeping the stored order.
  return [...new Set(valid)];
}

export function readToolPins(): ToolPins {
  if (typeof window === "undefined") return DEFAULT_PINS;
  // No authenticated identity to scope the cache to yet: fail closed to defaults
  // rather than reading a cache that might belong to a different clinician.
  const key = scopedStorageKey(PINS_STORAGE_KEY);
  if (!key) return DEFAULT_PINS;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        const left = sanitize(record.left, "left");
        let right = sanitize(record.right, "right");
        if (right && !right.includes("calendar")) {
          right = ["calendar", ...right];
        }
        if (left && right) return { left: left.length ? left : DEFAULT_PINS.left, right };
      }
    }
  } catch {
    // Fall through to defaults.
  }
  return DEFAULT_PINS;
}

export function cacheToolPins(pins: ToolPins): void {
  if (typeof window === "undefined") return;
  const key = scopedStorageKey(PINS_STORAGE_KEY);
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(pins));
  } catch {
    // A rail that cannot remember its pins still works for this session.
  }
}

export function writeToolPins(pins: ToolPins): void {
  if (typeof window === "undefined") return;
  cacheToolPins(pins);
  void persistToolPins(pins);
  // Both rails and both menus render from this record, so a change made in one
  // has to reach the others in the same tick.
  dispatchWorkspaceEvent(WORKSPACE_TOOL_PINS_CHANGED_EVENT, pins);
}

/** Adds or removes one tool on one side, ignoring sides it cannot render on. */
export function togglePin(pins: ToolPins, side: RailSideKey, id: string): ToolPins {
  if (!toolSupports(id, surfaceForSide(side))) return pins;
  const current = pins[side];
  const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
  return { ...pins, [side]: next };
}

export function isPinned(pins: ToolPins, side: RailSideKey, id: string): boolean {
  return pins[side].includes(id);
}

/** Resolves a side's pinned ids to tools, dropping anything unknown. */
export function isAvailableTool(tool: WorkspaceTool): boolean {
  return tool.status !== "planned";
}

/** The tools a clinician may pin. Planned destinations are not on offer. */
export const AVAILABLE_WORKSPACE_TOOLS: WorkspaceTool[] = WORKSPACE_TOOLS.filter(isAvailableTool);

export function pinnedTools(pins: ToolPins, side: RailSideKey): WorkspaceTool[] {
  return pins[side]
    .map((id) => findTool(id))
    // A rail saved before a tool was withdrawn must not resurrect it.
    .filter((tool): tool is WorkspaceTool => Boolean(tool) && isAvailableTool(tool!));
}


/** Reads the server-held rails, falling back to the local cache when offline. */
export async function fetchToolPins(): Promise<ToolPins> {
  try {
    const response = await fetch("/api/preferences");
    if (!response.ok) return readToolPins();
    const body = await response.json();
    const rails = body?.preferences?.rails;
    const left = sanitize(rails?.left, "left");
    let right = sanitize(rails?.right, "right");
    if (right && !right.includes("calendar")) {
      right = ["calendar", ...right];
    }
    if (!left && !right) return readToolPins();
    const pins: ToolPins = {
      left: left?.length ? left : DEFAULT_PINS.left,
      right: right ?? DEFAULT_PINS.right,
    };
    cacheToolPins(pins);
    return pins;
  } catch {
    // An unreachable server should not empty the rails.
    return readToolPins();
  }
}

/** Persists the rails. The local cache is written first so a failed request
 *  still leaves the rails as the clinician arranged them in this browser. */
export async function persistToolPins(pins: ToolPins): Promise<void> {
  cacheToolPins(pins);
  try {
    await fetch("/api/preferences/rails", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ left: pins.left, right: pins.right }),
    });
  } catch {
    // Cached locally; the next successful write reconciles it.
  }
}
