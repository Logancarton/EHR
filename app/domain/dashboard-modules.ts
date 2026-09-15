import type { ClinicalPermission } from "../server/auth/provider-context";

/**
 * Dashboard Module Registry (roadmap §21, DB-3).
 *
 * Defines the bounded registry contract for dashboard modules.
 * Each module definition specifies stable identity, title, scope, capabilities,
 * dimensions, layout modes, schema validation, and freshness strategy.
 *
 * Rules:
 * 1. Presentation state stores only module IDs, config, and geometry — never copied patient facts.
 * 2. Modules lacking working backends are marked `status: "planned"` and hidden from normal use.
 * 3. Schedule dominates and cannot be removed (permanent: true).
 * 4. Settings schemas are versioned and sanitize away unknown keys or script injection.
 */

export type DashboardModuleId =
  | "schedule"
  | "queue"
  | "team"
  | "briefing"
  | "metrics"
  | "shortcuts"
  | "arrivals"
  | "visit-prep"
  | "care-completion"
  | "intake"
  | "billing"
  | "reports";

export type DashboardModuleScope = "practice" | "provider" | "patient" | "appointment";

export type DashboardModuleCategory =
  | "schedule"
  | "clinical"
  | "team"
  | "operations"
  | "business";

export type DashboardModuleSpan = "half" | "full";

export type DashboardModuleStatus = "available" | "planned";

export type DashboardModuleFreshness = "event" | "poll" | "manual";

export type DashboardModuleSettingsSchema = {
  version: number;
  allowedKeys: readonly string[];
  sanitize: (raw: unknown) => Record<string, unknown>;
};

export type DashboardModuleDefinition = {
  id: DashboardModuleId;
  title: string;
  icon: string;
  summary: string;
  scope: DashboardModuleScope;
  category: DashboardModuleCategory;
  status: DashboardModuleStatus;
  /** Explicit explanation when a module is planned or deferred rather than mock-implemented. */
  unavailableReason?: string;
  /** Permanent modules cannot be hidden or removed from the canvas. */
  permanent?: boolean;
  defaultSpan: DashboardModuleSpan;
  allowedSpans: readonly DashboardModuleSpan[];
  minWidth: number;
  minHeight: number;
  requiredCapabilities: readonly ClinicalPermission[];
  sourceApi: string;
  freshnessStrategy: DashboardModuleFreshness;
  settingsSchema?: DashboardModuleSettingsSchema;
};

/**
 * Basic sanitizers for module settings.
 * Rejects non-objects, arbitrary keys, executable scripts, and HTML tags.
 */
function sanitizeStringArray(val: unknown, allowedValues?: readonly string[]): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter(
    (item): item is string =>
      typeof item === "string" &&
      item.trim().length > 0 &&
      !/<[^>]*>/.test(item) &&
      (!allowedValues || allowedValues.includes(item)),
  );
}

const metricsSettingsSchema: DashboardModuleSettingsSchema = {
  version: 1,
  allowedKeys: ["cockpitTiles"],
  sanitize: (raw: unknown) => {
    if (!raw || typeof raw !== "object") return { cockpitTiles: [] };
    const r = raw as Record<string, unknown>;
    const allowed = ["scheduled", "waiting", "inVisit", "upcoming", "completed"];
    return {
      cockpitTiles: sanitizeStringArray(r.cockpitTiles, allowed),
    };
  },
};

const scheduleSettingsSchema: DashboardModuleSettingsSchema = {
  version: 1,
  allowedKeys: ["defaultView"],
  sanitize: (raw: unknown) => {
    if (!raw || typeof raw !== "object") return { defaultView: "roster" };
    const r = raw as Record<string, unknown>;
    const defaultView = r.defaultView === "timeline" ? "timeline" : "roster";
    return { defaultView };
  },
};

