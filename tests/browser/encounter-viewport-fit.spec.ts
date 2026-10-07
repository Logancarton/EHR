import { expect, test, type Page } from "@playwright/test";
import { selectPrimaryPatientSection, signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * The encounter must fit the screen it is on, at every size in the matrix.
 *
 * The encounter area had a fixed viewport height with a 520px floor inside a pane
 * that clips and never scrolls. On a 720px-tall laptop that ran the readiness bar
 * and the end of the note below the screen; at 200% zoom (720x450) the note got a
 * 34px sliver nothing could scroll. Driven through the chart's own Encounter
 * control with a synthetic patient.
 */

async function openEncounter(page: Page, patientName: string) {
  const omnibox = page.getByRole("textbox", { name: "Ask AI or search the EHR" });
  await omnibox.fill(patientName);
  const result = page
    .locator('.search-results button[data-omnibox-result="patient"]')
    .filter({ hasText: patientName })
    .first();
  await expect(result).toBeVisible({ timeout: 15_000 });
  await result.click();
  await expect(
    page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: patientName }),
  ).toHaveClass(/active/, { timeout: 10_000 });
  await selectPrimaryPatientSection(page, "Encounter");
  return page.locator(".primary-workspace-pane .encounter-workspace-root");
}

test.describe("Encounter fits the viewport", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDefaultLayout(page, "Prototype provider");
  });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    test(`at ${viewport.width}x${viewport.height} the readiness bar and note end on screen`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const workspace = await openEncounter(page, "Marcus Vance");
      const layout = workspace.locator(".encounter-document-layout");
      await expect(layout).toBeVisible();
      const box = (await layout.boundingBox())!;
      expect(box.y + box.height, "the note's scroll region ends inside the screen").toBeLessThanOrEqual(viewport.height + 1);

      const readiness = workspace.locator(".encounter-readiness");
      await expect(readiness).toBeVisible();
      const readinessBox = (await readiness.boundingBox())!;
      expect(readinessBox.y + readinessBox.height, "readiness is not clipped below the screen").toBeLessThanOrEqual(
        viewport.height + 1,
      );
    });
  }

  test("at 200% zoom the pane scrolls the header away and the note gets the height", async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 450 });
    const workspace = await openEncounter(page, "Marcus Vance");
    const body = page.locator(".workspace-body");

    // Scroll the patient pane through the clinician's wheel, over the chart header
    // that fills the screen at this size. (Over the note itself, the note's own
    // scroll region scrolls first, as any nested scroller does.)
    const toolbar = workspace.locator(".encounter-top-toolbar");
    const maxScroll = await body.evaluate((node) => node.scrollHeight - node.clientHeight);
    expect(maxScroll, "the pane has a header to scroll away").toBeGreaterThan(100);
    await page.mouse.move(300, 160);
    for (let i = 0; i < 4; i += 1) {
      await page.mouse.wheel(0, 120);
    }
    await expect
      .poll(async () => body.evaluate((node) => node.scrollTop), { message: "the pane scrolled to the note" })
      .toBeGreaterThanOrEqual(maxScroll - 1);

    // The scroll stops with the note filling the pane: identity and Review & Sign on
    // top, and a working note area beneath them rather than a sliver.
    await expect(toolbar.getByRole("button", { name: "Review & Sign", exact: true })).toBeInViewport();
    await expect(workspace.locator(".encounter-mode-status")).toContainText("Marcus Vance");
    await expect(workspace.locator(".encounter-mode-status")).toBeInViewport();
    const layout = (await workspace.locator(".encounter-document-layout").boundingBox())!;
    expect(layout.height, "the note gets real reading height").toBeGreaterThan(180);
    expect(layout.y + layout.height).toBeLessThanOrEqual(451);
    expect(layout.width, "the note keeps its width").toBeGreaterThan(500);
  });
});
