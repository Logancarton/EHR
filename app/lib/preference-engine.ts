export type DensityMode = "comfortable" | "compact" | "minimal";
export type HeaderDensity = "full" | "compact" | "minimal";

export type TodayWidgetId = "briefing" | "metrics" | "roster" | "queue" | "shortcuts";
export type OverviewCardId = "snapshot" | "diagnoses" | "medications" | "timeline";

export type ProviderPreferences = {
  version: number;
  activePresetId: string;
  density: DensityMode;
  headerDensity: HeaderDensity;
  showCompanionRail: boolean;
  showSidebar: boolean;

  today: {
    showMorningBriefing: boolean;
    showMetrics: boolean;
    showScheduleSearch: boolean;
    showActionQueue: boolean;
    showQuickReferences: boolean;
    widgetOrder: TodayWidgetId[];
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

  today: {
    showMorningBriefing: true,
    showMetrics: true,
    showScheduleSearch: true,
    showActionQueue: true,
    showQuickReferences: true,
    widgetOrder: ["briefing", "metrics", "roster", "queue", "shortcuts"],
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
    name: "Standard Balanced",
    description: "Full clinical workstation with all widgets, queues, and context panels visible.",
    icon: "🌟",
    config: {
      density: "comfortable",
      headerDensity: "full",
      showCompanionRail: true,
      showSidebar: true,
      today: {
        showMorningBriefing: true,
        showMetrics: true,
        showScheduleSearch: true,
        showActionQueue: true,
        showQuickReferences: true,
        widgetOrder: ["briefing", "metrics", "roster", "queue", "shortcuts"],
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

  minimal: {
    id: "minimal",
    name: "Minimal / Zen Focus",
    description: "Distraction-free environment. Hides metrics, briefing, and sidebars for focused documentation.",
    icon: "🧘",
    config: {
      density: "minimal",
      headerDensity: "minimal",
      showCompanionRail: false,
      showSidebar: false,
      today: {
        showMorningBriefing: false,
        showMetrics: false,
        showScheduleSearch: true,
        showActionQueue: false,
        showQuickReferences: false,
        widgetOrder: ["roster"],
      },
      overview: {
        showSnapshot: true,
        showDiagnoses: false,
        showMedications: true,
        showTimeline: false,
        cardOrder: ["snapshot", "medications"],
        collapsedCards: {},
      },
      encounter: {
        showPastEncountersSearch: false,
        showIntervalHistory: true,
        showTreatmentResponse: false,
        showSideEffects: false,
        showAssessment: true,
        showPlan: true,
      },
    },
  },

  intake: {
    id: "intake",
    name: "Comprehensive Intake",
    description: "Expanded longitudinal view with past notes search, complete diagnostic timeline, and roster priority.",
    icon: "📋",
    config: {
      density: "comfortable",
      headerDensity: "full",
      showCompanionRail: true,
      showSidebar: true,
      today: {
        showMorningBriefing: true,
        showMetrics: true,
        showScheduleSearch: true,
        showActionQueue: true,
        showQuickReferences: true,
        widgetOrder: ["briefing", "roster", "metrics", "queue", "shortcuts"],
      },
      overview: {
        showSnapshot: true,
        showDiagnoses: true,
        showMedications: true,
        showTimeline: true,
        cardOrder: ["timeline", "diagnoses", "snapshot", "medications"],
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

  "med-check": {
    id: "med-check",
    name: "Fast Med Check",
    description: "High-density medication management. Emphasizes active prescriptions, surveillance, and quick metrics.",
    icon: "💊",
    config: {
      density: "compact",
      headerDensity: "compact",
      showCompanionRail: true,
      showSidebar: true,
      today: {
        showMorningBriefing: false,
        showMetrics: true,
        showScheduleSearch: true,
        showActionQueue: true,
        showQuickReferences: true,
        widgetOrder: ["metrics", "roster", "queue", "shortcuts"],
      },
      overview: {
        showSnapshot: true,
        showDiagnoses: true,
        showMedications: true,
        showTimeline: false,
        cardOrder: ["medications", "snapshot", "diagnoses"],
        collapsedCards: { diagnoses: true },
      },
      encounter: {
        showPastEncountersSearch: false,
        showIntervalHistory: true,
        showTreatmentResponse: true,
        showSideEffects: true,
        showAssessment: false,
        showPlan: true,
      },
    },
  },

  cockpit: {
    id: "cockpit",
    name: "Psychopharm Cockpit",
    description: "High-density multi-metric workspace for high-volume psychopharmacology with compact headers, live queues, and complete surveillance.",
    icon: "🚀",
    config: {
      density: "compact",
      headerDensity: "compact",
      showCompanionRail: true,
      showSidebar: true,
      today: {
        showMorningBriefing: true,
        showMetrics: true,
        showScheduleSearch: true,
        showActionQueue: true,
        showQuickReferences: true,
        widgetOrder: ["metrics", "queue", "roster", "briefing", "shortcuts"],
      },
      overview: {
        showSnapshot: true,
        showDiagnoses: true,
        showMedications: true,
        showTimeline: true,
        cardOrder: ["medications", "snapshot", "timeline", "diagnoses"],
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

const STORAGE_KEY = "ehr_provider_preferences_v1";

export function loadPreferences(): ProviderPreferences {
  if (typeof window === "undefined") return defaultPreferences;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPreferences;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || parsed.version !== 1) {
      return defaultPreferences;
    }
    return {
      ...defaultPreferences,
      ...parsed,
      today: { ...defaultPreferences.today, ...(parsed.today || {}) },
      overview: { ...defaultPreferences.overview, ...(parsed.overview || {}) },
      encounter: { ...defaultPreferences.encounter, ...(parsed.encounter || {}) },
      customPresets: parsed.customPresets || {},
    };
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
  const builtIn = builtInPresets[presetId];
  if (builtIn) {
    const updated: ProviderPreferences = {
      ...current,
      activePresetId: presetId,
      density: builtIn.config.density ?? current.density,
      headerDensity: builtIn.config.headerDensity ?? current.headerDensity,
      showCompanionRail: builtIn.config.showCompanionRail ?? current.showCompanionRail,
      showSidebar: builtIn.config.showSidebar ?? current.showSidebar,
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
  presetKey: "minimal" | "standard" | "cockpit",
  current: ProviderPreferences
): ProviderPreferences {
  return applyPreset(presetKey, current);
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

  // 2. Preset activations
  if (
    input.includes("minimal mode") ||
    input.includes("zen mode") ||
    input.includes("focus mode") ||
    input.includes("minimal layout") ||
    input.includes("minimal view")
  ) {
    const updated = applyPreset("minimal", current);
    return {
      recognized: true,
      feedback: "Activated Minimal / Zen Focus preset. Secondary sidebars and widgets hidden.",
      updatedPreferences: updated,
    };
  }

  if (
    input.includes("standard layout") ||
    input.includes("default layout") ||
    input.includes("standard view") ||
    input.includes("reset layout") ||
    input.includes("default view") ||
    input.includes("balanced mode") ||
    input.includes("balanced layout") ||
    input.includes("balanced view")
  ) {
    const updated = applyPreset("standard", current);
    return {
      recognized: true,
      feedback: "Reset workspace to Standard Balanced preset.",
      updatedPreferences: updated,
    };
  }

  if (
    input.includes("cockpit mode") ||
    input.includes("cockpit layout") ||
    input.includes("cockpit view") ||
    input.includes("cockpit") ||
    input.includes("high density mode")
  ) {
    const updated = applyPreset("cockpit", current);
    return {
      recognized: true,
      feedback: "Activated Psychopharm Cockpit preset with compact headers and live protocol queues.",
      updatedPreferences: updated,
    };
  }

  if (
    input.includes("intake mode") ||
    input.includes("intake preset") ||
    input.includes("intake layout") ||
    input.includes("comprehensive layout")
  ) {
    const updated = applyPreset("intake", current);
    return {
      recognized: true,
      feedback: "Activated Comprehensive Intake preset with past encounter search and full MSE blocks.",
      updatedPreferences: updated,
    };
  }

  if (
    input.includes("med check") ||
    input.includes("medication check") ||
    input.includes("med check layout")
  ) {
    const updated = applyPreset("med-check", current);
    return {
      recognized: true,
      feedback: "Activated Fast Med Check preset with prioritized medications and compact density.",
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
