import { type CockpitMetricId } from "./cockpit-metrics";

export type DensityMode = "comfortable" | "compact" | "minimal";
export type HeaderDensity = "full" | "compact" | "minimal";

export type TodayWidgetId = "briefing" | "metrics" | "roster" | "queue" | "team" | "shortcuts";
export type OverviewCardId = "snapshot" | "diagnoses" | "medications" | "timeline";

export type ProviderPreferences = {
  version: number;
  activePresetId: string;
  density: DensityMode;
  headerDensity: HeaderDensity;
  showCompanionRail: boolean;
  showSidebar: boolean;

  /**
   * Rail layout. Server-persisted alongside every other display preference so a
   * saved profile can restore the rails too — they previously lived only in this
   * browser's localStorage, which a profile switch could not have carried.
   */
  rails: {
    /** Tool ids pinned to each rail, in the order the rail shows them. */
    left: string[];
    right: string[];
    /** Last dragged width, in pixels. */
    leftWidth: number;
    rightWidth: number;
  };

  today: {
    showMorningBriefing: boolean;
    showMetrics: boolean;
    showScheduleSearch: boolean;
    showRoster: boolean;
    showActionQueue: boolean;
    showQuickReferences: boolean;
    showTeamWindow?: boolean;
    widgetOrder: TodayWidgetId[];
    /** Collapsed sections keep their place and stay restorable; hidden ones leave the page. */
    collapsedWidgets: Partial<Record<TodayWidgetId, boolean>>;
    /** Widget width spans: half vs full. */
    widgetSpans?: Partial<Record<TodayWidgetId, "half" | "full">>;
    /** Which Practice Cockpit tiles are shown, in order. */
    cockpitTiles: CockpitMetricId[];
  };

  overview: {
    showSnapshot: boolean;
    showDiagnoses: boolean;
    showMedications: boolean;
    showTimeline: boolean;
    cardOrder: OverviewCardId[];
    collapsedCards: Record<string, boolean>;
    cardSpans?: Record<string, 1 | 2>;
    pinnedCards?: Record<string, boolean>;
  };

  encounter: {
    showPastEncountersSearch: boolean;
    showIntervalHistory: boolean;
    showTreatmentResponse: boolean;
    showSideEffects: boolean;
    showAssessment: boolean;
    showPlan: boolean;
  };

  customPresets: Record<string, Omit<ProviderPreferences, "customPresets">>;
};

export const defaultPreferences: ProviderPreferences = {
  version: 1,
  activePresetId: "standard",
  density: "comfortable",
  headerDensity: "full",
  showCompanionRail: true,
  showSidebar: true,

  rails: {
    left: ["today", "schedule", "inbox", "tasks"],
    right: ["ai", "scratchpad", "tasks", "calc"],
    leftWidth: 76,
    rightWidth: 52,
  },

  today: {
    showMorningBriefing: true,
    showMetrics: true,
    showScheduleSearch: true,
    showRoster: true,
    showActionQueue: true,
    showQuickReferences: true,
    showTeamWindow: true,
    widgetOrder: ["briefing", "metrics", "roster", "queue", "team", "shortcuts"],
    collapsedWidgets: {},
    widgetSpans: {
      briefing: "full",
      metrics: "full",
      roster: "full",
      queue: "half",
      team: "half",
      shortcuts: "half",
    },
    cockpitTiles: ["upcoming"],
  },

  overview: {
    showSnapshot: true,
    showDiagnoses: true,
    showMedications: true,
    showTimeline: true,
    cardOrder: ["snapshot", "diagnoses", "medications", "timeline"],
    collapsedCards: {},
  },

  encounter: {
    showPastEncountersSearch: true,
    showIntervalHistory: true,
    showTreatmentResponse: true,
    showSideEffects: true,
    showAssessment: true,
    showPlan: true,
  },

  customPresets: {},
};

export const builtInPresets: Record<
  string,
  {
    id: string;
    name: string;
    description: string;
    icon: string;
    config: Partial<ProviderPreferences>;
  }
