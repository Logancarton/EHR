import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test("companion personalization remains scoped to supported tools", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.locator(".companion-rail-btn.add-btn").click();
  const menu = page.locator("[data-pin-menu-origin='right']");
  await expect(menu).toBeVisible();
  await expect(menu.locator(".col-side-label")).toHaveText("Right Rail");
  await expect(menu.getByRole("button", { name: /Left Sidebar/ })).toHaveCount(0);
  for (const name of ["Dashboard", "Schedule", "Billing"]) {
    await expect(menu.locator(".tool-pin-row").filter({ hasText: name })).toHaveCount(0);
  }
  const toggle = menu.getByRole("button", { name: "Unpin Calculators from Right Rail" });
  await toggle.click();
  await expect(page.locator(".companion-rail-btn[title*='Calculators']")).toHaveCount(0);
  await menu.getByRole("button", { name: "Pin Calculators to Right Rail" }).click();
  await expect(page.locator(".companion-rail-btn[title*='Calculators']")).toBeVisible();
});
