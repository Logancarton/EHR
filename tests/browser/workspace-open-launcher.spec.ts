import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

async function openLauncher(page: Page) {
  await page.locator("button[data-workspace-control='open-workspace-launcher']").click();
  const popover = page.locator("[data-testid='open-workspace-launcher-popover']");
  await expect(popover).toBeVisible();
  return popover;
}

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
      // UI-8 added Dashboard: it was the last destination the removed top-bar row
      // carried that the launcher did not already offer.
      "Dashboard",
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

    // Arrow down to Calendar. It was the second item until UI-8 added Dashboard
    // above it, so the arrow count is checked against what is actually highlighted
    // rather than trusted: pressing Enter on the wrong row would otherwise open the
    // wrong workspace and the assertion below would report it as a missing tab.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(
      popover.locator(".open-workspace-item[aria-selected='true']"),
      "arrowing down moves the highlight one row at a time",
    ).toHaveAttribute("data-workspace-id", "calendar");
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

  test("the launcher is the route the top-bar navigation used to be", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    // This was UI-1's migration-invariant guard: adding the launcher must not break
    // the top-bar row that still carried Calendar, Intake and Dashboard. The invariant
    // held through UI-5, UI-6 and UI-7, each of which rehomed a destination and then
    // removed its entry, and it is discharged by UI-8 — the row is gone because every
    // destination it carried has a proven owner.
    //
    // What replaces it is the same test read the other way round: the destinations the
    // row carried are here, and the row is not.
    await expect(
      page.locator(".tool-navigation, .tool-menu-trigger, .topbar-navigation-slot"),
      "the top bar carries no work navigation",
    ).toHaveCount(0);

    const popover = await openLauncher(page);
    for (const destination of ["calendar", "intake", "dashboard"]) {
      await expect(
        popover.locator(`.open-workspace-item[data-workspace-id="${destination}"]`),
        `${destination} is offered by the launcher`,
      ).toBeVisible();
    }
    // Team, Practice and Clinical were retired with their children, and nothing put
    // them back on either surface.
    for (const retired of ["Team", "Practice", "Clinical"]) {
      await expect(
        popover.getByRole("button", { name: retired, exact: true }),
        `${retired} is not offered by the launcher either`,
      ).toHaveCount(0);
    }

    // And it navigates: the destination the old row opened directly still opens.
    await popover.locator(".open-workspace-item[data-workspace-id='intake']").click();
    await expect(page.locator(".global-module-shell[data-active-module='intake']")).toBeVisible({
      timeout: 20_000,
    });
  });

  /**
   * The case the section exists for, and the one it used to get wrong.
   *
   * The launcher offered `roster.slice(0, 5)` — the first five patients by name —
   * so whether a chart could be reached from here depended on the patient's
   * initial. On the demo roster Maya Chen is exactly fifth and Sofia Martinez is
   * sixth, which is why this spec passed alone and failed in a full run: any
   * patient a run registers ahead of Maya pushes the chart under test off the end
   * of the list. Open charts now come first, so the launcher can always do the one
   * thing UI-1 promises — focus the chart that is already open.
   */
  test("an open chart is offered even when its patient sorts past the end of the list", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    // Sofia Martinez sorts last on the demo roster and is not docked by default.
    const omnibox = page.getByRole("textbox", { name: "Ask AI or search the EHR" });
    await omnibox.fill("Sofia Martinez");
    const result = page
      .locator('.search-results button[data-omnibox-result="patient"]')
      .filter({ hasText: "Sofia Martinez" })
      .first();
    // Generous on purpose: this establishes a precondition through the roster
    // request and the omnibox, which on a cold dev server outlasts the default.
    await expect(result).toBeVisible({ timeout: 15_000 });
    await result.click();

    const sofiaTab = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Sofia Martinez" });
    await expect(sofiaTab).toHaveClass(/active/, { timeout: 10_000 });

    const popover = page.locator("[data-testid='open-workspace-launcher-popover']");
    await page.locator("button[data-workspace-control='open-workspace-launcher']").click();
    await expect(popover).toBeVisible();

    const rows = popover.locator(".open-workspace-patient-row");
    await expect(rows, "the list stays capped at five").toHaveCount(5);
    await expect(
      rows.filter({ hasText: "Sofia Martinez" }).locator(".open-workspace-status-badge"),
    ).toHaveText("Active chart");

    // And choosing it focuses the chart already open rather than duplicating it.
    await rows.filter({ hasText: "Sofia Martinez" }).click();
    await expect(sofiaTab).toHaveCount(1);
    await expect(sofiaTab).toHaveClass(/active/);
  });
});