> = {
  standard: {
    id: "standard",
    name: "Clinical Workspace",
    description: "Complete clinical workspace with patient charts, schedule, and practice tools. Fully customizable.",
    icon: "dashboard",
    config: {
      density: "comfortable",
      headerDensity: "full",
      showCompanionRail: true,
      showSidebar: true,
      rails: { left: ["today", "schedule", "inbox", "tasks"], right: ["ai", "scratchpad", "tasks", "calc"], leftWidth: 76, rightWidth: 52 },
      today: {
        showMorningBriefing: true,
        showMetrics: true,
        showScheduleSearch: true,
        showRoster: true,
        showActionQueue: true,
        showQuickReferences: true,
        showTeamWindow: true,
        widgetOrder: ["briefing", "metrics", "roster", "queue", "team", "shortcuts"],
        collapsedWidgets: {},
        widgetSpans: {
          briefing: "full",
          metrics: "full",
          roster: "full",
          queue: "half",
          team: "half",
          shortcuts: "half",
        },
        cockpitTiles: ["scheduled", "waiting", "inVisit", "upcoming", "completed"],
      },
      overview: {
        showSnapshot: true,
        showDiagnoses: true,
        showMedications: true,
        showTimeline: true,
        cardOrder: ["snapshot", "diagnoses", "medications", "timeline"],
        collapsedCards: {},
      },
      encounter: {
        showPastEncountersSearch: true,
        showIntervalHistory: true,
        showTreatmentResponse: true,
        showSideEffects: true,
        showAssessment: true,
        showPlan: true,
      },
    },
  },
};

export const BUILT_IN_PRESETS = builtInPresets;

const STORAGE_KEY = "ehr_provider_preferences_v1";

/**
 * Merges stored preferences over the defaults one group at a time.
 *
 * A plain spread would let a stored `today` object written before a new setting
 * existed replace the whole default group, silently switching that setting off for
 * every clinician who had ever saved preferences. Every reader of stored
 * preferences — browser storage and the server repository alike — goes through here
 * so a newly added setting arrives at its default rather than as `undefined`.
 */
export function mergeStoredPreferences(parsed: Partial<ProviderPreferences> | null | undefined): ProviderPreferences {
  if (!parsed || typeof parsed !== "object") return defaultPreferences;
  const mergedToday = { ...defaultPreferences.today, ...(parsed.today || {}) };
  if (parsed.today?.widgetOrder) {
    // If stored order is missing newly introduced widgets like 'team', append them gracefully
    const order = [...parsed.today.widgetOrder];
    if (!order.includes("team")) order.push("team");
    mergedToday.widgetOrder = order;
  }
  return {
    ...defaultPreferences,
    ...parsed,
    rails: { ...defaultPreferences.rails, ...(parsed.rails || {}) },
    today: mergedToday,
    overview: { ...defaultPreferences.overview, ...(parsed.overview || {}) },
    encounter: { ...defaultPreferences.encounter, ...(parsed.encounter || {}) },
    customPresets: parsed.customPresets || {},
  };
}

export function getDefaultPreferences(): ProviderPreferences {
  return JSON.parse(JSON.stringify(defaultPreferences));
}

export function loadPreferences(): ProviderPreferences {
  if (typeof window === "undefined") return defaultPreferences;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPreferences;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || parsed.version !== 1) {
      return defaultPreferences;
    }
    return mergeStoredPreferences(parsed);
  } catch (err) {
    console.error("Failed to load provider preferences:", err);
    return defaultPreferences;
  }
}

export function savePreferences(preferences: ProviderPreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch (err) {
    console.error("Failed to save provider preferences:", err);
  }
}

export function applyPreset(presetId: string, current: ProviderPreferences): ProviderPreferences {
  const builtIn =
    builtInPresets[presetId] ||
    (["standard", "cockpit", "minimal", "intake", "med-check", "default"].includes(presetId)
      ? builtInPresets.standard
      : undefined);
  if (builtIn) {
    const updated: ProviderPreferences = {
      ...current,
      activePresetId: presetId,
      density: builtIn.config.density ?? current.density,
      headerDensity: builtIn.config.headerDensity ?? current.headerDensity,
      showCompanionRail: builtIn.config.showCompanionRail ?? current.showCompanionRail,
      showSidebar: builtIn.config.showSidebar ?? current.showSidebar,
      // Rails are part of the layout a preset describes, so applying one moves
      // them too. Without this a profile would restore the dashboard but leave
      // the rails from whatever the clinician last had open.
      rails: { ...current.rails, ...(builtIn.config.rails ?? {}) },
      today: {
        ...current.today,
        ...(builtIn.config.today ?? {}),
      },
      overview: {
        ...current.overview,
        ...(builtIn.config.overview ?? {}),
      },
      encounter: {
        ...current.encounter,
        ...(builtIn.config.encounter ?? {}),
      },
    };
    savePreferences(updated);
    return updated;
  }

  const custom = current.customPresets[presetId];
  if (custom) {
    const updated: ProviderPreferences = {
      ...current,
      ...custom,
      activePresetId: presetId,
      customPresets: current.customPresets,
    };
    savePreferences(updated);
    return updated;
  }

  return current;
}

