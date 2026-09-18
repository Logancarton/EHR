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
      path: "/Users/logancarton/.gemini/antigravity-ide/brain/d7c8139a-f9ab-4896-8550-0aa75c66d8f7/calendar_interval_companion_panel.png",
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
      path: "/Users/logancarton/.gemini/antigravity-ide/brain/d7c8139a-f9ab-4896-8550-0aa75c66d8f7/omnibox_calendar_jump_card.png",
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

  test("full CalendarWorkspace interval sub-bar allows typing any number of days, shows presets, and has zero header overlap", async ({
    page,
  }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    // Open Calendar full module
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "calendar" } }));
    });

    const gcalRoot = page.locator(".gcal-root");
    await expect(gcalRoot).toBeVisible({ timeout: 10_000 });

    // 1. Verify header search box ("name finder") and header-left do not overlap
    const headerLeft = page.locator(".gcal-header-left");
    const headerSearch = page.locator(".gcal-header-center");
    await expect(headerLeft).toBeVisible();
    await expect(headerSearch).toBeVisible();

    const leftBox = await headerLeft.boundingBox();
    const searchBox = await headerSearch.boundingBox();
    expect(leftBox).not.toBeNull();
    expect(searchBox).not.toBeNull();
    if (leftBox && searchBox) {
      // The search box must be to the right of header-left with no overlap!
      expect(searchBox.x).toBeGreaterThanOrEqual(leftBox.x + leftBox.width - 2);
    }

    // 2. Verify the dedicated interval jump bar is visible
    const jumpBar = page.locator(".gcal-interval-jump-bar");
    await expect(jumpBar).toBeVisible();

    // 3. Test typing any number of days (e.g. 45 days)
    const daysInput = page.locator(".gcal-jump-days-input");
    await expect(daysInput).toBeVisible();
    await daysInput.fill("45");

    // Live preview chip should be visible and indicate target date + weeks hint
    const previewChip = page.locator(".gcal-jump-preview-chip");
    await expect(previewChip).toBeVisible();
    await expect(previewChip).toContainText("Resolves to:");
    await expect(previewChip).toContainText("6.4w");

    // Click Jump to Date
    const jumpBtn = page.locator(".gcal-jump-submit-btn");
    await expect(jumpBtn).toBeEnabled();
    await jumpBtn.click();

    // 4. Test presets: click +28d preset pill
    const preset28 = page.locator(".gcal-preset-pill", { hasText: "+28d" });
    await expect(preset28).toBeVisible();
    await preset28.click();
    await expect(preset28).toHaveClass(/active/);

    // 5. Test Reset to Today
    const resetBtn = page.locator(".gcal-jump-reset-btn");
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();
    await expect(page.locator(".gcal-heading-date")).toContainText("September");

    // Take screenshot of the fixed, non-overlapping, typed-days calendar
    await page.screenshot({
      path: "/Users/logancarton/.gemini/antigravity-ide/brain/d7c8139a-f9ab-4896-8550-0aa75c66d8f7/calendar_typed_days_subbar.png",
      fullPage: false,
    });
  });
});
