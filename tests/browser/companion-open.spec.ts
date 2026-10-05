import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

const moreButton = (page: Page) => page.getByRole("button", { name: "More companion tools", exact: true });
async function openFromMore(page: Page, name: string) {
  await moreButton(page).click();
  await page.locator(".companion-add-menu").getByRole("button", { name: `Open ${name}`, exact: true }).click();
}
const chart = (page: Page, name: string) => page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: name }).click();
async function rails(page: Page) {
  const response = await page.request.get("/api/preferences");
  expect(response.ok()).toBe(true);
  return (await response.json()).preferences.rails;
}

test("Orders opens without pinning, stays patient-bound, and restores as current work", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");
  await chart(page, "Maya Chen");
  const before = (await rails(page)).right;
  await openFromMore(page, "Orders");
  const panel = page.locator('[data-patient-record-tool="orders"]');
  await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
  await panel.evaluate((element) => element.setAttribute("data-mount-probe", "retained"));
  await expect(page.locator('.companion-rail-btn[data-tool-id="orders"]')).toHaveCount(0);
  await expect(moreButton(page)).toContainText("Orders");
  await panel.getByRole("button", { name: "Pin another patient" }).click();
  await panel.getByRole("combobox").selectOption("maya-chen");
  await chart(page, "Jordan Reed");
  await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
  await openFromMore(page, "Orders");
  await expect(panel).toHaveAttribute("data-mount-probe", "retained");
  await expect(panel).toHaveAttribute("data-patient-binding", "pinned");
  await panel.getByRole("button", { name: "Expand to main canvas" }).click();
  await page.keyboard.press("Escape");
  await expect(panel).not.toHaveClass(/companion-expanded-canvas/);
  await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
  for (const [width, height, zoom] of [[1440, 900, 1], [1280, 800, 1], [1024, 800, 1], [1440, 900, 2]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((scale) => { document.documentElement.style.zoom = String(scale); }, zoom);
    await moreButton(page).scrollIntoViewIfNeeded();
    await expect(moreButton(page)).toBeInViewport({ ratio: 1 });
    await expect(panel.getByRole("status", { name: "Companion patient binding" })).toBeInViewport();
    await moreButton(page).click();
    const menu = page.locator(".companion-add-menu");
    await menu.getByRole("button", { name: "Open Orders", exact: true }).scrollIntoViewIfNeeded();
    await expect(menu.getByRole("button", { name: "Open Orders", exact: true })).toBeInViewport();
    await expect(menu.getByRole("button", { name: "Pin Orders to Right Rail" })).toBeInViewport();
    await page.screenshot({ path: `output/playwright/companion-open-${width}-${zoom}x.png` });
    await moreButton(page).click();
  }
  await page.evaluate(() => { document.documentElement.style.zoom = "1"; });
  await expect.poll(async () => (await rails(page)).activeRightPanel).toBe("orders");
  expect((await rails(page)).right).toEqual(before);
  await page.reload();
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-workspace-restored", "true");
  await expect(panel).toBeVisible();
  await expect(moreButton(page)).toContainText("Orders");
  expect((await rails(page)).right).toEqual(before);
  await panel.getByRole("button", { name: "Close orders", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(moreButton(page)).toBeFocused();
  await expect.poll(async () => (await rails(page)).rightPanelOpen).toBe(false);
  await moreButton(page).press("Enter");
  await page.locator(".companion-add-menu").getByRole("button", { name: "Open Orders", exact: true }).press("Enter");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(moreButton(page)).toBeFocused();
});

test("pinning and unpinning current Scratchpad work preserves its patient-owned draft", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await chart(page, "Maya Chen");
  await openFromMore(page, "Scratchpad");
  const panel = page.locator('[data-companion-panel="scratchpad"]');
  const draft = panel.getByRole("textbox");
  await draft.fill("Synthetic unpinned Maya draft");
  await expect(panel.getByRole("button", { name: "Unpin Scratchpad", exact: true })).toHaveCount(0);
  await moreButton(page).click();
  await page.locator(".companion-add-menu").getByRole("button", { name: "Pin Scratchpad to Right Rail" }).click();
  await moreButton(page).click();
  await expect(page.locator('.companion-rail-btn[data-tool-id="scratchpad"]')).toBeVisible();
  await panel.getByRole("button", { name: "Unpin Scratchpad", exact: true }).click();
  await expect(page.locator('.companion-rail-btn[data-tool-id="scratchpad"]')).toHaveCount(0);
  await expect(draft).toHaveValue("Synthetic unpinned Maya draft");
  await expect(panel.getByRole("button", { name: "Unpin Scratchpad", exact: true })).toHaveCount(0);
  await chart(page, "Jordan Reed");
  await expect(draft).toHaveValue("");
  await chart(page, "Maya Chen");
  await expect(draft).toHaveValue("Synthetic unpinned Maya draft");
  await panel.getByRole("button", { name: "Expand to main canvas" }).click();
  await panel.getByRole("button", { name: "Redock to companion rail" }).click();
  await expect(draft).toHaveValue("Synthetic unpinned Maya draft");
  await page.getByRole("button", { name: "Hide companion tools" }).click();
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Show companion tools" }).click();
  await expect(draft).toHaveValue("Synthetic unpinned Maya draft");
  await expect(moreButton(page)).toContainText("Scratchpad");
  expect((await rails(page)).right).not.toContain("scratchpad");
});

test("event opening accepts implemented unpinned tools and rejects invalid destinations", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await chart(page, "Maya Chen");
  await openFromMore(page, "Orders");
  for (const tool of ["unknown", "financial_integration", "billing", "reports"]) {
    await page.evaluate((id) => window.dispatchEvent(new CustomEvent("ehr-open-companion", { detail: { tool: id } })), tool);
    await expect(page.locator('[data-patient-record-tool="orders"]')).toBeVisible();
    await expect(moreButton(page)).toContainText("Orders");
  }
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("ehr-open-companion", { detail: { tool: "calc" } })));
  await expect(page.locator('[data-companion-panel="calc"]')).toBeVisible();
  await expect(moreButton(page)).toContainText("Calculators");
  expect((await rails(page)).right).not.toContain("calc");
});