export function applyQuickPreset(
  presetKey: "minimal" | "standard" | "cockpit" | string,
  current: ProviderPreferences
): ProviderPreferences {
  return applyPreset("standard", current);
}

export function saveCustomPreset(name: string, current: ProviderPreferences): ProviderPreferences {
  const id = `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString().slice(-4)}`;
  const { customPresets, ...configToSave } = current;
  const updated: ProviderPreferences = {
    ...current,
    activePresetId: id,
    customPresets: {
      ...customPresets,
      [id]: {
        ...configToSave,
        activePresetId: id,
      },
    },
  };
  savePreferences(updated);
  return updated;
}

export function deleteCustomPreset(id: string, current: ProviderPreferences): ProviderPreferences {
  const nextCustom = { ...current.customPresets };
  delete nextCustom[id];
  const updated: ProviderPreferences = {
    ...current,
    activePresetId: current.activePresetId === id ? "standard" : current.activePresetId,
    customPresets: nextCustom,
  };
  savePreferences(updated);
  return updated;
}

export function resetToDefaults(): ProviderPreferences {
  savePreferences(defaultPreferences);
  return defaultPreferences;
}

export type AiPreferenceResult = {
  recognized: boolean;
  feedback: string;
  updatedPreferences?: ProviderPreferences;
};

/**
 * Natural language parser for layout & preference commands.
 * Handles toggles ("hide action queue", "show morning briefing"),
 * density ("switch to compact mode", "zen mode"),
 * preset selection ("switch to minimal layout", "apply intake preset"),
 * and saving ("save current layout as Morning Focus").
 */
