import type {
  DensityMode,
  PresetLayoutConfig,
  ProviderPreferences,
  TodayWidgetId,
} from "./preference-engine";

export type AdaptiveTrigger =
  | { type: "time_window"; startHour: number; endHour: number }
  | { type: "waiting_threshold"; minWaiting: number }
  | { type: "urgent_queue_threshold"; minUrgent: number };

export interface AdaptiveRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  trigger: AdaptiveTrigger;
  targetPresetId?: string;
  density?: DensityMode;
  todayOverrides?: Partial<ProviderPreferences["today"]>;
  pinnedWidgets?: TodayWidgetId[];
  returnBehavior?: "restore_prior" | "retain";
}

export interface AdaptiveLayoutPreferences {
  enabled: boolean;
  paused: boolean;
  activeRuleId: string | null;
  priorLayoutSnapshot: PresetLayoutConfig | null;
  lastEvaluatedAt?: string;
  lastAdaptedAt?: string;
  rules: AdaptiveRule[];
}

export interface AdaptiveEvaluationContext {
  /** Minutes from midnight in the practice timezone (0 - 1439). */
  currentTimeMinutes: number;
  /** Count of patients currently in 'waiting' status on today's schedule. */
  waitingCount: number;
  /** Count of patients currently in 'in-visit' status. */
  inVisitCount: number;
  /** Count of unacknowledged labs + unsigned drafts + pending refills. */
  urgentWorkCount: number;
  /** False if user is typing or active modal/drawer is open (clinical focus protection). */
  isSafeToAdapt: boolean;
}

/**
 * Built-in inspectable default rules.
 * Bounded and deterministic — zero opaque machine learning heuristics or arbitrary scripts.
 */
export const DEFAULT_ADAPTIVE_RULES: AdaptiveRule[] = [
  {
    id: "rule-urgent-backlog",
    name: "Urgent Clinical Backlog",
    description: "Expands the Action Queue to full width when unreviewed labs or pending drafts accumulate (≥ 3 items).",
    enabled: true,
    priority: 100, // Highest priority: clinical safety first
    trigger: { type: "urgent_queue_threshold", minUrgent: 3 },
    pinnedWidgets: ["queue"],
    todayOverrides: {
      showActionQueue: true,
      widgetSpans: {
        queue: "full",
      },
    },
    returnBehavior: "restore_prior",
  },
  {
    id: "rule-clinic-flow",
    name: "High-Volume Clinic Flow",
    description: "Optimizes dashboard for active patient throughput when 2 or more patients are waiting in the office.",
    enabled: true,
    priority: 80,
    trigger: { type: "waiting_threshold", minWaiting: 2 },
    targetPresetId: "cockpit",
    density: "compact",
    pinnedWidgets: ["arrivals", "roster"],
    todayOverrides: {
      showArrivals: true,
      showRoster: true,
      showVisitPrep: true,
      widgetSpans: {
        arrivals: "half",
        roster: "full",
        "visit-prep": "half",
      },
    },
    returnBehavior: "restore_prior",
  },
  {
    id: "rule-morning-prep",
    name: "Morning Pre-Clinic Prep",
    description: "Focuses on morning briefing, patient flow schedule, and pre-visit chart readiness between 07:00 and 09:00.",
    enabled: true,
    priority: 50,
    trigger: { type: "time_window", startHour: 7, endHour: 9 },
    density: "comfortable",
    pinnedWidgets: ["briefing", "roster", "visit-prep"],
    todayOverrides: {
      showMorningBriefing: true,
      showRoster: true,
      showVisitPrep: true,
      // No cockpit: this rule is about the briefing, the flow and pre-visit
      // readiness, as its own description says. Turning the cockpit on here
      // would put a second copy of the schedule's status counts back above the
      // schedule the rule exists to focus on (DASH-13).
    },
    returnBehavior: "retain",
  },
  {
    id: "rule-evening-wrapup",
    name: "Documentation & Sign-off Wrap-up",
    description: "Focuses on unsigned encounter review, signing drafts, and team handoffs between 16:00 and 19:00.",
    enabled: true,
    priority: 40,
    trigger: { type: "time_window", startHour: 16, endHour: 19 },
    density: "comfortable",
    pinnedWidgets: ["queue", "roster", "team"],
    todayOverrides: {
      showActionQueue: true,
      showRoster: true,
      showTeamWindow: true,
      showMorningBriefing: false,
    },
    returnBehavior: "restore_prior",
  },
];

export const defaultAdaptivePreferences: AdaptiveLayoutPreferences = {
  enabled: false, // Strictly OFF by default
  paused: false,
  activeRuleId: null,
  priorLayoutSnapshot: null,
  rules: DEFAULT_ADAPTIVE_RULES,
};

/**
 * Extracts a portable preset layout config snapshot from current preferences.
 */
