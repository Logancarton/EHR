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

/** Where a tool can be shown. `full` takes the main area; `panel` is the right rail. */
export type ToolSurface = "full" | "panel";

export type WorkspaceTool = {
  id: string;
  label: string;
  icon: string;
  hint: string;
  surfaces: ToolSurface[];
};

export const WORKSPACE_TOOLS: WorkspaceTool[] = [
  // Global workspaces. These route through `ehr-switch-view` and take the whole
  // content area; none of them has a narrow-rail rendering yet.
  { id: "today", label: "Today", icon: "home", hint: "Schedule, briefing and the day's roster", surfaces: ["full"] },
  { id: "schedule", label: "Schedule", icon: "calendar_month", hint: "Calendar and appointment book", surfaces: ["full"] },
  { id: "inbox", label: "Inbox", icon: "mail", hint: "Results, refills and staff messages", surfaces: ["full"] },
  { id: "documents", label: "Documents", icon: "folder_open", hint: "Faxes, forms and uploads", surfaces: ["full"] },
  { id: "labs", label: "Labs", icon: "labs", hint: "Results across the panel", surfaces: ["full"] },
  { id: "prescribing", label: "Prescribing", icon: "prescriptions", hint: "Queues, renewals and transmissions", surfaces: ["full"] },
  { id: "billing", label: "Billing", icon: "payments", hint: "Coding and claim status", surfaces: ["full"] },
  { id: "reports", label: "Reports", icon: "monitoring", hint: "Panel and practice measures", surfaces: ["full"] },
  { id: "settings", label: "Settings", icon: "settings", hint: "Preferences and account", surfaces: ["full"] },

  // Dual-surface: a full workspace and a rail panel both exist.
  { id: "tasks", label: "Tasks", icon: "check", hint: "Follow-ups and reminders", surfaces: ["full", "panel"] },
  { id: "messages", label: "Messages", icon: "chat_bubble", hint: "Patient message threads", surfaces: ["full", "panel"] },

  // Companion tools. Written as rail panels; no full-window rendering yet.
  { id: "ai", label: "Clinical AI", icon: "auto_awesome", hint: "Synthesis, comparisons and chart questions", surfaces: ["panel"] },
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
  left: ["today", "schedule", "inbox", "tasks"],
  right: ["ai", "scratchpad", "tasks", "calc"],
};

/**
 * Rails are stored on the server with the rest of the display preferences, so a
 * saved profile can restore them and they follow the clinician between
 * browsers. These keys are a local cache: they paint the rails correctly on the
 * very first frame, before the preference fetch returns.
 */
const PINS_STORAGE_KEY = "ehr-tool-pins-v1";
/** Lists this registry replaced, read once so existing rails survive. */
const LEGACY_LEFT_KEY = "ehr-sidebar-tools-v1";
const LEGACY_RIGHT_KEY = "ehr-companion-rail-tools-v1";

export const TOOL_PINS_CHANGED_EVENT = "ehr-tool-pins-changed";

export function findTool(id: string): WorkspaceTool | undefined {
  return WORKSPACE_TOOLS.find((tool) => tool.id === id);
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
  const valid = ids.filter(
    (value): value is string => typeof value === "string" && toolSupports(value, surface),
  );
  // De-duplicate while keeping the stored order.
  return [...new Set(valid)];
}

export function readToolPins(): ToolPins {
  if (typeof window === "undefined") return DEFAULT_PINS;
  try {
    const raw = window.localStorage.getItem(PINS_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        const left = sanitize(record.left, "left");
        const right = sanitize(record.right, "right");
        if (left && right) return { left: left.length ? left : DEFAULT_PINS.left, right };
      }
    }

    // First run after the split lists were merged: adopt whatever the clinician
    // had already arranged rather than resetting both rails to the defaults.
    const legacyLeft = sanitize(JSON.parse(window.localStorage.getItem(LEGACY_LEFT_KEY) || "null"), "left");
    const legacyRight = sanitize(JSON.parse(window.localStorage.getItem(LEGACY_RIGHT_KEY) || "null"), "right");
    if (legacyLeft || legacyRight) {
      return {
        left: legacyLeft?.length ? legacyLeft : DEFAULT_PINS.left,
        right: legacyRight?.length ? legacyRight : DEFAULT_PINS.right,
      };
    }
  } catch {
    // Fall through to defaults.
  }
  return DEFAULT_PINS;
}

export function cacheToolPins(pins: ToolPins): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify(pins));
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
  window.dispatchEvent(new CustomEvent<ToolPins>(TOOL_PINS_CHANGED_EVENT, { detail: pins }));
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
export function pinnedTools(pins: ToolPins, side: RailSideKey): WorkspaceTool[] {
  return pins[side]
    .map((id) => findTool(id))
    .filter((tool): tool is WorkspaceTool => Boolean(tool));
}


/** Reads the server-held rails, falling back to the local cache when offline. */
export async function fetchToolPins(): Promise<ToolPins> {
  try {
    const response = await fetch("/api/preferences");
    if (!response.ok) return readToolPins();
    const body = await response.json();
    const rails = body?.preferences?.rails;
    const left = sanitize(rails?.left, "left");
    const right = sanitize(rails?.right, "right");
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
