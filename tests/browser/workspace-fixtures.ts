import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { practiceToday } from "../../app/lib/practice-calendar";

/**
 * Shared browser fixtures.
 *
 * The three specs share one server and one database, and clinician preferences are
 * durable by design — hiding a dashboard section or collapsing a card survives a
 * reload. That is the product behaviour, so a test that assumed the default layout
 * would depend on whatever the previous run (or a developer's browser session) left
 * behind. Signing in therefore also restores the default workspace.
 */

export async function signInDevelopmentUser(
  page: Page,
  buttonName: string,
  { waitForWorkspaceRestore = true }: { waitForWorkspaceRestore?: boolean } = {},
) {
  await page.context().clearCookies();
  await page.goto("/");
  await page.locator(".auth-checking").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
  const developmentLogin = page.getByRole("button", { name: buttonName, exact: true });
  await expect(developmentLogin).toBeVisible({ timeout: 15_000 });
  await developmentLogin.click();
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-ehr-role", "provider", { timeout: 15_000 });
  await expect(page.locator(".app-shell")).toBeVisible({ timeout: 15_000 });
  if (waitForWorkspaceRestore) {
    await expect(page.locator(".authenticated-app")).toHaveAttribute("data-workspace-restored", "true", { timeout: 15_000 });
  }
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
    // The rail-pin hook deliberately migrates a non-default local cache back to the
    // server when the server still has defaults. A browser test that promises the
    // default layout must clear that cache too, otherwise a prior test can silently
    // repopulate stale rail pins after this helper resets the server preferences.
    await page.evaluate(() => window.localStorage.clear()).catch(() => {});

    // Tear the live page down before writing. The loaded workspace autosaves on a
    // debounce, so a save capturing the pre-reset DOM could land after the reset and
    // win — leaving the reload to restore exactly the state being reset away from.
    // A blank page has no timers to race with.
    await page.goto("about:blank");

    const preferencesResponse = await page.request.put("/api/preferences", {
      data: { preferences: defaultPreferences },
    });
    expect(preferencesResponse.ok(), "resetting clinician layout preferences should succeed").toBeTruthy();

    // The pinned rails belong to their own endpoint and are deliberately not writable
    // through the whole-record PUT above (UI-8b) — that protection is what stops a
    // stale display-preferences write from undoing a clinician's unpin. So a helper
    // that promises the default starting point has to reset them where they live,
    // which is exactly what the product's own "Reset defaults" does.
    const railsResponse = await page.request.put("/api/preferences/rails", {
      data: {
        left: defaultPreferences.rails.left,
        right: defaultPreferences.rails.right,
      },
    });
    expect(railsResponse.ok(), "resetting the clinician's pinned rails should succeed").toBeTruthy();

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
    // Today can settle before the requested patient tabs restore. The helper
    // must establish the whole workspace it promises, including those tabs.
    const tabsRestored = settled && await expect(page.locator(".browser-tab[data-workspace-tab='patient']"))
      .toHaveCount(dockedPatientIds.length, { timeout: 7_500 })
      .then(() => true).catch(() => false);
    if (tabsRestored && await panes.count() === 0) return;
  }

  await expect(page.locator(".browser-tab[data-workspace-tab='patient']"), "requested patient tabs should restore").toHaveCount(dockedPatientIds.length);
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
  // A previous test can leave a saved workspace that is slow or impossible to
  // restore. Waiting for that stale state before resetting it lets one failure poison
  // every later spec. Authenticate only far enough to make the reset endpoints
  // available, tear the live page down inside resetWorkspaceLayout, then reload and
  // wait for the known-clean workspace there.
  await signInDevelopmentUser(page, buttonName, { waitForWorkspaceRestore: false });
  await resetWorkspaceLayout(page, dockedPatientIds);
}

/** Enter the primary pane through its visible section owner, then wait for
 * saved-note hydration before a test edits it. Detached panes retain their own
 * section tabs; this helper deliberately does not reach into those panes.
 */
export async function selectPrimaryPatientSection(page: Page, section: "Overview" | "Encounter") {
  const pane = page.locator(".primary-workspace-pane");
  const control = pane.locator(".patient-header-actions").getByRole("button", { name: section, exact: true });
  await control.click();
  await expect(control).toHaveAttribute("aria-pressed", "true");
  if (section === "Encounter") {
    await expect(pane.locator(".encounter-top-toolbar").getByRole("button", { name: "Review & Sign", exact: true })).toBeEnabled();
  }
}

