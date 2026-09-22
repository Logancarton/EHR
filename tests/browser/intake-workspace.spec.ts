import { expect, test, type Page } from "@playwright/test";
import { openWorkspaceFromLauncher, waitForAuthenticatedShell } from "./workspace-fixtures";

/**
 * Intake (D-075), in a browser.
 *
 * Source-level and repository/service-level coverage lives in
 * `tests/intake-readiness.test.ts` and `tests/intake-workflow.test.ts`. This
 * proves the queue actually renders through the real navigation path and
 * that the retired placeholder text is gone for good.
 */

async function signInAsProvider(page: Page) {
  await page.context().clearCookies();
  await page.goto("/");
  await page.locator(".auth-checking").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
  const login = page.getByRole("button", { name: "Taylor · Provider", exact: true });
  await expect(login).toBeVisible({ timeout: 20_000 });
  await login.click();
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-ehr-role", "provider", { timeout: 20_000 });
  await waitForAuthenticatedShell(page);
}

async function openIntake(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "intake" } }));
  });
  await expect(page.locator(".global-module-shell")).toHaveAttribute("data-active-module", "intake", { timeout: 20_000 });
}

async function openCalendar(page: Page) {
  // Calendar is its own first-class workspace tab (D-072), not a generic
  // global module — it opens from the top-row Calendar button, not the
  // `ehr-switch-view` event the module-shell surfaces (Intake, Billing, …) use.
  await openWorkspaceFromLauncher(page, "calendar");
  await expect(page.locator(".gcal-root")).toBeVisible({ timeout: 20_000 });
}

