import { type CockpitMetricId } from "./cockpit-metrics";
import { DEFAULT_ROSTER_FIELDS, type RosterFieldId, sanitizeRosterFields } from "../domain/roster-fields";
import {
  type AdaptiveLayoutPreferences,
  defaultAdaptivePreferences,
} from "./adaptive-layout-engine";

export type DensityMode = "comfortable" | "compact" | "minimal";
export type HeaderDensity = "full" | "compact" | "minimal";

export type TodayWidgetId =
  | "briefing"
  | "metrics"
  | "roster"
  | "queue"
  | "team"
  | "shortcuts"
  | "arrivals"
  | "visit-prep";
export type OverviewCardId = "snapshot" | "diagnoses" | "medications" | "timeline";

export type PresetLayoutConfig = {
  density: DensityMode;
  headerDensity: HeaderDensity;
  showCompanionRail: boolean;
  showSidebar: boolean;
  rails: {
    left: string[];
    right: string[];
    leftWidth: number;
    rightWidth: number;
  };
  today: ProviderPreferences["today"];
  overview: ProviderPreferences["overview"];
  encounter: ProviderPreferences["encounter"];
};

export interface NamedLayoutPreset {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  isBuiltIn?: boolean;
  isPracticeTemplate?: boolean;
  createdAt: string;
  updatedAt: string;
  layout: PresetLayoutConfig;
}

export type ProviderPreferences = {
  version: number;
  revision: number;
  updatedAt?: string;
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
    showArrivals?: boolean;
    showVisitPrep?: boolean;
    widgetOrder: TodayWidgetId[];
    /** Collapsed sections keep their place and stay restorable; hidden ones leave the page. */
    collapsedWidgets: Partial<Record<TodayWidgetId, boolean>>;
    /** Widget width spans: half vs full. */
    widgetSpans?: Partial<Record<TodayWidgetId, "half" | "full">>;
    /** Which Practice Cockpit tiles are shown, in order. */
    cockpitTiles: CockpitMetricId[];
    /** Configured roster columns/fields for the schedule. */
    rosterFields?: RosterFieldId[];
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

  namedPresets: Record<string, NamedLayoutPreset>;
  customPresets: Record<string, Omit<ProviderPreferences, "customPresets">>;
  adaptiveLayout?: AdaptiveLayoutPreferences;
};

