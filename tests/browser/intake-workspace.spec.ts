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
});
