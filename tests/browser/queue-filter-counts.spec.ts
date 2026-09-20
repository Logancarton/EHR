import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * CB-5 / DASH-13, in a browser.
 *
 * The dashboard and the operational queues each used to open with a row of large
 * tiles restating numbers that a filter control a few pixels below already carried
 * — and, in the queues, at least one number nothing could act on. These assert the
 * rule that replaced them: a count lives on the control that produces it, and it
 * equals what pressing that control yields.
 *
 * Counting the rows a filter returns is the point. A test that only checked the
 * label would pass on a count that lies.
 */

async function openModule(page: Page, view: string, module: string) {
  await page.evaluate((v) => {
    window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: v } }));
  }, view);
  await expect(page.locator(".global-module-shell")).toHaveAttribute(
    "data-active-module",
    module,
    { timeout: 20_000 },
  );
}

/** The number a filter button advertises, or null when it advertises none. */
function advertisedCount(label: string): number | null {
  const match = label.match(/\((\d+)\)\s*$/);
  return match ? Number(match[1]) : null;
}

test.describe("first-viewport economy", () => {
  test("the day is counted once, on the control that filters it", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const dashboard = page.locator(".today-dashboard");
    await expect(dashboard).toBeVisible({ timeout: 20_000 });

    // The cockpit is not part of the shipped canvas; the roster's filter bar is
    // the single owner of the day's status counts.
    await expect(page.locator(".today-metrics-container")).toHaveCount(0);
    const filterBar = page.locator(".schedule-filter-bar");
    await expect(filterBar).toBeVisible({ timeout: 20_000 });

    // The summary above it names who the day is waiting on and offers the action
    // that follows from it — and does not restate the counts below.
    const summary = page.locator(".morning-briefing-body");
    await expect(summary).toBeVisible();
    await expect(summary).not.toContainText("visits on the schedule");

    // Only the day summary may precede the schedule on the canvas, and what it
    // spends is budgeted. Measuring from the top of the grid rather than the top
    // of the viewport keeps this about the summaries and not about chrome or
    // window height. Before CB-5 this was 328px — a summary card and a cockpit.
    const grid = page.locator(".dashboard-shell-grid");
    const scheduleWindow = grid.locator("> *").filter({ has: page.locator(".schedule-main-card") });
    await expect(scheduleWindow).toHaveCount(1);
    expect(
      await grid.locator("> *").count(),
      "the schedule should be the second window on the shipped canvas",
    ).toBeGreaterThan(1);

    const gridBox = await grid.boundingBox();
    const scheduleBox = await scheduleWindow.boundingBox();
    expect(gridBox).not.toBeNull();
    expect(scheduleBox, "the schedule should be on screen").not.toBeNull();
    expect(
      scheduleBox!.y - gridBox!.y,
      "summaries above the schedule must not reclaim the space CB-5 gave back",
    ).toBeLessThanOrEqual(220);

    await expect(filterBar, "the day's counts belong in the first viewport").toBeInViewport();

    // Each filter's count is what pressing it yields.
    const buttons = filterBar.locator("button");
    const total = await buttons.count();
    expect(total).toBeGreaterThan(0);
    for (let i = 0; i < total; i += 1) {
      const button = buttons.nth(i);
      const label = (await button.textContent())?.trim() ?? "";
      const claimed = advertisedCount(label);
      if (claimed === null) continue;
      await button.click();
      await expect(page.locator(".roster-row")).toHaveCount(claimed, { timeout: 10_000 });
    }
  });

  test("the day summary keeps its unfinished-work action reachable", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    await expect(page.locator(".today-dashboard")).toBeVisible({ timeout: 20_000 });

    // Compacting the summary must not have cost it the actions it uniquely owns:
    // starting/resuming the next visit, and the unsigned draft that is easiest to
    // forget because its patient is not on today's schedule.
    const actions = page.locator(".briefing-quick-actions button");
    await expect(actions.first()).toBeVisible({ timeout: 20_000 });
    await expect(actions.first()).toBeEnabled();
  });
});