export const DASHBOARD_MODULES: readonly DashboardModuleDefinition[] = [
  {
    id: "schedule",
    title: "Today's Schedule",
    icon: "calendar_month",
    summary: "The clinic day as an interactive roster stream or zoomable calendar timeline.",
    scope: "practice",
    category: "schedule",
    status: "available",
    permanent: true,
    defaultSpan: "full",
    allowedSpans: ["full"],
    minWidth: 480,
    minHeight: 320,
    requiredCapabilities: ["read_schedule"],
    sourceApi: "/api/appointments",
    freshnessStrategy: "event",
    settingsSchema: scheduleSettingsSchema,
  },
  {
    id: "queue",
    title: "Outstanding Work",
    icon: "draw",
    summary: "Unsigned encounter drafts, unacknowledged lab results, and patient follow-up tasks.",
    scope: "provider",
    category: "clinical",
    status: "available",
    permanent: false,
    defaultSpan: "half",
    allowedSpans: ["half", "full"],
    minWidth: 320,
    minHeight: 240,
    requiredCapabilities: ["read_clinical", "manage_tasks"],
    sourceApi: "/api/practice/queue",
    freshnessStrategy: "poll",
  },
  {
    id: "team",
    title: "Team Collaboration",
    icon: "group",
    summary: "Team presence, shared patient handoffs, and active task assignments across the clinic.",
    scope: "practice",
    category: "team",
    status: "available",
    permanent: false,
    defaultSpan: "half",
    allowedSpans: ["half", "full"],
    minWidth: 320,
    minHeight: 240,
    requiredCapabilities: ["collaborate_team"],
    sourceApi: "/api/team",
    freshnessStrategy: "event",
  },
  {
    id: "briefing",
    title: "Day at a Glance",
    icon: "today",
    summary: "Summary of today's encounter counts, waiting lobby status, and next scheduled arrivals.",
    scope: "practice",
    category: "schedule",
    status: "available",
    permanent: false,
    defaultSpan: "full",
    allowedSpans: ["half", "full"],
    minWidth: 320,
    minHeight: 140,
    requiredCapabilities: ["read_schedule"],
    sourceApi: "/api/appointments",
    freshnessStrategy: "event",
  },
  {
    id: "metrics",
    title: "Practice Cockpit",
    icon: "speed",
    summary: "Key clinic volume counters with quick filtering by patient visit status.",
    scope: "practice",
    category: "schedule",
    status: "available",
    permanent: false,
    defaultSpan: "full",
    allowedSpans: ["half", "full"],
    minWidth: 320,
    minHeight: 120,
    requiredCapabilities: ["read_schedule"],
    sourceApi: "/api/appointments",
    freshnessStrategy: "event",
    settingsSchema: metricsSettingsSchema,
  },
  {
    id: "shortcuts",
    title: "Daily Shortcuts",
    icon: "bolt",
    summary: "Direct jump links to today's active encounters, unsigned notes, and lab reviews.",
    scope: "provider",
    category: "schedule",
    status: "available",
    permanent: false,
    defaultSpan: "half",
    allowedSpans: ["half", "full"],
    minWidth: 280,
    minHeight: 200,
    requiredCapabilities: ["read_schedule"],
    sourceApi: "/api/appointments",
    freshnessStrategy: "event",
  },
  {
    id: "arrivals",
    title: "Waiting Room & Arrivals",
    icon: "how_to_reg",
    summary: "Real-time lobby arrivals, wait durations, rooming state, and patient flow.",
    scope: "practice",
    category: "schedule",
    status: "available",
    permanent: false,
    defaultSpan: "half",
    allowedSpans: ["half", "full"],
    minWidth: 320,
    minHeight: 200,
    requiredCapabilities: ["read_schedule"],
    sourceApi: "/api/appointments",
    freshnessStrategy: "event",
  },
  {
    id: "visit-prep",
    title: "Visit Preparation",
    icon: "fact_check",
    summary: "Clinical continuity briefing with verified vitals, active problems, meds, and pending labs.",
    scope: "provider",
    category: "clinical",
    status: "available",
    permanent: false,
    defaultSpan: "half",
    allowedSpans: ["half", "full"],
    minWidth: 320,
    minHeight: 220,
    requiredCapabilities: ["read_clinical"],
    sourceApi: "/api/practice-queues?queue=visit-prep",
    freshnessStrategy: "poll",
  },
  {
    id: "care-completion",
    title: "Care Completion",
    icon: "task_alt",
    summary:
      "Patients you have pinned, with the loops still open for each: follow-up, signing, prescriptions, results, communication.",
    scope: "provider",
    category: "clinical",
    status: "available",
    // Optional and personal. Outstanding Work answers "what is unresolved across
    // my practice"; this answers "for the patients I chose to keep in view, have
    // I closed everything". Both are useful, neither replaces the other, and
    // neither ships as a permanent fixture of the canvas.
    permanent: false,
    defaultSpan: "half",
    allowedSpans: ["half", "full"],
    minWidth: 320,
    minHeight: 260,
    requiredCapabilities: ["read_clinical"],
    sourceApi: "/api/care-completion",
    freshnessStrategy: "poll",
  },
  // Planned modules: without working backends, these are omitted from normal use
  {
    id: "intake",
    title: "Intake & Consents",
    icon: "assignment",
    summary: "Patient registration forms, insurance capture, and clinical consent documents.",
    scope: "practice",
    category: "operations",
    status: "planned",
    unavailableReason: "Intake document workflows and portal form responses are scheduled for Phase P9 patient engagement integration.",
    permanent: false,
    defaultSpan: "half",
    allowedSpans: ["half", "full"],
    minWidth: 320,
    minHeight: 240,
    requiredCapabilities: ["edit_patient"],
    sourceApi: "/api/intake",
    freshnessStrategy: "manual",
  },
  {
    id: "billing",
    title: "Billing & Claims",
    icon: "payments",
    summary: "Claims, super-bills, and balances needing clinical review or reconciliation.",
    scope: "practice",
    category: "business",
    status: "planned",
    // Accurate as of P9-0: charges prepared from signed encounters are real and live
    // in the Billing workspace, but a dashboard window would have to summarise claim
    // and payment state, and neither exists. The window stays planned rather than
    // being filled with the charge counts it is not about.
    unavailableReason:
      "Claim and payment state does not exist yet (P9-C/P9-D): no clearinghouse is connected and no remittance has been received, so there is nothing here to summarise. Prepared charges are in the Billing workspace.",
    permanent: false,
    defaultSpan: "half",
    allowedSpans: ["half", "full"],
    minWidth: 320,
    minHeight: 240,
    requiredCapabilities: ["view_financial"],
    sourceApi: "/api/billing",
    freshnessStrategy: "manual",
  },
  {
    id: "reports",
    title: "Reports & Measures",
    icon: "monitoring",
    summary: "Practice analytics, quality metrics, and population measures.",
    scope: "practice",
    category: "operations",
    status: "planned",
    unavailableReason: "Practice analytics and quality measures are scheduled for Phase P9 practice reporting integration.",
    permanent: false,
    defaultSpan: "full",
    allowedSpans: ["half", "full"],
    minWidth: 480,
    minHeight: 240,
    requiredCapabilities: ["manage_organization"],
    sourceApi: "/api/reports",
    freshnessStrategy: "manual",
  },
];

