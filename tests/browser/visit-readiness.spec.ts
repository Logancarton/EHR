import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * Visit readiness and the billing template, driven through the clinician's own
 * controls (D-100, D-101).
 *
 * The note's readiness panel is asserted on behaviour: a prompt takes the cursor
 * to its section, writing closes it, a failed chart read is reported rather than
 * shown as clear, and Focus leaves only the page with the count still visible.
 * The billing path goes end to end with synthetic data: practice setup, a signed
 * note, a prepared and reviewed charge carrying the practice's fee, and a
 * superbill that prints alone.
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
  const tab = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: patientName });
  await expect(tab).toHaveClass(/active/, { timeout: 10_000 });
  await page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Encounter", exact: true }).click();
  const workspace = page.locator(".primary-workspace-pane .encounter-workspace-root");
  await expect(workspace).toBeVisible({ timeout: 15_000 });
  return workspace;
}

async function openBilling(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "billing" } }));
  });
  await expect(page.locator(".global-module-shell")).toHaveAttribute("data-active-module", "billing", { timeout: 20_000 });
  return page.locator("[data-billing-surface='authoritative']");
}

test("readiness prompts take the cursor to the gap, close when written, and survive Focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInWithDefaultLayout(page, "Prototype provider");
  // Sofia's draft is the one the billing test below signs, so this file leaves no
  // unsigned draft behind for other specs that reason about a patient's newest visit.
  const workspace = await openEncounter(page, "Sofia Martinez");

  const panel = workspace.getByRole("complementary", { name: "Visit readiness" });
  await expect(panel).toBeVisible();
  for (const group of ["note", "billing", "labs", "meds", "follow-up"]) {
    await expect(panel.locator(`[data-readiness-group="${group}"]`)).toBeVisible();
  }
  // The chart-side groups resolve from the server rather than sitting in "Checking".
  await expect(panel.locator('[data-readiness-group="labs"]')).not.toContainText("Checking", { timeout: 15_000 });

  const followUp = workspace.getByRole("textbox", { name: "Follow-Up", exact: true });
  await followUp.fill("");
  const followUpItem = panel.locator('[data-readiness-item="section:followUp"]');
  await expect(followUpItem).toHaveAttribute("data-readiness-state", "open");
  const openBefore = Number(await panel.getAttribute("data-readiness-open"));

  await followUpItem.getByRole("button", { name: "Write it" }).click();
  await expect(followUp).toBeFocused();
  // The rail follows the cursor to the same section.
  await expect(workspace.locator("[data-suggestion-target]")).toHaveAttribute("data-suggestion-target", "followUp");
  await expect(workspace.locator(".encounter-top-toolbar")).toBeInViewport();

  await page.keyboard.type("Return in 4 weeks, sooner if mood worsens.");
  // Done items fold under "Show N done"; the open prompt is gone from the list.
  await expect(followUpItem).toHaveCount(0);
  await panel.locator('[data-readiness-group="note"]').getByRole("button", { name: /Show \d+ done/ }).click();
  await expect(followUpItem).toHaveAttribute("data-readiness-state", "complete");
  await expect.poll(async () => Number(await panel.getAttribute("data-readiness-open"))).toBeLessThan(openBefore);

  const focus = workspace.getByRole("button", { name: "Focus" });
  await focus.click();
  await expect(workspace.locator(".context-rail")).toBeHidden();
  await expect(panel.locator(".readiness-body")).toBeHidden();
  await expect(panel.locator(".readiness-count")).toBeVisible();
  await focus.click();
  await expect(workspace.locator(".context-rail")).toBeVisible();
  await expect(workspace.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 15_000 });
});

test("a failed chart read is stated per group, never shown as nothing to do", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.route("**/api/visit-readiness**", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, error: "synthetic outage" }) }),
  );
  const workspace = await openEncounter(page, "Jordan Reed");
  const panel = workspace.getByRole("complementary", { name: "Visit readiness" });
  for (const group of ["labs", "meds", "follow-up"]) {
    const section = panel.locator(`[data-readiness-group="${group}"]`);
    await expect(section).toContainText("Could not be checked", { timeout: 15_000 });
    await expect(section).toContainText("not the same as nothing to do");
    await expect(section.locator(".readiness-group-count")).not.toHaveText("Clear");
  }
  // The note's own prompts do not depend on the chart read and keep working.
  await expect(panel.locator('[data-readiness-group="note"] .readiness-item').first()).toBeVisible();
  await page.unroute("**/api/visit-readiness**");
});

