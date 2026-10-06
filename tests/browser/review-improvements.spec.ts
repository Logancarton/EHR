import { expect, test } from "@playwright/test";
import { openWorkspaceFromLauncher, signInWithDefaultLayout } from "./workspace-fixtures";

test("practice queue tabs survive a reload and retain the active workspace", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  for (const moduleId of ["intake", "labs", "documents"] as const) {
    await openWorkspaceFromLauncher(page, moduleId);
    await expect(page.locator(`.browser-tab[data-workspace-view="${moduleId}"]`)).toHaveCount(1);
  }
  await expect.poll(async () => (await (await page.request.get("/api/workspace-state")).json()).state?.openModuleTabs)
    .toEqual(["intake", "labs", "documents"]);
  await expect.poll(async () => (await (await page.request.get("/api/workspace-state")).json()).state?.activeView).toBe("documents");
  await page.reload();
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-workspace-restored", "true", { timeout: 20_000 });
  for (const moduleId of ["intake", "labs", "documents"]) await expect(page.locator(`.browser-tab[data-workspace-view="${moduleId}"]`)).toHaveCount(1);
  await expect(page.locator('.browser-tab[data-workspace-view="documents"]')).toHaveClass(/active/);
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();
  await page.locator('.browser-tab[data-workspace-view="labs"]').getByRole("button", { name: "Close Results Queue tab" }).click();
  await expect(page.locator(".primary-workspace-pane .patient-header h1")).toHaveText("Maya Chen");
  await page.locator('.browser-tab[data-workspace-view="documents"]').click();
  await page.screenshot({ path: "output/playwright/review-improvements-queue-tabs.png" });
});

test("medication catalog search filters names and categories without changing the selected prescription", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();
  await page.locator('.companion-rail-btn[data-tool-id="medications"]').click();
  await page.locator('[data-patient-record-tool="medications"]').getByRole("button", { name: "New prescription", exact: true }).click();
  const composer = page.locator(".order-cart-modal");
  await composer.getByRole("button", { name: /Prescribe Medication \(Rx\)/ }).click();
  const search = composer.getByRole("searchbox", { name: "Search available medications" });
  await search.fill("zoloft");
  await expect(composer.locator(".drug-chip")).toHaveCount(1);
  await composer.locator(".drug-chip").click();
  await search.fill("no-such-drug");
  await expect(composer.getByRole("status").filter({ hasText: "No medications match" })).toContainText("No medications match");
  await expect(composer.getByTestId("rx-no-drug-selected")).toHaveCount(0);
  await search.fill("SSRI");
  await expect(composer.locator(".drug-chip")).not.toHaveCount(0);
  await search.fill("");
  await expect(composer.locator(".drug-chip[aria-pressed='true']")).toContainText("Sertraline");
  await expect(composer.getByRole("button", { name: /Stage Prescription to Cart/ })).toBeDisabled();
  for (const [width, height] of [[1440,900], [1280,800], [1024,800]]) {
    await page.setViewportSize({ width, height });
    await search.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `output/playwright/review-improvements-rx-${width}.png` });
  }
  // A 720×450 CSS viewport models the reflow available at 200% browser zoom
  // on a 1440×900 display; root CSS zoom does not rescale viewport units.
  await page.setViewportSize({ width: 720, height: 450 });
  await search.scrollIntoViewIfNeeded();
  await expect(search).toBeVisible();
  const bounds = await composer.boundingBox();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(720);
  await expect(composer.getByRole("button", { name: "Close modal" })).toBeInViewport();
  await page.screenshot({ path: "output/playwright/review-improvements-rx-200-percent.png" });
});

test("an incomplete PHQ-9 immediately exposes its existing item-level safety flag", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();
  await page.locator('.companion-rail-btn[data-tool-id="history"]').click();
  await page.locator('[data-patient-record-tool="history"]').getByRole("button", { name: "Administer Scale", exact: true }).click();
  const dialog = page.locator(".assessment-modal-container");
  const question = dialog.locator("form > div > div").filter({ hasText: "Thoughts that you would be better off dead" });
  await question.getByRole("button", { name: "1 · Several days", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("POSITIVE ITEM 9");
  await expect(dialog).toContainText("1/9 questions answered");
  await expect(dialog.getByRole("button", { name: "Save to Medical Record" })).toBeDisabled();
  await dialog.getByRole("alert").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "output/playwright/review-improvements-incomplete-safety.png" });
  await question.getByRole("button", { name: "0 · Not at all", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("button", { name: "GAD-7 (Anxiety)", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});

test("note and monitoring read the patient's shared working cart without attributing it to another patient", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.evaluate(() => localStorage.setItem("ehr_orders_staged_v1", JSON.stringify({ "maya-chen": [{
    id: "synthetic-review-cart", patientId: "maya-chen", type: "lab", testName: "Electrolytes / sodium", loincCode: "", specimen: "Blood", priority: "Routine", fastingRequired: false, clinicalRationale: "Synthetic browser fixture", indication: "Synthetic review", targetFacility: "Quest Diagnostics", status: "staged", orderedBy: "Synthetic provider", createdAt: new Date().toISOString(),
  }] })));
  await page.reload();
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-workspace-restored", "true", { timeout: 20_000 });
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();
  await page.locator('.companion-rail-btn[data-tool-id="labs"]').click();
  await page.getByRole("tab", { name: "Record & review", exact: true }).click();
  await expect(page.locator('.labs-container').getByRole("button", { name: "Already staged" })).toBeDisabled();
  await page.locator('[data-companion-panel="labs"]').getByRole("button", { name: "Close", exact: true }).click();
  await page.locator(".primary-workspace-pane").getByRole("button", { name: "Encounter", exact: true }).first().click();
  const orderSection = page.locator('section[aria-labelledby="note-heading-orders"]');
  await expect(orderSection).toContainText("Electrolytes / sodium");
  await expect(orderSection).toContainText("Local drafts only");
  await orderSection.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "output/playwright/review-improvements-working-cart.png" });
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Jordan Reed" }).click();
  await page.locator(".primary-workspace-pane").getByRole("button", { name: "Encounter", exact: true }).first().click();
  await expect(orderSection).not.toContainText("Electrolytes / sodium");
  await expect(orderSection).toContainText("No order drafts");
});

test("chart-summary chip returns a provenance-backed bounded record recap", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();
  await page.locator(".companion-rail-btn[aria-label='Clinical AI']").click();
  const panel = page.locator("aside.companion-ai-panel");
  await panel.getByRole("button", { name: "Summarize chart", exact: true }).click();
  const answer = panel.locator("[data-omnibox-plan-answer]");
  await expect(answer).toContainText("Bounded chart recap for Maya Chen", { timeout: 20_000 });
  await expect(answer).toContainText("Sertraline");
  await expect(answer).toContainText("not a complete chart review");
  await expect(panel.locator("[data-omnibox-plan-card]")).toContainText(/Clinical mutation: none/i);
  await page.screenshot({ path: "output/playwright/review-improvements-chart-recap.png" });
});