export function extractLayoutSnapshot(prefs: ProviderPreferences): PresetLayoutConfig {
  return {
    density: prefs.density,
    headerDensity: prefs.headerDensity,
    showCompanionRail: prefs.showCompanionRail,
    showSidebar: prefs.showSidebar,
    rails: {
      left: [...prefs.rails.left],
      right: [...prefs.rails.right],
      leftWidth: prefs.rails.leftWidth,
      rightWidth: prefs.rails.rightWidth,
    },
    today: JSON.parse(JSON.stringify(prefs.today)),
    overview: JSON.parse(JSON.stringify(prefs.overview)),
    encounter: JSON.parse(JSON.stringify(prefs.encounter)),
  };
}

/**
 * Evaluates whether a trigger condition is met given current context.
 */
export function isTriggerMet(trigger: AdaptiveTrigger, context: AdaptiveEvaluationContext): boolean {
  switch (trigger.type) {
    case "time_window": {
      const currentHour = context.currentTimeMinutes / 60;
      return currentHour >= trigger.startHour && currentHour < trigger.endHour;
    }
    case "waiting_threshold":
      return context.waitingCount >= trigger.minWaiting;
    case "urgent_queue_threshold":
      return context.urgentWorkCount >= trigger.minUrgent;
    default:
      return false;
  }
}

export type EvaluationResult =
  | { action: "none"; reason: string }
  | { action: "defer"; rule: AdaptiveRule; reason: string }
  | { action: "apply"; rule: AdaptiveRule; targetPreferences: ProviderPreferences }
  | { action: "restore"; targetPreferences: ProviderPreferences; reason: string };

/**
 * Pure evaluation function for adaptive layout engine.
 * Never mutates input arguments.
 */
