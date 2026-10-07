import { expect, test, type Page } from "@playwright/test";
import {
  openWorkspaceFromLauncher,
  selectPrimaryPatientSection,
  signInWithDefaultLayout,
} from "./workspace-fixtures";

function communicationButton(page: Page) {
  return page.locator(".companion-rail-btn[aria-label='Communication']");
}

async function openLayoutCustomizer(page: Page) {
  await page.locator(".topbar").getByRole("button", { name: "Preferences", exact: true }).click();
  const menu = page.getByRole("region", { name: "Workspace options" });
  await menu.getByRole("button", { name: /Customize layout/i }).click();
  const customizer = page.getByRole("dialog", { name: "Workspace Layout Preferences" });
  await expect(customizer).toBeVisible();
  return customizer;
}

test.describe("active canvas context alignment", () => {
  test("a practice workspace replaces the remembered chart as companion context", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    await page.locator('.browser-tab[data-workspace-tab="patient"]')
      .filter({ hasText: "Maya Chen" })
      .click();
    await communicationButton(page).click();

    const panel = page.locator('[data-companion-panel="communication"]');
    await expect(panel).toHaveAttribute("data-context-tab", "patient:maya-chen");
    // D-117: a patient thread names its patient explicitly in the pinned header.
    const mayaIdentity = "Maya Chen · P-10482 · DOB 04/18/1992";
    await expect(panel.locator(".companion-panel-header small")).toHaveText(mayaIdentity);

    await openWorkspaceFromLauncher(page, "intake");
    await expect(page.locator(".global-module-shell")).toHaveAttribute(
      "data-active-module",
      "intake",
    );
    await expect(panel).toHaveAttribute("data-context-tab", "module:intake");
    // The canvas context moved to Intake, but the companion's patient thread keeps
    // its explicit patient identity (D-117) rather than silently re-targeting or
    // dropping who it is about; the header says exactly whose thread this is.
    await expect(panel.locator(".companion-panel-header small")).toHaveText(mayaIdentity);

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
      { width: 720, height: 450 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(panel.locator(".companion-panel-header small")).toBeVisible();
      await expect(communicationButton(page)).toBeVisible();
    }
  });

  test("the layout customizer opens on the active patient and practice canvas scopes", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    await page.locator('.browser-tab[data-workspace-tab="patient"]')
      .filter({ hasText: "Maya Chen" })
      .click();
    // The primary section tabs were retired (Documents is now a companion), so the
    // chart canvas is entered through its visible Overview control.
    await selectPrimaryPatientSection(page, "Overview");

    let customizer = await openLayoutCustomizer(page);
    await expect(customizer.locator("[data-customizer-context]"))
      .toHaveText("Current canvas: Maya Chen · Overview");
    await expect(customizer.locator('[data-customizer-tab="overview"]')).toHaveClass(/active/);
    await expect(customizer.locator('[data-customizer-tab="today"]')).not.toHaveClass(/active/);
    await customizer.getByRole("button", { name: "Close", exact: true }).click();

    await openWorkspaceFromLauncher(page, "intake");
    customizer = await openLayoutCustomizer(page);
    await expect(customizer.locator("[data-customizer-context]"))
      .toHaveText("Current canvas: Intake workspace");
    await expect(customizer.locator('[data-customizer-tab="density"]')).toHaveClass(/active/);
    await expect(customizer.locator('[data-customizer-tab="today"]')).not.toHaveClass(/active/);

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
      { width: 720, height: 450 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(customizer.locator("[data-customizer-context]")).toBeVisible();
      await expect(customizer.getByRole("button", { name: "Close", exact: true })).toBeVisible();
    }
  });
});
