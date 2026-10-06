import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * D-103: a lab result has a real entry form in the chart's Labs section, a
 * vital sign typed into it is sent to the vitals form, and seeded office
 * blood pressures are vitals rather than lab results.
 */
test("Labs records a hand-entered result and sends vital signs to the vitals form", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");

  const mayaTab = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Maya Chen" });
  await mayaTab.click();
  await page.locator('.companion-rail-btn[data-tool-id="labs"]').click();
  await page.getByRole("tab", { name: "Record & review", exact: true }).click();
  await page.locator('[data-companion-panel="labs"]').getByRole("button", { name: "Expand to main canvas" }).click();

  const flowsheet = page.locator(".labs-container .card").filter({ hasText: "Longitudinal Lab Results" });
  await expect(flowsheet.locator(".lab-table")).toContainText("TSH", { timeout: 15_000 });
  await expect(flowsheet.locator(".lab-table"), "office blood pressures are vitals, not lab results")
    .not.toContainText(/blood pressure/i);

  await flowsheet.getByRole("button", { name: /Record result/ }).click();
  const form = page.getByRole("form", { name: /Record a lab result for Maya Chen/ });
  await expect(form).toBeVisible();

  // A vital sign is redirected before it can be saved.
  await form.getByLabel("Test name").fill("Resting blood pressure");
  await expect(form.locator(".lab-entry-redirect")).toContainText("vital sign");
  await expect(form.getByRole("button", { name: "Save result" })).toBeDisabled();
  await form.getByRole("button", { name: "Record vitals instead" }).click();
  const vitals = page.locator(".vitals-modal-container");
  await expect(vitals).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(vitals).toHaveCount(0);

  // A real result saves into the lab record and appears in the flowsheet.
  await flowsheet.getByRole("button", { name: /Record result/ }).click();
  await form.getByLabel("Test name").fill("Vitamin D, 25-hydroxy");
  await form.getByLabel("Result").fill("24");
  await form.getByLabel("Unit").fill("ng/mL");
  await form.getByLabel("Reference range").fill("30–100");
  await form.getByLabel("Interpretation").selectOption("low");
  await form.getByRole("button", { name: "Save result" }).click();

  await expect(page.locator(".lab-entry-saved")).toContainText("lab queue");
  await expect(flowsheet.locator(".lab-table")).toContainText("Vitamin D, 25-hydroxy");
  await expect(flowsheet.locator(".lab-table")).toContainText("24");
});

test("lab entry clears a prior test code and uses the practice day while travelling", async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: "Asia/Tokyo", viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await signInWithDefaultLayout(page, "Prototype provider");
    await page.clock.setFixedTime(new Date("2026-10-07T02:00:00Z"));
    await page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Maya Chen" }).click();
    await page.locator('.companion-rail-btn[data-tool-id="labs"]').click();
    await page.getByRole("tab", { name: "Record & review", exact: true }).click();
    await page.locator('[data-companion-panel="labs"]').getByRole("button", { name: "Expand to main canvas" }).click();
    await page.getByRole("button", { name: "Record result", exact: true }).click();
    const form = page.getByRole("form", { name: /Record a lab result for Maya Chen/ });
    const name = form.getByLabel("Test name");
    const code = form.getByLabel("LOINC code (optional)");
    await expect(form.getByLabel("Collected")).toHaveValue("2026-10-06");
    await expect(form.getByLabel("Collected")).toHaveAttribute("max", "2026-10-06");
    await name.fill("Comprehensive Metabolic Panel (CMP)");
    await expect(code).toHaveValue("24323-8");
    await name.fill("Fasting Lipid Panel & HbA1c");
    await expect(code).toHaveValue("");
    await name.fill("Complete Blood Count with Differential (CBC with Diff)");
    await expect(code).toHaveValue("58410-2");
    await name.fill("Custom laboratory test");
    await expect(code).toHaveValue("");
    await code.fill("12345-6");
    await form.getByLabel("Result", { exact: true }).fill("24");
    await expect(code).toHaveValue("12345-6");
    await name.fill("");
    await expect(code).toHaveValue("");
    await expect(form.getByRole("button", { name: "Save result" })).toBeDisabled();
  } finally {
    await context.close();
  }
});