export const defaultPreferences: ProviderPreferences = {
  version: 1,
  revision: 1,
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
    showArrivals: false,
    showVisitPrep: false,
    widgetOrder: ["briefing", "metrics", "roster", "queue", "team", "shortcuts", "arrivals", "visit-prep"],
    collapsedWidgets: {},
    widgetSpans: {
      briefing: "full",
      metrics: "full",
      roster: "full",
      queue: "half",
      team: "half",
      shortcuts: "half",
      arrivals: "half",
      "visit-prep": "half",
    },
    cockpitTiles: ["upcoming"],
    rosterFields: [...DEFAULT_ROSTER_FIELDS],
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

  namedPresets: {},
  customPresets: {},
  adaptiveLayout: defaultAdaptivePreferences,
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
        rosterFields: [...DEFAULT_ROSTER_FIELDS],
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
  cockpit: {
    id: "cockpit",
    name: "Psychopharm Cockpit",
    description: "High-density multi-metric cockpit for rapid high-volume medication management and patient flow.",
    icon: "monitor",
    config: {
      density: "compact",
      headerDensity: "compact",
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
        showArrivals: true,
        showVisitPrep: true,
        widgetOrder: ["metrics", "roster", "arrivals", "visit-prep", "queue", "briefing", "team", "shortcuts"],
        collapsedWidgets: {},
        widgetSpans: {
          metrics: "full",
          roster: "full",
          arrivals: "half",
          "visit-prep": "half",
          queue: "half",
          briefing: "half",
          team: "half",
          shortcuts: "half",
        },
        cockpitTiles: ["scheduled", "waiting", "inVisit", "upcoming", "completed"],
        rosterFields: [...DEFAULT_ROSTER_FIELDS],
      },
      overview: {
        showSnapshot: true,
        showDiagnoses: true,
        showMedications: true,
        showTimeline: true,
        cardOrder: ["medications", "snapshot", "diagnoses", "timeline"],
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
    name: "Therapy Zen",
    description: "Distraction-free environment for psychotherapy and focused clinical note writing.",
    icon: "feather",
    config: {
      density: "comfortable",
      headerDensity: "minimal",
      showCompanionRail: false,
      showSidebar: false,
      rails: { left: ["today", "schedule"], right: ["scratchpad"], leftWidth: 60, rightWidth: 40 },
      today: {
        showMorningBriefing: false,
        showMetrics: false,
        showScheduleSearch: false,
        showRoster: true,
        showActionQueue: false,
        showQuickReferences: false,
        showTeamWindow: false,
        widgetOrder: ["roster", "team"],
        collapsedWidgets: {},
        widgetSpans: {
          roster: "full",
        },
        cockpitTiles: ["upcoming"],
        rosterFields: ["time", "patientName", "status", "visitType"],
      },
      overview: {
        showSnapshot: true,
        showDiagnoses: false,
        showMedications: false,
        showTimeline: true,
        cardOrder: ["snapshot", "timeline"],
        collapsedCards: {},
      },
      encounter: {
        showPastEncountersSearch: false,
        showIntervalHistory: false,
        showTreatmentResponse: false,
        showSideEffects: false,
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
    // If stored order is missing newly introduced widgets like 'team', 'arrivals', 'visit-prep', append them gracefully
    const order = [...parsed.today.widgetOrder];
    if (!order.includes("team")) order.push("team");
    if (!order.includes("arrivals")) order.push("arrivals");
    if (!order.includes("visit-prep")) order.push("visit-prep");
    mergedToday.widgetOrder = order;
  }
  if (parsed.today?.rosterFields) {
    mergedToday.rosterFields = sanitizeRosterFields(parsed.today.rosterFields);
  } else {
    mergedToday.rosterFields = [...DEFAULT_ROSTER_FIELDS];
  }

  // Migrate legacy customPresets to namedPresets if needed
  const namedPresets: Record<string, NamedLayoutPreset> = { ...(parsed.namedPresets || {}) };
  if (parsed.customPresets) {
    for (const [key, val] of Object.entries(parsed.customPresets)) {
      if (!namedPresets[key] && val) {
        namedPresets[key] = {
          id: key,
          name: key.replace(/^custom-/, "").replace(/-\d+$/, "").replace(/-/g, " "),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          layout: {
            density: val.density ?? defaultPreferences.density,
            headerDensity: val.headerDensity ?? defaultPreferences.headerDensity,
            showCompanionRail: val.showCompanionRail ?? defaultPreferences.showCompanionRail,
            showSidebar: val.showSidebar ?? defaultPreferences.showSidebar,
            rails: val.rails ?? defaultPreferences.rails,
            today: val.today ?? defaultPreferences.today,
            overview: val.overview ?? defaultPreferences.overview,
            encounter: val.encounter ?? defaultPreferences.encounter,
          },
        };
      }
    }
  }

  return {
    ...defaultPreferences,
    ...parsed,
    revision: typeof parsed.revision === "number" ? parsed.revision : 1,
    rails: { ...defaultPreferences.rails, ...(parsed.rails || {}) },
    today: mergedToday,
    overview: { ...defaultPreferences.overview, ...(parsed.overview || {}) },
    encounter: { ...defaultPreferences.encounter, ...(parsed.encounter || {}) },
    namedPresets,
    customPresets: parsed.customPresets || {},
    adaptiveLayout: parsed.adaptiveLayout
      ? { ...defaultAdaptivePreferences, ...parsed.adaptiveLayout }
      : defaultAdaptivePreferences,
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

export function extractLayoutConfig(current: ProviderPreferences): PresetLayoutConfig {
  return {
    density: current.density,
    headerDensity: current.headerDensity,
    showCompanionRail: current.showCompanionRail,
    showSidebar: current.showSidebar,
    rails: { ...current.rails },
    today: { ...current.today },
    overview: { ...current.overview },
    encounter: { ...current.encounter },
  };
}

export function applyPreset(presetId: string, current: ProviderPreferences): ProviderPreferences {
  const builtIn =
    builtInPresets[presetId] ||
    (["intake", "med-check", "default"].includes(presetId)
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

  const named = current.namedPresets[presetId];
  if (named) {
    const layout = named.layout;
    const updated: ProviderPreferences = {
      ...current,
      activePresetId: presetId,
      density: layout.density ?? current.density,
      headerDensity: layout.headerDensity ?? current.headerDensity,
      showCompanionRail: layout.showCompanionRail ?? current.showCompanionRail,
      showSidebar: layout.showSidebar ?? current.showSidebar,
      rails: { ...current.rails, ...(layout.rails ?? {}) },
      today: {
        ...current.today,
        ...(layout.today ?? {}),
      },
      overview: {
        ...current.overview,
        ...(layout.overview ?? {}),
      },
      encounter: {
        ...current.encounter,
        ...(layout.encounter ?? {}),
      },
    };
    savePreferences(updated);
    return updated;
  }

  const custom = current.customPresets?.[presetId];
  if (custom) {
    const updated: ProviderPreferences = {
      ...current,
      ...custom,
      activePresetId: presetId,
      namedPresets: current.namedPresets,
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
  if (presetKey === "minimal" || presetKey === "cockpit" || presetKey === "standard") {
    return applyPreset(presetKey, current);
  }
  return applyPreset("standard", current);
}

/**
 * Checks if the current working layout has been modified relative to the active preset.
 * Modifying the working layout must never silently mutate a named preset; this flag
 * lets the UI indicate "Modified from [Preset Name]" and offer explicit update/save actions.
 */
export function isPresetModified(current: ProviderPreferences): boolean {
  const activeId = current.activePresetId;
  const builtIn = builtInPresets[activeId];
  if (builtIn) {
    const cfg = builtIn.config;
    if (cfg.density !== undefined && cfg.density !== current.density) return true;
    if (cfg.headerDensity !== undefined && cfg.headerDensity !== current.headerDensity) return true;
    if (cfg.showCompanionRail !== undefined && cfg.showCompanionRail !== current.showCompanionRail) return true;
    if (cfg.showSidebar !== undefined && cfg.showSidebar !== current.showSidebar) return true;
    if (cfg.today) {
      if (cfg.today.showMorningBriefing !== undefined && cfg.today.showMorningBriefing !== current.today.showMorningBriefing) return true;
      if (cfg.today.showMetrics !== undefined && cfg.today.showMetrics !== current.today.showMetrics) return true;
      if (cfg.today.showScheduleSearch !== undefined && cfg.today.showScheduleSearch !== current.today.showScheduleSearch) return true;
      if (cfg.today.showRoster !== undefined && cfg.today.showRoster !== current.today.showRoster) return true;
      if (cfg.today.showActionQueue !== undefined && cfg.today.showActionQueue !== current.today.showActionQueue) return true;
      if (cfg.today.showQuickReferences !== undefined && cfg.today.showQuickReferences !== current.today.showQuickReferences) return true;
      if (cfg.today.showTeamWindow !== undefined && cfg.today.showTeamWindow !== current.today.showTeamWindow) return true;
      if (cfg.today.widgetOrder && JSON.stringify(cfg.today.widgetOrder) !== JSON.stringify(current.today.widgetOrder)) return true;
      if (cfg.today.widgetSpans && JSON.stringify(cfg.today.widgetSpans) !== JSON.stringify(current.today.widgetSpans)) return true;
      if (cfg.today.cockpitTiles && JSON.stringify(cfg.today.cockpitTiles) !== JSON.stringify(current.today.cockpitTiles)) return true;
      if (cfg.today.rosterFields && JSON.stringify(cfg.today.rosterFields) !== JSON.stringify(current.today.rosterFields)) return true;
    }
    return false;
  }

  const named = current.namedPresets[activeId];
  if (named) {
    const l = named.layout;
    if (l.density !== current.density) return true;
    if (l.headerDensity !== current.headerDensity) return true;
    if (l.showCompanionRail !== current.showCompanionRail) return true;
    if (l.showSidebar !== current.showSidebar) return true;
    if (l.today.showMorningBriefing !== current.today.showMorningBriefing) return true;
    if (l.today.showMetrics !== current.today.showMetrics) return true;
    if (l.today.showScheduleSearch !== current.today.showScheduleSearch) return true;
    if (l.today.showRoster !== current.today.showRoster) return true;
    if (l.today.showActionQueue !== current.today.showActionQueue) return true;
    if (l.today.showQuickReferences !== current.today.showQuickReferences) return true;
    if (l.today.showTeamWindow !== current.today.showTeamWindow) return true;
    if (JSON.stringify(l.today.widgetOrder) !== JSON.stringify(current.today.widgetOrder)) return true;
    if (JSON.stringify(l.today.widgetSpans || {}) !== JSON.stringify(current.today.widgetSpans || {})) return true;
    if (JSON.stringify(l.today.cockpitTiles || []) !== JSON.stringify(current.today.cockpitTiles || [])) return true;
    if (JSON.stringify(l.today.rosterFields || []) !== JSON.stringify(current.today.rosterFields || [])) return true;
    return false;
  }

  return false;
}

/**
 * Reverts the current working layout back to the active preset's saved settings.
 */
export function revertToActivePreset(current: ProviderPreferences): ProviderPreferences {
  return applyPreset(current.activePresetId, current);
}

/**
 * Creates an independent named preset from the current working layout.
 */
export function createNamedPreset(
  name: string,
  current: ProviderPreferences,
  description?: string,
  icon?: string,
): ProviderPreferences {
  const cleanName = name.trim() || "Custom Preset";
  const id = `preset-${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString().slice(-4)}`;
  const now = new Date().toISOString();

  const newPreset: NamedLayoutPreset = {
    id,
    name: cleanName,
    description: description?.trim() || `Personal layout preset created ${new Date().toLocaleDateString()}`,
    icon: icon || "layout",
    createdAt: now,
    updatedAt: now,
    layout: extractLayoutConfig(current),
  };

  const updated: ProviderPreferences = {
    ...current,
    activePresetId: id,
    namedPresets: {
      ...current.namedPresets,
      [id]: newPreset,
    },
    // Keep customPresets in sync for backward compatibility
    customPresets: {
      ...(current.customPresets || {}),
      [id]: {
        ...current,
        activePresetId: id,
      },
    },
  };

  savePreferences(updated);
  return updated;
}

/**
 * Explicitly updates an existing custom named preset with current layout.
 * Built-in presets cannot be overwritten.
 */
export function updateNamedPreset(id: string, current: ProviderPreferences): ProviderPreferences {
  if (builtInPresets[id]) {
    throw new Error(`Cannot overwrite built-in preset "${builtInPresets[id].name}". Save as a new preset instead.`);
  }

  const existing = current.namedPresets[id];
  if (!existing) {
    return createNamedPreset(id, current);
  }

  const now = new Date().toISOString();
  const updatedPreset: NamedLayoutPreset = {
    ...existing,
    updatedAt: now,
    layout: extractLayoutConfig(current),
  };

  const updated: ProviderPreferences = {
    ...current,
    activePresetId: id,
    namedPresets: {
      ...current.namedPresets,
      [id]: updatedPreset,
    },
  };

  savePreferences(updated);
  return updated;
}

/**
 * Duplicates an existing preset under a new name.
 */
export function duplicateNamedPreset(
  sourcePresetId: string,
  newName: string,
  current: ProviderPreferences,
): ProviderPreferences {
  let layout: PresetLayoutConfig;

  const builtIn = builtInPresets[sourcePresetId];
  if (builtIn) {
    const temp = applyPreset(sourcePresetId, current);
    layout = extractLayoutConfig(temp);
  } else if (current.namedPresets[sourcePresetId]) {
    layout = JSON.parse(JSON.stringify(current.namedPresets[sourcePresetId].layout));
  } else {
    layout = extractLayoutConfig(current);
  }

  const cleanName = newName.trim() || `${sourcePresetId} Copy`;
  const id = `preset-${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString().slice(-4)}`;
  const now = new Date().toISOString();

  const newPreset: NamedLayoutPreset = {
    id,
    name: cleanName,
    description: `Copy of ${builtIn ? builtIn.name : (current.namedPresets[sourcePresetId]?.name || sourcePresetId)}`,
    icon: builtIn ? builtIn.icon : (current.namedPresets[sourcePresetId]?.icon || "copy"),
    createdAt: now,
    updatedAt: now,
    layout,
  };

  const updated: ProviderPreferences = {
    ...current,
    activePresetId: id,
    namedPresets: {
      ...current.namedPresets,
      [id]: newPreset,
    },
  };

  savePreferences(updated);
  return updated;
}

/**
 * Renames a custom named preset.
 */
export function renameNamedPreset(
  id: string,
  newName: string,
  current: ProviderPreferences,
): ProviderPreferences {
  if (builtInPresets[id]) {
    throw new Error(`Cannot rename built-in preset "${builtInPresets[id].name}".`);
  }

  const existing = current.namedPresets[id];
  if (!existing) return current;

  const cleanName = newName.trim();
  if (!cleanName) return current;

  const updatedPreset: NamedLayoutPreset = {
    ...existing,
    name: cleanName,
    updatedAt: new Date().toISOString(),
  };

  const updated: ProviderPreferences = {
    ...current,
    namedPresets: {
      ...current.namedPresets,
      [id]: updatedPreset,
    },
  };

  savePreferences(updated);
  return updated;
}

/**
 * Deletes a custom named preset. Built-in presets cannot be deleted.
 */
export function deleteNamedPreset(id: string, current: ProviderPreferences): ProviderPreferences {
  if (builtInPresets[id]) {
    throw new Error(`Cannot delete built-in preset "${builtInPresets[id].name}".`);
  }

  const nextNamed = { ...current.namedPresets };
  delete nextNamed[id];

  const nextCustom = { ...(current.customPresets || {}) };
  delete nextCustom[id];

  const nextActive = current.activePresetId === id ? "standard" : current.activePresetId;

  const updated: ProviderPreferences = {
    ...current,
    activePresetId: nextActive,
    namedPresets: nextNamed,
    customPresets: nextCustom,
  };

  savePreferences(updated);
  return updated;
}

/**
 * Adopting a practice template copies its configuration into personal preferences
 * and creates an independent personal named preset. Later edits or deletion of the
 * practice template by managers never alters the adopted personal layout.
 */
export function adoptPracticeTemplate(
  template: {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    config: Partial<ProviderPreferences>;
  },
  current: ProviderPreferences,
): ProviderPreferences {
  const cfg = template.config;
  const adoptedLayout: PresetLayoutConfig = {
    density: cfg.density ?? current.density,
    headerDensity: cfg.headerDensity ?? current.headerDensity,
    showCompanionRail: cfg.showCompanionRail ?? current.showCompanionRail,
    showSidebar: cfg.showSidebar ?? current.showSidebar,
    rails: { ...current.rails, ...(cfg.rails ?? {}) },
    today: { ...current.today, ...(cfg.today ?? {}) },
    overview: { ...current.overview, ...(cfg.overview ?? {}) },
    encounter: { ...current.encounter, ...(cfg.encounter ?? {}) },
  };

  const now = new Date().toISOString();
  const personalPresetId = `adopted-${template.id}-${now.slice(0, 10)}`;

  const personalPreset: NamedLayoutPreset = {
    id: personalPresetId,
    name: `${template.name} (My Copy)`,
    description: template.description || `Adopted from practice template ${template.name}`,
    icon: template.icon || "template",
    isPracticeTemplate: true,
    createdAt: now,
    updatedAt: now,
    layout: adoptedLayout,
  };

  const updated: ProviderPreferences = {
    ...current,
    activePresetId: personalPresetId,
    density: adoptedLayout.density,
    headerDensity: adoptedLayout.headerDensity,
    showCompanionRail: adoptedLayout.showCompanionRail,
    showSidebar: adoptedLayout.showSidebar,
    rails: adoptedLayout.rails,
    today: adoptedLayout.today,
    overview: adoptedLayout.overview,
    encounter: adoptedLayout.encounter,
    namedPresets: {
      ...current.namedPresets,
      [personalPresetId]: personalPreset,
    },
  };

  savePreferences(updated);
  return updated;
}

export function saveCustomPreset(name: string, current: ProviderPreferences): ProviderPreferences {
  return createNamedPreset(name, current);
}

export function deleteCustomPreset(id: string, current: ProviderPreferences): ProviderPreferences {
  return deleteNamedPreset(id, current);
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
