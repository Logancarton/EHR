"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AdaptiveEvaluationContext,
  type AdaptiveRule,
  evaluateAdaptiveRules,
  restorePriorLayout,
} from "./adaptive-layout-engine";
import { type ProviderPreferences, builtInPresets } from "./preference-engine";
import { type ScheduleItem } from "./schedule-data";
import { practiceMinutesNow } from "./practice-calendar";
import { type AttentionItem } from "../components/dashboard/QueueDashboardWindow";

export interface PendingAdaptation {
  rule: AdaptiveRule;
  reason: string;
}

export interface UseAdaptiveLayoutReturn {
  isEnabled: boolean;
  isPaused: boolean;
  activeRule: AdaptiveRule | null;
  pendingAdaptation: PendingAdaptation | null;
  rules: AdaptiveRule[];
  priorLayoutExists: boolean;
  toggleAdaptiveMode: (enabled?: boolean) => void;
  togglePause: (paused?: boolean) => void;
  restorePriorLayoutNow: () => void;
  applyPendingNow: () => void;
  dismissPending: () => void;
  toggleRuleEnabled: (ruleId: string, enabled?: boolean) => void;
}

/**
 * Focus & clinical interaction protection:
 * Returns false if the clinician is actively typing in a form input, text area,
 * or interacting with an open dialog or drawer.
 */
function checkIsSafeToAdapt(activeModalOpen: boolean): boolean {
  if (activeModalOpen) return false;
  if (typeof document === "undefined") return false;

  const el = document.activeElement;
  if (!el) return true;

  const tagName = el.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return false;
  }
  if (el.getAttribute("contenteditable") === "true") {
    return false;
  }
  if (el.closest?.(".modal, .drawer, [role='dialog'], [data-prevent-adaptive='true']")) {
    return false;
  }

  return true;
}