test.describe("Intake workspace", () => {
  test("New Intake starts a prospect with no visit required, then a visit can be scheduled later", async ({ page }) => {
    await signInAsProvider(page);
    await openIntake(page);
    await page.locator(".intake-queue-pane .ui-state-loading").waitFor({ state: "detached", timeout: 20_000 });

    await page.getByRole("button", { name: "New Intake", exact: true }).click();
    const modal = page.locator(".intake-new-modal-panel");
    await expect(modal).toBeVisible({ timeout: 10_000 });

    const uniqueLast = `IntakeStart${Date.now()}`;
    async function field(labelText: string) {
      return modal.locator(".iqd-field", { hasText: labelText });
    }
    await (await field("First name")).locator("input").fill("Direct");
    await (await field("Last name")).locator("input").fill(uniqueLast);
    await (await field("Date of birth")).locator("input").fill("1990-01-15");
    await (await field("Callback phone")).locator("input").fill("555-909-1234");
    await (await field("Email")).locator("input").fill("direct.intake.start@example.test");

    // The "schedule a visit now" checkbox is off by default — a visit is
    // optional, not required to start intake.
    await expect(modal.locator("input[type=checkbox]")).not.toBeChecked();
    await expect(modal.locator("input[type=date]")).toHaveCount(1, { timeout: 2_000 }); // only date of birth, no appointment date field
    await expect(modal).toContainText("No visit will be scheduled");

    await modal.getByRole("button", { name: "Start Intake", exact: true }).click();
    await expect(modal).toBeHidden({ timeout: 15_000 });

    const uniqueName = `Direct ${uniqueLast}`;
    await page.locator(".intake-queue-pane .ui-state-loading").waitFor({ state: "detached", timeout: 20_000 });
    const row = page.locator(".iq-card", { hasText: uniqueName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.locator(".iq-prospect-badge")).toBeVisible();
    await expect(row).toContainText("No visit scheduled yet");

    // The detail panel opens for the just-created episode automatically.
    const detailPane = page.locator(".intake-detail-pane");
    await expect(detailPane).toContainText(uniqueName);
    await expect(detailPane).toContainText("Pre-chart identity");
    await expect(detailPane).toContainText("No visit scheduled yet");

    // No visit yet, so the only front-door action is to schedule one — not
    // to confirm an appointment that does not exist.
    await expect(detailPane.getByRole("button", { name: "Confirm appointment", exact: true })).toHaveCount(0);
    await expect(detailPane.getByRole("button", { name: "Confirm anyway…", exact: true })).toHaveCount(0);
    await detailPane.getByRole("button", { name: "Schedule visit…", exact: true }).click();

    const schedulePanel = detailPane.locator(".iqd-inline-panel").last();
    await schedulePanel.locator("input[type=date]").fill("2026-10-01");
    // The picker shows the practice's real (empty, for this synthetic date)
    // schedule — any open slot works; the submit button stays disabled until
    // one is actually chosen.
    const submitButton = schedulePanel.getByRole("button", { name: "Schedule visit", exact: true });
    await expect(submitButton).toBeDisabled();
    await schedulePanel.locator(".intake-day-slot.open").first().click();
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    await expect(detailPane).toContainText("2026-10-01", { timeout: 10_000 });
    await expect(row, "the same episode now shows the scheduled visit").toContainText("2026-10-01", { timeout: 10_000 });
  });

  test("dragging to select text in a field and releasing off the dialog does not close it", async ({ page }) => {
    await signInAsProvider(page);
    await openIntake(page);
    await page.locator(".intake-queue-pane .ui-state-loading").waitFor({ state: "detached", timeout: 20_000 });

    await page.getByRole("button", { name: "New Intake", exact: true }).click();
    const modal = page.locator(".intake-new-modal-panel");
    await expect(modal).toBeVisible({ timeout: 10_000 });

    const emailInput = modal.locator(".iqd-field", { hasText: "Email" }).locator("input");
    await emailInput.fill("someone@example.test");

    // A text-selection drag that starts inside the field and is released past
    // the dialog's edge must not be read as "clicked the overlay to dismiss".
    const box = await emailInput.boundingBox();
    if (!box) throw new Error("email input has no bounding box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 400, box.y + 400, { steps: 10 });
    await page.mouse.up();

    await expect(modal).toBeVisible();
    await expect(emailInput).toHaveValue("someone@example.test");
  });

  test("opens the real queue rather than the retired placeholder", async ({ page }) => {
    await signInAsProvider(page);
    await openIntake(page);

    const workspace = page.locator(".intake-workspace");
    await expect(workspace).toBeVisible({ timeout: 20_000 });

    // The old placeholder said the workflow "is not built yet" — that sentence
    // must never reappear once the real queue replaces it.
    await expect(workspace).not.toContainText("is not built yet");
    await expect(page.locator(".intake-queue-toolbar")).toBeVisible();
    await expect(page.locator(".intake-stage-tab").first()).toBeVisible();

    // Empty or populated, the lifecycle must be legible rather than a blank pane.
    await page.locator(".intake-queue-pane .ui-state-loading").waitFor({ state: "detached", timeout: 20_000 });
    const hasCards = (await page.locator(".iq-card").count()) > 0;
    const hasEmptyState = await page.locator(".intake-queue-pane .ui-state-empty").isVisible().catch(() => false);
    expect(hasCards || hasEmptyState).toBeTruthy();
  });

  test("a tentative hold for a brand-new caller creates a prospective record, not a chart (D-076)", async ({ page }) => {
    await signInAsProvider(page);
    await openCalendar(page);

    await page.getByRole("button", { name: "New Event", exact: true }).click();
    const modal = page.locator(".gcal-modal-body");
    await expect(modal).toBeVisible({ timeout: 10_000 });

    await page.locator(".gcal-create-patient-link").click();

    const uniqueName = `Prospect Browser Test ${Date.now()}`;
    const fields = page.locator(".gcal-new-patient-fields");
    await fields.locator("label", { hasText: "Full name" }).locator("input").fill(uniqueName);
    await fields.locator("label", { hasText: "Date of birth" }).locator("input").fill("1991-03-15");
    await fields.locator("label", { hasText: "Callback phone" }).locator("input").fill("555-123-9876");
    await fields.locator("label", { hasText: "Email" }).locator("input").fill("prospect.browser.test@example.test");

    // The helper copy must tell the truth: this path holds a prospective
    // record, not a clinical chart.
    await expect(modal).toContainText(/prospective record, not a clinical chart/i);

    // Clicking "Create new patient" already defaulted booking status to tentative.
    await page.getByRole("button", { name: "Hold & Start Intake", exact: true }).click();
    await expect(modal).toBeHidden({ timeout: 15_000 });

    // No administrative drawer should auto-open for a prospect (it has no chart yet).
    await expect(page.locator(".patient-info-drawer")).toHaveCount(0);

    await openIntake(page);
    await page.locator(".intake-queue-pane .ui-state-loading").waitFor({ state: "detached", timeout: 20_000 });

    const row = page.locator(".iq-card", { hasText: uniqueName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.locator(".iq-prospect-badge")).toBeVisible();

    await row.click();
    const detailPane = page.locator(".intake-detail-pane");
    await expect(detailPane).toBeVisible();
    await expect(detailPane).toContainText("Pre-chart identity");
    await expect(detailPane).toContainText("Check for possible existing patients");
  });

  test("a prospect completes government ID, coverage, and card evidence pre-chart, and it carries through promotion (D-077)", async ({ page }) => {
    await signInAsProvider(page);
    await openCalendar(page);

    await page.getByRole("button", { name: "New Event", exact: true }).click();
    const modal = page.locator(".gcal-modal-body");
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await page.locator(".gcal-create-patient-link").click();

    const uniqueName = `Continuity Prospect ${Date.now()}`;
    const fields = page.locator(".gcal-new-patient-fields");
    await fields.locator("label", { hasText: "Full name" }).locator("input").fill(uniqueName);
    await fields.locator("label", { hasText: "Date of birth" }).locator("input").fill("1993-07-21");
    await fields.locator("label", { hasText: "Callback phone" }).locator("input").fill("555-321-7777");
    await fields.locator("label", { hasText: "Email" }).locator("input").fill("continuity.prospect@example.test");
    await page.getByRole("button", { name: "Hold & Start Intake", exact: true }).click();
    await expect(modal).toBeHidden({ timeout: 15_000 });

    await openIntake(page);
    await page.locator(".intake-queue-pane .ui-state-loading").waitFor({ state: "detached", timeout: 20_000 });
    await page.locator(".iq-card", { hasText: uniqueName }).click();
    const detailPane = page.locator(".intake-detail-pane");
    await expect(detailPane).toBeVisible();

    async function openStep(label: string) {
      await detailPane.locator(".iqd-step-row", { hasText: label }).click();
      return detailPane.locator(".iqd-inline-panel");
    }
    async function field(panel: import("@playwright/test").Locator, labelText: string) {
      return panel.locator(".iqd-field", { hasText: labelText });
    }

    // --- Government ID: upload, advance workflow, confirm identity ---
    let panel = await openStep("Government ID confirmed");
    await (await field(panel, "Content")).locator("textarea").fill("Synthetic driver's license — front, for browser test.");
    await panel.getByRole("button", { name: /^Add Government ID/ }).click();
    await expect(panel.getByRole("button", { name: "Mark needs review" })).toBeVisible({ timeout: 10_000 });
    await panel.getByRole("button", { name: "Mark needs review" }).click();
    await expect(panel.getByRole("button", { name: "Mark reviewed" })).toBeVisible({ timeout: 10_000 });
    await panel.getByRole("button", { name: "Mark reviewed" }).click();
    await expect(panel.getByRole("button", { name: "Record identity review" })).toBeVisible({ timeout: 10_000 });
    await panel.getByRole("button", { name: "Record identity review" }).click();
    await expect(detailPane.locator(".iqd-step-row", { hasText: "Government ID confirmed" })).toContainText("recorded", { timeout: 10_000 });

    // --- Insurance details: a real payer, not self-pay ---
    panel = await openStep("Insurance on file or self-pay recorded");
    await (await field(panel, "Payer")).locator("input").fill("Continuity Health Plan");
    await (await field(panel, "Member ID")).locator("input").fill("MEM-CONT-1");
    await panel.getByRole("button", { name: "Add coverage" }).click();
    await expect(detailPane.locator(".iqd-step-row", { hasText: "Insurance on file or self-pay recorded" })).toContainText("recorded", { timeout: 10_000 });

    // --- Insurance card: distinct from the policy details just entered ---
    await expect(detailPane.locator(".iqd-step-row", { hasText: "Insurance card evidence reviewed" })).toContainText("needed");
    panel = await openStep("Insurance card evidence reviewed");
    await (await field(panel, "Content")).locator("textarea").fill("Synthetic insurance card image, for browser test.");
    await panel.getByRole("button", { name: /^Add Insurance card/ }).click();
    await expect(panel.getByRole("button", { name: "Mark needs review" })).toBeVisible({ timeout: 10_000 });
    await panel.getByRole("button", { name: "Mark needs review" }).click();
    await expect(panel.getByRole("button", { name: "Mark reviewed" })).toBeVisible({ timeout: 10_000 });
    await panel.getByRole("button", { name: "Mark reviewed" }).click();
    await expect(detailPane.locator(".iqd-step-row", { hasText: "Insurance card evidence reviewed" })).toContainText("recorded", { timeout: 10_000 });

    // --- Promote: no likely duplicates, create a fresh chart ---
    const promotionPanel = detailPane.locator(".iqd-section", { hasText: "Pre-chart identity" });
    await promotionPanel.getByRole("button", { name: "Check for possible existing patients" }).click();
    await promotionPanel.getByRole("button", { name: /create.*chart/i }).click();

    // The row/workflow continues as the same episode — the panel now shows a
    // real chart link instead of the prospective badge.
    const openChartButton = detailPane.getByRole("button", { name: uniqueName, exact: true });
    await expect(openChartButton).toBeVisible({ timeout: 15_000 });
    await openChartButton.click();

    // --- Evidence appears in the patient's own Documents/Coverage surfaces ---
    const patientTab = page.locator(".browser-tab").filter({ hasText: uniqueName });
    await expect(patientTab).toBeVisible({ timeout: 15_000 });
    await patientTab.click();

    await page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Documents", exact: true }).click();
    const docList = page.locator(".patient-doc-list");
    await expect(docList.locator(".patient-doc-row", { hasText: "Government ID" })).toBeVisible({ timeout: 15_000 });
    await expect(docList.locator(".patient-doc-row", { hasText: "Insurance card" })).toBeVisible();

    await page.getByRole("button", { name: "Patient info" }).click();
    const drawer = page.locator(".patient-info-drawer");
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: "Coverage" }).click();
    await expect(drawer.locator(".patient-info-list li", { hasText: "Continuity Health Plan" })).toBeVisible({ timeout: 10_000 });
  });
});
