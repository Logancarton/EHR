import { expect, test, type Page } from "@playwright/test";
import { resetWorkspaceLayout, signInDevelopmentUser, waitForAuthenticatedShell } from "./workspace-fixtures";

/**
 * The workspace runs on the authenticated roster, not on patients compiled into the
 * client. These tests change what the roster route answers and check that the shell
 * follows it: a chart that is not on the roster cannot be searched for or restored,
 * and an empty roster lands the clinician on Today rather than on a blank chart.
 */

function omnibox(page: Page) {
  return page.getByRole("textbox", { name: "Ask AI or search the EHR" });
}

function patientResults(page: Page) {
  return page.locator(".search-results button:has(.avatar.small)");
}

/** Replaces the roster route for the rest of the test, before the page loads it. */
async function serveRoster(page: Page, patients: unknown[]) {
  await page.route("**/api/patients", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, patients }),
    });
  });
}

const SOLE_ROSTER_PATIENT = {
  id: "maya-chen",
  name: "Maya Chen",
  initials: "MC",
  dob: "04/18/1992",
  age: 34,
  pronouns: "she/her",
  mrn: "P-10482",
  status: "Established",
  allergies: [],
  diagnoses: ["Generalized anxiety disorder"],
  meds: [],
  vitals: {},
  lastVisit: "Aug 12, 2026",
  nextVisit: "Sep 9, 2026 · 10:30 AM",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

test.describe("authoritative patient roster", () => {
  test("omnibox search offers only the charts the backend roster returned", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await signInDevelopmentUser(page, "Prototype provider");
    await resetWorkspaceLayout(page, []);

    // The backend narrows this clinician to one chart. Jordan Reed is still in the
    // seed fixtures the client bundle was built from.
    await serveRoster(page, [SOLE_ROSTER_PATIENT]);
    await page.reload();
    await waitForAuthenticatedShell(page);

    await omnibox(page).fill("Maya");
    await expect(patientResults(page).filter({ hasText: "Maya Chen" })).toBeVisible();

    await omnibox(page).fill("Jordan");
    await expect(
      patientResults(page).filter({ hasText: "Jordan Reed" }),
      "a patient outside the authoritative roster is not offered, even though the bundle has the fixture",
    ).toHaveCount(0);

    await omnibox(page).fill("Maya");
    await patientResults(page).filter({ hasText: "Maya Chen" }).first().click();
    await expect(page.locator(".primary-workspace-pane .patient-header h1")).toHaveText("Maya Chen");
    await expect(
      page.locator(".primary-workspace-pane .patient-header"),
      "the opened chart carries the identifiers the roster route returned",
    ).toContainText("P-10482");
  });

  test("a saved tab for a chart outside the roster is discarded rather than restored", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await signInDevelopmentUser(page, "Prototype provider");
    await resetWorkspaceLayout(page, []);

    // The loaded workspace autosaves on a debounce, so the saved state is written
    // against a blank page — otherwise the running page overwrites it before reload.
    await page.goto("about:blank");

    // A workspace saved while the clinician still had access to a chart that has
    // since moved out of reach.
    const saved = await page.request.put("/api/workspace-state", {
      data: {
        state: {
          activeView: "patient",
          dockedPatientIds: ["maya-chen", "transferred-patient"],
          detachedPatientIds: [],
          activePatientId: "transferred-patient",
        },
      },
    });
    expect(saved.ok()).toBeTruthy();

    await serveRoster(page, [SOLE_ROSTER_PATIENT]);
    await page.goto("/");
    await waitForAuthenticatedShell(page);

    await expect(page.locator(".browser-tab")).toHaveCount(1);
    await expect(page.locator(".browser-tab")).toContainText("Maya Chen");
    await expect(
      page.locator(".primary-workspace-pane .patient-header h1"),
      "the reachable chart is restored and the unreachable one is dropped",
    ).toHaveText("Maya Chen");
  });

  test("an empty roster lands on Today instead of a blank chart", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await signInDevelopmentUser(page, "Prototype provider");
    await resetWorkspaceLayout(page, []);

    await page.goto("about:blank");

    const saved = await page.request.put("/api/workspace-state", {
      data: {
        state: {
          activeView: "patient",
          dockedPatientIds: ["maya-chen"],
          detachedPatientIds: [],
          activePatientId: "maya-chen",
        },
      },
    });
    expect(saved.ok()).toBeTruthy();

    await serveRoster(page, []);
    await page.goto("/");
    await waitForAuthenticatedShell(page);

    await expect(page.locator(".browser-tab")).toHaveCount(0);
    await expect(
      page.locator(".today-dashboard"),
      "with no accessible chart the workspace opens on Today rather than inventing a patient",
    ).toBeVisible();
    await expect(page.locator(".primary-workspace-pane .patient-header")).toHaveCount(0);

    await omnibox(page).fill("Maya");
    await expect(patientResults(page)).toHaveCount(0);
  });
});
