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
      "Labs and Prescribing stay until UI-7c gives them owners",
    ).toHaveText([/Labs/, /Prescribing/]);

    await panel.getByRole("button", { name: "Labs", exact: true }).click();
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
      "Clinical is removed only after Labs and Prescribing have owners",
    ).toContain("Clinical");
  });
});

/**
 * UI-7b — Tasks leaves the Clinical menu for the right companion.
 *
 * The menu's Tasks opened the practice task queue as a workspace tab, with filters,
 * patient links, removal and a standing open-task count beside the entry. The
 * replacement has to reach all of it, so these check the queue itself rather than
 * the presence of a panel: the companion expanded to the main canvas renders the
 * same queue, the count came with the destination, a clinician's draft and filter
 * survive the lifecycle, a change made on one surface reaches the others, and the
 * workspace tab is still one click away. The menu entry is checked gone last.
 */

async function openTasksCompanion(page: Page) {
  await page.locator(".companion-rail-btn[data-tool-id='tasks']").click();
  const panel = page.locator(".companion-panel[data-companion-panel='tasks']");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-companion-presentation", "docked");
  return panel;
}

async function expandTasksCompanion(page: Page) {
  const panel = page.locator(".companion-panel[data-companion-panel='tasks']");
  await panel.locator("button[data-action='expand-companion']").click();
  await expect(panel).toHaveAttribute("data-companion-presentation", "expanded");
  await expect(panel.locator(".global-tasks-workspace")).toBeVisible({ timeout: 20_000 });
  return panel;
}

/** The number a task filter reports for itself, e.g. `Open (3)`. */
async function taskFilterCount(panel: ReturnType<Page["locator"]>, label: string): Promise<number> {
  const button = panel.locator(".global-task-filters button")
    .filter({ hasText: new RegExp(`^${label} \\(\\d+\\)$`) });
  await expect(button).toHaveCount(1);
  return Number(/\((\d+)\)/.exec((await button.textContent()) ?? "")?.[1] ?? NaN);
}

test.describe("UI-7b: Tasks leaves the Clinical menu for the companion", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDefaultLayout(page, "Prototype provider");
  });

  test("the expanded companion is the practice queue, and Tasks is offered nowhere in the top navigation", async ({
    page,
  }) => {
    await openTasksCompanion(page);
    const panel = await expandTasksCompanion(page);

    // Everything the menu's Tasks reached, asked of the surface that replaced it.
    await expect(
      panel.locator(".global-task-compose input"),
      "a task can still be added from the surface that owns the queue",
    ).toBeVisible();
    await expect(
      panel.locator(".global-task-filters button"),
      "the queue's own filters came with it rather than a read-only list",
    ).toHaveText([/^Open/, /^Completed/, /^Patient-linked/, /^All/]);
    await expect(
      panel.locator(".global-task-row").first(),
      "the queue answered with rows rather than an empty companion",
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      panel.locator(".global-task-row").first().locator(".global-task-delete"),
      "removing a task is reachable here too",
    ).toBeVisible();
    await expect(
      panel.locator(".global-task-row").first().locator(".global-task-check"),
      "and so is completing one",
    ).toBeVisible();

    // RIGHT-05: the rail stays reachable while the companion holds the canvas.
    await expect(page.locator(".companion-rail")).toBeVisible();

    expect(
      await topNavigationDestinations(page),
      "Tasks is retired from the work menus now that the companion owns it",
    ).not.toContain("Tasks");
  });

  test("the open-task count follows Tasks onto the companion rail", async ({ page }) => {
    // Read the count the shell offers before opening anything. The queue publishes
    // it at load, so the rail carries it without the companion ever being opened.
    const badge = page.locator(".companion-rail-btn[data-tool-id='tasks'] .companion-rail-count");
    await expect(badge).toBeVisible({ timeout: 20_000 });
    const shown = Number((await badge.textContent())?.replace(/\D/g, ""));
    expect(Number.isFinite(shown)).toBe(true);
    expect(shown).toBeGreaterThan(0);

    await openTasksCompanion(page);
    const panel = await expandTasksCompanion(page);
    expect(
      shown,
      "the rail's count is the queue's own open work, not a fixture literal",
    ).toBe(await taskFilterCount(panel, "Open"));
  });

  test("a draft and a chosen filter survive expand, redock and expand again", async ({ page }) => {
    await openTasksCompanion(page);
    let panel = await expandTasksCompanion(page);

    await panel.locator(".global-task-filters button").filter({ hasText: /^Patient-linked/ }).click();
    await panel.locator(".global-task-compose input").fill("Draft that must survive redocking");

    await panel.locator("button[data-action='redock-companion']").click();
    await expect(panel).toHaveAttribute("data-companion-presentation", "docked");
    await expect(
      panel.locator(".tasks-add-box input"),
      "the docked compose box is the same draft, not a second one",
    ).toHaveValue("Draft that must survive redocking");

    panel = await expandTasksCompanion(page);
    await expect(panel.locator(".global-task-compose input")).toHaveValue(
      "Draft that must survive redocking",
    );
    await expect(
      panel.locator(".global-task-filters button").filter({ hasText: /^Patient-linked/ }),
      "the filter the clinician chose is still the one applied",
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("Escape redocks the expanded companion before dismissing it", async ({ page }) => {
    const panel = await openTasksCompanion(page);
    await expandTasksCompanion(page);

    await page.keyboard.press("Escape");
    await expect(panel).toHaveAttribute("data-companion-presentation", "docked");
    await expect(panel, "the first Escape redocks rather than closing").toBeVisible();

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  });

  test("a task added from the companion moves the queue and the rail count together", async ({
    page,
  }) => {
    const badge = page.locator(".companion-rail-btn[data-tool-id='tasks'] .companion-rail-count");
    await expect(badge).toBeVisible({ timeout: 20_000 });
    const before = Number((await badge.textContent())?.replace(/\D/g, ""));

    await openTasksCompanion(page);
    const panel = await expandTasksCompanion(page);
    const openBefore = await taskFilterCount(panel, "Open");

    const text = `Confirm lithium level with the lab ${Date.now()}`;
    await panel.locator(".global-task-compose input").fill(text);
    await panel.getByRole("button", { name: "Add task", exact: true }).click();

    await expect(
      panel.locator(".global-task-row").filter({ hasText: text }),
      "the task the companion added is in the queue it just wrote to",
    ).toHaveCount(1, { timeout: 20_000 });
    await expect(badge, "and the shell's count moved with it").toHaveText(String(before + 1));
    expect(await taskFilterCount(panel, "Open")).toBe(openBefore + 1);

    // Removing it puts the queue back, which proves the removal control works and
    // leaves the shared database as this spec found it.
    await panel.locator(".global-task-row").filter({ hasText: text })
      .locator(".global-task-delete").click();
    await expect(panel.locator(".global-task-row").filter({ hasText: text })).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(badge).toHaveText(String(before));
  });

  test("the companion still opens the Tasks workspace tab the menu opened", async ({ page }) => {
    await openTasksCompanion(page);
    await page.getByRole("button", { name: "Open Full Tasks Workspace" }).click();

    await expect(
      page.locator(".global-module-shell[data-active-module='tasks']"),
      "the queue's own workspace is still one click from the companion",
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.locator(".browser-tab").filter({ hasText: "Tasks" }),
      "and it is a labelled persistent tab, as it was from the menu",
    ).toHaveCount(1);
  });
});
