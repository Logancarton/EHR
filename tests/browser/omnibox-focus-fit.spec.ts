import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 800 },
  { width: 720, height: 450 },
]) {
  test(`omnibox focus preserves writing space and shell controls at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signInWithDefaultLayout(page, "Prototype provider");

    for (const surface of ["dashboard", "patient", "home"] as const) {
      if (surface === "patient") {
        await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();
        await expect(page.locator(".primary-workspace-pane .patient-header h1")).toHaveText("Maya Chen");
      } else if (surface === "home") {
        await page.getByRole("button", { name: "Home Launchpad", exact: true }).click();
        await expect(page.locator(".zen-home-viewport")).toBeVisible();
      }
      const search = page.getByRole("textbox", { name: "Ask AI or search the EHR", exact: true });
      const wrapper = page.locator(".topbar .patient-search-wrap");
      await search.blur();
      await page.screenshot({ path: `output/playwright/omnibox-focus/${surface}-${viewport.width}-idle.png`, animations: "disabled" });
      const idle = (await wrapper.boundingBox())!;
      await search.focus();
      await expect(search).toBeFocused();
      await page.screenshot({ path: `output/playwright/omnibox-focus/${surface}-${viewport.width}-focused.png`, animations: "disabled" });
      const focused = (await wrapper.boundingBox())!;
      expect(focused.width, `${surface}: focusing must not reduce writing space`).toBeGreaterThanOrEqual(idle.width - 1);
      if (viewport.width === 1440) {
        expect(focused.width, `${surface}: the roomy shell expands its omnibox`).toBeGreaterThan(idle.width);
      }
      const preferences = page.getByRole("button", { name: "Preferences", exact: true });
      const controls = (await preferences.boundingBox())!;
      expect(focused.x).toBeGreaterThanOrEqual(0);
      expect(focused.x + focused.width, `${surface}: focus stays clear of preferences`).toBeLessThanOrEqual(controls.x);
      expect(controls.x + controls.width).toBeLessThanOrEqual(viewport.width);
      await preferences.click();
      await expect(page.getByRole("region", { name: "Workspace options" })).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });
}
