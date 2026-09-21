import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test.describe("Clinical Interval Jump & Follow-Up Scheduling", () => {
  /**
   * The companion's follow-up intervals, and the omnibox route into them.
   *
   * This used to drive `.interval-chip`, `.companion-active-interval-banner` and
   * `.calc-days-input` — a second, companion-only scheduling UI. `94cdc8e` removed
   * it deliberately: the companion now renders the same `CalendarWorkspace` the
   * Calendar tab does, so there is one set of intervals, one base-date rule and one
   * booking surface rather than two that can disagree. The spec was not moved with
   * it and had been waiting on deleted markup ever since.
   *
   * It is rewritten against what replaced it, and asserts the date the calendar
   * actually lands on rather than a banner's label: a preset pill is `active` only
   * while the view is on that interval's target, and "Reset to Today" exists only
   * while the view has left today.
   */
  test("clinical interval jumps drive the companion calendar from its own toolbar and from the omnibox", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDefaultLayout(page, "Prototype provider");

    // 1. Open the Calendar companion from the right rail.
    const calendarRailBtn = page.locator(".companion-rail-btn[title*='Calendar']").first();
    await expect(calendarRailBtn).toBeVisible({ timeout: 10_000 });
    await calendarRailBtn.click();

    const panel = page.locator("aside.companion-calendar-panel");
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // The companion is the practice calendar in a compact presentation, not a
    // separate one. Everything below therefore tests the real scheduling surface.
    await expect(panel.locator('.gcal-root[data-calendar-presentation="companion"]')).toBeVisible();

    // 2. The clinical interval presets are offered by name, so nobody counts weeks.
    const followUp = panel.getByRole("dialog", { name: "Clinical follow-up date" });
    await panel.getByRole("button", { name: "Follow-up", exact: true }).click();
    await expect(followUp).toBeVisible();

    const preset = (label: string) => followUp.locator(".gcal-preset-pill").filter({ hasText: label });
    for (const label of ["+28d", "+56d", "+84d"]) {
      await expect(preset(label), `${label} should be offered as a preset`).toBeVisible();
    }
    await expect(
      followUp.getByRole("button", { name: /Reset to Today/ }),
      "nothing to reset before anything has been jumped",
    ).toHaveCount(0);

    // 3. A preset moves the calendar, and the calendar says where it landed.
    await preset("+28d").click();
    await expect(preset("+28d"), "the view is on the +28d follow-up date").toHaveClass(/active/);
    await expect(followUp.getByRole("button", { name: /Reset to Today/ })).toBeVisible();

    // 4. An arbitrary interval works the same way, previewed before it is taken.
    const daysInput = followUp.locator(".gcal-jump-days-input");
    await daysInput.fill("56");
    await expect(followUp.locator(".gcal-jump-preview-chip")).toContainText("8w");
    await followUp.getByRole("button", { name: "Jump to Date" }).click();
    await expect(preset("+56d"), "the view is on the +56d follow-up date").toHaveClass(/active/);
    await expect(preset("+28d")).not.toHaveClass(/active/);

    // 5. Reset returns the companion to today, and the reset control retires itself.
    await followUp.getByRole("button", { name: /Reset to Today/ }).click();
    await expect(followUp.getByRole("button", { name: /Reset to Today/ })).toHaveCount(0);
    await expect(preset("+56d")).not.toHaveClass(/active/);

    await page.screenshot({
      path: "test-results/playwright/calendar_interval_companion_panel.png",
      fullPage: false,
    });

    // 6. The same interval reached by intent rather than by toolbar. The omnibox
    //    answer is a proposal with an explicit action; it does not jump on its own.
    await page.keyboard.press("Escape");
    const omnibox = page.locator("input[placeholder*='Search or ask AI']");
    await expect(omnibox).toBeVisible();
    await omnibox.fill("pull up 84 days later");

    const aiCard = page.locator(".query-answer-card");
    await expect(aiCard).toBeVisible({ timeout: 5_000 });
    await expect(aiCard).toContainText("84 Days Later");

    await page.screenshot({
      path: "test-results/playwright/omnibox_calendar_jump_card.png",
      fullPage: false,
    });

    const pullUpBtn = aiCard.getByRole("button", { name: /Pull Up.*\(\+84d\)/ });
    await expect(pullUpBtn).toBeVisible();
    await pullUpBtn.click();

    // 7. The companion is where the jump lands, on the date the card named.
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Follow-up", exact: true }).click();
    await expect(followUp).toBeVisible();
    await expect(preset("+84d"), "the companion is on the +84d date the card offered").toHaveClass(/active/);
  });

  test("full CalendarWorkspace keeps follow-up scheduling one click away without permanent chrome", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await signInWithDefaultLayout(page, "Prototype provider");

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "calendar" } }));
    });

    const gcalRoot = page.locator(".gcal-root");
    await expect(gcalRoot).toBeVisible({ timeout: 10_000 });

    // Calendar is an integrated Clinical Bond workspace: one local toolbar,
    // no duplicate brand/search row, and no permanently visible interval bar.
    await expect(page.locator(".gcal-header")).toHaveCount(1);
    await expect(page.locator(".gcal-brand")).toHaveCount(0);
    await expect(page.locator(".gcal-header-center")).toHaveCount(0);
    await expect(page.locator(".gcal-interval-jump-bar")).toHaveCount(0);

    const followUpButton = page.getByRole("button", { name: "Follow-up", exact: true });
    await expect(followUpButton).toBeVisible();
    await followUpButton.click();

    const followUp = page.getByRole("dialog", { name: "Clinical follow-up date" });
    await expect(followUp).toBeVisible();

    // High-frequency workflow: custom interval input is ready to type immediately.
    const daysInput = followUp.locator(".gcal-jump-days-input");
    await expect(daysInput).toBeFocused();
    await daysInput.fill("45");

    const previewChip = followUp.locator(".gcal-jump-preview-chip");
    await expect(previewChip).toBeVisible();
    await expect(previewChip).toContainText("Resolves to");
    await expect(previewChip).toContainText("6.4w");

    const popoverBox = await followUp.boundingBox();
    expect(popoverBox).not.toBeNull();
    if (popoverBox) {
      expect(popoverBox.x).toBeGreaterThanOrEqual(0);
      expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(1024);
    }

    const jumpBtn = followUp.locator(".gcal-jump-submit-btn");
    await expect(jumpBtn).toBeEnabled();
    await jumpBtn.click();

    const preset28 = followUp.locator(".gcal-preset-pill", { hasText: "+28d" });
    await expect(preset28).toBeVisible();
    await preset28.click();
    await expect(preset28).toHaveClass(/active/);

    const resetBtn = followUp.locator(".gcal-jump-reset-btn");
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    // The sidebar owns the normal Calendar filter. When it is collapsed,
    // a compact trigger keeps that same filter state available.
    await page.getByRole("button", { name: "Toggle sidebar" }).click();
    const filterButton = page.getByRole("button", { name: "Filter calendar" });
    await expect(filterButton).toBeVisible();
    await filterButton.click();

    const filterDialog = page.getByRole("dialog", { name: "Filter calendar" });
    const filterInput = filterDialog.getByRole("searchbox", {
      name: "Filter patients, visits, or reasons",
    });
    await expect(filterInput).toBeFocused();
    await filterInput.fill("Maya");
    await expect(filterInput).toHaveValue("Maya");

    const filterBox = await filterDialog.boundingBox();
    expect(filterBox).not.toBeNull();
    if (filterBox) {
      expect(filterBox.x).toBeGreaterThanOrEqual(0);
      expect(filterBox.x + filterBox.width).toBeLessThanOrEqual(1024);
    }

    await page.screenshot({
      path: "test-results/playwright/calendar_progressive_followup.png",
      fullPage: false,
    });
  });
});
