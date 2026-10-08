import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

async function openHistory(page: Page) {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();
  await page.locator('.companion-rail-btn[data-tool-id="history"]').click();
  const panel = page.locator('[data-patient-record-tool="history"]');
  await expect(panel.getByRole("textbox", { name: "Search clinical history", exact: true })).toBeVisible();
  return panel;
}

async function expectControlsFit(page: Page) {
  const overflow = await page.locator('[data-patient-record-tool="history"]').evaluate((panel) => {
    const bounds = panel.getBoundingClientRect();
    return [...panel.querySelectorAll<HTMLElement>(".history-top-header input, .history-top-header button, .history-view-tabs button, .history-stream-tabs button, .interval-card-header button, .history-mode-header button")]
      .filter((element) => element.getClientRects().length > 0)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
      }).map((element) => element.textContent || element.getAttribute("aria-label"));
  });
  expect(overflow, "every labeled History control fits its patient pane").toEqual([]);
}

test("History controls fit minimum dock, viewport changes and enlargement without losing filters", async ({ page }) => {
  const panel = await openHistory(page);
  const search = panel.getByRole("textbox", { name: "Search clinical history", exact: true });
  await search.fill("Sertraline");
  const filters = panel.getByRole("group", { name: "Filter the longitudinal record" });
  const medications = filters.getByRole("button", { name: /Medications/ });
  await medications.click();
  await expect(panel.locator(".timeline-feed .timeline-card")).toHaveCount(1);
  await expect(panel.locator(".timeline-feed")).toContainText("Sertraline");
  await panel.evaluate((element) => element.setAttribute("data-mount-probe", "retained"));
  for (const [width, height, zoom] of [[1440, 900, 1], [1280, 800, 1], [1024, 800, 1], [1440, 900, 2]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((value) => { document.documentElement.style.zoom = String(value); }, zoom);
    await search.scrollIntoViewIfNeeded();
    await expect(search).toBeInViewport();
    await expectControlsFit(page);
    await expect(search).toHaveValue("Sertraline");
    await expect(medications).toHaveAttribute("aria-pressed", "true");
    await expect(panel).toHaveAttribute("data-mount-probe", "retained");
    await page.screenshot({ path: `output/playwright/history-fit-${width}-${zoom}x.png` });
  }
  await page.evaluate(() => { document.documentElement.style.zoom = "1"; });
  await page.setViewportSize({ width: 1440, height: 900 });
  await panel.getByRole("button", { name: "Expand to main canvas" }).click();
  await expect(search).toHaveValue("Sertraline");
  await expectControlsFit(page);
  await panel.getByRole("button", { name: "Redock to companion rail" }).click();
  await expect(medications).toHaveAttribute("aria-pressed", "true");
  // The width preference is already an existing owner; reload only establishes a minimum-width precondition.
  await page.evaluate(() => window.localStorage.setItem("ehr-companion-panel-width-v1", "260"));
  await page.reload();
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-workspace-restored", "true");
  await expect(search).toBeVisible();
  await expectControlsFit(page);
  await page.screenshot({ path: "output/playwright/history-fit-260-dock.png" });
  await panel.getByRole("button", { name: /Record Vitals/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Maya Chen");
  await page.getByRole("button", { name: "Close vitals modal" }).click();
  await panel.getByRole("button", { name: /Administer Scale/, exact: false }).click();
  await expect(page.getByRole("dialog")).toContainText("Maya Chen");
  await page.getByRole("button", { name: "Close assessments modal" }).click();
  await panel.getByRole("button", { name: /Clinical Rating Scales/ }).click();
  await expectControlsFit(page);
  await panel.getByRole("button", { name: /Structured History/ }).click();
  await expect(panel.getByRole("heading", { name: /Structured History: Psychiatric/ })).toBeVisible();
  await panel.getByRole("button", { name: /Longitudinal Timeline/ }).click();
  await search.fill("Synthetic unmatched history search");
  await expect(panel.locator(".timeline-feed .timeline-card")).toHaveCount(0);
  await panel.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(panel.locator(".timeline-feed .timeline-card").first()).toBeVisible();
});

test("History action dialogs retain the pane's pinned patient while another chart is foreground", async ({ page }) => {
  const panel = await openHistory(page);
  await panel.getByRole("button", { name: "Pin another patient" }).click();
  await panel.getByRole("combobox", { name: "Choose patient for history" }).selectOption("maya-chen");
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Jordan Reed" }).click();
  await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
  for (const [action, close] of [["Record Vitals", "Close vitals modal"], ["Administer Scale", "Close assessments modal"]]) {
    const loaded = page.waitForResponse((response) => response.url().includes("/api/clinical-records?patientId=maya-chen") && response.request().method() === "GET");
    await panel.getByRole("button", { name: action, exact: true }).click();
    expect((await loaded).ok()).toBe(true);
    const identity = page.getByRole("dialog").locator(".clinical-modal-patient");
    await expect(identity).toContainText("Maya Chen");
    await expect(identity).toContainText("04/18/1992");
    await expect(identity).toContainText("P-10482");
    await expect(identity).not.toContainText("Jordan Reed");
    if (action === "Record Vitals") await page.screenshot({ path: "output/playwright/history-fit-bound-dialog.png" });
    await page.getByRole("button", { name: close, exact: true }).click();
    await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
  }
});
