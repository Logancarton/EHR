import { expect, test, type Page } from "@playwright/test";
import { waitForAuthenticatedShell } from "./workspace-fixtures";

/**
 * BILL-05: Billing's workflow queue, driven through the clinician's own controls.
 *
 * What only a running page can show: the queue is built from the same load as
 * the Charges view, a real action taken from the queue lands on the server and
 * moves the row without losing the selection, and submission is refused on the
 * control itself. The suite database persists between runs, so each step works
 * from whatever state an earlier run left rather than assuming a fresh practice.
 */

const SCREENSHOTS = "test-results/billing-screenshots";

async function signInAsOwner(page: Page) {
  await page.context().clearCookies();
  await page.goto("/");
  await page.locator(".auth-checking").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
  const login = page.getByRole("button", { name: "Taylor · Provider", exact: true });
  await expect(login).toBeVisible({ timeout: 20_000 });
  await login.click();
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-ehr-role", "provider", { timeout: 20_000 });
  await waitForAuthenticatedShell(page);
}

async function openBillingFromLauncher(page: Page) {
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page.locator(".open-workspace-popover").getByText("Billing", { exact: true }).click();
  await expect(page.locator(".global-module-shell")).toHaveAttribute("data-active-module", "billing", {
    timeout: 20_000,
  });
}

