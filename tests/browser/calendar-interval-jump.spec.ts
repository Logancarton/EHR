import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test.describe("Clinical Interval Jump & Follow-Up Scheduling", () => {
  test("allows jumping 28, 56, and 84 days later from companion panel and omnibox without week counting", async ({
    page,
  }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    // 1. Open Calendar Companion Panel from right rail
    const calendarRailBtn = page.locator(".companion-rail-btn[title*='Calendar']").first();
    await expect(calendarRailBtn).toBeVisible({ timeout: 10_000 });
    await calendarRailBtn.click();

    const panel = page.locator("aside.companion-calendar-panel");
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // 2. Verify clinical interval presets are visible
    const chip28 = panel.locator(".interval-chip", { hasText: "+28d" });
    const chip56 = panel.locator(".interval-chip", { hasText: "+56d" });
    const chip84 = panel.locator(".interval-chip", { hasText: "+84d" });

    await expect(chip28).toBeVisible();
    await expect(chip56).toBeVisible();
    await expect(chip84).toBeVisible();

    // 3. Click +28d chip
    await chip28.click();
    await expect(chip28).toHaveClass(/active/);

    // Verify active provenance banner is visible
    const banner = panel.locator(".companion-active-interval-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("+28d");

    await page.screenshot({
      path: "test-results/playwright/calendar_interval_companion_panel.png",
      fullPage: false,
    });

    // 4. Test custom days later calculator input: enter 56 days
    const daysInput = panel.locator(".calc-days-input");
    await expect(daysInput).toBeVisible();
    await daysInput.fill("56");

    const jumpBtn = panel.locator(".calc-jump-btn");
    await expect(jumpBtn).toBeVisible();
    await jumpBtn.click();

    // Verify banner updates to +56d
    await expect(banner).toContainText("+56d");

    // 5. Click Reset to Today
    const resetLink = panel.locator(".banner-reset-link");
    await resetLink.click();
    await expect(panel.locator(".date-chip", { hasText: "Today" })).toHaveClass(/active/);

    // 6. Test Omnibox intent: "pull up 84 days later"
    const omnibox = page.locator("input[placeholder*='Search or ask AI']");
    await expect(omnibox).toBeVisible();
    await omnibox.fill("pull up 84 days later");

    // Verify AI query result card appears with 84 days later
    const aiCard = page.locator(".query-answer-card");
    await expect(aiCard).toBeVisible({ timeout: 5_000 });
    await expect(aiCard.getByText("84 Days Later")).toBeVisible();

    await page.screenshot({
      path: "test-results/playwright/omnibox_calendar_jump_card.png",
      fullPage: false,
    });

    // Click the jump button in the card
    const pullUpBtn = aiCard.getByRole("button", { name: /Pull Up.*(\+84d)/ });
    await expect(pullUpBtn).toBeVisible();
    await pullUpBtn.click();

    // Verify companion panel shows +84d banner
    await expect(panel).toBeVisible();
    await expect(banner).toContainText("+84d");
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
