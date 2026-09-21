import { expect, test, type Page } from "@playwright/test";
import { clinicalHomeTile, waitForAuthenticatedShell } from "./workspace-fixtures";

/**
 * The home launcher's assistant, in a browser.
 *
 * `tests/home-assistant-grounding.test.ts` proves what the planner may return and
 * that the component has no local answer path. These are the claims only a running
 * page can make: that a question reaches the server at all, that each outcome is
 * visibly different from the others, and that the screen never fills a gap with an
 * example.
 *
 * The screen it replaced answered from a `query.includes(...)` ladder, so every one
 * of these requests used to be served without a single network call.
 */

const SCREENSHOTS = "test-results/home-assistant-screenshots";

async function signInAndOpenHome(page: Page) {
  await page.context().clearCookies();
  await page.goto("/");
  await page.locator(".auth-checking").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
  const login = page.getByRole("button", { name: "Taylor · Provider", exact: true });
  await expect(login).toBeVisible({ timeout: 20_000 });
  await login.click();
  await waitForAuthenticatedShell(page);

  await page.getByRole("button", { name: "Home Launchpad" }).click();
  await expect(page.locator(".zen-home-viewport")).toBeVisible({ timeout: 20_000 });
}

/** Types a question and presses Enter, returning the planner request it caused. */
async function ask(page: Page, question: string) {
  const input = page.locator(".zen-pill-input");
  await input.click();
  await input.fill(question);

  const [request] = await Promise.all([
    page.waitForRequest((candidate) => candidate.url().includes("/api/ai/omnibox/plan"), { timeout: 15_000 }),
    input.press("Enter"),
  ]);

  const card = page.locator("[data-omnibox-plan-card]");
  await expect(card).toBeVisible({ timeout: 20_000 });
  // The card appears in its "Understanding request…" state first. Waiting only for
  // the card would read the loading frame, so this waits for the plan body or the
  // refusal — whichever the request produced.
  await expect(
    card.locator(".omnibox-plan-body, [data-omnibox-plan-error]").first(),
  ).toBeVisible({ timeout: 20_000 });
  return request;
}

test.describe("home launcher assistant", () => {
  test("a question crosses the authenticated planner rather than being answered locally", async ({ page }) => {
    await signInAndOpenHome(page);

    const request = await ask(page, "What medications is Maya Chen taking?");
    expect(request.method()).toBe("POST");
    // No active patient is claimed from a launcher that is not a chart; the server
    // resolves the name against this clinician's own roster.
    expect(request.postDataJSON()).toMatchObject({ activeSurface: "general" });
    expect(request.postDataJSON().activePatientId).toBeUndefined();

    const card = page.locator("[data-omnibox-plan-card]");
    await expect(card).toContainText("Patient: Maya Chen");
    await expect(card.locator("[data-omnibox-plan-answer]")).toBeVisible();
    await expect(card).toContainText(/Clinical mutation: none/i);

    await page.screenshot({ path: `${SCREENSHOTS}/answered.png`, animations: "disabled" });
  });

  test("a record that does not exist is reported missing, not filled in", async ({ page }) => {
    await signInAndOpenHome(page);
    await ask(page, "What was Maya Chen's last lithium level?");

    const answer = page.locator("[data-omnibox-plan-answer]");
    await expect(answer).toBeVisible();
    const text = await answer.innerText();

    // The old screen answered this with "0.9 mEq/L (therapeutic range: 0.6–1.2)".
    expect(text, "a missing lab must not come back as a value").not.toMatch(/\d+(\.\d+)?\s*mEq\/L/i);
    expect(text, "a missing lab must not come back with a reference range").not.toMatch(/therapeutic range/i);
    expect(text).toMatch(/no lithium result|does not contain|not .*present/i);

    await page.screenshot({ path: `${SCREENSHOTS}/missing-record.png`, animations: "disabled" });
  });

  test("a request naming no patient asks which one instead of choosing", async ({ page }) => {
    await signInAndOpenHome(page);
    await ask(page, "What medications is the patient taking?");

    const card = page.locator("[data-omnibox-plan-card]");
    await expect(card.locator("[data-omnibox-plan-clarification]")).toBeVisible();
    await expect(card).toContainText(/Choose or name the patient/i);
    await expect(card.locator("[data-omnibox-plan-answer]")).toHaveCount(0);
    await expect(card).toContainText(/Clinical context: not assembled/i);

    await page.screenshot({ path: `${SCREENSHOTS}/patient-required.png`, animations: "disabled" });
  });

  test("an unsupported request says so rather than showing an example", async ({ page }) => {
    await signInAndOpenHome(page);
    await ask(page, "zzqq mmnn vvbb");

    const card = page.locator("[data-omnibox-plan-card]");
    await expect(card.locator("[data-omnibox-plan-unanswered]")).toBeVisible();
    await expect(card).toContainText(/Could not be retrieved/i);
    await expect(card).toContainText(/no example was substituted/i);
    await expect(card.locator("[data-omnibox-plan-answer]")).toHaveCount(0);

    await page.screenshot({ path: `${SCREENSHOTS}/unsupported.png`, animations: "disabled" });
  });

  test("an unfinished template is refused before anything is looked up", async ({ page }) => {
    await signInAndOpenHome(page);

    // Clicking a chip fills the box without submitting, leaving the placeholder for
    // the clinician to replace.
    await page.getByRole("button", { name: /Open \[patient\]'s last encounter/ }).click();
    await expect(page.locator(".zen-pill-input")).toHaveValue("Open [patient]'s last encounter");

    // Submitting it anyway must not reach the server: a lookup for a patient named
    // "[patient]" would come back "not found", which reads as a fact about the chart.
    let planRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/ai/omnibox/plan")) planRequests += 1;
    });
    await page.locator(".zen-pill-input").press("Enter");

    const card = page.locator("[data-omnibox-plan-card]");
    await expect(card.locator("[data-omnibox-plan-error]")).toBeVisible();
    await expect(card).toContainText(/Replace \[patient\]/i);
    await expect(card).toContainText(/Nothing was looked up/i);
    expect(planRequests, "an unfinished template must not be sent").toBe(0);
  });

  test("the answer card is the same one the workspace omnibox renders", async ({ page }) => {
    await signInAndOpenHome(page);
    await ask(page, "What medications is Maya Chen taking?");
    const home = await page.locator("[data-omnibox-plan-card]").innerText();

    // Same question from the workspace omnibox, which routes through the bridge.
    await clinicalHomeTile(page).click();
    await expect(page.locator(".today-dashboard")).toBeVisible({ timeout: 20_000 });

    const workspaceOmnibox = page.getByLabel("Ask AI or search the EHR");
    await workspaceOmnibox.click();
    await workspaceOmnibox.fill("What medications is Maya Chen taking?");
    await workspaceOmnibox.press("Enter");

    const overlay = page.locator(".omnibox-plan-overlay [data-omnibox-plan-card]");
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    // Both carry the same answer and the same safety line; only the card's title
    // differs, because each surface names itself.
    for (const fragment of ["Patient: Maya Chen", "Clinical mutation: none", "Execution: not executed"]) {
      expect(home, `home card should state "${fragment}"`).toContain(fragment);
      await expect(overlay).toContainText(fragment);
    }
  });
});