test.describe("queue filter counts", () => {
  test("Tasks counts on its filters, including the patient-linked subset", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    await openModule(page, "tasks", "tasks");

    await expect(
      page.locator(".global-module-summary-strip"),
      "the duplicate count tiles are gone",
    ).toHaveCount(0);

    const filters = page.locator(".global-task-filters button");
    await expect(filters).toHaveCount(4);

    for (const name of ["Open", "Completed", "Patient-linked", "All"]) {
      const button = filters.filter({ hasText: name }).first();
      const label = (await button.textContent())?.trim() ?? "";
      const claimed = advertisedCount(label);
      expect(claimed, `${name} should advertise a count once the queue has loaded`).not.toBeNull();
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".global-task-row")).toHaveCount(claimed!, { timeout: 10_000 });
    }

    // A filter the clinician is standing on stays visible and pressed when it is
    // empty, and says why it is empty rather than looking broken.
    const patientLinked = filters.filter({ hasText: "Patient-linked" }).first();
    await patientLinked.click();
    await expect(patientLinked).toBeVisible();
    if (advertisedCount((await patientLinked.textContent()) ?? "") === 0) {
      await expect(page.locator(".global-task-list")).toContainText("linked to a patient chart");
    }
  });

  test("Inbox counts threads on its filters, matching what each returns", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    await openModule(page, "inbox", "inbox");

    await expect(page.locator(".global-module-summary-strip")).toHaveCount(0);

    const filters = page.locator(".global-inbox-workspace .global-filter-group button");
    await expect(filters).toHaveCount(4);
    await expect(filters.first()).toContainText(/All \(\d+\)/, { timeout: 20_000 });

    const total = await filters.count();
    for (let i = 0; i < total; i += 1) {
      const button = filters.nth(i);
      const claimed = advertisedCount((await button.textContent()) ?? "");
      expect(claimed, "every inbox filter carries its own count").not.toBeNull();
      await button.click();
      await expect(page.locator(".global-inbox-row")).toHaveCount(claimed!, { timeout: 10_000 });
    }
  });
});

test.describe("intake stage filtering", () => {
  test("empty stages fold into a disclosure that still reaches every one of them", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    await openModule(page, "intake", "intake");
    await page.locator(".intake-queue-pane .ui-state-loading").waitFor({ state: "detached", timeout: 20_000 });

    // The queue size is the All tab's count and is not also printed beside the
    // subtitle where nothing could act on it.
    await expect(page.locator(".intake-queue-count")).toHaveCount(0);
    const allTab = page.locator(".intake-stage-tab").first();
    await expect(allTab).toContainText("All");

    const overflow = page.locator(".intake-stage-overflow");
    const visibleTabs = page.locator(".intake-stage-tab");
    const visibleBefore = await visibleTabs.count();

    if ((await overflow.count()) === 0) {
      // Every stage holds someone, so nothing was folded away — the contract still
      // holds, there is simply nothing to disclose.
      expect(visibleBefore).toBeGreaterThan(1);
      return;
    }

    // Every stage the tab row does not show is reachable, in order, from the
    // disclosure — and it expands in place rather than behind the scrolling row.
    await overflow.locator("summary").click();
    const items = overflow.locator(".intake-stage-overflow-item");
    const foldedCount = await items.count();
    expect(foldedCount).toBeGreaterThan(0);
    await expect(items.first()).toBeInViewport();

    // Choosing a folded stage promotes it to a tab and keeps it there at zero.
    const chosen = items.first();
    const chosenName = (await chosen.locator("span").first().textContent())?.trim() ?? "";
    await chosen.click();

    const promoted = page.locator(".intake-stage-tab", { hasText: chosenName });
    await expect(promoted).toBeVisible({ timeout: 10_000 });
    await expect(promoted).toHaveClass(/active/);
    await expect(visibleTabs).toHaveCount(visibleBefore + 1);
  });
});
