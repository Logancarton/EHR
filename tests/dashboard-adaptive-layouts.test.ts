import test from "node:test";
import assert from "node:assert/strict";
import {
  type AdaptiveEvaluationContext,
  type AdaptiveRule,
  DEFAULT_ADAPTIVE_RULES,
  defaultAdaptivePreferences,
  evaluateAdaptiveRules,
  extractLayoutSnapshot,
  isTriggerMet,
  restorePriorLayout,
} from "../app/lib/adaptive-layout-engine";
import {
  type ProviderPreferences,
  applyPreset,
  builtInPresets,
  defaultPreferences,
  mergeStoredPreferences,
} from "../app/lib/preference-engine";

test("DB-8: OFF by default — layout never rearranges without explicit activation", () => {
  const initialPrefs = defaultPreferences;
  assert.equal(initialPrefs.adaptiveLayout?.enabled, false, "Adaptive mode is strictly false by default");

  // Simulate heavy clinic workload: 5 waiting patients, 10 urgent queue items, midday clinic rush
  const context: AdaptiveEvaluationContext = {
    currentTimeMinutes: 11 * 60, // 11:00 AM
    waitingCount: 5,
    inVisitCount: 2,
    urgentWorkCount: 10,
    isSafeToAdapt: true,
  };

  const result = evaluateAdaptiveRules(initialPrefs, context);
  assert.equal(result.action, "none", "Evaluation returns 'none' when adaptive mode is off");
  assert.match((result as any).reason, /Adaptive mode is off/i);
  assert.equal(initialPrefs.density, "comfortable", "Density is untouched");
  assert.equal(initialPrefs.today.showArrivals, false, "Arrivals visibility is untouched");
});

test("DB-8: Explicit activation permits configured changes deterministically", () => {
  // Start with standard default preferences and enable adaptive mode
  let prefs: ProviderPreferences = {
    ...defaultPreferences,
    adaptiveLayout: {
      ...defaultAdaptivePreferences,
      enabled: true,
    },
  };

  // Scenario A: 3 urgent items triggers rule-urgent-backlog (priority 100)
  const urgentContext: AdaptiveEvaluationContext = {
    currentTimeMinutes: 14 * 60, // 2:00 PM
    waitingCount: 0,
    inVisitCount: 0,
    urgentWorkCount: 3,
    isSafeToAdapt: true,
  };

  const urgentResult = evaluateAdaptiveRules(prefs, urgentContext);
  assert.equal(urgentResult.action, "apply");
  if (urgentResult.action === "apply") {
    assert.equal(urgentResult.rule.id, "rule-urgent-backlog");
    assert.equal(urgentResult.targetPreferences.today.showActionQueue, true);
    assert.equal(urgentResult.targetPreferences.today.widgetSpans?.queue, "full");
    assert.equal(urgentResult.targetPreferences.adaptiveLayout?.activeRuleId, "rule-urgent-backlog");
    assert.ok(urgentResult.targetPreferences.adaptiveLayout?.priorLayoutSnapshot, "Snapshot was captured");
    prefs = urgentResult.targetPreferences;
  }

  // Scenario B: High volume clinic flow (waitingCount >= 2) with no urgent backlog
  const clinicFlowContext: AdaptiveEvaluationContext = {
    currentTimeMinutes: 11 * 60, // 11:00 AM
    waitingCount: 3,
    inVisitCount: 1,
    urgentWorkCount: 0,
    isSafeToAdapt: true,
  };

  // Force apply to bypass hysteresis between test steps
  const flowResult = evaluateAdaptiveRules(prefs, clinicFlowContext, { forceApply: true, presets: builtInPresets });
  assert.equal(flowResult.action, "apply");
  if (flowResult.action === "apply") {
    assert.equal(flowResult.rule.id, "rule-clinic-flow");
    assert.equal(flowResult.targetPreferences.density, "compact");
    assert.equal(flowResult.targetPreferences.today.showArrivals, true);
    assert.equal(flowResult.targetPreferences.today.showVisitPrep, true);
  }

  // Scenario C: Morning prep window (07:00 - 09:00) with 0 waiting and 0 urgent
  const morningContext: AdaptiveEvaluationContext = {
    currentTimeMinutes: 8 * 60, // 08:00 AM
    waitingCount: 0,
    inVisitCount: 0,
    urgentWorkCount: 0,
    isSafeToAdapt: true,
  };

  const morningResult = evaluateAdaptiveRules(defaultPreferences, {
    ...morningContext,
    isSafeToAdapt: true,
  }, { forceApply: true });
  // If OFF it does nothing:
  assert.equal(morningResult.action, "none");

  // If enabled:
  const enabledPrefs: ProviderPreferences = {
    ...defaultPreferences,
    adaptiveLayout: { ...defaultAdaptivePreferences, enabled: true },
  };
  const morningEnabledResult = evaluateAdaptiveRules(enabledPrefs, morningContext, { forceApply: true });
  assert.equal(morningEnabledResult.action, "apply");
  if (morningEnabledResult.action === "apply") {
    assert.equal(morningEnabledResult.rule.id, "rule-morning-prep");
    assert.equal(morningEnabledResult.targetPreferences.today.showMorningBriefing, true);
    assert.equal(morningEnabledResult.targetPreferences.today.showVisitPrep, true);
  }
});