test("the billing workflow queue stages work from the signed note to a reviewed charge", async ({ page }) => {
  await signInAsOwner(page);
  await openBillingFromLauncher(page);

  const billing = page.locator("[data-billing-surface='authoritative']");
  await expect(billing).toBeVisible({ timeout: 20_000 });
  // Charges stays the default view while the workflow proves parity beside it.
  await expect(billing.getByRole("tab", { name: "Charges" })).toHaveAttribute("aria-selected", "true");

  await billing.getByRole("tab", { name: "Workflow" }).click();
  const queue = page.locator("[data-billing-workflow]");
  await expect(queue).toBeVisible();

  const cards = queue.locator("[data-workflow-key]");
  await expect(cards.first()).toBeVisible({ timeout: 20_000 });

  // The queue agrees with the server row for row: every unbilled encounter and
  // every non-void charge is one card under "All".
  const server = await page.evaluate(async () => {
    const res = await fetch("/api/billing");
    return (await res.json()) as {
      charges: Array<{ encounterId: string; status: string }>;
      awaitingCharge: Array<{ encounterId: string }>;
    };
  });
  const expectedAll = server.awaitingCharge.length + server.charges.filter((c) => c.status !== "void").length;
  await expect(cards).toHaveCount(expectedAll);

  // Take the next unbilled encounter through its first step from the queue.
  const needsCharge = queue.locator("[data-workflow-stage='needs_charge']").first();
  if ((await needsCharge.count()) > 0) {
    const key = (await needsCharge.getAttribute("data-workflow-key"))!;
    await needsCharge.click();

    const detail = page.locator(`[data-workflow-detail='${key}']`);
    await expect(detail).toBeVisible();
    await expect(detail.locator("[data-workflow-step='charge']")).toHaveAttribute("data-workflow-step-state", "needed");
    // Facts not yet read from the signed record are pending, not missing.
    await expect(detail.locator("[data-workflow-step='diagnosis']")).toHaveAttribute("data-workflow-step-state", "pending");

    await detail.getByRole("button", { name: "Prepare charge", exact: true }).click();

    // The same encounter stays selected and moves out of "Needs charge".
    const card = queue.locator(`[data-workflow-key='${key}']`);
    await expect(card).not.toHaveAttribute("data-workflow-stage", "needs_charge", { timeout: 20_000 });
    await expect(page.locator(`[data-workflow-detail='${key}']`)).toBeVisible();
    await expect(
      page.locator(`[data-workflow-detail='${key}'] [data-workflow-step='charge']`),
    ).toHaveAttribute("data-workflow-step-state", "recorded");

    const prepared = await page.evaluate(async (encounterId) => {
      const res = await fetch("/api/billing");
      const body = (await res.json()) as { charges: Array<{ encounterId: string }>; awaitingCharge: Array<{ encounterId: string }> };
      return {
        hasCharge: body.charges.some((c) => c.encounterId === encounterId),
        stillAwaiting: body.awaitingCharge.some((a) => a.encounterId === encounterId),
      };
    }, key);
    expect(prepared).toEqual({ hasCharge: true, stillAwaiting: false });
  } else {
    await cards.first().click();
  }

  // Submission is a step that is never available here, and its control says why.
  const detail = page.locator("[data-workflow-detail]");
  const submission = detail.locator("[data-workflow-step='submission']");
  await expect(submission).toHaveAttribute("data-workflow-step-state", "not_available");
  await submission.click();
  const submit = detail.getByRole("button", { name: "Submit claim", exact: true });
  await expect(submit).toHaveAttribute("aria-disabled", "true");
  await expect(queue).not.toContainText(/submitted|\$0\.00/i);

  await page.screenshot({ path: `${SCREENSHOTS}/billing-workflow.png`, animations: "disabled" });

  // "Show in Charges" hands the same charge to the existing inspector.
  const showInCharges = detail.getByRole("button", { name: "Show in Charges", exact: true });
  if ((await showInCharges.count()) > 0) {
    const chargeKey = (await detail.getAttribute("data-workflow-detail"))!;
    await showInCharges.click();
    await expect(billing.getByRole("tab", { name: "Charges" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(`.claim-row.selected[data-charge-encounter='${chargeKey}']`)).toBeVisible();
  }
});

test("the chosen stage and sort survive a reload; the queue contents do not come from storage", async ({ page }) => {
  await signInAsOwner(page);
  await openBillingFromLauncher(page);
  const billing = page.locator("[data-billing-surface='authoritative']");
  await billing.getByRole("tab", { name: "Workflow" }).click();
  const queue = page.locator("[data-billing-workflow]");
  await expect(queue).toBeVisible({ timeout: 20_000 });

  // Whichever stage currently has rows; empty stages sit under "more stages".
  const stageTab = queue.locator(".intake-stage-tab[data-billing-stage]").first();
  await expect(stageTab).toBeVisible({ timeout: 20_000 });
  const chosen = (await stageTab.getAttribute("data-billing-stage"))!;
  await stageTab.click();
  await expect(stageTab).toHaveAttribute("aria-pressed", "true");
  await queue.getByRole("combobox", { name: "Sort billing workflow" }).selectOption("patient");

  const stored = await page.evaluate(() => window.localStorage.getItem("ehr.billing.workflow.queue"));
  expect(JSON.parse(stored!)).toEqual({ stage: chosen, sort: "patient" });

  await page.reload();
  await waitForAuthenticatedShell(page);
  // The billing tab may or may not be restored by the workspace; reopen it if not.
  if ((await page.locator("[data-billing-surface='authoritative']").count()) === 0) {
    await openBillingFromLauncher(page);
  }
  await page.locator("[data-billing-surface='authoritative']").getByRole("tab", { name: "Workflow" }).click();
  const restored = page.locator("[data-billing-workflow]");
  await expect(restored.locator(`[data-billing-stage='${chosen}']`)).toHaveAttribute("aria-pressed", "true");
  await expect(restored.getByRole("combobox", { name: "Sort billing workflow" })).toHaveValue("patient");

  // Every visible card is in the restored stage; the rows still come from the server.
  const cards = restored.locator("[data-workflow-key]");
  const stages = await cards.evaluateAll((els) => els.map((el) => el.getAttribute("data-workflow-stage")));
  expect(stages.length).toBeGreaterThan(0);
  expect(stages.every((stage) => stage === chosen)).toBe(true);

  // A tampered preference falls back to the defaults rather than breaking the queue.
  await page.evaluate(() => window.localStorage.setItem("ehr.billing.workflow.queue", "{\"stage\":\"bogus\",\"sort\":7}"));
  await page.reload();
  await waitForAuthenticatedShell(page);
  if ((await page.locator("[data-billing-surface='authoritative']").count()) === 0) {
    await openBillingFromLauncher(page);
  }
  await page.locator("[data-billing-surface='authoritative']").getByRole("tab", { name: "Workflow" }).click();
  await expect(page.getByRole("combobox", { name: "Sort billing workflow" })).toHaveValue("priority");
  await expect(page.locator("[data-billing-workflow] .intake-stage-tab").first()).toHaveAttribute("aria-pressed", "true");
});
