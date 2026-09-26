import { expect, test, type Page } from "@playwright/test";
import { waitForAuthenticatedShell } from "./workspace-fixtures";

/**
 * P9-0 containment, in a browser.
 *
 * The exit gate asks for proof that simulated claims, metrics and transport success
 * cannot appear as operational facts on the paths a clinician actually takes:
 * normal navigation, a direct module request, and a stale selection restored from a
 * saved workspace. Source-level assertions live in `tests/billing-containment.test.ts`;
 * these are the ones only a running page can make.
 *
 * Screenshots are written for the three account shapes the gate names — a provider
 * who owns the practice, a practice manager in the billing role, and a clinician
 * with no financial access — because what each of them is shown is different, and
 * the difference is the point.
 */

const SCREENSHOTS = "test-results/billing-screenshots";

/** Phrases from the removed prototype. None may appear on a workspace surface. */
const PROTOTYPE_FABRICATIONS = [
  "Availity",
  "98.2%",
  "$42,850.00",
  "Batch 837P",
  "clean claim rate",
  "Synced 12 transactions",
];

async function signInAs(page: Page, buttonName: string, expectedRole: string) {
  await page.context().clearCookies();
  await page.goto("/");
  await page.locator(".auth-checking").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
  const login = page.getByRole("button", { name: buttonName, exact: true });
  await expect(login).toBeVisible({ timeout: 20_000 });
  await login.click();
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-ehr-role", expectedRole, {
    timeout: 20_000,
  });
  await waitForAuthenticatedShell(page);
}

/** The direct module request path: what a stale link or the app drawer produces. */
async function openModule(page: Page, module: string) {
  await page.evaluate((view) => {
    window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view } }));
  }, module);
  await expect(page.locator(".global-module-shell")).toHaveAttribute("data-active-module", module, {
    timeout: 20_000,
  });
}

async function expectNoFabrications(page: Page) {
  const text = (await page.locator(".global-module-shell").innerText()).replace(/\s+/g, " ");
  for (const phrase of PROTOTYPE_FABRICATIONS) {
    expect(text, `the workspace must not show "${phrase}"`).not.toContain(phrase);
  }
}

