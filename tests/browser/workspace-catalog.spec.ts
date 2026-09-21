import { test, expect } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test.describe("UI-2: Shared Workspace Catalog across Home and '+' Launcher", () => {
  test.beforeEach(async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    // Click Brand Home button to ensure we are on Home view
    const homeBtn = page.getByRole("button", { name: "Home Launchpad" });
    await expect(homeBtn).toBeVisible({ timeout: 20_000 });
    await homeBtn.click();
    await expect(page.locator(".zen-home-viewport")).toBeVisible({ timeout: 20_000 });
  });

  test("Home presents exactly the three major entities (Clinical, Billing, Brand) from the shared catalog", async ({ page }) => {
    const shortcutsGrid = page.locator(".zen-shortcuts-grid");
    await expect(shortcutsGrid).toBeVisible();

    const shortcutItems = shortcutsGrid.locator(".zen-shortcut-item");
    await expect(shortcutItems).toHaveCount(3);

    // Verify Clinical tile
    const clinicalTile = shortcutItems.filter({ hasText: "Clinical" });
    await expect(clinicalTile).toBeVisible();
    await expect(clinicalTile).toHaveAttribute("data-workspace-id", "clinical");
    await expect(clinicalTile).toHaveAttribute("data-workspace-view", "today");

    // Verify Billing tile
    const billingTile = shortcutItems.filter({ hasText: "Billing" });
    await expect(billingTile).toBeVisible();
    await expect(billingTile).toHaveAttribute("data-workspace-id", "billing");

    // Verify Brand tile
    const brandTile = shortcutItems.filter({ hasText: "Brand" });
    await expect(brandTile).toBeVisible();
    await expect(brandTile).toHaveAttribute("data-workspace-id", "brand");

    // Verify Staff/HR and withdrawn prototypes are NOT on Home
    await expect(shortcutsGrid.locator("[data-workspace-id='hr']")).toHaveCount(0);
    await expect(shortcutsGrid.getByText("HR", { exact: true })).toHaveCount(0);
    await expect(shortcutsGrid.getByText("Staff", { exact: false })).toHaveCount(0);
    await expect(shortcutsGrid.locator("[data-workspace-id='financial_integration']")).toHaveCount(0);
    await expect(shortcutsGrid.getByText("Financials")).toHaveCount(0);
    await expect(shortcutsGrid.locator("[data-workspace-id='reports']")).toHaveCount(0);
  });

  test("Clicking Home Clinical tile launches the primary clinical environment", async ({ page }) => {
    const clinicalTile = page.locator(".zen-shortcut-item[data-workspace-id='clinical']");
    await clinicalTile.click();

    // Verifies navigation lands on Today Dashboard / clinical view
    await expect(page.locator(".zen-home-viewport")).toHaveCount(0);
    await expect(page.locator(".dashboard-container, .primary-workspace-pane")).toBeVisible();
  });

  test("Clicking Home Billing tile opens the Billing workspace module", async ({ page }) => {
    const billingTile = page.locator(".zen-shortcut-item[data-workspace-id='billing']");
    await billingTile.click();

    // Verifies Billing module is opened
    await expect(page.locator(".global-module-shell[data-active-module='billing']")).toBeVisible();
    await expect(page.locator(".global-module-shell h1")).toHaveText("Billing & Claims");
  });

  test("Clicking Home Brand tile opens the Brand workspace module", async ({ page }) => {
    const brandTile = page.locator(".zen-shortcut-item[data-workspace-id='brand']");
    await brandTile.click();

    // UI-6b: Brand is its own workspace holding Website and Social Media, rather than
    // the Home tile borrowing the website module under a different name.
    await expect(page.locator(".global-module-shell[data-active-module='brand']")).toBeVisible();
    await expect(page.locator(".global-module-shell h1")).toHaveText("Brand — Website & Social");
    await expect(page.locator("[data-brand-section='website']")).toBeVisible();
    await expect(page.locator("[data-brand-section='social']")).toBeVisible();
  });

  test("'+' launcher agrees with Home on shared destinations and excludes withdrawn tools", async ({ page }) => {
    const launcherBtn = page.locator("button[data-workspace-control='open-workspace-launcher']");
    await launcherBtn.click();

    const popover = page.locator("[data-testid='open-workspace-launcher-popover']");
    await expect(popover).toBeVisible();

    // Verify 7 major workspaces in '+' launcher
    const requiredDestinations = [
      "Home",
      "Calendar",
      "Patients",
      "Intake",
      "Documents",
      "Billing",
      "Brand",
    ];

    for (const name of requiredDestinations) {
      await expect(
        popover.locator(".open-workspace-item-title").filter({ hasText: name }),
        `Workspace ${name} should be offered in launcher`,
      ).toBeVisible();
    }

    // Verify Billing and Brand have identical data-workspace-id as on Home
    await expect(popover.locator("button[data-workspace-id='billing']")).toBeVisible();
    await expect(popover.locator("button[data-workspace-id='brand']")).toBeVisible();

    // D-086 amends LEFT-02: HR is offered here, because it is now everyone's own
    // record as well as the staff directory. Home's three entities are unchanged,
    // which the Home assertions above cover.
    await expect(popover.locator("button[data-workspace-id='hr']")).toBeVisible();

    // Withdrawn and planned prototypes still cannot leak through.
    await expect(popover.locator("button[data-workspace-id='financial_integration']")).toHaveCount(0);
    await expect(popover.locator("button[data-workspace-id='reports']")).toHaveCount(0);
  });
});
