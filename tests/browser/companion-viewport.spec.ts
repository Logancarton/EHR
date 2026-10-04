import { expect, test } from "@playwright/test";
import { openWorkspaceFromLauncher, signInWithDefaultLayout } from "./workspace-fixtures";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 720, height: 450 }, // 1440 × 900 at 200% browser zoom.
]) {
  test(`Calendar companion keeps the full Calendar usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signInWithDefaultLayout(page, "Prototype provider");
    await openWorkspaceFromLauncher(page, "calendar");

    const calendar = page.locator('.gcal-root[data-calendar-presentation="workspace"]');
    await expect(calendar).toBeVisible();
    await calendar.getByRole("tab", { name: "Week", exact: true }).click();
    const before = await calendar.boundingBox();
    expect(before).not.toBeNull();

    // Viewport geometry is a global companion concern, so exercise it with the
    // global Calendar companion. Clinical AI is patient-scoped and is covered by
    // workspace-ergonomics.spec.ts; opening it from a practice canvas must park it
    // rather than silently converting it into a practice-level assistant.
    await page.locator(".companion-rail-btn[aria-label='Calendar']").first().click();
    const panel = page.locator("aside.companion-calendar-panel");
    await expect(panel).toBeVisible();
    await panel.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );

    // Opening a companion must not consume a row of the primary workspace.
    await expect.poll(async () => (await calendar.boundingBox())?.height).toBeCloseTo(before!.height, 0);

    const panelBox = (await panel.boundingBox())!;
    const railBox = (await page.locator(".companion-rail").boundingBox())!;
    if (viewport.width < 1032) expect(panelBox.x).toBe(0);
    else expect(panelBox.x).toBeGreaterThan(0);
    expect(panelBox.y).toBeCloseTo(railBox.y, 0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(railBox.x + 1);
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(viewport.height + 1);

    const compactCalendar = panel.locator('.gcal-root[data-calendar-presentation="companion"]');
    await expect(compactCalendar).toBeVisible();
    await expect(compactCalendar.getByRole("button", { name: "New Event", exact: true })).toBeVisible();
    await expect(compactCalendar.getByRole("button", { name: "Expand to full view", exact: true })).toBeVisible();

    if (viewport.width < 1032) {
      await expect(panel.getByRole("button", { name: "Return to workspace" })).toBeInViewport();
      await expect(page.locator(".workspace-body")).toHaveAttribute("inert", "");
      await panel.getByRole("button", { name: "Return to workspace" }).click();
      await expect(panel).toHaveCount(0);
    }

    const fullGrid = calendar.locator(".gcal-scroll-grid");
    await fullGrid.evaluate((element) => {
      element.scrollTop = 0;
    });
    const gridBox = (await fullGrid.boundingBox())!;
    await page.mouse.move(gridBox.x + 20, gridBox.y + 25);
    await page.mouse.wheel(0, 480);
    await expect.poll(() => fullGrid.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const close = panel.getByRole("button", { name: "Close", exact: true });
    if (viewport.width >= 1032) await close.click();
    await expect(panel).toHaveCount(0);
    await expect(calendar.getByRole("button", { name: /New Event/i })).toBeInViewport({ ratio: 1 });
    await expect.poll(async () => (await calendar.boundingBox())?.height).toBeCloseTo(before!.height, 0);
  });
}


test("single-surface companion returns to the same practice module without covered controls", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await signInWithDefaultLayout(page, "Prototype provider");
  await openWorkspaceFromLauncher(page, "intake");
  const intake = page.locator('.global-module-shell[data-active-module="intake"]');
  await expect(intake).toBeVisible();
  await intake.evaluate((element) => element.setAttribute("data-mount-probe", "retained"));
  await page.locator('.companion-rail-btn[data-tool-id="labs"]').click();
  const panel = page.locator('[data-companion-panel="labs"]');
  await expect(panel).toBeVisible();
  await expect(intake).toBeHidden();
  await panel.getByRole("button", { name: "Return to workspace" }).click();
  await expect(intake).toBeVisible();
  await expect(intake).toHaveAttribute("data-mount-probe", "retained");
  await expect(page.locator('.companion-rail-btn[data-tool-id="labs"]')).toBeFocused();
});