test.describe("P9-0 billing containment", () => {
  test("Billing shows authoritative records and cannot report a transmission", async ({ page }) => {
    await signInAs(page, "Taylor · Provider", "provider");
    await openModule(page, "billing");

    const surface = page.locator("[data-billing-surface='authoritative']");
    await expect(surface).toBeVisible({ timeout: 20_000 });
    await expectNoFabrications(page);

    // Submission is offered and refused, with the reason on the control itself
    // rather than the control quietly missing.
    const notice = page.locator("[data-billing-transport='unavailable']");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/clearinghouse/i);

    // Money is absent and explained; it is never rendered as a zero total.
    await expect(surface).toContainText(/fee schedule/i);
    await expect(surface).not.toContainText("$0.00");

    // Put a real charge on screen so the inspector — and the controls that used to
    // lie — are exercised against authoritative data. The suite keeps its database
    // between runs, so an earlier run may already have prepared one; either path
    // reaches the same inspector, and neither invents a row.
    const existing = page.locator("[data-charge-id]");
    if ((await existing.count()) > 0) {
      await existing.first().click();
    } else {
      const prepare = page.getByRole("button", { name: "Prepare charge" }).first();
      await expect(prepare).toBeVisible({ timeout: 20_000 });
      await prepare.click();
    }

    const inspector = page.locator(".billing-inspector-pane");
    await expect(inspector).toBeVisible({ timeout: 20_000 });
    await expect(inspector).toContainText(/Legal record hash/i);

    const submit = inspector.getByRole("button", { name: "Submit claim" });
    await expect(submit).toBeVisible();
    await expect(submit).toHaveAttribute("aria-disabled", "true");

    // Clicking the refused control must change nothing and announce nothing. The
    // prototype's defect was the opposite: a click flipped the row to "submitted"
    // and raised a success banner.
    const statusBadge = inspector.locator(".claim-status-badge");
    const actionNotice = page.locator(".global-module-shell .billing-action-notice[role='status']");
    // No status on this surface may name a transmission or a payment.
    await expect(statusBadge).toHaveText(/^(Prepared|Reviewed)$/);
    // `textContent`, not `innerText`: the badge is uppercased in CSS, and innerText
    // returns the rendered casing while `toHaveText` compares the DOM text.
    const statusBefore = (await statusBadge.textContent())!.trim();
    const noticeBefore = (await actionNotice.count()) ? await actionNotice.innerText() : "";

    await submit.click({ force: true });

    await expect(statusBadge).toHaveText(statusBefore);
    const noticeAfter = (await actionNotice.count()) ? await actionNotice.innerText() : "";
    expect(noticeAfter, "a refused submission must announce nothing new").toBe(noticeBefore);
    expect(noticeAfter).not.toMatch(/submit|transmit|sent|payer/i);

    await expectNoFabrications(page);
    await page.screenshot({ path: `${SCREENSHOTS}/billing-owner-provider.png`, animations: "disabled" });
  });

  test("the practice manager in the billing role sees the same authoritative surface", async ({ page }) => {
    await signInAs(page, "Morgan Reed · Practice Manager & Biller", "staff");
    await openModule(page, "billing");

    await expect(page.locator("[data-billing-surface='authoritative']")).toBeVisible({ timeout: 20_000 });
    await expectNoFabrications(page);

    await page.screenshot({ path: `${SCREENSHOTS}/billing-manager.png`, animations: "disabled" });
  });

  test("a clinician without financial access is told so, not shown an empty practice", async ({ page }) => {
    await signInAs(page, "Alex Rivera · PMHNP", "provider");
    await openModule(page, "billing");

    // The distinction that matters: refused is not the same as nothing to bill.
    const shell = page.locator(".global-module-shell");
    await expect(shell).toContainText(/financial access/i);
    await expect(page.locator("[data-billing-surface='authoritative']")).toHaveCount(0);
    await expectNoFabrications(page);

    await page.screenshot({ path: `${SCREENSHOTS}/billing-no-financial-access.png`, animations: "disabled" });
  });

  test("a stale saved selection for the withdrawn Financials prototype resolves to an honest surface", async ({ page }) => {
    await signInAs(page, "Taylor · Provider", "provider");

    // Tear the live page down first: the workspace autosaves on a debounce, so a
    // save capturing the pre-write state can land after this and win.
    await page.goto("about:blank");

    // Write the selection a clinician would have had saved when the destination was
    // still offered, then reload the way they would next morning.
    const current = await page.request.get("/api/workspace-state");
    expect(current.ok()).toBeTruthy();
    const state = (await current.json()).state;
    const write = await page.request.put("/api/workspace-state", {
      data: { state: { ...state, activeView: "financial_integration", savedAt: new Date().toISOString() } },
    });
    expect(write.ok()).toBeTruthy();

    await page.goto("/");
    await waitForAuthenticatedShell(page);

    const shell = page.locator(".global-module-shell");
    await expect(shell).toBeVisible({ timeout: 20_000 });
    await expect(shell).toHaveAttribute("data-active-module", "financial_integration");
    await expect(shell).toContainText(/is not built yet/i);
    await expectNoFabrications(page);

    await page.screenshot({ path: `${SCREENSHOTS}/financials-stale-restore.png`, animations: "disabled" });

    // And the stale selection is cleared, so the explanation is shown once rather
    // than greeting them every session.
    await expect
      .poll(async () => (await (await page.request.get("/api/workspace-state")).json())?.state?.activeView, {
        timeout: 10_000,
      })
      .not.toBe("financial_integration");
  });

  test("the retained prototype is labelled a demo on every figure and can transmit nothing", async ({ page }) => {
    await signInAs(page, "Taylor · Provider", "provider");
    await page.goto("/preview/billing");

    const preview = page.locator("[data-preview='billing']");
    await expect(preview).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-preview-banner]")).toBeVisible();

    // No workspace chrome under a preview: the rule the dashboard prototype follows.
    await expect(page.locator(".app-shell")).toHaveCount(0);
    await expect(page.locator(".global-module-shell")).toHaveCount(0);

    // Every invented figure carries its own marker, so a cropped screenshot of one
    // tile still says Demo.
    const demoTags = page.locator(".billing-demo-tag");
    expect(await demoTags.count()).toBeGreaterThan(8);

    // The action that used to announce a clearinghouse batch now says it did nothing.
    await page.getByRole("button", { name: /Transmit batch/i }).click();
    const outcome = page.locator(".ui-state-error");
    await expect(outcome).toContainText(/does nothing/i);
    await expect(outcome).toContainText(/no claim was prepared, transmitted or paid/i);

    // And the rows did not move, which is what the prototype used to do instead.
    await expect(preview).not.toContainText("submitted claims");

    await page.screenshot({
      path: `${SCREENSHOTS}/billing-preview.png`,
      fullPage: true,
      animations: "disabled",
    });
  });
});
