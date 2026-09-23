import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

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

    const snapshotCard = page.locator(".overview-card-container").filter({ hasText: "What Matters for This Visit" });
    const diagnosesCard = page.locator(".overview-card-container").filter({ hasText: "Active Diagnoses" });
    const medsCard = page.locator(".overview-card-container").filter({ hasText: "Active Medications" });
    const timelineCard = page.locator(".overview-card-container").filter({ hasText: "Recent Clinical Changes" });

    await expect(snapshotCard).toBeVisible();
    await expect(diagnosesCard).toBeVisible();
    await expect(medsCard).toBeVisible();
    await expect(timelineCard).toBeVisible();

    // The first viewport is a compact clinical command center.
    await expect(snapshotCard.locator(".clinical-pulse-cell")).toHaveCount(6);
    await expect(snapshotCard.getByText("Active meds", { exact: true })).toBeVisible();
    await expect(snapshotCard.getByText("Latest lab", { exact: true })).toBeVisible();
    await expect(snapshotCard.getByText("Rating scale", { exact: true })).toBeVisible();
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
    const snapshotCard = page.locator(".overview-card-container").filter({ hasText: "What Matters for This Visit" });
    await expect(snapshotCard).toBeVisible();

    const snapshotMenu = snapshotCard.locator(".overview-card-menu summary");
    await snapshotMenu.click();

    // Click "Hide card"
    const hideBtn = snapshotCard.locator(".overview-card-menu-item.danger");
    await hideBtn.click();

    // Snapshot card should be hidden
    await expect(page.locator(".overview-card-container").filter({ hasText: "What Matters for This Visit" })).toHaveCount(0);

    // Restore bar should now be visible with "Show Snapshot"
    const restoreBar = page.locator(".overview-restore-bar");
    await expect(restoreBar).toBeVisible();

    const restoreSnapshotBtn = page.locator(".overview-restore-pill").filter({ hasText: "Show Snapshot" });
    await expect(restoreSnapshotBtn).toBeVisible();

    // Click restore
    await restoreSnapshotBtn.click();

    // Snapshot card is back
    await expect(page.locator(".overview-card-container").filter({ hasText: "What Matters for This Visit" })).toBeVisible();
  });
});
