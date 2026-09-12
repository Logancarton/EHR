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
 */
export const TODAY_SECTION_META: Record<
  TodayWidgetId,
  { label: string; visibilityKey: keyof ProviderPreferences["today"]; movedLabel: string }
> = {
  briefing: { label: "morning briefing", visibilityKey: "showMorningBriefing", movedLabel: "AI Morning Briefing" },
  metrics: { label: "practice cockpit", visibilityKey: "showMetrics", movedLabel: "Daily Metrics" },
  roster: { label: "patient flow", visibilityKey: "showRoster", movedLabel: "Encounter Roster" },
  queue: { label: "action queue", visibilityKey: "showActionQueue", movedLabel: "Action Queue" },
  shortcuts: { label: "daily shortcuts", visibilityKey: "showQuickReferences", movedLabel: "Daily Shortcuts" },
};

export type TodayLayout = {
  hiddenSections: HiddenTodaySection[];
  /** Writes any change to the Today preference block, e.g. the cockpit tile set. */
  applyTodayPreferences: (today: ProviderPreferences["today"]) => void;
  isCollapsed: (widgetId: TodayWidgetId) => boolean;
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

  const hiddenSections = useMemo(
    () =>
      (Object.keys(TODAY_SECTION_META) as TodayWidgetId[])
        .filter((widgetId) => !preferences.today[TODAY_SECTION_META[widgetId].visibilityKey])
        .map((widgetId) => ({ id: widgetId, label: TODAY_SECTION_META[widgetId].label })),
    [preferences.today],
  );

  return {
    hiddenSections,
    applyTodayPreferences,
    isCollapsed,
    sectionToolsFor,
    restoreSection,
    restoreAllSections,
  };
}
