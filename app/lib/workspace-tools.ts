/** D-117: full work opens through the workspace catalog; contextual tools pin only to the right. */

import { scopedStorageKey } from "./local-cache-scope";
import {
  WORKSPACE_TOOL_PINS_CHANGED_EVENT,
  dispatchWorkspaceEvent,
} from "./workspace-events";

/** Where a tool can be shown. `full` takes the main area; `panel` is the right rail. */
export type ToolSurface = "full" | "panel";

export type ToolScope = "global" | "patient";

export type WorkspaceTool = {
  id: string;
  label: string;
  icon: string;
  hint: string;
  surfaces: ToolSurface[];
  /**
   * Patient-scoped tools must never silently follow a remembered/background chart.
   * Their panel owns an explicit patient binding and parks mutations whenever that
   * patient is not the foreground canvas.
   */
  scope?: ToolScope;
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
  { id: "documents", label: "Documents", icon: "folder_open", hint: "Faxes, forms and uploads", surfaces: ["full", "panel"] },
  { id: "labs", label: "Labs", icon: "labs", hint: "Results and patient-specific lab ordering", surfaces: ["full", "panel"], scope: "patient" },
  // D-119 combines companion prescribing with Medications. Keep the full
  // workspace registered for saved tabs and the queue escalation path.
  { id: "prescribing", label: "Prescribing", icon: "prescriptions", hint: "Prescriptions needing attention", surfaces: ["full"] },
  { id: "billing", label: "Billing", icon: "payments", hint: "Charges prepared from signed encounters", surfaces: ["full"] },
  // UI-6: Brand is the workspace Website and Social Media consolidate into (D-085).
  // The two originals stay registered while the migration proves parity.
  { id: "brand", label: "Brand", icon: "campaign", hint: "Clinic website, booking portal & reputation", surfaces: ["full"] },
  { id: "website", label: "Website", icon: "language", hint: "Clinic public website & booking portal", surfaces: ["full"] },
  { id: "social_media", label: "Social Media", icon: "campaign", hint: "Practice reputation & social channels", surfaces: ["full"] },
  { id: "email", label: "Email", icon: "mail", hint: "Practice correspondence and referrals", surfaces: ["full"] },
  // D-086: HR is both a companion and a major workspace. Everyone reaches their own
  // record; the staff directory inside it is gated server-side, not by this registry.
  { id: "hr", label: "HR", icon: "badge", hint: "Your insurance, licenses, coaching & goals", surfaces: ["full", "panel"] },
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

  { id: "medications", label: "Medications", icon: "medication", hint: "Medication record and prescribing work", surfaces: ["panel"], scope: "patient" },
  { id: "history", label: "History", icon: "history", hint: "Longitudinal chart, assessments and psychiatric history", surfaces: ["panel"], scope: "patient" },
  { id: "orders", label: "Orders", icon: "shopping_bag", hint: "Patient-bound staged orders and review", surfaces: ["panel"], scope: "patient" },

  // Companion tools. Written as rail panels; no full-window rendering yet.
  { id: "ai", label: "Clinical AI", icon: "auto_awesome", hint: "Synthesis, comparisons and chart questions", surfaces: ["panel"], scope: "patient" },
  { id: "communication", label: "Communication", icon: "forum", hint: "Team chat, inbox, patient SMS, email, fax and community", surfaces: ["panel"] },
  { id: "scratchpad", label: "Scratchpad", icon: "edit_note", hint: "Working notes that never reach the chart", surfaces: ["panel"] },
  { id: "calc", label: "Calculators", icon: "calculate", hint: "PHQ-9, GAD-7 and other instruments", surfaces: ["panel"], scope: "patient" },
];

export type RailSideKey = "left" | "right";

export type ToolPins = {
  /** Compatibility wire field only. D-117 always normalizes it to empty. */
  left: string[];
  /** Ordered right companion pins. */
  right: string[];
};

/**
 * Primary record tools stay visible. Lower-frequency tools such as Orders remain
 * available through More and can still be pinned explicitly.
 */
export const PATIENT_RECORD_TOOLS = ["medications", "labs", "documents", "communication", "history"] as const;
export function isRequiredPatientTool(id: string): boolean {
  return (PATIENT_RECORD_TOOLS as readonly string[]).includes(id);
}
export function companionToolIdsFor(pins: ToolPins): string[] {
  return [...new Set([...PATIENT_RECORD_TOOLS, ...normalizeToolPins(pins).right])];
}

export const DEFAULT_PINS: ToolPins = {
  left: [],
  right: [...PATIENT_RECORD_TOOLS, "ai", "calendar", "tasks"],
};

/** The pre-cleanup default. Migrate only this exact generated layout so custom rails are untouched. */
const LEGACY_NOISY_DEFAULT_RIGHT = [
  "medications", "labs", "documents", "communication", "history", "orders",
  "calendar", "ai", "hr", "scratchpad", "tasks", "calc",
] as const;

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Rails are stored on the server with the rest of the display preferences, so a
 * saved profile can restore them and they follow the clinician between
 * browsers. These keys are a local cache: they paint the rails correctly on the
 * very first frame, before the preference fetch returns.
 */
const PINS_STORAGE_KEY = "ehr-tool-pins-v1";

export const TOOL_PINS_CHANGED_EVENT = "ehr-tool-pins-changed";

/** Legacy IDs remain readable, but never create another launcher or state owner. */
export function canonicalToolId(id: string): string {
  return id === "messages" ? "communication" : id === "schedule" ? "calendar" : id === "prescribing" ? "medications" : id;
}