test("practice setup, a signed note, a reviewed charge at the practice fee, and a superbill that prints alone", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInWithDefaultLayout(page, "Prototype provider");

  // ---- Practice setup through its own controls. Idempotent across runs.
  let billing = await openBilling(page);
  await billing.getByRole("tab", { name: "Practice setup" }).click();
  const setup = page.locator("[data-billing-setup='practice']");
  await expect(setup.getByText("Charge templates", { exact: true })).toBeVisible({ timeout: 15_000 });
  const starters = setup.getByRole("button", { name: /Create from note templates/ });
  if (await starters.isVisible().catch(() => false)) {
    await starters.click();
    await expect(setup.locator(":scope > [role='status']")).toContainText("Starter templates saved.");
  }
  await expect(setup.locator("[data-charge-template]").first()).toBeVisible();

  // The attested E/M level depends on what is documented, so each level is priced.
  const fees: Record<string, string> = { "99212": "$110.00", "99213": "$150.00", "99214": "$210.00", "99215": "$280.00" };
  const notices = setup.locator(":scope > [role='status'], :scope > [role='alert']");
  for (const [code, amount] of Object.entries(fees)) {
    await setup.getByLabel("Fee code").fill(code);
    await setup.getByLabel("Fee description").fill(`Synthetic ${code}`);
    await setup.getByLabel("Fee amount").fill(amount);
    await setup.getByRole("button", { name: "Set fee" }).click();
    await expect(setup.locator(`[data-fee-code='${code}']`)).toContainText(amount);
  }

  const npi = setup.getByLabel("NPI for Prototype Provider");
  await npi.fill("1234567890");
  await setup.locator("[data-billing-provider]").filter({ hasText: "Prototype Provider" }).getByRole("button", { name: "Save" }).click();
  await expect(notices).toContainText("valid check digit");
  await npi.fill("1234567893");
  // The suite's database persists across runs: when this NPI is already the
  // stored value, Save is disabled with "Nothing changed yet." and that is correct.
  const saveNpi = setup.locator("[data-billing-provider]").filter({ hasText: "Prototype Provider" }).getByRole("button", { name: "Save" });
  if ((await saveNpi.getAttribute("aria-disabled")) !== "true") {
    await saveNpi.click();
    await expect(notices).toContainText("identifiers saved");
  } else {
    await expect(saveNpi).toHaveAttribute("title", "Nothing changed yet.");
  }

  // ---- A note that names a coded problem, signed through the closing ceremony.
  const workspace = await openEncounter(page, "Sofia Martinez");
  await workspace.getByRole("button", { name: "Template", exact: true }).click();
  await workspace.locator(".template-options").getByRole("button", { name: /Psychiatric Follow-Up & Med Management/ }).click();
  await workspace.getByRole("textbox", { name: "Chief Complaint", exact: true }).fill("Synthetic follow-up.");
  await workspace
    .getByRole("textbox", { name: "Clinical Assessment & Medical Decision Making", exact: true })
    .fill("Major depressive disorder, improving on the current regimen.");
  await workspace.getByRole("textbox", { name: "Treatment Plan", exact: true }).fill("Continue current medication.");
  await workspace.getByRole("textbox", { name: "Follow-Up", exact: true }).fill("Return in 4 weeks.");
  const panel = workspace.getByRole("complementary", { name: "Visit readiness" });
  await expect(panel.locator('[data-readiness-item="billing:diagnosis"]')).toContainText(/awaiting confirmation|\d+ coded diagnos[ie]s? linked/i, { timeout: 20_000 });
  await expect(workspace.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 15_000 });
  const encounterId = await workspace.getAttribute("data-encounter-id");
  expect(encounterId).toBeTruthy();

  await workspace.getByRole("button", { name: "Review & Sign", exact: true }).click();
  const signModal = page.locator(".review-sign-modal");
  await expect(signModal).toBeVisible();
  while (await signModal.getByRole("button", { name: /continue/i }).isVisible().catch(() => false)) {
    const followupCheck = signModal.locator("label").filter({ hasText: "follow-up plan" }).locator("input[type='checkbox']");
    if (await followupCheck.isVisible().catch(() => false)) await followupCheck.check();
    await signModal.getByRole("button", { name: /continue/i }).click();
  }
  await signModal.locator("label").filter({ hasText: "I attest" }).locator("input[type='checkbox']").check();
  await signModal.getByRole("button", { name: /sign legal record|sign note/i }).click();
  await expect(signModal.getByRole("button", { name: "Close" })).toBeVisible({ timeout: 20_000 });
  await signModal.getByRole("button", { name: "Close" }).click();

  // ---- Charge: prepared from that signed note, carrying the practice's fee.
  billing = await openBilling(page);
  await billing.getByRole("tab", { name: "Charges" }).click();
  const awaiting = billing.locator(`[data-awaiting-encounter="${encounterId}"]`);
  await expect(awaiting).toBeVisible({ timeout: 15_000 });
  await awaiting.getByRole("button", { name: "Prepare charge" }).click();
  await expect(awaiting).toHaveCount(0, { timeout: 15_000 });

  const inspector = billing.locator(".billing-inspector-pane");
  await billing.locator(`[data-charge-encounter="${encounterId}"]`).click();
  const code = (await billing.locator(`[data-charge-encounter="${encounterId}"] .cpt-chip`).first().innerText()).trim();
  expect(Object.keys(fees)).toContain(code);
  await expect(inspector).toContainText(fees[code]);
  await expect(inspector).toContainText("Psychiatric Follow-Up & Med Management");
  const superbillButton = inspector.getByRole("button", { name: "Superbill" });
  await expect(superbillButton).toHaveAttribute("aria-disabled", "true");
  await inspector.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(inspector.locator(".claim-status-badge")).toHaveText("Reviewed", { timeout: 15_000 });

  // ---- Superbill: rendered from records, gaps named, printable alone.
  await inspector.getByRole("button", { name: "Superbill" }).click();
  const document = page.getByRole("dialog", { name: "Superbill" });
  await expect(document.locator(".superbill-page")).toBeVisible({ timeout: 15_000 });
  await expect(document).toContainText("Sofia Martinez");
  await expect(document).toContainText(code);
  await expect(document.locator(".superbill-lines tfoot")).toContainText(fees[code]);
  await expect(document).toContainText("1234567893");
  await expect(document).toContainText(/F33\.1/);

  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".app-shell")).toBeHidden();
  await expect(document.locator(".superbill-page")).toBeVisible();
  await expect(document.locator(".superbill-toolbar")).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  await page.keyboard.press("Escape");
  await expect(document).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-print-document", /.*/);
  await expect(billing).toBeVisible();
});