test("DB-8: Clinical focus & active interaction protection — deferral while typing or dialog open", () => {
  const prefs: ProviderPreferences = {
    ...defaultPreferences,
    adaptiveLayout: {
      ...defaultAdaptivePreferences,
      enabled: true,
    },
  };

  // Conditions are met for clinic-flow (2 waiting), BUT clinician is actively typing or modal is open (isSafeToAdapt = false)
  const unsafeContext: AdaptiveEvaluationContext = {
    currentTimeMinutes: 10 * 60,
    waitingCount: 2,
    inVisitCount: 0,
    urgentWorkCount: 0,
    isSafeToAdapt: false, // Focus protection active!
  };

  const deferredResult = evaluateAdaptiveRules(prefs, unsafeContext);
  assert.equal(deferredResult.action, "defer", "Layout transition must be deferred when user is editing");
  if (deferredResult.action === "defer") {
    assert.equal(deferredResult.rule.id, "rule-clinic-flow");
    assert.match(deferredResult.reason, /Deferred while editing/i);
  }

  // When forceApply is explicitly requested (e.g. user clicked "Apply Now" button on the notification pill)
  const forcedResult = evaluateAdaptiveRules(prefs, unsafeContext, { forceApply: true });
  assert.equal(forcedResult.action, "apply", "User explicit override allows applying now");
});

test("DB-8: Repeat triggers and threshold oscillation guard (hysteresis)", () => {
  const now = new Date("2026-09-14T10:00:00.000Z");

  const adaptedPrefs: ProviderPreferences = {
    ...defaultPreferences,
    adaptiveLayout: {
      ...defaultAdaptivePreferences,
      enabled: true,
      activeRuleId: "rule-clinic-flow",
      lastAdaptedAt: now.toISOString(),
    },
  };

  // 1. Same rule already active returns 'none'
  const contextSame: AdaptiveEvaluationContext = {
    currentTimeMinutes: 10 * 60,
    waitingCount: 2,
    inVisitCount: 1,
    urgentWorkCount: 0,
    isSafeToAdapt: true,
  };
  const sameResult = evaluateAdaptiveRules(adaptedPrefs, contextSame);
  assert.equal(sameResult.action, "none");
  assert.match((sameResult as any).reason, /already active/i);

  // 2. Fluctuating workload within cooldown window (e.g. 5 seconds later, urgent item spikes then drops)
  const cooldownContext: AdaptiveEvaluationContext = {
    currentTimeMinutes: 10 * 60,
    waitingCount: 0,
    inVisitCount: 0,
    urgentWorkCount: 4,
    isSafeToAdapt: true,
  };

  // Within 15s cooldown
  const cooldownResult = evaluateAdaptiveRules(adaptedPrefs, cooldownContext, {
    nowIso: new Date(now.getTime() + 5000).toISOString(),
    cooldownMs: 15000,
  });
  assert.equal(cooldownResult.action, "none");
  assert.match((cooldownResult as any).reason, /Hysteresis cooldown active/i);

  // After cooldown expires (20s later), it permits the transition
  const afterCooldownResult = evaluateAdaptiveRules(adaptedPrefs, cooldownContext, {
    nowIso: new Date(now.getTime() + 20000).toISOString(),
    cooldownMs: 15000,
  });
  assert.equal(afterCooldownResult.action, "apply");
});

