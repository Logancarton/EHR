import { expect, test, type Page } from "@playwright/test";
import { resetWorkspaceLayout, signInDevelopmentUser } from "./workspace-fixtures";

/**
 * The patient administrative record (roadmap phase P2-G).
 *
 * What matters here is that a staff member can maintain the record a practice runs
 * on without touching the database, and that the editor never claims a save the
 * server did not make.
 */

async function openDrawer(page: Page) {
  await page.setViewportSize({ width: 1500, height: 940 });
  await signInDevelopmentUser(page, "Prototype provider");
  await resetWorkspaceLayout(page, ["maya-chen"]);
  await page.locator(".browser-tab").filter({ hasText: "Maya Chen" }).click();
  await page.getByRole("button", { name: "Patient info" }).click();
  const drawer = page.locator(".patient-info-drawer");
  await expect(drawer).toBeVisible();
  return drawer;
}

test.describe("patient administrative record", () => {
  test("a related person is added with their own disclosure scope, and retired without being erased", async ({ page }) => {
    const drawer = await openDrawer(page);

    await drawer.getByRole("button", { name: "Related people" }).click();
    await drawer.getByRole("button", { name: "Add related person" }).click();

    const form = drawer.locator(".patient-info-inline-form");
    const submit = form.getByRole("button", { name: "Add person" });
    await expect(submit, "a nameless contact cannot be saved").toBeDisabled();
    await expect(submit).toHaveAttribute("title", "Enter a name first.");

    await form.locator("input").first().fill("Priya Raman");
    await form.locator("select").first().selectOption("guardian");
    await form.locator("select").nth(1).selectOption("scheduling");
    await expect(submit).toBeEnabled();
    await submit.click();

    const row = drawer.locator(".patient-info-list li").filter({ hasText: "Priya Raman" });
    await expect(row).toBeVisible();
    await expect(
      row,
      "the disclosure scope travels with the person, not with their role",
    ).toContainText("Scheduling only");
    await expect(drawer.locator(".ui-save-state")).toContainText("Saved");

    // Retiring removes them from the active list; the record of the authorisation
    // itself is kept server-side rather than deleted.
    await row.getByRole("button", { name: "Retire" }).click();
    await expect(row).toHaveCount(0);
  });

  test("identity edits persist and the chart follows them", async ({ page }) => {
    const drawer = await openDrawer(page);

    const preferred = drawer.getByLabel("Preferred name");
    await preferred.fill("May");
    await drawer.getByRole("button", { name: "Save identity" }).click();
    await expect(drawer.locator(".ui-save-state")).toContainText("Saved");

    // The server is the authority: a reload has to show the same thing.
    await page.reload();
    await page.locator(".browser-tab").filter({ hasText: "Maya Chen" }).click();
    await page.getByRole("button", { name: "Patient info" }).click();
    await expect(page.getByLabel("Preferred name")).toHaveValue("May");
  });

  test("a save the server rejects is reported, not silently swallowed", async ({ page }) => {
    const drawer = await openDrawer(page);

    await page.route("**/api/patients/maya-chen", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: "MRN P-10482 already belongs to another patient." }),
      });
    });

    await drawer.getByLabel("Preferred name").fill("Rejected");
    await drawer.getByRole("button", { name: "Save identity" }).click();

    await expect(drawer.locator(".ui-save-state")).toContainText("Save failed");
    await expect(
      drawer.locator(".ui-state-error"),
      "the reason stays on screen rather than fading out of a toast",
    ).toContainText("already belongs to another patient");
  });

  test("the drawer closes on Escape and leaves the chart where it was", async ({ page }) => {
    const drawer = await openDrawer(page);
    await expect(page.locator(".primary-workspace-pane .patient-header h1")).toHaveText("Maya Chen");

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(
      page.locator(".primary-workspace-pane .patient-header h1"),
      "administrative work happens beside the chart, not instead of it",
    ).toHaveText("Maya Chen");
  });
});

/**
 * These specs share one database, and coverage and pharmacies accumulate across runs.
 * Each test establishes its own starting point rather than assuming an empty chart —
 * the same reasoning as `resetWorkspaceLayout`, applied to clinical rows.
 */
