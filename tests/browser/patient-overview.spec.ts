import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * Patient tools live in the right companion rail. The quiet default set (2931b33,
 * D-121) keeps the primary record tools on the strip and moves lower-frequency
 * Orders behind "More companion tools", where it must still be openable.
 */
async function expectRightRailPatientTools(page: Page) {
  for (const id of ["medications", "labs", "documents", "communication", "history"]) {
    await expect(page.locator(`.companion-rail-btn[data-tool-id="${id}"]`)).toBeVisible();
  }
  const more = page.getByRole("button", { name: "More companion tools", exact: true });
  await expect(more).toBeVisible();
  await more.click();
  await expect(
    page.locator(".companion-add-menu").getByRole("button", { name: "Open Orders", exact: true }),
  ).toBeVisible();
  await more.click();
  await expect(page.locator(".companion-add-menu")).toHaveCount(0);
}

test.describe("Patient Overview Identity Deduplication & Card Menus (CB-4)", () => {
  test("preserves single identity header per pane and removes redundant envelope card", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDefaultLayout(page, "Prototype provider");

    // Open Maya Chen's chart tab
    const mayaTab = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Maya Chen" });
    await expect(mayaTab).toBeVisible();
    await mayaTab.click();

    // Verify patient header exists and has patient identity
    const patientHeader = page.locator(".patient-header");
    await expect(patientHeader).toBeVisible();
    await expect(patientHeader.locator("h1")).toContainText("Maya Chen");

    // Ensure the redundant envelope card is NOT rendered
    const duplicateEnvelope = page.locator(".patient-envelope-card");
    await expect(duplicateEnvelope).toHaveCount(0);

    // Verify that the 4 clinical overview cards are immediately visible
    const overviewGrid = page.locator(".overview-grid");
    await expect(overviewGrid).toBeVisible();

    const snapshotCard = page.locator(".overview-card-container").filter({ hasText: "Last Visit & Follow-up" });
    const diagnosesCard = page.locator(".overview-card-container").filter({ hasText: "Active Diagnoses" });
    const medsCard = page.locator(".overview-card-container").filter({ hasText: "Active Medications" });
    const timelineCard = page.locator(".overview-card-container").filter({ hasText: "Recent Clinical Changes" });

    await expect(snapshotCard).toBeVisible();
    await expect(diagnosesCard).toBeVisible();
    await expect(medsCard).toBeVisible();
    await expect(timelineCard).toBeVisible();

    // Redundant 6-card stat grid has been decommissioned from the visit readiness card
    await expect(snapshotCard.locator(".clinical-pulse-cell")).toHaveCount(0);
    // Trajectories and trends are visible
    await expect(page.getByRole("heading", { name: "Symptoms & Measurements" })).toBeVisible();
    // Consolidated care team & logistics card is visible
    const careCoordCard = page.locator(".overview-card-container").filter({ hasText: "Care Team & Logistics" });
    await expect(careCoordCard).toBeVisible();
  });

  test("keeps patient identity clear while patient tools live in the right rail and Layout lives in Edit", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await signInWithDefaultLayout(page, "Prototype provider");

    const mayaTab = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Maya Chen" });
    await expect(mayaTab).toBeVisible();
    await mayaTab.click();

    const header = page.locator(".primary-workspace-pane .patient-header");
    const identity = header.locator(".patient-identity");
    await expect(identity.getByText(/DOB/)).toBeVisible();
    await expect(identity.getByText(/Allergies/i)).toBeVisible();

    await expect(page.locator(".primary-workspace-pane .patient-chart-sidebar")).toHaveCount(0);
    const controls = header.locator(".patient-header-actions");
    await expect(controls.getByRole("button", { name: "Overview", exact: true })).toBeVisible();
    await expect(controls.getByRole("button", { name: "Encounter", exact: true })).toBeVisible();
    await expect(controls.getByRole("button", { name: "Patient info", exact: true })).toBeVisible();
    await expectRightRailPatientTools(page);
    await controls.locator("summary").click();
    await expect(controls.getByRole("button", { name: /worklist/i })).toBeVisible();
    await controls.locator("summary").click();

    // Layout lives under Edit
    const editSummary = page.locator('.primary-workspace-pane .patient-header-container summary[aria-label="Edit problems, allergies, and layout"]');
    await expect(editSummary).toBeVisible();
    await editSummary.click();

    const editMenu = page.locator(".primary-workspace-pane details[open] [role='menu']");
    await expect(editMenu).toBeVisible();
    await expect(editMenu.getByRole("menuitem", { name: "Problems & allergies" })).toBeVisible();
    await expect(editMenu.getByRole("menuitem", { name: "Customize layout" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(editMenu).toBeHidden();
  });

  test("keeps right-rail tools available in a narrow chart and floats Edit menu above chart chrome", async ({ page }) => {
    await page.setViewportSize({ width: 680, height: 820 });
    await signInWithDefaultLayout(page, "Prototype provider");

    const mayaTab = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Maya Chen" });
    await expect(mayaTab).toBeVisible();
    await mayaTab.click();

    await expect(page.locator(".primary-workspace-pane .patient-chart-sidebar")).toHaveCount(0);
    await expectRightRailPatientTools(page);
    await expect(page.locator(".primary-workspace-pane .patient-header-actions").getByRole("button", { name: "Patient info" })).toBeVisible();

    const editSummary = page.locator('.primary-workspace-pane .patient-header-container summary[aria-label="Edit problems, allergies, and layout"]');
    await expect(editSummary).toBeVisible();
    await editSummary.click();

    const layoutItem = page.locator(".primary-workspace-pane details[open]").getByRole("menuitem", { name: "Customize layout" });
    await expect(layoutItem).toBeVisible();

    const layoutBox = await layoutItem.boundingBox();
    expect(layoutBox).not.toBeNull();
    const menuOwnsPoint = await page.evaluate(
      ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest("[role='menu']")),
      {
        x: layoutBox!.x + layoutBox!.width / 2,
        y: layoutBox!.y + layoutBox!.height / 2,
      },
    );
    expect(menuOwnsPoint).toBe(true);
  });

  test("opens layered clinical monitoring preferences and retires the duplicate synthetic surveillance banner", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDefaultLayout(page, "Prototype provider");

    const launcher = page.locator("button[data-workspace-control='open-workspace-launcher']");
    await launcher.click();
    const popover = page.locator("[data-testid='open-workspace-launcher-popover']");
    await expect(popover).toBeVisible();
    const searchInput = popover.getByPlaceholder("Find workspace or patient...");
    if (await searchInput.isVisible()) {
      await searchInput.fill("David Kim");
    }
    await popover.locator(".open-workspace-patient-row").filter({ hasText: "David Kim" }).click();

    const davidTab = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "David Kim" });
    await expect(davidTab).toBeVisible({ timeout: 10_000 });
    await expect(davidTab).toHaveClass(/active/);

    await expect(
      page.locator(".primary-workspace-pane .clinical-alert").filter({ hasText: "Overdue 12-hr Lithium level & eGFR" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Preferences" }).click();
    await page.getByRole("button", { name: "Clinical monitoring" }).click();

    const dialog = page.getByRole("dialog", { name: "Medication monitoring" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("tab", { name: "Practice defaults" })).toBeVisible();
    await expect(dialog.getByRole("tab", { name: "My overrides" })).toBeVisible();
    await expect(dialog.getByRole("tab", { name: /David Kim exception/ })).toBeVisible();
    await expect(dialog.getByText("Lithium Carbonate", { exact: true }).first()).toBeVisible();
    await expect(dialog.getByText("12-hour serum lithium level", { exact: true })).toBeVisible();

    await dialog.getByRole("button", { name: "Close clinical monitoring" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("displays visible primary clinical action buttons and unified card menu with keyboard dismissal", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDefaultLayout(page, "Prototype provider");

    // Open Maya Chen's chart tab
    const mayaTab = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Maya Chen" });
    await expect(mayaTab).toBeVisible();
    await mayaTab.click();

    // Keep domain-specific actions visible without duplicating the patient header's Open encounter action.
    const addressInNoteButtons = page.locator(".card-primary-action-btn").filter({ hasText: "Address in Note" });
    await expect(addressInNoteButtons).toHaveCount(1);

    const manageRxBtn = page.locator(".card-primary-action-btn").filter({ hasText: "Manage Rx" });
    await expect(manageRxBtn).toBeVisible();

    const fullTimelineBtn = page.locator(".card-primary-action-btn").filter({ hasText: "Full Timeline" });
    await expect(fullTimelineBtn).toBeVisible();

    // Verify card menu details element exists
    const firstMenu = page.locator(".overview-card-menu").first();
    await expect(firstMenu).toBeVisible();

    // Open the menu
    const menuSummary = firstMenu.locator("summary");
    await menuSummary.click();
    await expect(firstMenu).toHaveAttribute("open", "");

    // Verify menu items inside
    const dropdown = firstMenu.locator(".overview-card-menu-dropdown");
    await expect(dropdown).toBeVisible();
    await expect(dropdown.locator("button").filter({ hasText: "Pin to top" })).toBeVisible();
    await expect(dropdown.locator("button").filter({ hasText: "Hide card" })).toBeVisible();

    // Test Escape key dismissal
    await page.keyboard.press("Escape");
    await expect(firstMenu).not.toHaveAttribute("open", "");
  });

  test("hiding a card reveals the restore bar, and clicking restore brings the card back", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDefaultLayout(page, "Prototype provider");

    // Open Maya Chen's chart tab
    const mayaTab = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Maya Chen" });
    await expect(mayaTab).toBeVisible();
    await mayaTab.click();

    // Find snapshot card menu and open it
    const snapshotCard = page.locator(".overview-card-container").filter({ hasText: "Last Visit & Follow-up" });
    await expect(snapshotCard).toBeVisible();

    const snapshotMenu = snapshotCard.locator(".overview-card-menu summary");
    await snapshotMenu.click();

    // Click "Hide card"
    const hideBtn = snapshotCard.locator(".overview-card-menu-item.danger");
    await hideBtn.click();

    // Snapshot card should be hidden
    await expect(page.locator(".overview-card-container").filter({ hasText: "Last Visit & Follow-up" })).toHaveCount(0);

    // Restore bar should now be visible with "Show Visit Continuity"
    const restoreBar = page.locator(".overview-restore-bar");
    await expect(restoreBar).toBeVisible();

    const restoreSnapshotBtn = page.locator(".overview-restore-pill").filter({ hasText: "Show Visit Continuity" });
    await expect(restoreSnapshotBtn).toBeVisible();

    // Click restore
    await restoreSnapshotBtn.click();

    // Snapshot card is back
    await expect(page.locator(".overview-card-container").filter({ hasText: "Last Visit & Follow-up" })).toBeVisible();
  });
});
