import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test.describe("UI-1: Universal Open workspace launcher", () => {
  test("tab-strip + button upgrades to Open workspace launcher and opens popover", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    // 1. Verify + button attributes
    const launcherBtn = page.locator("button[data-workspace-control='open-workspace-launcher']");
    await expect(launcherBtn).toBeVisible();
    await expect(launcherBtn).toHaveAttribute("aria-label", "Open workspace");
    await expect(launcherBtn).toHaveAttribute("title", "Open workspace");
    await expect(launcherBtn).toHaveAttribute("aria-haspopup", "dialog");

    // Initially launcher popover is not open
    const popover = page.locator("[data-testid='open-workspace-launcher-popover']");
    await expect(popover).toHaveCount(0);

    // 2. Click + button to open launcher popover
    await launcherBtn.click();
    await expect(popover).toBeVisible();
    await expect(popover.getByRole("heading", { name: "Open workspace" })).toBeVisible();

    // 3. Verify all major workspace destinations are offered
    const requiredWorkspaces = [
      "Home",
      "Calendar",
      "Patients",
      "Intake",
      "Documents",
      "Billing",
      "Brand",
    ];

    for (const name of requiredWorkspaces) {
      await expect(
        popover.locator(".open-workspace-item-title").filter({ hasText: name }),
        `Workspace ${name} should be offered in launcher`,
      ).toBeVisible();
    }

    // 4. Verify recent patients section
    await expect(popover.getByText("Recent Patients")).toBeVisible();
    await expect(popover.locator(".open-workspace-patient-name").first()).toBeVisible();

    // 5. Verify search input is present and autofocusable
    const searchInput = popover.locator(".open-workspace-search-input");
    await expect(searchInput).toBeVisible();

    // Filter workspaces by typing "bill"
    await searchInput.fill("bill");
    await expect(popover.locator("button[data-workspace-id='billing']")).toBeVisible();
    await expect(popover.locator("button[data-workspace-id='calendar']")).toHaveCount(0);

    // Clear search query
    await popover.locator(".open-workspace-search-clear").click();
    await expect(popover.locator("button[data-workspace-id='calendar']")).toBeVisible();
  });

  test("focus-existing singleton rule: focuses open tabs instead of creating duplicates", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const launcherBtn = page.locator("button[data-workspace-control='open-workspace-launcher']");
    const popover = page.locator("[data-testid='open-workspace-launcher-popover']");

    // Open launcher and click Intake (not open yet)
    await launcherBtn.click();
    await expect(popover).toBeVisible();
    await popover.locator("button[data-workspace-id='intake']").click();

    // Intake tab is created and active
    const intakeTab = page.locator(".browser-tab[data-workspace-tab='module'][data-workspace-view='intake']");
    await expect(intakeTab).toBeVisible({ timeout: 10_000 });
    await expect(intakeTab).toHaveClass(/active/);
    await expect(intakeTab).toHaveCount(1);

    // Open launcher again and click Calendar (not open yet)
    await launcherBtn.click();
    await expect(popover).toBeVisible();
    // Intake should now indicate "Open tab"
    await expect(
      popover.locator("button[data-workspace-id='intake'] .open-workspace-status-badge"),
    ).toHaveText("Open tab");

    await popover.locator("button[data-workspace-id='calendar']").click();

    // Calendar tab is opened and active
    const calendarTab = page.locator(".browser-tab[data-workspace-tab='calendar']");
    await expect(calendarTab).toBeVisible({ timeout: 10_000 });
    await expect(calendarTab).toHaveClass(/active/);
    await expect(calendarTab).toHaveCount(1);

    // Intake tab remains in background
    await expect(intakeTab).toBeVisible();
    await expect(intakeTab).not.toHaveClass(/active/);
    await expect(intakeTab).toHaveCount(1);

    // Focus existing Intake tab via launcher
    await launcherBtn.click();
    await expect(popover).toBeVisible();
    await popover.locator("button[data-workspace-id='intake']").click();

    // Intake tab is re-activated without duplicate tab
    await expect(intakeTab).toHaveClass(/active/);
    await expect(intakeTab).toHaveCount(1);
    await expect(calendarTab).not.toHaveClass(/active/);
    await expect(calendarTab).toHaveCount(1);

    // Focus existing Calendar tab via launcher
    await launcherBtn.click();
    await expect(popover).toBeVisible();
    await popover.locator("button[data-workspace-id='calendar']").click();

    // Calendar tab is re-activated without duplicate tab
    await expect(calendarTab).toHaveClass(/active/);
    await expect(calendarTab).toHaveCount(1);
  });

  test("opening patient charts from launcher focuses existing docked tab or opens new tab", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const launcherBtn = page.locator("button[data-workspace-control='open-workspace-launcher']");
    const popover = page.locator("[data-testid='open-workspace-launcher-popover']");

    // Open Maya Chen tab first
    const mayaTab = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Maya Chen" });
    await mayaTab.click();
    await expect(mayaTab).toHaveClass(/active/);

    // Open launcher
    await launcherBtn.click();
    await expect(popover).toBeVisible();

    // Maya Chen row should show "Active chart"
    await expect(
      popover.locator(".open-workspace-patient-row").filter({ hasText: "Maya Chen" }).locator(".open-workspace-status-badge"),
    ).toHaveText("Active chart");

    // Click Elena Rostova from launcher
    const elenaBtn = popover.locator(".open-workspace-patient-row").filter({ hasText: "Elena Rostova" });
    await elenaBtn.click();

    // Elena Rostova tab should open and become active
    const elenaTab = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Elena Rostova" });
    await expect(elenaTab).toBeVisible({ timeout: 10_000 });
    await expect(elenaTab).toHaveClass(/active/);
    await expect(elenaTab).toHaveCount(1);

    // Open launcher again
    await launcherBtn.click();
    await expect(popover).toBeVisible();

    // Click Maya Chen from launcher -> focuses existing Maya tab
    await popover.locator(".open-workspace-patient-row").filter({ hasText: "Maya Chen" }).click();
    await expect(mayaTab).toHaveClass(/active/);
    await expect(mayaTab).toHaveCount(1);
  });

  test("dismissal and keyboard navigation contracts", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const launcherBtn = page.locator("button[data-workspace-control='open-workspace-launcher']");
    const popover = page.locator("[data-testid='open-workspace-launcher-popover']");

    // 1. Open via click
    await launcherBtn.click();
    await expect(popover).toBeVisible();

    // 2. Escape dismisses popover and returns focus to launcher button
    await page.keyboard.press("Escape");
    await expect(popover).toHaveCount(0);
    await expect(launcherBtn).toBeFocused();

    // 3. Arrow navigation and Enter activation
    await launcherBtn.click();
    await expect(popover).toBeVisible();

    // Arrow down to select second item (Calendar)
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    // Popover closes and Calendar tab opens
    await expect(popover).toHaveCount(0);
    await expect(page.locator(".browser-tab[data-workspace-tab='calendar']")).toBeVisible({ timeout: 10_000 });

    // 4. Dismiss on outside click
    await launcherBtn.click();
    await expect(popover).toBeVisible();
    await page.locator(".brand-titles").click();
    await expect(popover).toHaveCount(0);
  });

  test("existing top-bar navigation (ToolNavigation) remains functional and unchanged", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    // Verify all existing top navigation destinations remain present
    const toolNav = page.locator(".tool-navigation");
    await expect(toolNav).toBeVisible();
    await expect(toolNav.getByRole("button", { name: "Clinical", exact: true })).toBeVisible();
    await expect(toolNav.getByRole("button", { name: "Calendar", exact: true })).toBeVisible();
    await expect(toolNav.getByRole("button", { name: "Intake", exact: true })).toBeVisible();
    await expect(toolNav.getByRole("button", { name: "Practice", exact: true })).toBeVisible();
    await expect(toolNav.getByRole("button", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(toolNav.getByRole("button", { name: "Team", exact: true })).toHaveCount(0);

    // Top-bar navigation still navigates directly
    await toolNav.getByRole("button", { name: "Intake", exact: true }).click();
    await expect(page.locator(".global-module-shell[data-active-module='intake']")).toBeVisible({ timeout: 10_000 });
  });
});
