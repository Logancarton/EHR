import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  builtInPresets,
  defaultPreferences,
  mergeStoredPreferences,
} from "../app/lib/preference-engine";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  addableDashboardModules,
  createDefaultDashboardLayout,
  setDashboardModuleVisible,
  visibleDashboardModules,
} from "../app/lib/dashboard-layout-model";
import { TODAY_SECTION_META } from "../app/lib/use-today-layout";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(`${ROOT}${path}`, "utf8");

/**
 * DASH-13, first-viewport economy (roadmap CB-5).
 *
 * The clinic day used to be counted three times above the fold: once in the Day at
 * a Glance sentence, once in the Practice Cockpit's tiles, and once in the roster's
 * own filter bar — which is the only one of the three that both counts *and*
 * filters. These assert the rule that settled it: the schedule counts itself, and
 * the windows above it may not restate what the filter bar already carries.
 *
 * They deliberately assert the shipped defaults and the preservation rules around
 * them, not pixels. A layout that quietly re-added a second copy of the counts, or
 * that "simplified" by taking the cockpit away from the people who chose it, would
 * still screenshot fine.
 */

test("the shipped dashboard does not put the Practice Cockpit above the schedule", () => {
  assert.equal(
    defaultPreferences.today.showMetrics,
    false,
    "the cockpit's counters duplicate the roster filter bar, so it ships off",
  );
  assert.equal(
    builtInPresets.standard.config.today?.showMetrics,
    false,
    "the standard preset is the shipped default and must agree with it",
  );

  const order = defaultPreferences.today.widgetOrder;
  assert.ok(
    order.indexOf("metrics") > order.indexOf("roster"),
    "adding the cockpit back must not push the schedule off the first viewport",
  );

  const layoutIds = DEFAULT_DASHBOARD_LAYOUT.modules.map((m) => m.id);
  assert.ok(
    layoutIds.indexOf("schedule") < layoutIds.indexOf("metrics"),
    "the module layout model must not disagree with the preference default",
  );
  assert.equal(
    DEFAULT_DASHBOARD_LAYOUT.modules.find((m) => m.id === "metrics")?.visible,
    false,
  );
});

test("the high-density cockpit persona still ships its counters", () => {
  assert.equal(
    builtInPresets.cockpit.config.today?.showMetrics,
    true,
    "Psychopharm Cockpit is an explicit high-density choice, not the default",
  );
});

test("a clinician who already has the cockpit keeps it", () => {
  // The default is read only where nothing was stored. Someone whose saved
  // preferences carry the cockpit must not have it taken away by this change.
  const stored = mergeStoredPreferences({
    today: { ...defaultPreferences.today, showMetrics: true },
  });
  assert.equal(stored.today.showMetrics, true);
});

test("the cockpit stays addable and is not reported as dismissed work", () => {
  assert.equal(
    TODAY_SECTION_META.metrics.shipsVisible,
    false,
    "an off cockpit is a window never added, not one the clinician dismissed",
  );

  // It is still a real module: present in the order so Customize lists it, and
  // restorable through the ordinary visibility path.
  assert.ok(defaultPreferences.today.widgetOrder.includes("metrics"));

  const layout = createDefaultDashboardLayout();
  assert.ok(
    addableDashboardModules(layout).some((m) => m.id === "metrics"),
    "the cockpit must appear in the add-window list while it is off",
  );

  const restored = setDashboardModuleVisible(layout, "metrics", true);
  assert.ok(visibleDashboardModules(restored).some((m) => m.id === "metrics"));
});

test("restore-all does not conjure a window the clinician never added", () => {
  const source = read("app/lib/use-today-layout.ts");
  const restoreAll = source.slice(source.indexOf("const restoreAllSections"));
  const body = restoreAll.slice(0, restoreAll.indexOf("}, ["));
  assert.ok(
    !body.includes("showMetrics"),
    "restoreAllSections restores what ships visible; the cockpit is opt-in",
  );
});

test("the roster filter bar is not gated behind the schedule search preference", () => {
  // Filtering a roster is navigation, not searching. While the filter bar was
  // gated on `showScheduleSearch`, turning search off took the day's only
  // actionable counts with it — which is how two more copies of them ended up
  // upstream in the first place.
  const source = read("app/components/TodayDashboard.tsx");
  const filterBarIndex = source.indexOf('className="schedule-filter-bar"');
  assert.ok(filterBarIndex > 0, "the roster filter bar should still exist");

  const guard = source.slice(filterBarIndex - 400, filterBarIndex);
  const condition = guard.slice(guard.lastIndexOf("{viewMode ==="));
  assert.ok(
    condition.includes('viewMode === "roster"'),
    "the filter bar belongs to the roster view",
  );
  assert.ok(
    !condition.includes("showScheduleSearch"),
    "the search preference must not decide whether the day is counted",
  );
});

/** The Day at a Glance markup, from its body to the end of its action row. */
function daySummaryMarkup(): string {
  const source = read("app/components/TodayDashboard.tsx");
  const start = source.indexOf('className="morning-briefing-body"');
  assert.ok(start > 0, "the day summary body should still exist");
  const end = source.indexOf("</div>", source.indexOf("briefing-quick-actions", start));
  assert.ok(end > start, "the day summary action row should still exist");
  return source.slice(start, end);
}

test("the day summary states what an empty day is instead of calling it concluded", () => {
  const body = daySummaryMarkup();
  assert.ok(
    body.includes("No visits are booked for this date."),
    "an empty day has not concluded anything",
  );
  assert.ok(
    body.indexOf("No visits are booked for this date.")
      < body.indexOf("Every booked visit for this date is concluded."),
    "the empty-day branch must be reached before the concluded-day branch",
  );
});

test("the day summary no longer recites the counts the filter bar carries", () => {
  const body = daySummaryMarkup();
  for (const restated of ["counts.booked", "counts.completed", "counts.waiting", "counts.tentative"]) {
    assert.ok(
      !body.includes(restated),
      `the day summary must not restate ${restated}; the roster filter bar owns it`,
    );
  }
});
