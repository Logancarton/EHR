import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * Global modules (Intake, Team's Practice submenu items, etc.) now behave as
 * persistent, closeable workspace tabs, the same way Dashboard and Calendar
 * already do (D-072) — opening one adds it to the tab strip, it stays open
 * while the clinician works a chart, clicking it re-focuses it, and its ×
 * closes it without disturbing the other open tabs.
 */
test.describe("global module workspace tabs", () => {
  test("opening Intake adds a closeable tab that survives navigating to a chart and back", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const intakeTab = page.locator(".browser-tab[data-workspace-tab=\"module\"][data-workspace-view=\"intake\"]");
    await expect(intakeTab).toHaveCount(0);

    await page.getByRole("button", { name: "Intake", exact: true }).click();
    await expect(page.locator(".global-module-shell")).toHaveAttribute("data-active-module", "intake", { timeout: 20_000 });
    await expect(intakeTab).toBeVisible({ timeout: 10_000 });
    await expect(intakeTab).toHaveClass(/active/);
    await expect(intakeTab.locator(".tab-name")).toHaveText("Intake");

    // Switching to a patient chart leaves the module tab open, just unfocused.
    await page.locator(".browser-tab").filter({ hasText: "Maya Chen" }).click();
    await expect(page.locator(".global-module-shell")).toHaveCount(0);
    await expect(intakeTab, "the Intake tab stays open in the background").toBeVisible();
    await expect(intakeTab).not.toHaveClass(/active/);

    // Clicking it again re-opens the module.
    await intakeTab.click();
    await expect(page.locator(".global-module-shell")).toHaveAttribute("data-active-module", "intake", { timeout: 20_000 });
    await expect(intakeTab).toHaveClass(/active/);

    // Its own × closes the module and removes the tab, falling back the same
    // way the Calendar tab's × already does (Dashboard first, since it is
    // still open here).
    await intakeTab.getByRole("button", { name: "Close Intake tab" }).click();
    await expect(page.locator(".global-module-shell")).toHaveCount(0);
    await expect(intakeTab).toHaveCount(0);
    await expect(page.locator(".today-dashboard")).toBeVisible();
  });

  test("closing an inactive module tab does not disturb the active chart", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    await page.getByRole("button", { name: "Intake", exact: true }).click();
    await expect(page.locator(".global-module-shell")).toHaveAttribute("data-active-module", "intake", { timeout: 20_000 });

    // Move focus to a chart — the Intake tab stays open, just inactive.
    await page.locator(".browser-tab").filter({ hasText: "Jordan Reed" }).click();
    const intakeTab = page.locator(".browser-tab[data-workspace-tab=\"module\"][data-workspace-view=\"intake\"]");
    await expect(intakeTab).toBeVisible();
    await expect(intakeTab).not.toHaveClass(/active/);

    await intakeTab.getByRole("button", { name: "Close Intake tab" }).click();
    await expect(intakeTab).toHaveCount(0);
    // The chart that was actually on screen is undisturbed by closing a
    // background tab.
    await expect(page.locator(".primary-workspace-pane .patient-header h1")).toHaveText("Jordan Reed");
  });
});
