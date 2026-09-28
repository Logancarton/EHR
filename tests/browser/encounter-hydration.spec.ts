import { expect, test } from "@playwright/test";
import { bookVisitToday, signInWithDefaultLayout, type SyntheticVisitPatient } from "./workspace-fixtures";

/**
 * Review & Sign while the saved draft is still loading (CB-7, SAVE-06).
 *
 * A fresh browser has no local copy of Maya's draft, so until the server's copy is
 * read the editor holds a blank template. Pressing Review & Sign in that window
 * used to queue the blank template as an edit; hydration then kept it over the
 * server's draft and saved it as a second, empty draft for the same patient.
 */
test("Review & Sign waits for the saved draft and never saves the blank template", async ({ page }) => {
  const draftIds = async () => {
    const response = await page.request.get("/api/encounters?patientId=maya-chen", {
      headers: { "x-ehr-patient-id": "maya-chen" },
    });
    expect(response.ok()).toBeTruthy();
    const { encounters } = (await response.json()) as { encounters: Array<{ id: string; status: string }> };
    return encounters.filter((encounter) => encounter.status === "draft").map((encounter) => encounter.id).sort();
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInWithDefaultLayout(page, "Prototype provider");
  const draftsBefore = await draftIds();

  // Hold the chart's read of Maya's encounters open.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/api\/encounters\?patientId=maya-chen/, async (route) => {
    await held;
    await route.continue();
  });
  const encounterWrites: string[] = [];
  page.on("request", (sent) => {
    if (sent.method() === "POST" && new URL(sent.url()).pathname === "/api/encounters") {
      encounterWrites.push(sent.postData() || "");
    }
  });

  await page.locator(".browser-tab").filter({ hasText: "Maya Chen" }).click();
  await page
    .locator(".primary-workspace-pane .section-tabs")
    .getByRole("tab", { name: "Encounter", exact: true })
    .click();
  await expect(page.locator(".encounter-top-toolbar")).toBeVisible();

  const reviewAndSign = page.getByRole("button", { name: "Review & Sign", exact: true }).first();
  await expect(reviewAndSign, "signing waits for the saved draft").toBeDisabled();
  await expect(reviewAndSign).toHaveAttribute("title", "Loading the saved note…");
  // Pressing it anyway (keyboard or a scripted click) must not write anything.
  await reviewAndSign.dispatchEvent("click");
  await page.waitForTimeout(500);
  expect(encounterWrites, "nothing is saved while the draft is loading").toEqual([]);
  await expect(page.locator(".review-sign-modal")).toHaveCount(0);

  release();
  await expect(reviewAndSign, "signing is available once the draft has loaded").toBeEnabled();
  await reviewAndSign.click();
  await expect(page.locator(".review-sign-modal")).toBeVisible();
  await page.locator(".review-sign-modal .modal-close").click();

  expect(await draftIds(), "no second draft was created for Maya").toEqual(draftsBefore);
});

const DAVID: SyntheticVisitPatient = {
  patientId: "david-kim",
  patientName: "David Kim",
  dob: "12/05/1979",
  age: 46,
  mrn: "P-10889",
};

/**
 * A second visit started from the schedule gets its own note (CB-7, identity).
 *
 * The browser keeps a recovery copy of the last draft it edited for a patient. When
 * the clinician then presses Start on a different visit, that copy is another
 * visit's note: resuming it would sign the wrong visit closed. The new visit starts
 * its own draft, and the earlier one stays exactly as saved.
 */
test("Start on a second visit opens a new note and leaves the first visit's draft intact", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInWithDefaultLayout(page, "Prototype provider");
  const firstVisit = await bookVisitToday(page.request, DAVID);
  const secondVisit = await bookVisitToday(page.request, DAVID);

  const startFromRoster = async (appointmentId: string) => {
    await page.locator(".browser-tab").filter({ hasText: "Dashboard" }).first().click();
    const row = page.locator(`.roster-row[data-appointment-id="${appointmentId}"]`);
    await expect(row).toContainText("David Kim");
    await row.getByRole("button", { name: "Start", exact: true }).click();
    const workspace = page.locator(".primary-workspace-pane .encounter-workspace-root");
    await expect(workspace).toBeVisible();
    await expect(page.getByRole("button", { name: "Review & Sign", exact: true }).first()).toBeEnabled();
    return workspace;
  };
  const davidEncounters = async () => {
    const response = await page.request.get("/api/encounters?patientId=david-kim", {
      headers: { "x-ehr-patient-id": "david-kim" },
    });
    expect(response.ok()).toBeTruthy();
    return ((await response.json()) as {
      encounters: Array<{ id: string; status: string; appointmentId?: string; chiefComplaint?: string }>;
    }).encounters;
  };

  // Chart the first visit until the server holds it.
  let workspace = await startFromRoster(firstVisit);
  const firstEncounterId = await workspace.getAttribute("data-encounter-id");
  await workspace.getByRole("textbox", { name: "Chief Complaint", exact: true }).fill("First visit: sleep review.");
  await expect
    .poll(async () => (await davidEncounters()).find((encounter) => encounter.id === firstEncounterId))
    .toMatchObject({ status: "draft", appointmentId: firstVisit, chiefComplaint: "First visit: sleep review." });

  // Close the chart, then start the second visit.
  await page.getByRole("button", { name: "Close David Kim", exact: true }).click();
  workspace = await startFromRoster(secondVisit);
  await expect(workspace, "the second visit does not resume the first visit's note").not.toHaveAttribute(
    "data-encounter-id",
    firstEncounterId!,
  );
  await expect(workspace.getByRole("textbox", { name: "Chief Complaint", exact: true })).not.toContainText(
    "First visit",
  );

  // Charting the second visit links it to the second appointment only.
  const secondEncounterId = await workspace.getAttribute("data-encounter-id");
  await workspace.getByRole("textbox", { name: "Chief Complaint", exact: true }).fill("Second visit: medication check.");
  await expect
    .poll(async () => (await davidEncounters()).find((encounter) => encounter.id === secondEncounterId))
    .toMatchObject({ status: "draft", appointmentId: secondVisit, chiefComplaint: "Second visit: medication check." });
  expect(
    (await davidEncounters()).find((encounter) => encounter.id === firstEncounterId),
    "the first visit's draft is untouched",
  ).toMatchObject({ status: "draft", appointmentId: firstVisit, chiefComplaint: "First visit: sleep review." });
});