export const DASHBOARD_MODULE_REGISTRY = DASHBOARD_MODULES;

const MODULE_BY_ID = new Map(DASHBOARD_MODULES.map((mod) => [mod.id, mod]));

export function getDashboardModule(id: DashboardModuleId): DashboardModuleDefinition | undefined {
  return MODULE_BY_ID.get(id);
}

export function isKnownDashboardModuleId(id: string): id is DashboardModuleId {
  return MODULE_BY_ID.has(id as DashboardModuleId);
}

export const ACTIVE_DASHBOARD_MODULES = DASHBOARD_MODULES.filter((m) => m.status === "available");
export const PLANNED_DASHBOARD_MODULES = DASHBOARD_MODULES.filter((m) => m.status === "planned");

export function listActiveDashboardModules(): DashboardModuleDefinition[] {
  return [...ACTIVE_DASHBOARD_MODULES];
}

export function listPlannedDashboardModules(): DashboardModuleDefinition[] {
  return [...PLANNED_DASHBOARD_MODULES];
}

export function isModulePermitted(
  module: DashboardModuleDefinition,
  actor: { permissions?: readonly string[] | null } | null | undefined,
): boolean {
  if (module.status === "planned") return false;
  const permissions = new Set(actor?.permissions ?? []);
  return module.requiredCapabilities.every((cap) => permissions.has(cap));
}

export function sanitizeModuleSettings(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      cleaned[key] = value;
    } else if (Array.isArray(value)) {
      cleaned[key] = value.filter(
        (v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean",
      );
    }
  }
  return cleaned;
}

/**
 * Filter modules based on actor capabilities and availability status.
 * Planned modules are hidden from standard catalog.
 * Modules requiring capabilities the actor lacks are omitted.
 */
export function filterModulesByCapabilities(
  modules: readonly DashboardModuleDefinition[],
  userCapabilities?: readonly ClinicalPermission[] | null,
  options: { includePlanned?: boolean } = {},
): DashboardModuleDefinition[] {
  if (!userCapabilities) {
    return modules.filter((mod) => mod.status !== "planned" || options.includePlanned);
  }
  const capSet = new Set(userCapabilities);
  return modules.filter((mod) => {
    if (mod.status === "planned" && !options.includePlanned) {
      return false;
    }
    return mod.requiredCapabilities.every((req) => capSet.has(req));
  });
}

