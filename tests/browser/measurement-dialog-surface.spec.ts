import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

async function openHistory(page: Page) {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();
  await page.locator('.companion-rail-btn[data-tool-id="history"]').click();
  const panel = page.locator('[data-patient-record-tool="history"]');
  await expect(panel.getByRole("textbox", { name: "Search clinical history", exact: true })).toBeVisible();
  return panel;
}

// The chart must never show through a measurement dialog: every layer that can
// sit over chart content paints a fully opaque background.
async function expectOpaque(locator: Locator, label: string) {
  const alpha = await locator.evaluate((element) => {
    const match = getComputedStyle(element).backgroundColor.match(/rgba?\(([^)]+)\)/);
    const parts = match ? match[1].split(",").map((part) => part.trim()) : [];
    return parts.length === 4 ? Number(parts[3]) : parts.length === 3 ? 1 : 0;
  });
  expect(alpha, `${label} is opaque`).toBe(1);
}

async function expectStableEdges(page: Page, closeName: string) {
  const card = page.locator(".modal-card");
  const header = card.locator(":scope > .modal-header");
  const footer = card.locator(":scope > .modal-card-footer");
  await expectOpaque(card, "dialog card");
  await expectOpaque(header, "dialog header");
  await expectOpaque(footer, "dialog footer");
  const scrollable = await card.evaluate((element) => element.scrollHeight > element.clientHeight + 1);
  expect(scrollable, "short viewport makes the dialog body scroll").toBe(true);
  await card.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  const [cardBox, headerBox] = [await card.boundingBox(), await header.boundingBox()];
  expect(Math.abs((headerBox?.y ?? 0) - (cardBox?.y ?? -100)), "header stays pinned to the card top").toBeLessThan(3);
  // Opened from a companion pane, nothing in the workspace chrome may paint over the title.
  const titleOnTop = await header.locator("h2").evaluate((title) => {
    const rect = title.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + 8, rect.top + rect.height / 2);
    return Boolean(hit && title.contains(hit));
  });
  expect(titleOnTop, "dialog title is topmost at its own position").toBe(true);
  await expect(header.locator(".clinical-modal-patient")).toContainText("Maya Chen");
  await expect(header.locator(".clinical-modal-patient")).toBeInViewport();
  await expect(page.getByRole("button", { name: closeName, exact: true })).toBeInViewport();
  await expect(footer.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
}

test("Measurement dialogs paint an opaque surface and keep identity and close controls visible while scrolling", async ({ page }) => {
  const panel = await openHistory(page);
  await page.setViewportSize({ width: 1024, height: 640 });

  await panel.getByRole("button", { name: "Record Vitals", exact: true }).click();
  await expect(page.getByRole("dialog").locator("table")).toBeVisible();
  await expectStableEdges(page, "Close vitals modal");
  await page.screenshot({ path: "output/playwright/measurement-dialog-vitals-1024.png" });
  await page.getByRole("dialog").locator(".modal-card-footer").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await panel.getByRole("button", { name: "Administer Scale", exact: true }).click();
  await expectStableEdges(page, "Close assessments modal");
  await page.screenshot({ path: "output/playwright/measurement-dialog-scales-1024.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