/**
 * The Home launcher tile that leads back into the clinical workspace.
 *
 * It was labelled "EHR" until UI-2 made Home present the three major suite
 * entities, at which point it became **Clinical** and every spec still naming
 * "EHR" started waiting for a button that no longer exists. Addressing it by
 * `data-workspace-id` rather than by label keeps that rename from breaking these
 * specs again, and keeps `getByRole("button", { name: "Clinical" })` from also
 * matching the top bar's Clinical group, which is on screen at the same time.
 */
export function clinicalHomeTile(page: Page) {
  return page.locator('.zen-shortcut-item[data-workspace-id="clinical"]');
}

/**
 * Opens a major workspace through the `+` Open workspace launcher.
 *
 * Until UI-8 most specs reached Calendar or Intake by clicking the top bar's work
 * navigation, because it was the shortest route on screen rather than because it was
 * the route under test. That row is gone: the tab strip, its `+` launcher and the
 * omnibox are the destinations' only routes now, so the specs that were only passing
 * through take the durable one. Specs that *are* testing a route keep addressing it
 * directly rather than calling this.
 *
 * Singletons focus their existing tab instead of duplicating it, so this is safe to
 * call for a destination that is already open.
 */
export async function openWorkspaceFromLauncher(
  page: Page,
  destination:
    | "home"
    | "dashboard"
    | "calendar"
    | "patients"
    | "intake"
    | "documents"
    | "labs"
    | "hr"
    | "billing"
    | "brand",
) {
  const launcher = page.locator("[data-workspace-control='open-workspace-launcher']");
  await expect(launcher).toBeVisible();
  await launcher.click();

  const popover = page.getByTestId("open-workspace-launcher-popover");
  await expect(popover).toBeVisible();
  await popover.locator(`.open-workspace-item[data-workspace-id="${destination}"]`).click();
  await expect(popover).toHaveCount(0);
}

export type SyntheticVisitPatient = {
  patientId: string;
  patientName: string;
  dob: string;
  age: number;
  mrn: string;
};

/**
 * Book a visit on the practice's today through the ordinary appointments API and
 * return its id, for specs that start a visit from the roster.
 *
 * The demo clinic day is placed relative to the day the suite's database was first
 * seeded, so a seeded "today" visit is gone on any later day. The server refuses a
 * booking that overlaps another visit and earlier runs leave theirs behind, so this
 * walks back through late-evening 15-minute slots until one is free. Any refusal
 * other than a schedule conflict fails the test.
 */
export async function bookVisitToday(request: APIRequestContext, patient: SyntheticVisitPatient): Promise<string> {
  for (let slot = 0; slot < 40; slot += 1) {
    const minutes = 23 * 60 + 45 - slot * 15;
    const hour = Math.floor(minutes / 60);
    const clock = `${String(((hour + 11) % 12) + 1).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const booked = await request.post("/api/appointments", {
      headers: { "Content-Type": "application/json", "x-ehr-patient-id": patient.patientId },
      data: {
        ...patient,
        date: practiceToday(),
        time: `${clock} ${hour < 12 ? "AM" : "PM"}`,
        duration: "15 min",
        type: "30-min Med Check",
        status: "waiting",
        chiefComplaint: "Synthetic visit browser fixture",
        room: "Telehealth Room A",
      },
    });
    const body = await booked.json();
    if (booked.ok()) return body.appointment.id as string;
    expect(String(body.error), "only a schedule conflict may refuse the fixture").toMatch(/Schedule conflict/);
  }
  throw new Error("No free evening slot left today for a synthetic visit.");
}

/**
 * Opens a companion tool the way a clinician reaches it: its rail button when the
 * tool is pinned, otherwise the rail's labelled "More companion tools" menu. The
 * default rail pins only the high-frequency tools, so specs that address an
 * unpinned tool's rail button directly wait for a control that is not there.
 */
export async function openCompanionTool(page: Page, label: string) {
  await expect(page.locator(".companion-rail-btn").first()).toBeVisible({ timeout: 15_000 });
  const pinned = page.locator(`.companion-rail-btn[aria-label='${label}']`).first();
  if (await pinned.count()) {
    await pinned.click();
    return;
  }
  await page.getByRole("button", { name: "More companion tools", exact: true }).click();
  await page.locator(".companion-add-menu").getByRole("button", { name: `Open ${label}`, exact: true }).click();
}
