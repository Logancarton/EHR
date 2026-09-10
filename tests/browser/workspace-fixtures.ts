import { expect, type Page } from "@playwright/test";

/**
 * Shared browser fixtures.
 *
 * The three specs share one server and one database, and clinician preferences are
 * durable by design — hiding a dashboard section or collapsing a card survives a
 * reload. That is the product behaviour, so a test that assumed the default layout
 * would depend on whatever the previous run (or a developer's browser session) left
 * behind. Signing in therefore also restores the default workspace.
 */

export async function signInDevelopmentUser(page: Page, buttonName: string) {
  await page.context().clearCookies();
  await page.goto("/");
  await page.locator(".auth-checking").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
  const developmentLogin = page.getByRole("button", { name: buttonName, exact: true });
  await expect(developmentLogin).toBeVisible({ timeout: 15_000 });
  await developmentLogin.click();
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-ehr-role", "provider", { timeout: 15_000 });
  await expect(page.locator(".app-shell")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-workspace-restored", "true", { timeout: 15_000 });
}

export async function waitForAuthenticatedShell(page: Page) {
  await page.locator(".auth-checking").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
  await expect(page.locator(".app-shell")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-workspace-restored", "true", { timeout: 15_000 });
}

export const DEFAULT_DOCKED_PATIENT_IDS = ["maya-chen", "jordan-reed"] as const;

/**
 * Restores the signed-in clinician's default starting point: every dashboard section
 * shown and expanded, two docked charts, nothing floating, and Today in front.
 *
 * Both halves matter. Preferences decide which sections exist; workspace state
 * decides which view and charts are restored. A test that reset only one of them
 * would still inherit the other from whatever ran before it.
 *
 * The workspace autosaves, so a save queued by the loaded page can land after the
 * reset. Re-applying until the reload comes back clean makes the starting state
 * deterministic rather than dependent on that timing.
 */
export async function resetWorkspaceLayout(
  page: Page,
  dockedPatientIds: readonly string[] = DEFAULT_DOCKED_PATIENT_IDS,
) {
  const { defaultPreferences } = await import("../../app/lib/preference-engine");
  const panes = page.locator(".detached-patient-pane");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    // Tear the live page down before writing. The loaded workspace autosaves on a
    // debounce, so a save capturing the pre-reset DOM could land after the reset and
    // win — leaving the reload to restore exactly the state being reset away from.
    // A blank page has no timers to race with.
    await page.goto("about:blank");

    const preferencesResponse = await page.request.put("/api/preferences", {
      data: { preferences: defaultPreferences },
    });
    expect(preferencesResponse.ok(), "resetting clinician layout preferences should succeed").toBeTruthy();

    const stateResponse = await page.request.put("/api/workspace-state", {
      data: {
        state: {
          activeView: "today",
          dockedPatientIds,
          detachedPatientIds: [],
          activePatientId: dockedPatientIds[0],
        },
      },
    });
    expect(stateResponse.ok(), "resetting workspace state should succeed").toBeTruthy();

    // Confirm the write survived before relying on it.
    const storedState = await page.request.get("/api/workspace-state");
    expect(storedState.ok()).toBeTruthy();
    const stored = await storedState.json();
    if (stored?.state?.activeView !== "today") continue;

    await page.goto("/");
    await waitForAuthenticatedShell(page);

    // Verify the state this helper promises rather than assuming the write took.
    // A save queued before the reset can land after it, and a late restore can flip
    // the view back, so the check is on what is actually on screen.
    //
    // The budget is generous on purpose: this is establishing a precondition, not
    // measuring the product. The first navigation of a run hits a cold dev server
    // that still has to compile the route, which the default expect timeout of a
    // few seconds does not cover.
    const settled = await page.locator(".today-dashboard")
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (settled && await panes.count() === 0) return;
  }

  await expect(panes, "the workspace should reset with no floating charts").toHaveCount(0);
  await expect(
    page.locator(".today-dashboard"),
    "the workspace should reset to the Today dashboard",
  ).toBeVisible();
}

export async function signInWithDefaultLayout(
  page: Page,
  buttonName: string,
  dockedPatientIds?: readonly string[],
) {
  await signInDevelopmentUser(page, buttonName);
  await resetWorkspaceLayout(page, dockedPatientIds);
}
