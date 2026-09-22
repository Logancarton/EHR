import { expect, test } from "@playwright/test";
import { openWorkspaceFromLauncher, signInWithDefaultLayout } from "./workspace-fixtures";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 720, height: 450 }, // 1440 × 900 at 200% browser zoom.
]) {
  test(`AI companion keeps Calendar usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signInWithDefaultLayout(page, "Prototype provider");
    await openWorkspaceFromLauncher(page, "calendar");
    const calendar = page.locator(".gcal-root");
    await expect(calendar).toBeVisible();
    await calendar.getByRole("tab", { name: "Week", exact: true }).click();
    const before = await calendar.boundingBox();
    expect(before).not.toBeNull();

    await page.locator(".companion-rail-btn[title*='Clinical AI']").click();
    const panel = page.getByRole("complementary", { name: "Clinical AI Companion", exact: true });
    await expect(panel).toBeVisible();
    await panel.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
    // Opening a companion must not consume a row of the primary workspace.
    await expect.poll(async () => (await calendar.boundingBox())?.height).toBeCloseTo(before!.height, 0);
    const panelBox = (await panel.boundingBox())!;
    const railBox = (await page.locator(".companion-rail").boundingBox())!;
    expect(panelBox.x).toBeGreaterThan(0);
    expect(panelBox.y).toBeCloseTo(railBox.y, 0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(railBox.x + 1);
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(viewport.height + 1);

    const close = panel.getByRole("button", { name: "Close", exact: true });
    const input = panel.locator("#ai-composer-input");
    await expect(close).toBeInViewport({ ratio: 1 });
    await expect(input).toBeInViewport({ ratio: 1 });
    await expect(panel.locator("#ai-send-btn")).toBeInViewport({ ratio: 1 });
    await input.fill("Draft remains available while scrolling");

    const grid = calendar.locator(".gcal-scroll-grid");
    await grid.evaluate((element) => { element.scrollTop = 0; });
    const gridBox = (await grid.boundingBox())!;
    await page.mouse.move(gridBox.x + 20, gridBox.y + 25);
    await page.mouse.wheel(0, 480);
    await expect.poll(() => grid.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    if (viewport.height === 450) {
      const body = panel.locator(".companion-panel-body");
      const bodyBox = (await body.boundingBox())!;
      await page.mouse.move(bodyBox.x + bodyBox.width / 2, bodyBox.y + bodyBox.height / 2);
      await page.mouse.wheel(0, 480);
      await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await expect(close).toBeInViewport({ ratio: 1 });
      await expect(input).toBeInViewport({ ratio: 1 });
    }
    await expect(input).toHaveValue("Draft remains available while scrolling");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/playwright/companion-${viewport.width}x${viewport.height}.png` });

    await close.click();
    await expect(panel).toHaveCount(0);
    await expect(calendar.getByRole("button", { name: /New Event/i })).toBeInViewport({ ratio: 1 });
    await expect.poll(async () => (await calendar.boundingBox())?.height).toBeCloseTo(before!.height, 0);
  });
}