/** `left` stays on the wire for older clients. It can no longer render global navigation. */
export function normalizeToolPins(pins: { left?: unknown; right?: unknown }): ToolPins {
  const sanitized = sanitize(pins.right, "right");
  const requested = sanitized ?? DEFAULT_PINS.right;
  const right = sameIds(requested, LEGACY_NOISY_DEFAULT_RIGHT) ? DEFAULT_PINS.right : requested;
  return { left: [], right: [...new Set([...PATIENT_RECORD_TOOLS, ...right])] };
}

export function findTool(id: string): WorkspaceTool | undefined {
  // Full workspace lookup keeps its identity; companion state uses canonicalToolId.
  const normalizedId = id === "prescribing" ? id : canonicalToolId(id);
  return WORKSPACE_TOOLS.find(
    (tool) => tool.id === normalizedId || (tool.id === "calendar" && id === "schedule") || (tool.id === "schedule" && id === "calendar"),
  );
}

export function toolSupports(id: string, surface: ToolSurface): boolean {
  return Boolean(findTool(id)?.surfaces.includes(surface));
}

/** Current work is independent of favorites; only implemented panel tools may open. */
export function isAvailableCompanionTool(id: string): boolean {
  const tool = findTool(canonicalToolId(id));
  return Boolean(tool && tool.status !== "planned" && tool.surfaces.includes("panel"));
}

export function toolScopeFor(id: string): ToolScope {
  return findTool(id)?.scope ?? "global";
}

/** The surface a rail renders its tools on. */
export function surfaceForSide(side: RailSideKey): ToolSurface {
  return side === "left" ? "full" : "panel";
}

function sanitize(ids: unknown, side: RailSideKey): string[] | null {
  if (!Array.isArray(ids)) return null;
  if (side === "left") return [];
  const surface = surfaceForSide(side);
  const mapped = ids.map((id) => typeof id === "string" ? canonicalToolId(id) : id);
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
        // The cache is read as written. Calendar used to be spliced back in here and
        // in `fetchToolPins`, alongside the same splice in `preference-engine`, so an
        // unpin was reverted three separate ways; it is a one-time backfill now
        // (CALENDAR_RAIL_BACKFILL), which the server applies once and records.
        const right = sanitize(record.right, "right");
        if (right) return normalizeToolPins({ right });
      }
    }
  } catch {
    // Fall through to defaults.
  }
  return DEFAULT_PINS;
}

export function cacheToolPins(pins: ToolPins): void {
  pins = normalizeToolPins(pins);
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
  pins = normalizeToolPins(pins);
  cacheToolPins(pins);
  void persistToolPins(pins);
  // Companion launchers and configuration menus share this record.
  dispatchWorkspaceEvent(WORKSPACE_TOOL_PINS_CHANGED_EVENT, pins);
}

/** Adds or removes one tool on one side, ignoring sides it cannot render on. */
export function togglePin(pins: ToolPins, side: RailSideKey, id: string): ToolPins {
  if (side === "left") return pins;
  id = canonicalToolId(id);
  if (!toolSupports(id, surfaceForSide(side)) || isRequiredPatientTool(id)) return pins;
  const current = pins[side];
  const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
  return { ...pins, [side]: next };
}

export function isPinned(pins: ToolPins, side: RailSideKey, id: string): boolean {
  return side === "right" && normalizeToolPins(pins).right.includes(canonicalToolId(id));
}

/** Resolves a side's pinned ids to tools, dropping anything unknown. */
export function isAvailableTool(tool: WorkspaceTool): boolean {
  return tool.status !== "planned";
}

/** The tools a clinician may pin. Planned destinations are not on offer. */
export const AVAILABLE_WORKSPACE_TOOLS: WorkspaceTool[] = WORKSPACE_TOOLS.filter(isAvailableTool);

export function pinnedTools(pins: ToolPins, side: RailSideKey): WorkspaceTool[] {
  return normalizeToolPins(pins)[side]
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
    // Already normalized and backfilled by `preference-engine`; re-adding Calendar
    // here would undo an unpin the server just honoured.
    const right = sanitize(rails?.right, "right");
    if (!left && !right) return readToolPins();
    const pins: ToolPins = {
      left: [],
      right: right ?? DEFAULT_PINS.right,
    };
    const normalized = normalizeToolPins(pins);
    cacheToolPins(normalized);
    return normalized;
  } catch {
    // An unreachable server should not empty the rails.
    return readToolPins();
  }
}

/** Persists the rails. The local cache is written first so a failed request
 *  still leaves the rails as the clinician arranged them in this browser. */
export async function persistToolPins(pins: ToolPins): Promise<void> {
  pins = normalizeToolPins(pins);
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

/**
 * What a rail badge counts, in words. A bare "14" beside an icon asks the
 * clinician to remember which queue each tool publishes; the tooltip and the
 * accessible description say it instead. Each phrase names the count the
 * publishing surface actually computes (see WORKSPACE_SIDEBAR_BADGES_EVENT).
 */
const BADGE_NOUNS: Record<string, [singular: string, plural: string]> = {
  labs: ["lab order to review", "lab orders to review"],
  prescribing: ["prescription needing attention", "prescriptions needing attention"],
  medications: ["prescription needing attention", "prescriptions needing attention"],
  tasks: ["open task", "open tasks"],
  inbox: ["unread message", "unread messages"],
  documents: ["document to review", "documents to review"],
};

export function describeToolBadge(toolId: string, count: number): string {
  const nouns = BADGE_NOUNS[toolId];
  if (!nouns) return `${count} ${count === 1 ? "item" : "items"}`;
  return `${count} ${count === 1 ? nouns[0] : nouns[1]}`;
}
