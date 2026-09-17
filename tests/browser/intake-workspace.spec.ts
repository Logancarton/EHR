import { expect, test, type Page } from "@playwright/test";
import { waitForAuthenticatedShell } from "./workspace-fixtures";

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
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.locator(".today-dashboard.calendar-surface")).toBeVisible({ timeout: 20_000 });
}

test.describe("Intake workspace", () => {
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
});
