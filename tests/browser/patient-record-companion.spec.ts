import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

async function chart(page: Page, name: string) {
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: name }).click();
}
async function dashboard(page: Page) {
  await page.locator('.browser-tab[data-workspace-tab="dashboard"]').click();
}

for (const [id, label] of [["medications", "Medications"], ["documents", "Documents"], ["communication", "Communication"], ["history", "History"], ["orders", "Orders"]]) {
  test(`${label} follows the chart, retains the patient on Dashboard, and resets on close`, async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    await chart(page, "Maya Chen");
    await page.locator(`.companion-rail-btn[data-tool-id="${id}"]`).click();
    const panel = page.locator(`[data-patient-record-tool="${id}"]`);
    await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
    await chart(page, "Jordan Reed");
    await expect(panel).toHaveAttribute("data-bound-patient-id", "jordan-reed");
    await dashboard(page);
    await expect(panel).toHaveAttribute("data-bound-patient-id", "jordan-reed");
    await panel.getByRole("button", { name: "Expand to main canvas" }).click();
    await expect(panel).toHaveClass(/companion-expanded-canvas/);
    await expect(panel).toHaveAttribute("data-bound-patient-id", "jordan-reed");
    await panel.getByRole("button", { name: "Redock to companion rail" }).click();
    await panel.getByRole("button", { name: id === "communication" ? "Close" : `Close ${label.toLowerCase()}`, exact: true }).click();
    await page.locator(`.companion-rail-btn[data-tool-id="${id}"]`).click();
    await expect(panel).toHaveAttribute("data-bound-patient-id", "");
    await panel.getByRole("combobox").selectOption("maya-chen");
    await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
    await expect(panel).toContainText("Maya Chen");
  });
}

test("lab draft remains owned by its patient while the tool follows charts and stays usable on Dashboard", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await chart(page, "Maya Chen");
  await page.locator('.companion-rail-btn[data-tool-id="labs"]').click();
  const picker = page.getByRole("combobox", { name: "Choose patient for labs" });
  await expect(picker).toHaveValue("maya-chen");
  const panel = page.locator('[data-companion-panel="labs"]');
  await panel.getByRole("tab", { name: /Order/ }).click();
  const indication = panel.getByRole("textbox", { name: "Lab indication" });
  await indication.fill("Synthetic Maya-specific indication");
  await chart(page, "Jordan Reed");
  await expect(picker).toHaveValue("jordan-reed");
  await expect(indication).toHaveValue("");
  await chart(page, "Maya Chen");
  await expect(indication).toHaveValue("Synthetic Maya-specific indication");
  await dashboard(page);
  await expect(picker).toHaveValue("maya-chen");
  await expect(panel).toContainText("Selected Patient");
});

test("core tools are reachable without the left panel across viewport sizes", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await chart(page, "Maya Chen");
  for (const [width, height] of [[1440, 900], [1280, 800], [1024, 800], [720, 800]]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".primary-workspace-pane .patient-chart-sidebar")).toHaveCount(0);
    const controls = page.locator(".primary-workspace-pane .patient-header-actions");
    await expect(controls.getByRole("button", { name: "Overview", exact: true })).toBeVisible();
    await expect(controls.getByRole("button", { name: "Encounter", exact: true })).toBeVisible();
    for (const id of ["medications", "labs", "documents", "communication", "history", "orders"]) {
      const tool = page.locator(`.companion-rail-btn[data-tool-id="${id}"]`);
      await tool.scrollIntoViewIfNeeded();
      await expect(tool).toBeInViewport();
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await expect.poll(() => page.evaluate(() => {
    const rail = document.querySelector(".companion-rail")!.getBoundingClientRect();
    const strip = document.querySelector(".browser-tabs")!.getBoundingClientRect();
    return Math.abs(rail.top - strip.bottom);
  })).toBeLessThanOrEqual(2);
  await expect(page.locator(".primary-workspace-pane .patient-header-actions").getByRole("button", { name: "Encounter", exact: true })).toBeVisible();
  const orders = page.locator('.companion-rail-btn[data-tool-id="orders"]');
  await orders.scrollIntoViewIfNeeded();
  await expect(orders).toBeInViewport();
  await page.screenshot({ path: "output/playwright/patient-record-chart-200-percent.png", fullPage: false });
});

test("Messages retains access to intake contacts without an active chart", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await dashboard(page);
  await page.route("**/api/intake", (route) => route.fulfill({ json: { success: true, queue: [{ prospectivePersonId: "synthetic-intake-contact", patientName: "Synthetic Intake Contact", patientId: null }] } }));
  await page.locator('.companion-rail-btn[data-tool-id="communication"]').click();
  const panel = page.locator('[data-companion-panel="communication"]');
  await panel.locator('[data-channel="patient"]').click();
  await expect(panel.locator('option[value="synthetic-intake-contact"]')).toHaveCount(1);
  await panel.getByRole("combobox").selectOption("synthetic-intake-contact");
  await expect(panel.getByRole("combobox")).toHaveValue("synthetic-intake-contact");
  await panel.getByRole("button", { name: "Expand to main canvas" }).click();
  await expect(panel.getByRole("combobox")).toHaveValue("synthetic-intake-contact");
  await expect(panel).toHaveAttribute("data-bound-patient-id", "");
});

test("document retrieval failure remains patient-bound and recovers through Retry", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await chart(page, "Maya Chen");
  let fail = true;
  await page.route("**/api/clinical-records?patientId=maya-chen", async (route) => {
    if (fail) await route.fulfill({ status: 503, json: { success: false, error: "Synthetic document retrieval unavailable" } });
    else await route.continue();
  });
  await page.locator('.companion-rail-btn[data-tool-id="documents"]').click();
  const panel = page.locator('[data-patient-record-tool="documents"]');
  await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
  await expect(panel.locator(".global-inline-error")).toContainText("Synthetic document retrieval unavailable");
  fail = false;
  await panel.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(panel.locator(".patient-doc-row").first()).toBeVisible();
  await expect(panel.locator(".global-inline-error")).toHaveCount(0);
});

test("Labs rejects another patient's records and does not claim current monitoring on failure", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await chart(page, "Maya Chen");
  await page.route("**/api/clinical-records?patientId=maya-chen", (route) => route.fulfill({
    json: { success: true, record: { medications: [{ patient_id: "jordan-reed", status: "active", display_text: "Wrong patient medication" }], observations: [], vitals: [] } },
  }));
  await page.locator('.companion-rail-btn[data-tool-id="labs"]').click();
  const panel = page.locator('[data-companion-panel="labs"]');
  await expect(panel).toContainText("Patient binding mismatch");
  await expect(panel).toContainText("Medication surveillance unavailable");
  await expect(panel).not.toContainText("Recorded Monitoring Checks Current");
  await expect(panel).not.toContainText("Wrong patient medication");
});
