import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * UI-7 — decomposing the Clinical menu one child at a time.
 *
 * Same gate UI-6 used on Practice: a child leaves the menu only once something else
 * provably opens the same work. UI-7a covers the two children whose owner is the `+`
 * launcher — Patients and Documents — so these tests check the launcher reaches each
 * surface, that a second visit focuses what is already open rather than stacking it,
 * that the count Documents carried in the menu came with it, and only then that the
 * old entries are gone. In that order: a passing run means the capability moved
 * rather than disappeared.
 */

/**
 * Every destination the top work-navigation offers, with each menu opened.
 *
 * Asking "is it still in the Clinical menu?" would pass for the wrong reason if the
 * entry merely moved to a neighbouring menu, so the question is the whole navigation:
 * is this label offered anywhere in it?
 */
async function topNavigationDestinations(page: Page): Promise<string[]> {
  const triggers = page.locator(".tool-navigation .tool-menu-trigger");
  await expect(triggers.first()).toBeVisible();
  const labels: string[] = [];

  for (let index = 0; index < (await triggers.count()); index += 1) {
    const trigger = triggers.nth(index);
    labels.push((await trigger.getAttribute("aria-label")) ?? "");
    if ((await trigger.getAttribute("aria-expanded")) === null) continue;

    await trigger.click();
    const panel = page.locator(".tool-menu-panel");
    await expect(panel).toBeVisible();
    labels.push(
      ...(await panel
        .getByRole("button")
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label") ?? ""))),
    );
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  }

  return labels;
}

async function openLauncher(page: Page) {
  await page.locator("button[data-workspace-control='open-workspace-launcher']").click();
  const popover = page.locator("[data-testid='open-workspace-launcher-popover']");
  await expect(popover).toBeVisible();
  return popover;
}

/** The number a filter button reports for itself, e.g. `Received (3)`. */
async function filterCount(page: Page, label: string): Promise<number> {
  const button = page.locator(".global-queue-toolbar .global-filter-group button")
    .filter({ hasText: new RegExp(`^${label} \\(\\d+\\)$`) });
  await expect(button).toHaveCount(1);
  const text = (await button.textContent()) ?? "";
  return Number(/\((\d+)\)/.exec(text)?.[1] ?? NaN);
}

test.describe("UI-7a: Patients and Documents leave the Clinical menu", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDefaultLayout(page, "Prototype provider");
  });

  test("the `+` launcher opens a chart, and Patients is offered nowhere in the top navigation", async ({
    page,
  }) => {
    // Leave the chart view first, so landing on one is this control's doing.
    await page.locator(".brand-home-button").click();
    await expect(page.locator(".app-shell")).toHaveClass(/view-zen-home/);

    const launcher = await openLauncher(page);
    await launcher.locator("button[data-workspace-id='patients']").click();

    const chart = page.locator(".primary-workspace-pane[data-scroll-patient-id]");
    await expect(chart, "a chart opens, not the dashboard or Home").toBeVisible({
      timeout: 20_000,
    });
    await expect(
      chart.locator(".patient-header").first(),
      "the chart carries its own identity header rather than a bare shell",
    ).toBeVisible({ timeout: 20_000 });

    expect(
      await topNavigationDestinations(page),
      "Patients is retired from the work menus now that the launcher owns it",
    ).not.toContain("Patients");
  });

  test("re-opening Patients from the launcher focuses the open chart rather than docking a second tab", async ({
    page,
  }) => {
    const chartTabs = page.locator(".browser-tab[data-workspace-tab='patient']");
    const openedCount = await chartTabs.count();
    expect(openedCount, "the default layout docks charts to focus").toBeGreaterThan(0);

    // The default layout lands on the Dashboard, so focus a chart first: what is
    // under test is that the launcher returns to the chart already open.
    await chartTabs.first().click();
    const activeChart = page.locator(".browser-tab[data-workspace-tab='patient'].active");
    await expect(activeChart).toHaveCount(1);
    const activeName = (await activeChart.locator(".tab-name").textContent()) ?? "";
    expect(activeName.length, "a chart is active once one is clicked").toBeGreaterThan(0);

    await page.locator(".brand-home-button").click();
    const launcher = await openLauncher(page);
    await launcher.locator("button[data-workspace-id='patients']").click();

    await expect(page.locator(".primary-workspace-pane[data-scroll-patient-id]")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      chartTabs,
      "returning to Patients focuses a docked chart instead of docking another",
    ).toHaveCount(openedCount);
    await expect(
      chartTabs.filter({ hasText: activeName }).first(),
      "the chart that was active is the one brought back",
    ).toHaveClass(/active/);
  });

  test("the `+` launcher opens the Documents queue, and Documents is offered nowhere in the top navigation", async ({
    page,
  }) => {
    const launcher = await openLauncher(page);
    await launcher.locator("button[data-workspace-id='documents']").click();

    const queue = page.locator(".practice-queue-shell[data-active-module='documents']");
    await expect(queue).toBeVisible({ timeout: 20_000 });
    await expect(queue.locator(".global-documents-workspace")).toBeVisible({ timeout: 20_000 });

    expect(
      await topNavigationDestinations(page),
      "Documents is retired from the work menus now that the launcher owns it",
    ).not.toContain("Documents");
  });

  test("the unreviewed-document count follows Documents into the launcher", async ({ page }) => {
    // Read the count the shell offers before opening anything.
    const launcher = await openLauncher(page);
    const documentsItem = launcher.locator("button[data-workspace-id='documents']");
    const badge = documentsItem.locator(".open-workspace-item-count");
    await expect(
      badge,
      "the queue publishes its count at load, so the launcher has it before the queue is opened",
    ).toBeVisible({ timeout: 20_000 });
    const shown = Number((await badge.textContent())?.replace(/\D/g, ""));
    expect(Number.isFinite(shown)).toBe(true);
    expect(shown).toBeGreaterThan(0);

    // Then ask the queue itself what it holds. The count must be the queue's own
    // answer — received plus needs-review — rather than a number the chrome invented.
    await documentsItem.click();
    await expect(page.locator(".practice-queue-shell[data-active-module='documents']")).toBeVisible({
      timeout: 20_000,
    });
    const received = await filterCount(page, "Received");
    const needsReview = await filterCount(page, "Needs review");
    expect(
      shown,
      "the launcher's count is the queue's unreviewed work, not a fixture literal",
    ).toBe(received + needsReview);
  });

  test("Clinical keeps exactly the children that still have no other owner, and they still open", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Clinical", exact: true }).click();
    const panel = page.getByRole("region", { name: "Clinical options" });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("button"),
      "Tasks, Labs and Prescribing stay until UI-7b/UI-7c give them owners",
    ).toHaveText([/Tasks/, /Labs/, /Prescribing/]);

    await panel.getByRole("button", { name: "Tasks", exact: true }).click();
    await expect(page.locator(".global-tasks-workspace")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Clinical", exact: true }).click();
    await page.getByRole("region", { name: "Clinical options" })
      .getByRole("button", { name: "Labs", exact: true }).click();
    await expect(page.locator(".practice-queue-shell[data-active-module='labs']")).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: "Clinical", exact: true }).click();
    await page.getByRole("region", { name: "Clinical options" })
      .getByRole("button", { name: "Prescribing", exact: true }).click();
    await expect(page.locator(".global-module-shell[data-active-module='prescribing']")).toBeVisible({
      timeout: 20_000,
    });
  });

  test("the launcher stays inside the viewport at 200% zoom, where it is now the only route", async ({
    page,
  }) => {
    // 720x450 is the matrix's 200%-equivalent. The popover reserved 360px while its
    // stylesheet drew 380px, so it ran off the right edge and clipped its own close
    // control — tolerable when the Clinical menu was a second way in, and not
    // tolerable now that this is the only way to Patients and Documents.
    await page.setViewportSize({ width: 720, height: 450 });
    const launcher = await openLauncher(page);

    const box = (await launcher.boundingBox())!;
    expect(box.x, "the launcher does not start off the left edge").toBeGreaterThanOrEqual(0);
    expect(
      box.x + box.width,
      "the launcher does not run off the right edge",
    ).toBeLessThanOrEqual(720);
    await expect(
      launcher.getByRole("button", { name: "Close launcher" }),
      "its own dismissal stays on screen",
    ).toBeVisible();
  });

  test("the group stays until every child is rehomed", async ({ page }) => {
    expect(
      await topNavigationDestinations(page),
      "Clinical is removed only after Tasks, Labs and Prescribing have owners",
    ).toContain("Clinical");
  });
});
