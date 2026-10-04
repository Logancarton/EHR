import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test("Medications owns patient prescribing and the practice queue through expand/redock", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();
  await expect(page.locator('.companion-rail-btn[data-tool-id="prescribing"]')).toHaveCount(0);
  await page.locator('.companion-rail-btn[data-tool-id="medications"]').click();
  const panel = page.locator('[data-patient-record-tool="medications"]');
  await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
  await expect(panel.getByRole("button", { name: "New prescription", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Prescribing queue", exact: true }).click();
  await expect(panel.locator(".prescription-ops-summary > div")).toHaveCount(3);
  await expect(panel.locator(".prescription-integration-alert")).toContainText("No enabled prescribing integration");
  await panel.getByRole("button", { name: "Expand to main canvas" }).click();
  await expect(panel.locator('[data-prescribing-presentation="workspace"]')).toBeVisible();
  await panel.getByRole("button", { name: "Redock to companion rail" }).click();
  await expect(panel.getByRole("button", { name: "Prescribing queue", exact: true })).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "Patient medications", exact: true }).click();
  await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
  await expect(panel.getByRole("button", { name: "New prescription", exact: true })).toBeVisible();
  for (const [width, height, zoom] of [[1440, 900, 1], [1280, 800, 1], [1024, 768, 1], [1440, 900, 2]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((value) => { document.documentElement.style.zoom = String(value); }, zoom);
    await expect(panel.getByRole("button", { name: "Prescribing queue", exact: true })).toBeVisible();
    await page.screenshot({ animations: "disabled", path: `output/playwright/medications-unified-${width}-${zoom}x.png` });
  }
});