test("DB-8: Pause, Restore Prior Layout snapshot, and Preset independence", () => {
  const initialStandard = applyPreset("standard", defaultPreferences);
  assert.equal(initialStandard.density, "comfortable");

  // 1. Take snapshot and apply adaptation
  const snapshot = extractLayoutSnapshot(initialStandard);
  let adaptedPrefs: ProviderPreferences = {
    ...initialStandard,
    density: "compact",
    today: {
      ...initialStandard.today,
      showArrivals: true,
      showVisitPrep: true,
    },
    adaptiveLayout: {
      ...defaultAdaptivePreferences,
      enabled: true,
      paused: false,
      activeRuleId: "rule-clinic-flow",
      priorLayoutSnapshot: snapshot,
    },
  };

  assert.equal(adaptedPrefs.density, "compact");
  assert.equal(adaptedPrefs.today.showArrivals, true);

  // 2. Verify built-in preset is untouched
  assert.equal(builtInPresets.standard.config.density, "comfortable", "Built-in standard preset is untouched");

  // 3. Pause adaptive mode: evaluation returns 'none'
  adaptedPrefs = {
    ...adaptedPrefs,
    adaptiveLayout: {
      ...adaptedPrefs.adaptiveLayout!,
      paused: true,
    },
  };
  const pausedResult = evaluateAdaptiveRules(adaptedPrefs, {
    currentTimeMinutes: 8 * 60,
    waitingCount: 0,
    inVisitCount: 0,
    urgentWorkCount: 5,
    isSafeToAdapt: true,
  });
  assert.equal(pausedResult.action, "none");
  assert.match((pausedResult as any).reason, /Adaptive mode is paused/i);

  // 4. Manually restore prior layout
  const restored = restorePriorLayout(adaptedPrefs);
  assert.equal(restored.density, "comfortable", "Restored comfortable density");
  assert.equal(restored.today.showArrivals, initialStandard.today.showArrivals, "Restored arrivals visibility");
  assert.equal(restored.adaptiveLayout?.activeRuleId, null, "Active rule cleared");
  assert.equal(restored.adaptiveLayout?.priorLayoutSnapshot, null, "Prior snapshot cleared");

  // 5. Automatic restore when condition ceases and rule has returnBehavior = 'restore_prior'
  const ruleCeasedContext: AdaptiveEvaluationContext = {
    currentTimeMinutes: 12 * 60,
    waitingCount: 0,
    inVisitCount: 0,
    urgentWorkCount: 0,
    isSafeToAdapt: true,
  };
  const autoRestoreResult = evaluateAdaptiveRules(
    {
      ...adaptedPrefs,
      adaptiveLayout: {
        ...adaptedPrefs.adaptiveLayout!,
        paused: false,
      },
    },
    ruleCeasedContext,
    { forceApply: true },
  );
  assert.equal(autoRestoreResult.action, "restore");
  if (autoRestoreResult.action === "restore") {
    assert.equal(autoRestoreResult.targetPreferences.density, "comfortable");
    assert.equal(autoRestoreResult.targetPreferences.adaptiveLayout?.activeRuleId, null);
  }
});