export function evaluateAdaptiveRules(
  prefs: ProviderPreferences,
  context: AdaptiveEvaluationContext,
  options?: {
    forceApply?: boolean; // bypasses isSafeToAdapt check if user explicitly requested Apply Now
    cooldownMs?: number;  // hysteresis minimum duration between transitions (default 15s)
    nowIso?: string;
    presets?: Record<string, { config?: Partial<ProviderPreferences> }>;
  },
): EvaluationResult {
  const adaptive = prefs.adaptiveLayout || defaultAdaptivePreferences;

  // 1. If adaptive mode is OFF or PAUSED, never rearrange
  if (!adaptive.enabled) {
    return { action: "none", reason: "Adaptive mode is off" };
  }
  if (adaptive.paused) {
    return { action: "none", reason: "Adaptive mode is paused" };
  }

  const nowIso = options?.nowIso || new Date().toISOString();
  const cooldownMs = options?.cooldownMs ?? 15000;

  // Check cooldown hysteresis if recently adapted
  if (adaptive.lastAdaptedAt && !options?.forceApply) {
    const currentMs = new Date(nowIso).getTime();
    const elapsed = currentMs - new Date(adaptive.lastAdaptedAt).getTime();
    if (elapsed < cooldownMs) {
      return { action: "none", reason: "Hysteresis cooldown active to prevent layout oscillation" };
    }
  }

  // 2. Sort enabled rules by priority descending
  const activeRules = [...(adaptive.rules || DEFAULT_ADAPTIVE_RULES)]
    .filter((r) => r.enabled)
    .sort((a, b) => b.priority - a.priority);

  // 3. Find highest priority rule whose trigger is met
  const matchedRule = activeRules.find((r) => isTriggerMet(r.trigger, context));

  // 4. If a rule matched:
  if (matchedRule) {
    // If this rule is already the active rule, no change needed
    if (adaptive.activeRuleId === matchedRule.id) {
      return { action: "none", reason: `Rule "${matchedRule.name}" is already active` };
    }

    // Check clinical focus protection
    if (!context.isSafeToAdapt && !options?.forceApply) {
      return {
        action: "defer",
        rule: matchedRule,
        reason: `Deferred while editing or active dialog open (rule: ${matchedRule.name})`,
      };
    }

    // Build the updated preferences
    const priorSnapshot = adaptive.priorLayoutSnapshot || extractLayoutSnapshot(prefs);

    let updatedPrefs: ProviderPreferences = {
      ...prefs,
      density: matchedRule.density || prefs.density,
      today: {
        ...prefs.today,
        ...(matchedRule.todayOverrides || {}),
        widgetSpans: {
          ...(prefs.today.widgetSpans || {}),
          ...(matchedRule.todayOverrides?.widgetSpans || {}),
        },
      },
    };

    // If targetPresetId specified, apply base preset config without overwriting named preset records
    if (matchedRule.targetPresetId) {
      const preset = (options?.presets || {})[matchedRule.targetPresetId] || prefs.namedPresets[matchedRule.targetPresetId];
      if (preset?.config) {
        updatedPrefs = {
          ...updatedPrefs,
          density: matchedRule.density || preset.config.density || updatedPrefs.density,
          headerDensity: preset.config.headerDensity || updatedPrefs.headerDensity,
          today: {
            ...updatedPrefs.today,
            ...(preset.config.today || {}),
            ...(matchedRule.todayOverrides || {}),
          },
        };
      }
    }

    // Ensure pinned widgets are visible and uncollapsed
    if (matchedRule.pinnedWidgets && matchedRule.pinnedWidgets.length > 0) {
      const nextCollapsed = { ...(updatedPrefs.today.collapsedWidgets || {}) };
      for (const widgetId of matchedRule.pinnedWidgets) {
        nextCollapsed[widgetId] = false;
        if (widgetId === "arrivals") updatedPrefs.today.showArrivals = true;
        if (widgetId === "visit-prep") updatedPrefs.today.showVisitPrep = true;
        if (widgetId === "queue") updatedPrefs.today.showActionQueue = true;
        if (widgetId === "roster") updatedPrefs.today.showRoster = true;
        if (widgetId === "briefing") updatedPrefs.today.showMorningBriefing = true;
        if (widgetId === "team") updatedPrefs.today.showTeamWindow = true;
        if (widgetId === "metrics") updatedPrefs.today.showMetrics = true;
      }
      updatedPrefs.today.collapsedWidgets = nextCollapsed;
    }

    updatedPrefs.adaptiveLayout = {
      ...adaptive,
      activeRuleId: matchedRule.id,
      priorLayoutSnapshot: priorSnapshot,
      lastAdaptedAt: nowIso,
      lastEvaluatedAt: nowIso,
    };

    return {
      action: "apply",
      rule: matchedRule,
      targetPreferences: updatedPrefs,
    };
  }

  // 5. No rule matched. If a rule was previously active and returnBehavior is restore_prior:
  if (adaptive.activeRuleId && adaptive.priorLayoutSnapshot) {
    const previousRule = (adaptive.rules || DEFAULT_ADAPTIVE_RULES).find((r) => r.id === adaptive.activeRuleId);
    if (previousRule?.returnBehavior === "restore_prior") {
      if (!context.isSafeToAdapt && !options?.forceApply) {
        return {
          action: "none",
          reason: "Prior layout restoration deferred while editing",
        };
      }

      const snapshot = adaptive.priorLayoutSnapshot;
      const restoredPrefs: ProviderPreferences = {
        ...prefs,
        density: snapshot.density,
        headerDensity: snapshot.headerDensity,
        showCompanionRail: snapshot.showCompanionRail,
        showSidebar: snapshot.showSidebar,
        rails: {
          left: [...snapshot.rails.left],
          right: [...snapshot.rails.right],
          leftWidth: snapshot.rails.leftWidth,
          rightWidth: snapshot.rails.rightWidth,
        },
        today: JSON.parse(JSON.stringify(snapshot.today)),
        overview: JSON.parse(JSON.stringify(snapshot.overview)),
        encounter: JSON.parse(JSON.stringify(snapshot.encounter)),
        adaptiveLayout: {
          ...adaptive,
          activeRuleId: null,
          priorLayoutSnapshot: null, // Clear snapshot once restored
          lastAdaptedAt: nowIso,
          lastEvaluatedAt: nowIso,
        },
      };

      return {
        action: "restore",
        targetPreferences: restoredPrefs,
        reason: `Trigger conditions for "${previousRule.name}" ceased; restored prior layout`,
      };
    }
  }

  return { action: "none", reason: "No matching adaptive rule" };
}

/**
 * Manually restores the prior layout snapshot if one exists.
 */
export function restorePriorLayout(prefs: ProviderPreferences): ProviderPreferences {
  const adaptive = prefs.adaptiveLayout;
  if (!adaptive?.priorLayoutSnapshot) return prefs;

  const snapshot = adaptive.priorLayoutSnapshot;
  return {
    ...prefs,
    density: snapshot.density,
    headerDensity: snapshot.headerDensity,
    showCompanionRail: snapshot.showCompanionRail,
    showSidebar: snapshot.showSidebar,
    rails: {
      left: [...snapshot.rails.left],
      right: [...snapshot.rails.right],
      leftWidth: snapshot.rails.leftWidth,
      rightWidth: snapshot.rails.rightWidth,
    },
    today: JSON.parse(JSON.stringify(snapshot.today)),
    overview: JSON.parse(JSON.stringify(snapshot.overview)),
    encounter: JSON.parse(JSON.stringify(snapshot.encounter)),
    adaptiveLayout: {
      ...adaptive,
      activeRuleId: null,
      priorLayoutSnapshot: null,
      lastAdaptedAt: new Date().toISOString(),
    },
  };
}