export function useAdaptiveLayout({
  preferences,
  onUpdatePreferences,
  appointments,
  attentionQueue,
  activeModalOpen,
  announce,
}: {
  preferences: ProviderPreferences;
  onUpdatePreferences: (next: ProviderPreferences) => void;
  appointments: readonly ScheduleItem[];
  attentionQueue: readonly AttentionItem[];
  activeModalOpen: boolean;
  announce?: (msg: string) => void;
}): UseAdaptiveLayoutReturn {
  const [pendingAdaptation, setPendingAdaptation] = useState<PendingAdaptation | null>(null);
  const pendingRef = useRef<PendingAdaptation | null>(null);
  pendingRef.current = pendingAdaptation;

  const adaptive = preferences.adaptiveLayout;
  const isEnabled = Boolean(adaptive?.enabled);
  const isPaused = Boolean(adaptive?.paused);
  const rules = adaptive?.rules || [];
  const priorLayoutExists = Boolean(adaptive?.priorLayoutSnapshot);

  const activeRule = useMemo(() => {
    if (!adaptive?.activeRuleId) return null;
    return rules.find((r) => r.id === adaptive.activeRuleId) || null;
  }, [adaptive?.activeRuleId, rules]);

  // Derived workload metrics from authoritative records
  const waitingCount = useMemo(
    () => appointments.filter((apt) => apt.status === "waiting").length,
    [appointments],
  );
  const inVisitCount = useMemo(
    () => appointments.filter((apt) => apt.status === "in-visit").length,
    [appointments],
  );
  const urgentWorkCount = useMemo(
    () => attentionQueue.length,
    [attentionQueue],
  );

  // Evaluate conditions periodically and whenever inputs change
  const evaluate = useCallback(
    (forceApply: boolean = false) => {
      if (!isEnabled || isPaused) {
        if (pendingRef.current) setPendingAdaptation(null);
        return;
      }

      const isSafe = checkIsSafeToAdapt(activeModalOpen);
      const context: AdaptiveEvaluationContext = {
        currentTimeMinutes: practiceMinutesNow(),
        waitingCount,
        inVisitCount,
        urgentWorkCount,
        isSafeToAdapt: isSafe,
      };

      const result = evaluateAdaptiveRules(preferences, context, { forceApply, presets: builtInPresets });

      if (result.action === "defer") {
        setPendingAdaptation({ rule: result.rule, reason: result.reason });
      } else if (result.action === "apply") {
        setPendingAdaptation(null);
        onUpdatePreferences(result.targetPreferences);
        announce?.(`Adapted workspace layout for “${result.rule.name}”`);
      } else if (result.action === "restore") {
        setPendingAdaptation(null);
        onUpdatePreferences(result.targetPreferences);
        announce?.(`Restored prior workspace layout`);
      } else {
        // If there was a pending adaptation whose trigger is no longer met, clear it
        if (pendingRef.current && !forceApply) {
          setPendingAdaptation(null);
        }
      }
    },
    [
      isEnabled,
      isPaused,
      activeModalOpen,
      waitingCount,
      inVisitCount,
      urgentWorkCount,
      preferences,
      onUpdatePreferences,
      announce,
    ],
  );

  // Polling evaluation timer (evaluates every 10 seconds or on workload changes)
  useEffect(() => {
    evaluate(false);
    const interval = setInterval(() => {
      evaluate(false);
    }, 10000);
    return () => clearInterval(interval);
  }, [evaluate]);

  // When the user leaves an input or closes a modal, re-check if pending adaptation can safely apply
  useEffect(() => {
    function handleBlur() {
      // Small timeout to let next activeElement take focus
      setTimeout(() => {
        if (pendingRef.current && checkIsSafeToAdapt(activeModalOpen)) {
          evaluate(false);
        }
      }, 150);
    }

    window.addEventListener("focusout", handleBlur);
    return () => window.removeEventListener("focusout", handleBlur);
  }, [activeModalOpen, evaluate]);

  const toggleAdaptiveMode = useCallback(
    (explicitEnabled?: boolean) => {
      const nextEnabled = explicitEnabled !== undefined ? explicitEnabled : !isEnabled;
      const updated: ProviderPreferences = {
        ...preferences,
        adaptiveLayout: {
          ...(preferences.adaptiveLayout || {
            enabled: false,
            paused: false,
            activeRuleId: null,
            priorLayoutSnapshot: null,
            rules: [],
          }),
          enabled: nextEnabled,
          paused: false,
        },
      };
      onUpdatePreferences(updated);
      announce?.(nextEnabled ? "Adaptive layout mode enabled" : "Adaptive layout mode turned off");
      if (!nextEnabled) {
        setPendingAdaptation(null);
      }
    },
    [isEnabled, preferences, onUpdatePreferences, announce],
  );

  const togglePause = useCallback(
    (explicitPaused?: boolean) => {
      const nextPaused = explicitPaused !== undefined ? explicitPaused : !isPaused;
      const updated: ProviderPreferences = {
        ...preferences,
        adaptiveLayout: {
          ...(preferences.adaptiveLayout || {
            enabled: false,
            paused: false,
            activeRuleId: null,
            priorLayoutSnapshot: null,
            rules: [],
          }),
          paused: nextPaused,
        },
      };
      onUpdatePreferences(updated);
      announce?.(nextPaused ? "Adaptive layout mode paused" : "Adaptive layout mode resumed");
    },
    [isPaused, preferences, onUpdatePreferences, announce],
  );

  const restorePriorLayoutNow = useCallback(() => {
    const restored = restorePriorLayout(preferences);
    onUpdatePreferences(restored);
    setPendingAdaptation(null);
    announce?.("Restored prior layout snapshot");
  }, [preferences, onUpdatePreferences, announce]);

  const applyPendingNow = useCallback(() => {
    evaluate(true);
  }, [evaluate]);

  const dismissPending = useCallback(() => {
    setPendingAdaptation(null);
  }, []);

  const toggleRuleEnabled = useCallback(
    (ruleId: string, explicitEnabled?: boolean) => {
      const currentRules = preferences.adaptiveLayout?.rules || [];
      const updatedRules = currentRules.map((rule) => {
        if (rule.id === ruleId) {
          return {
            ...rule,
            enabled: explicitEnabled !== undefined ? explicitEnabled : !rule.enabled,
          };
        }
        return rule;
      });

      const updated: ProviderPreferences = {
        ...preferences,
        adaptiveLayout: {
          ...(preferences.adaptiveLayout || {
            enabled: false,
            paused: false,
            activeRuleId: null,
            priorLayoutSnapshot: null,
            rules: [],
          }),
          rules: updatedRules,
        },
      };
      onUpdatePreferences(updated);
    },
    [preferences, onUpdatePreferences],
  );

  return {
    isEnabled,
    isPaused,
    activeRule,
    pendingAdaptation,
    rules,
    priorLayoutExists,
    toggleAdaptiveMode,
    togglePause,
    restorePriorLayoutNow,
    applyPendingNow,
    dismissPending,
    toggleRuleEnabled,
  };
}
