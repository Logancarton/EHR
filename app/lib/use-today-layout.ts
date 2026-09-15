"use client";

import { useCallback, useMemo } from "react";
import {
  type ProviderPreferences,
  type TodayWidgetId,
  savePreferences,
} from "./preference-engine";

/**
 * How the clinician has arranged Today: which sections are shown, which are folded
 * away, and in what order.
 *
 * All of it is persisted rather than component state. Someone who folds the cockpit
 * away expects it to stay folded on their next visit, the same way a hidden section
 * stays hidden — so every change here writes through the preference record.
 *
 * Pulled out of `TodayDashboard` unchanged. It is layout preference manipulation and
 * nothing else, which made it the clearest seam in that file.
 */

export type HiddenTodaySection = { id: TodayWidgetId; label: string };

export type SectionTools = {
  label: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onHide?: () => void;
};

/**
 * One place that knows a section's name and which preference controls it, so the
 * section header, the toast and the restore bar cannot drift out of agreement.
 *
 * `shipsVisible` is the difference between a section a clinician *dismissed* and a
 * window they have simply never added. Both are stored as the same `false`, and
 * conflating them put "2 hidden — waiting room, visit preparation" on a brand-new
 * default dashboard, where nothing had been hidden at all. Arrivals and visit prep
 * are front-desk windows that ship off (DB-4): a prescriber running their own day
 * is not the front desk. They belong in the Add Window menu, which already lists
 * every window that is off, not in a bar whose whole contract is "this is what you
 * dismissed, and nothing at all when you have dismissed nothing".
 *
 * `restoreAllSections` already encoded this belief by restoring only the six
 * sections that ship visible. This makes the same rule readable in one place
 * instead of being implied by an omission.
 */
export const TODAY_SECTION_META: Record<
  TodayWidgetId,
  {
    label: string;
    visibilityKey: keyof ProviderPreferences["today"];
    movedLabel: string;
    /** True when the section is part of the default dashboard, so off means dismissed. */
    shipsVisible: boolean;
  }
> = {
  briefing: { label: "morning briefing", visibilityKey: "showMorningBriefing", movedLabel: "AI Morning Briefing", shipsVisible: true },
  metrics: { label: "practice cockpit", visibilityKey: "showMetrics", movedLabel: "Daily Metrics", shipsVisible: true },
  roster: { label: "patient flow", visibilityKey: "showRoster", movedLabel: "Encounter Roster", shipsVisible: true },
  queue: { label: "action queue", visibilityKey: "showActionQueue", movedLabel: "Action Queue", shipsVisible: true },
  team: { label: "team collaboration", visibilityKey: "showTeamWindow", movedLabel: "Team Collaboration", shipsVisible: true },
  shortcuts: { label: "daily shortcuts", visibilityKey: "showQuickReferences", movedLabel: "Daily Shortcuts", shipsVisible: true },
  arrivals: { label: "waiting room", visibilityKey: "showArrivals", movedLabel: "Waiting Room & Arrivals", shipsVisible: false },
  "visit-prep": { label: "visit preparation", visibilityKey: "showVisitPrep", movedLabel: "Visit Preparation", shipsVisible: false },
};

export type TodayLayout = {
  hiddenSections: HiddenTodaySection[];
  /** Writes any change to the Today preference block, e.g. the cockpit tile set. */
  applyTodayPreferences: (today: ProviderPreferences["today"]) => void;
  isCollapsed: (widgetId: TodayWidgetId) => boolean;
  spanFor: (widgetId: TodayWidgetId) => "half" | "full";
  cycleSpan: (widgetId: TodayWidgetId) => void;
  moveWidget: (widgetId: TodayWidgetId, direction: "up" | "down") => void;
  toggleCollapse: (widgetId: TodayWidgetId) => void;
  hideSection: (widgetId: TodayWidgetId) => void;
  sectionToolsFor: (widgetId: TodayWidgetId, options?: { hideable?: boolean }) => SectionTools;
  restoreSection: (widgetId: TodayWidgetId) => void;
  restoreAllSections: () => void;
};

