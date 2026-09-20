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


test("companion selection and open state survive rail collapse and reload", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");

  const calculatorButton = page.getByRole("button", { name: "Calculators", exact: true });
  const panel = page.locator(".companion-panel").filter({ hasText: "Clinical Rating Scales" });

  const openSaved = page.waitForResponse(
    (response) =>
      response.url().includes("/api/preferences") &&
      response.request().method() === "PUT" &&
      response.ok(),
  );
  await calculatorButton.click();
  await openSaved;
  await expect(panel).toBeVisible();
  await expect(calculatorButton).toHaveAttribute("aria-pressed", "true");

  const hideSaved = page.waitForResponse(
    (response) =>
      response.url().includes("/api/preferences") &&
      response.request().method() === "PUT" &&
      response.ok(),
  );
  await page.getByRole("button", { name: "Hide companion tools" }).click();
  await hideSaved;
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show companion tools" })).toBeVisible();

  const showSaved = page.waitForResponse(
    (response) =>
      response.url().includes("/api/preferences") &&
      response.request().method() === "PUT" &&
      response.ok(),
  );
  await page.getByRole("button", { name: "Show companion tools" }).click();
  await showSaved;
  await expect(panel).toBeVisible();
  await expect(calculatorButton).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Calculators", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const closeSaved = page.waitForResponse(
    (response) =>
      response.url().includes("/api/preferences") &&
      response.request().method() === "PUT" &&
      response.ok(),
  );
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await closeSaved;
  await expect(panel).toHaveCount(0);

  await page.reload();
  await expect(page.locator(".companion-panel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Calculators", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
