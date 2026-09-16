import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  WORKSPACE_VIEW_ATTRIBUTE,
  renderedWorkspaceView,
  sanitizeWorkspaceState,
  workspaceViewControlSelector,
  workspaceViewPaneSelector,
} from "../app/lib/workspace-state";

/**
 * The workspace view round-trip.
 *
 * `b2c1eed` gave the Zen home launcher the `.home-tab` class that had, until then,
 * named the tab-strip button which opened Today. `WorkspaceStateManager` keyed both
 * halves of the round-trip off that class, so it inverted in both directions at
 * once: sitting on the launcher saved `today`, and restoring a saved `today`
 * clicked the launcher. Every clinician who reloaded landed on the launcher instead
 * of their schedule, and all 23 browser specs failed on it.
 *
 * The contract that replaced it is deliberately plain data — which pane proves a
 * view rendered, and which control switches to it — so it can be asserted here
 * rather than only in a browser.
 */

const WORKSPACE_ROOT = fileURLToPath(new URL("..", import.meta.url));

test("the rendered view is read from the pane on screen, launcher included", () => {
  assert.equal(
    renderedWorkspaceView({ hasTodayDashboard: true, hasZenHome: false }),
    "today",
  );
  assert.equal(
    renderedWorkspaceView({ hasTodayDashboard: false, hasZenHome: true }),
    "home",
    "the launcher is its own view; recording it as Today is what broke the round-trip",
  );
  assert.equal(
    renderedWorkspaceView({ hasTodayDashboard: false, hasZenHome: false }),
    "patient",
  );
  assert.equal(
    renderedWorkspaceView({ hasTodayDashboard: true, hasZenHome: true }),
    "today",
    "the dashboard wins a transitional frame where both are momentarily in the tree",
  );
});

test("a saved view names the control that restores it and the pane that proves it landed", () => {
  assert.equal(workspaceViewControlSelector("today"), `[${WORKSPACE_VIEW_ATTRIBUTE}="today"]`);
  assert.equal(workspaceViewControlSelector("home"), `[${WORKSPACE_VIEW_ATTRIBUTE}="home"]`);
  assert.notEqual(
    workspaceViewControlSelector("today"),
    workspaceViewControlSelector("home"),
    "the two views must never resolve to the same control again",
  );

  assert.equal(workspaceViewPaneSelector("today"), ".today-dashboard");
  assert.equal(workspaceViewPaneSelector("home"), ".zen-home-pane");

  // A chart is restored by clicking its own tab, which is per-patient rather than
  // per-view, so there is deliberately no shared control for it.
  assert.equal(workspaceViewControlSelector("patient"), null);
  assert.equal(workspaceViewPaneSelector("patient"), null);
});

test("home survives a save/restore round trip rather than collapsing into today", () => {
  for (const view of ["home", "today", "patient"] as const) {
    const captured = renderedWorkspaceView({
      hasTodayDashboard: view === "today",
      hasZenHome: view === "home",
    });
    assert.equal(captured, view);
    const restored = sanitizeWorkspaceState({
      version: 1,
      activeView: captured,
      dockedPatientIds: [],
      detachedPatientIds: [],
      activePatientId: null,
      activeSection: "Overview",
      detachedSections: {},
      activeCompanionPanel: null,
      sidebarToolIds: [],
      windowStates: {},
      savedAt: "2026-09-13T12:00:00.000Z",
    });
    assert.ok(restored, "a well-formed workspace state is accepted");
    assert.equal(restored.activeView, view, `${view} must survive persistence`);
  }
});

test("the markup declares a control for every view the restore can be asked for", () => {
  const shell = readFileSync(`${WORKSPACE_ROOT}app/components/PatientWorkspace.tsx`, "utf8");
  const launcher = readFileSync(`${WORKSPACE_ROOT}app/components/home/ZenHomeWindow.tsx`, "utf8");
  const markup = `${shell}\n${launcher}`;

  assert.match(
    markup,
    /data-workspace-view="home"/,
    "the launcher control must declare the view it switches to",
  );
  assert.match(
    markup,
    /data-workspace-view="today"/,
    "the Dashboard tab must declare the view it switches to",
  );
  assert.match(
    launcher,
    /data-workspace-view=\{shortcut\.id === "ehr" \? "today" : undefined\}/,
    "a fresh load starts on the launcher, so its EHR tile is the restore's only route to Today",
  );

  // The regression itself: the class that used to mean "open Today" now belongs to
  // the launcher, so nothing may navigate by it again.
  assert.ok(
    !/querySelector[^\n]*\.home-tab/.test(
      readFileSync(`${WORKSPACE_ROOT}app/components/WorkspaceStateManager.tsx`, "utf8"),
    ),
    "workspace restore must not navigate by the ambiguous .home-tab class",
  );
});

test("the schedule tab stays open once opened, so a chart always has a way back", () => {
  const shell = readFileSync(`${WORKSPACE_ROOT}app/components/PatientWorkspace.tsx`, "utf8");

  assert.match(
    shell,
    /\{dashboardTabOpen && \(/,
    "the Dashboard tab renders from whether it is open, not from whether it is in front",
  );
  assert.ok(
    !/\{activeView === "today" && \(\s*<div\s+className="browser-tab active"/.test(shell),
    "rendering the tab only while active left a patient chart with no route to the roster",
  );
  // Navigation goes through `goToWorkspaceView` rather than `setActiveView`, so a
  // destination cannot be chosen and then left hidden under an open global module.
  // The behaviour asserted here is unchanged: closing the tab is what closes it,
  // and doing so lands the clinician on Home.
  assert.match(
    shell,
    /setDashboardTabOpen\(false\);\s*\n\s*goToWorkspaceView\("home"\);/,
    "closing the tab is the only thing that closes it",
  );
});

test("restoring charts verifies available chrome, including on Home", () => {
  const manager = readFileSync(`${WORKSPACE_ROOT}app/components/WorkspaceStateManager.tsx`, "utf8");
  const shell = readFileSync(`${WORKSPACE_ROOT}app/components/PatientWorkspace.tsx`, "utf8");

  // The three-row shell now exposes search on Home too. Keep the restoration
  // readiness guard for hydration and accessible-roster timing.
  assert.doesNotMatch(
    shell,
    /\{activeView !== "home" && \(\s*\n?\s*<div className=\{`patient-search-wrap/,
    "global search remains reachable on Home",
  );
  assert.match(
    manager,
    /async function ensureRestorableShell\(\)/,
    "the restore must establish a view that carries the chrome it drives",
  );
  assert.match(
    manager,
    /if \(!\(await ensureRestorableShell\(\)\)\) return false;/,
    "opening a chart checks for that chrome rather than assuming it",
  );
});