async function clearCoverageAndPharmacies(page: Page, patientId = "maya-chen") {
  const response = await page.request.get(`/api/patients/${patientId}/administration`, {
    headers: { "x-ehr-patient-id": patientId },
  });
  if (!response.ok()) return;
  const { record } = await response.json();

  for (const policy of record?.coverage ?? []) {
    if (policy.status !== "active") continue;
    await page.request.post(`/api/patients/${patientId}/administration`, {
      headers: { "x-ehr-patient-id": patientId },
      data: { kind: "coverage", recordId: policy.id, values: { status: "inactive" } },
    });
  }
  for (const pharmacy of record?.pharmacies ?? []) {
    await page.request.post(`/api/patients/${patientId}/administration`, {
      headers: { "x-ehr-patient-id": patientId },
      data: { kind: "pharmacy", recordId: pharmacy.pharmacyId, values: { status: "inactive" } },
    });
  }
}

test.describe("coverage and pharmacy", () => {
  test("billing order is an explicit choice, and a terminated policy stays readable", async ({ page }) => {
    await openDrawer(page);
    await clearCoverageAndPharmacies(page);
    const drawer = await openDrawer(page);
    await drawer.getByRole("button", { name: "Coverage" }).click();

    await drawer.getByRole("button", { name: "Add coverage" }).click();
    const form = drawer.locator(".patient-info-inline-form");
    const submit = form.getByRole("button", { name: "Add coverage" });
    await expect(submit, "an unnamed payer cannot be saved as insurance").toBeDisabled();
    await expect(submit).toHaveAttribute("title", "Enter a payer, or mark this self-pay.");

    // Terminated policies stay on the record by design, so runs accumulate rows. A
    // payer unique to this run is what makes the assertion about *this* policy.
    const payer = `Blue Shield ${Date.now()}`;
    await form.getByLabel("Payer", { exact: true }).fill(payer);
    await form.getByLabel("Member ID").fill("BS-1");
    await expect(submit).toBeEnabled();
    await submit.click();

    const row = drawer.locator(".patient-info-list li").filter({ hasText: payer });
    await expect(row).toContainText("Primary");

    await row.getByRole("button", { name: "Terminate" }).click();
    await expect(
      drawer.locator(".patient-info-list li").filter({ hasText: payer }),
      "a claim filed against this policy last month still has to be reconstructable",
    ).toContainText("terminated");
  });

  test("self-pay is recorded as a coverage state rather than an empty list", async ({ page }) => {
    const drawer = await openDrawer(page);
    await drawer.getByRole("button", { name: "Coverage" }).click();
    await drawer.getByRole("button", { name: "Add coverage" }).click();

    const form = drawer.locator(".patient-info-inline-form");
    await form.getByRole("button", { name: "Self-pay" }).click();
    await expect(
      form.getByLabel("Payer", { exact: true }),
      "a self-pay record needs no payer typed in to be meaningful",
    ).toHaveCount(0);

    await form.getByRole("button", { name: "Add coverage" }).click();
    await expect(
      drawer.locator(".patient-info-list li").filter({ hasText: "Self-pay" }).first(),
    ).toBeVisible();
  });

  test("promoting an alternate pharmacy demotes the incumbent", async ({ page }) => {
    await openDrawer(page);
    await clearCoverageAndPharmacies(page);
    const drawer = await openDrawer(page);
    await drawer.getByRole("button", { name: "Pharmacy" }).click();

    for (const name of ["Market St Pharmacy", "Mail Order Rx"]) {
      await drawer.getByRole("button", { name: "Add pharmacy" }).click();
      const form = drawer.locator(".patient-info-inline-form");
      await form.getByLabel("Pharmacy name").fill(name);
      await form.getByRole("button", { name: "Add pharmacy" }).click();
      await expect(drawer.locator(".patient-info-list li").filter({ hasText: name })).toBeVisible();
    }

    const first = drawer.locator(".patient-info-list li").filter({ hasText: "Market St Pharmacy" });
    const second = drawer.locator(".patient-info-list li").filter({ hasText: "Mail Order Rx" });
    await expect(first).toContainText("Preferred");

    await second.getByRole("button", { name: "Make preferred" }).click();

    await expect(second, "the promoted pharmacy becomes the prescribing destination").toContainText("Preferred");
    await expect(
      first,
      "and the incumbent is demoted in the same action, so there is never more than one",
    ).not.toContainText("Preferred");
  });
});
