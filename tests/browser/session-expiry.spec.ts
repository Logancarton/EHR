import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * What the workspace does when the session ends underneath it.
 *
 * The defect: the dashboard rendered "Authentication required: session is invalid
 * or expired." inside a shell that still looked signed in, and the one path that
 * did notice — the focus re-check — responded by unmounting the workspace, which
 * would have taken any unsaved note with it.
 *
 * Both halves are asserted here, because the fix is only correct if it does the
 * second thing as well as the first: challenge, *and* keep the work.
 */


/**
 * Ends the session the way it ends in life.
 *
 * Deliberately not `clearCookies()`. With no cookie at all, `getProviderContext`
 * falls back to a development provider on the routes that allow one, so half the
 * workspace keeps working and the scenario is not the one under test. A cookie that
 * is presented and does not verify is what produces "session is invalid or expired."
 */
async function expireSession(page: Page) {
  await page.context().clearCookies();
  const hostname = new URL(page.url()).hostname;
  await page.context().addCookies([
    {
      name: "ehr_session",
      value: "expired.invalid-signature",
      domain: hostname,
      path: "/",
    },
  ]);
}

test.describe("an expired session", () => {
  test.beforeEach(async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
  });

  test("challenges over the workspace instead of unmounting it", async ({ page }) => {
    await expect(page.locator(".today-dashboard")).toBeVisible();
    await expect(page.locator(".auth-challenge")).toHaveCount(0);

    // The session goes away as it does in life: the cookie stops being presented,
    // and the next thing the clinician does is refused. A refused *write* is the
    // case with the most at stake, so that is the one driven here. It has to be the
    // workspace's own request — a raw `fetch` from the test bypasses the client
    // that reports the refusal, which is the mechanism under test.
    await expireSession(page);
    await page.locator(".roster-row .frontdesk-btn").first().click();

    const challenge = page.locator(".auth-challenge");
    await expect(challenge).toBeVisible({ timeout: 10_000 });
    await expect(challenge).toContainText("Your session expired");

    // The whole point: the workspace is still there, and still holds its charts.
    await expect(page.locator(".today-dashboard")).toBeAttached();
    await expect(page.locator(".app-shell")).toBeAttached();
    await expect(page.locator(".authenticated-app")).toHaveAttribute("data-session-expired", "true");

    // And it cannot be operated behind the challenge — the permissions that drew
    // those controls are the ones that just lapsed.
    await expect(page.locator(".authenticated-app")).toHaveAttribute("inert", "");

    // The refused write did not leave a row looking saved.
    await expect(page.locator(".roster-row[data-save-status='saved']")).toHaveCount(0);
  });

  test("signing back in clears the challenge and leaves the workspace where it was", async ({ page }) => {
    await expect(page.locator(".today-dashboard")).toBeVisible();

    await expireSession(page);
    await page.locator(".roster-row .frontdesk-btn").first().click();
    await expect(page.locator(".auth-challenge")).toBeVisible({ timeout: 10_000 });

    await page
      .locator(".auth-challenge")
      .getByRole("button", { name: /Sign back in as/ })
      .click();

    await expect(page.locator(".auth-challenge")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator(".authenticated-app")).not.toHaveAttribute("data-session-expired", "true");
    await expect(page.locator(".today-dashboard")).toBeVisible();
  });

  test("a burst of refused requests asks the server once", async ({ page }) => {
    await expect(page.locator(".today-dashboard")).toBeVisible();

    // Count the re-verifications, because that is the property: the coalescing is
    // about not asking the server once per refused surface. The overlay is a single
    // boolean, so counting overlays would prove nothing.
    const verifications: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/auth/me")) verifications.push(request.url());
    });

    // One click refuses several things at once: the appointment write and the
    // workspace autosave that follows it are separate requests to separate routes.
    await expireSession(page);
    await page.locator(".roster-row .frontdesk-btn").first().click();

    await expect(page.locator(".auth-challenge")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1_200);

    expect(verifications.length, "an expiry is one question to the server, not one per surface").toBe(1);
  });

  test("a focus re-check that finds no session keeps the workspace too", async ({ page }) => {
    await expect(page.locator(".today-dashboard")).toBeVisible();

    // This is the path that used to drop straight back to the sign-in page,
    // unmounting every open chart and any unsaved note with them.
    await expireSession(page);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));

    await expect(page.locator(".auth-challenge")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".today-dashboard")).toBeAttached();
  });

  test("explicit switch account discards the workspace safely and returns to sign-in", async ({ page }) => {
    await expect(page.locator(".today-dashboard")).toBeVisible();

    await expireSession(page);
    await page.locator(".roster-row .frontdesk-btn").first().click();
    await expect(page.locator(".auth-challenge")).toBeVisible({ timeout: 10_000 });

    await page
      .locator(".auth-challenge")
      .getByRole("button", { name: "Switch account (discards workspace)" })
      .click();

    // Workspace is cleanly unmounted and sign-in card appears
    await expect(page.locator(".auth-challenge")).toHaveCount(0);
    await expect(page.locator(".today-dashboard")).toHaveCount(0);
    await expect(page.locator(".auth-card")).toBeVisible();
  });
});

