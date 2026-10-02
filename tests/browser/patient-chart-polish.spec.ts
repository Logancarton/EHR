import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test("patient identity and complete problems remain readable across chart sizes", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Maya Chen" }).click();
  const header = page.locator(".patient-header-container");
  await expect(header.getByRole("heading", { name: "Maya Chen" })).toBeVisible();
  await expect(header.getByLabel("Active problems")).toContainText("ADHD, combined presentation");
  for (const [width, height, zoom] of [[1440, 900, 1], [1280, 800, 1], [1024, 800, 1], [1440, 900, 2]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((scale) => { document.documentElement.style.zoom = String(scale); }, zoom);
    await expect(header.getByRole("heading", { name: "Maya Chen" })).toBeVisible();
    await expect(header).toContainText("P-10482");
    await expect(header).toContainText("Penicillin (Rash)");
    const clipped = await header.getByLabel("Active problems").evaluate((bar) => Array.from(bar.querySelectorAll("[title]")).filter((fact) => fact instanceof HTMLElement && fact.tagName === "SPAN" && (fact.scrollWidth > fact.clientWidth + 1 || fact.scrollHeight > fact.clientHeight + 1)).map((fact) => fact.textContent));
    expect(clipped, "clinical problem names must wrap instead of being clipped").toEqual([]);
    await page.screenshot({ path: `output/playwright/chart-polish-${width}-${zoom}x.png` });
  }
  await page.evaluate(() => { document.documentElement.style.zoom = "1"; });
  await page.getByRole("button", { name: /Review Scales/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