export function useTodayLayout({
  preferences,
  onUpdatePreferences,
  announce,
}: {
  preferences: ProviderPreferences;
  onUpdatePreferences?: (updated: ProviderPreferences) => void;
  announce: (message: string) => void;
}): TodayLayout {
  const applyTodayPreferences = useCallback(
    (today: ProviderPreferences["today"]) => {
      if (!onUpdatePreferences) return;
      const next: ProviderPreferences = { ...preferences, today };
      savePreferences(next);
      onUpdatePreferences(next);
    },
    [preferences, onUpdatePreferences],
  );

  const isCollapsed = useCallback(
    (widgetId: TodayWidgetId) => Boolean(preferences.today.collapsedWidgets?.[widgetId]),
    [preferences.today.collapsedWidgets],
  );

  const spanFor = useCallback(
    (widgetId: TodayWidgetId): "half" | "full" => {
      const stored = preferences.today.widgetSpans?.[widgetId];
      if (stored === "half" || stored === "full") return stored;
      if (widgetId === "roster" || widgetId === "metrics" || widgetId === "briefing") return "full";
      return "half";
    },
    [preferences.today.widgetSpans],
  );

  const cycleSpan = useCallback(
    (widgetId: TodayWidgetId) => {
      const current = spanFor(widgetId);
      const nextSpan = current === "half" ? "full" : "half";
      applyTodayPreferences({
        ...preferences.today,
        widgetSpans: {
          ...(preferences.today.widgetSpans || {}),
          [widgetId]: nextSpan,
        },
      });
      announce(`Made ${TODAY_SECTION_META[widgetId].movedLabel} ${nextSpan} width`);
    },
    [applyTodayPreferences, preferences.today, spanFor, announce],
  );

  const hideSection = useCallback(
    (widgetId: TodayWidgetId) => {
      const meta = TODAY_SECTION_META[widgetId];
      applyTodayPreferences({ ...preferences.today, [meta.visibilityKey]: false });
      announce(`Hid the ${meta.label}. Restore it from the hidden-sections bar.`);
    },
    [applyTodayPreferences, preferences.today, announce],
  );

  const restoreSection = useCallback(
    (widgetId: TodayWidgetId) => {
      const meta = TODAY_SECTION_META[widgetId];
      applyTodayPreferences({ ...preferences.today, [meta.visibilityKey]: true });
    },
    [applyTodayPreferences, preferences.today],
  );

  const restoreAllSections = useCallback(() => {
    applyTodayPreferences({
      ...preferences.today,
      showMorningBriefing: true,
      showMetrics: true,
      showRoster: true,
      showActionQueue: true,
      showQuickReferences: true,
      showTeamWindow: true,
    });
  }, [applyTodayPreferences, preferences.today]);

  const toggleCollapse = useCallback(
    (widgetId: TodayWidgetId) => {
      applyTodayPreferences({
        ...preferences.today,
        collapsedWidgets: {
          ...preferences.today.collapsedWidgets,
          [widgetId]: !isCollapsed(widgetId),
        },
      });
    },
    [applyTodayPreferences, preferences.today, isCollapsed],
  );

  const moveWidget = useCallback(
    (widgetId: TodayWidgetId, direction: "up" | "down") => {
      if (!onUpdatePreferences) return;
      const order = [...preferences.today.widgetOrder];
      const index = order.indexOf(widgetId);
      if (index === -1) return;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= order.length) return;
      [order[index], order[target]] = [order[target], order[index]];

      const next: ProviderPreferences = {
        ...preferences,
        today: { ...preferences.today, widgetOrder: order },
      };
      savePreferences(next);
      onUpdatePreferences(next);
      announce(`Moved ${TODAY_SECTION_META[widgetId].movedLabel} ${direction}`);
    },
    [preferences, onUpdatePreferences, announce],
  );

  const sectionToolsFor = useCallback(
    (widgetId: TodayWidgetId, options: { hideable?: boolean } = {}): SectionTools => {
      const order = preferences.today.widgetOrder;
      const index = order.indexOf(widgetId);
      return {
        label: TODAY_SECTION_META[widgetId].label,
        canMoveUp: index > 0,
        canMoveDown: index >= 0 && index < order.length - 1,
        onMoveUp: () => moveWidget(widgetId, "up"),
        onMoveDown: () => moveWidget(widgetId, "down"),
        collapsed: isCollapsed(widgetId),
        onToggleCollapse: () => toggleCollapse(widgetId),
        onHide: options.hideable === false ? undefined : () => hideSection(widgetId),
      };
    },
    [preferences.today.widgetOrder, moveWidget, isCollapsed, toggleCollapse, hideSection],
  );

  // Only sections that ship visible can have been dismissed; an opt-in window that
  // is off was never on the canvas, and listing it as "hidden" made a default
  // dashboard claim the clinician had hidden two things they had never seen.
  const hiddenSections = useMemo(
    () =>
      (Object.keys(TODAY_SECTION_META) as TodayWidgetId[])
        .filter((widgetId) => TODAY_SECTION_META[widgetId].shipsVisible)
        .filter((widgetId) => !preferences.today[TODAY_SECTION_META[widgetId].visibilityKey])
        .map((widgetId) => ({ id: widgetId, label: TODAY_SECTION_META[widgetId].label })),
    [preferences.today],
  );

  return {
    hiddenSections,
    applyTodayPreferences,
    isCollapsed,
    spanFor,
    cycleSpan,
    moveWidget,
    toggleCollapse,
    hideSection,
    sectionToolsFor,
    restoreSection,
    restoreAllSections,
  };
}
