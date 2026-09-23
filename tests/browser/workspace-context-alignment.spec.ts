import { expect, test, type Page } from "@playwright/test";
import {
  openWorkspaceFromLauncher,
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
    await expect(panel.locator(".companion-panel-header small")).toHaveText(
      "Context: Maya Chen · Overview",
    );

    await openWorkspaceFromLauncher(page, "intake");
    await expect(page.locator(".global-module-shell")).toHaveAttribute(
      "data-active-module",
      "intake",
    );
    await expect(panel).toHaveAttribute("data-context-tab", "module:intake");
    await expect(panel.locator(".companion-panel-header small")).toHaveText(
      "Context: Intake workspace",
    );
    await expect(panel.locator(".companion-panel-header")).not.toContainText("Maya Chen");

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
    await page.locator(".primary-workspace-pane .section-tabs")
      .getByRole("tab", { name: "Documents", exact: true })
      .click();

    let customizer = await openLayoutCustomizer(page);
    await expect(customizer.locator("[data-customizer-context]"))
      .toHaveText("Current canvas: Maya Chen · Documents");
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
