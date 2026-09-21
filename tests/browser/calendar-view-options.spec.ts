import { test, expect } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test.describe("Calendar View Options: Density & Visible Hours", () => {
  test("adjusts row density between compact, standard, and spacious", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithDefaultLayout(page, "Prototype provider");

    // Open Calendar workspace
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "calendar" } }));
    });

    const gcalRoot = page.locator(".gcal-root");
    await expect(gcalRoot).toBeVisible({ timeout: 10_000 });

    // Click View Options button in the calendar toolbar
    const viewOptionsBtn = page.getByRole("button", { name: "Calendar view options", exact: true });
    await expect(viewOptionsBtn).toBeVisible();
    await viewOptionsBtn.click();

    // Verify popover opens
    const popover = page.getByRole("dialog", { name: "Calendar view options" });
    await expect(popover).toBeVisible();

    // Check density presets
    const compactPill = popover.getByRole("radio", { name: /Compact \(Thin\)/i });
    const standardPill = popover.getByRole("radio", { name: /^Standard/i });
    const spaciousPill = popover.getByRole("radio", { name: /Spacious \(Tall\)/i });

    await expect(compactPill).toBeVisible();
    await expect(standardPill).toBeVisible();
    await expect(spaciousPill).toBeVisible();

    // Standard should be active initially
    await expect(standardPill).toHaveClass(/active/);

    // Click Compact (Thin)
    await compactPill.click();
    await expect(compactPill).toHaveClass(/active/);
    await expect(gcalRoot).toHaveAttribute("data-calendar-density", "compact");

    // In compact mode, 1-hour slot should be 56px (14px * 4 slots)
    const firstHourSlot = gcalRoot.locator(".gcal-hour-slot").first();
    await expect(firstHourSlot).toBeVisible();
    const compactBox = await firstHourSlot.boundingBox();
    expect(compactBox).not.toBeNull();
    if (compactBox) {
      expect(Math.round(compactBox.height)).toBe(56);
    }

    // Switch to Spacious (Tall)
    await spaciousPill.click();
    await expect(spaciousPill).toHaveClass(/active/);
    await expect(gcalRoot).toHaveAttribute("data-calendar-density", "spacious");

    // In spacious mode, 1-hour slot should be 128px (32px * 4 slots)
    const spaciousBox = await firstHourSlot.boundingBox();
    expect(spaciousBox).not.toBeNull();
    if (spaciousBox) {
      expect(Math.round(spaciousBox.height)).toBe(128);
    }

    // Reset to defaults
    const resetBtn = popover.getByRole("button", { name: /Reset to Defaults/i });
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();
    await expect(standardPill).toHaveClass(/active/);
    await expect(gcalRoot).toHaveAttribute("data-calendar-density", "standard");
  });

  test("configures visible hours to Full Day (24 hrs) and custom hour ranges", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithDefaultLayout(page, "Prototype provider");

    // Open Calendar workspace
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "calendar" } }));
    });

    const gcalRoot = page.locator(".gcal-root");
    await expect(gcalRoot).toBeVisible({ timeout: 10_000 });

    // Open View Options
    const viewOptionsBtn = page.getByRole("button", { name: "Calendar view options", exact: true });
    await viewOptionsBtn.click();

    const popover = page.getByRole("dialog", { name: "Calendar view options" });
    await expect(popover).toBeVisible();

    // Click "Full Day (24 hrs)" preset
    const fullDayPill = popover.getByRole("radio", { name: /Full Day \(24 hrs\)/i });
    await expect(fullDayPill).toBeVisible();
    await fullDayPill.click();
    await expect(fullDayPill).toHaveClass(/active/);

    // Full day has 24 hour slots in each day column
    const dayCol = gcalRoot.locator(".gcal-day-col").first();
    await expect(dayCol.locator(".gcal-hour-slot")).toHaveCount(24);

    // Early and late labels exist in time gutter
    const timeGutter = gcalRoot.locator(".gcal-time-gutter");
    await expect(timeGutter).toContainText("1 AM");
    await expect(timeGutter).toContainText("11 PM");

    // Test custom start & end selects
    const startSelect = popover.getByLabel("Calendar day start hour");
    const endSelect = popover.getByLabel("Calendar day end hour");
    await expect(startSelect).toBeVisible();
    await expect(endSelect).toBeVisible();

    // Select 6 AM to 10 PM (16 hours)
    await startSelect.selectOption("6");
    await endSelect.selectOption("22");

    // Should now show 16 hour slots (22 - 6 = 16)
    await expect(dayCol.locator(".gcal-hour-slot")).toHaveCount(16);

    // Close on Escape
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
  });
});