export function parseAiPreferenceCommand(
  rawInput: string,
  current: ProviderPreferences
): AiPreferenceResult {
  const input = rawInput.trim().toLowerCase();

  // 1. Save preset command
  const saveMatch = input.match(
    /(?:save (?:current (?:layout|view|preference|workspace)|this (?:layout|preference|preset)|preference|layout) as|save preset)\s+["']?([^"']+)["']?/i
  );
  if (saveMatch && saveMatch[1]) {
    const presetName = saveMatch[1].trim();
    const updated = saveCustomPreset(presetName, current);
    return {
      recognized: true,
      feedback: `Saved current workspace layout as custom preset “${presetName}”.`,
      updatedPreferences: updated,
    };
  }

  // 2. Layout resets
  if (
    input.includes("standard layout") ||
    input.includes("default layout") ||
    input.includes("standard view") ||
    input.includes("reset layout") ||
    input.includes("default view") ||
    input.includes("reset workspace") ||
    input.includes("default workspace")
  ) {
    const updated = applyPreset("standard", current);
    return {
      recognized: true,
      feedback: "Reset workspace to clean default Clinical Workspace layout.",
      updatedPreferences: updated,
    };
  }

  // 3. Density commands
  if (input.includes("compact mode") || input.includes("compact density") || input.includes("make it compact")) {
    const updated: ProviderPreferences = { ...current, density: "compact" };
    savePreferences(updated);
    return {
      recognized: true,
      feedback: "Switched display density to Compact mode.",
      updatedPreferences: updated,
    };
  }

  if (input.includes("comfortable mode") || input.includes("comfortable density") || input.includes("spacious")) {
    const updated: ProviderPreferences = { ...current, density: "comfortable" };
    savePreferences(updated);
    return {
      recognized: true,
      feedback: "Switched display density to Comfortable mode.",
      updatedPreferences: updated,
    };
  }

  // 4. Widget Toggles
  // Action queue
  if (input.includes("hide action queue") || input.includes("close action queue") || input.includes("remove action queue")) {
    const updated: ProviderPreferences = {
      ...current,
      today: { ...current.today, showActionQueue: false },
    };
    savePreferences(updated);
    return {
      recognized: true,
      feedback: "Action queue hidden on Today dashboard.",
      updatedPreferences: updated,
    };
  }
  if (input.includes("show action queue") || input.includes("open action queue")) {
    const updated: ProviderPreferences = {
      ...current,
      today: { ...current.today, showActionQueue: true },
    };
    savePreferences(updated);
    return {
      recognized: true,
      feedback: "Action queue restored on Today dashboard.",
      updatedPreferences: updated,
    };
  }

  // Morning briefing
  if (input.includes("hide briefing") || input.includes("hide morning briefing") || input.includes("dismiss briefing")) {
    const updated: ProviderPreferences = {
      ...current,
      today: { ...current.today, showMorningBriefing: false },
    };
    savePreferences(updated);
    return {
      recognized: true,
      feedback: "Morning briefing hidden.",
      updatedPreferences: updated,
    };
  }
  if (input.includes("show briefing") || input.includes("show morning briefing")) {
    const updated: ProviderPreferences = {
      ...current,
      today: { ...current.today, showMorningBriefing: true },
    };
    savePreferences(updated);
    return {
      recognized: true,
      feedback: "Morning briefing restored.",
      updatedPreferences: updated,
    };
  }

  // Metrics
  if (input.includes("hide metrics") || input.includes("hide numbers") || input.includes("remove metrics")) {
    const updated: ProviderPreferences = {
      ...current,
      today: { ...current.today, showMetrics: false },
    };
    savePreferences(updated);
    return {
      recognized: true,
      feedback: "Today metrics row hidden.",
      updatedPreferences: updated,
    };
  }
  if (input.includes("show metrics")) {
    const updated: ProviderPreferences = {
      ...current,
      today: { ...current.today, showMetrics: true },
    };
    savePreferences(updated);
    return {
      recognized: true,
      feedback: "Today metrics row restored.",
      updatedPreferences: updated,
    };
  }

  // Longitudinal Search / Past Notes
  if (input.includes("hide past encounters") || input.includes("hide past notes") || input.includes("hide longitudinal search")) {
    const updated: ProviderPreferences = {
      ...current,
      encounter: { ...current.encounter, showPastEncountersSearch: false },
    };
    savePreferences(updated);
    return {
      recognized: true,
      feedback: "Past encounters search drawer hidden in active encounter.",
      updatedPreferences: updated,
    };
  }
  if (input.includes("show past encounters") || input.includes("show past notes") || input.includes("show longitudinal search")) {
    const updated: ProviderPreferences = {
      ...current,
      encounter: { ...current.encounter, showPastEncountersSearch: true },
    };
    savePreferences(updated);
    return {
      recognized: true,
      feedback: "Past encounters search drawer visible in active encounter.",
      updatedPreferences: updated,
    };
  }

  // Companion rail
  if (input.includes("hide companion rail") || input.includes("hide right rail") || input.includes("hide tools rail")) {
    const updated: ProviderPreferences = {
      ...current,
      showCompanionRail: false,
    };
    savePreferences(updated);
    return {
      recognized: true,
      feedback: "Google companion right rail hidden.",
      updatedPreferences: updated,
    };
  }
  if (input.includes("show companion rail") || input.includes("show right rail") || input.includes("show tools rail")) {
    const updated: ProviderPreferences = {
      ...current,
      showCompanionRail: true,
    };
    savePreferences(updated);
    return {
      recognized: true,
      feedback: "Google companion right rail restored.",
      updatedPreferences: updated,
    };
  }

  // Snapshot card
  if (input.includes("hide snapshot") || input.includes("hide what matters now")) {
    const updated: ProviderPreferences = {
      ...current,
      overview: { ...current.overview, showSnapshot: false },
    };
    savePreferences(updated);
    return {
      recognized: true,
      feedback: "Clinical snapshot card hidden in patient chart.",
      updatedPreferences: updated,
    };
  }
  if (input.includes("show snapshot")) {
    const updated: ProviderPreferences = {
      ...current,
      overview: { ...current.overview, showSnapshot: true },
    };
    savePreferences(updated);
    return {
      recognized: true,
      feedback: "Clinical snapshot card restored.",
      updatedPreferences: updated,
    };
  }

  return { recognized: false, feedback: "" };
}
