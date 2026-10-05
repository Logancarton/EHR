import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * New-prescription safety: the composer must not hand the clinician a drug they
 * never chose, and staging a drug the patient already takes must say so.
 */

async function openNewPrescriptionForMaya(page: Page) {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();
  await page.locator('.companion-rail-btn[data-tool-id="medications"]').click();
  const panel = page.locator('[data-patient-record-tool="medications"]');
  await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
  await panel.getByRole("button", { name: "New prescription", exact: true }).click();
  const composer = page.locator(".order-cart-modal");
  await expect(composer).toBeVisible({ timeout: 20_000 });
  await expect(composer).toContainText("Maya Chen");
  return composer;
}

test("New prescription opens with no drug chosen and staging an existing medication surfaces it", async ({ page }) => {
  // Sign-in, a server-reviewed stage and a server delete in one scenario.
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const composer = await openNewPrescriptionForMaya(page);

  // The composer may open on the cart; the prescribe tab is the explicit path.
  await composer.getByRole("button", { name: /Prescribe Medication \(Rx\)/ }).click();

  await expect(composer.locator(".drug-chip[aria-pressed='true']")).toHaveCount(0);
  await expect(composer.getByTestId("rx-no-drug-selected")).toBeVisible();
  const stage = composer.getByRole("button", { name: /Stage Prescription to Cart/ });
  await expect(stage, "Stage is unavailable until a drug is chosen").toBeDisabled();
  await expect(composer.locator("#rx-stage-blocked-reason")).toContainText("Choose a medication");
  await page.screenshot({ animations: "disabled", path: "output/playwright/rx-safety-empty-composer.png" });

  // Choosing a drug fills its catalog defaults, but indication and pharmacy stay explicit.
  await composer.getByRole("button", { name: /Sertraline \(Zoloft\)/ }).click();
  await expect(composer.getByRole("button", { name: /Sertraline \(Zoloft\)/ })).toHaveAttribute("aria-pressed", "true");
  await expect(composer.locator(".pill-btn.active").filter({ hasText: "100 mg" })).toHaveCount(1);
  await expect(stage).toBeDisabled();
  await expect(composer.locator("#rx-stage-blocked-reason")).toContainText("indication");
  await expect(composer.locator("#rx-stage-blocked-reason")).toContainText("pharmacy");
  await expect(composer.getByLabel("Community Pharmacy")).toHaveValue("");

  await composer.getByLabel("Clinical Indication (ICD-10)").selectOption("Generalized anxiety disorder");
  await composer.getByLabel("Community Pharmacy").selectOption({ index: 1 });
  await expect(composer.locator("#rx-stage-blocked-reason")).toHaveCount(0);
  await expect(stage).toBeEnabled();
  await page.screenshot({ animations: "disabled", path: "output/playwright/rx-safety-ready-to-stage.png" });

  await stage.click();

  const card = composer.locator(".staged-order-card").filter({ hasText: "Sertraline 100 mg" }).last();
  await expect(card).toBeVisible({ timeout: 20_000 });
  const review = card.getByRole("region", { name: "Prescription intent review" });
  try {
    await expect(review.getByTestId("rx-existing-medication")).toContainText("Sertraline 100 mg daily");
    await expect(review).not.toContainText("may represent a new medication");
    await expect(review.locator(".prescription-review-grid dt").first()).toHaveText("Current medication truth");
    await expect(review.locator(".prescription-review-grid dd").first()).toHaveText("Sertraline 100 mg daily");
    // Label and value are separate rows, not one run-on line.
    const [labelBox, valueBox] = await Promise.all([
      review.locator(".prescription-review-grid dt").first().boundingBox(),
      review.locator(".prescription-review-grid dd").first().boundingBox(),
    ]);
    expect(labelBox && valueBox && valueBox.y >= labelBox.y + labelBox.height - 1).toBeTruthy();
    // Nothing is offered that would add a second Sertraline to the medication list.
    await expect(review.getByRole("button", { name: /Also add to medication list/ })).toHaveCount(0);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ animations: "disabled", path: "output/playwright/rx-safety-existing-medication-review.png" });
  } finally {
    // Remove the staged order through the cart's own control (server delete).
    const removeButtons = composer.locator(".staged-order-card").filter({ hasText: "Sertraline 100 mg" }).locator(".btn-remove-order");
    while (await removeButtons.count()) {
      const before = await removeButtons.count();
      await removeButtons.first().click();
      await expect(removeButtons).toHaveCount(before - 1, { timeout: 10_000 });
    }
  }

  // Reopening the composer starts empty again; nothing carries over from the staged drug.
  await composer.getByRole("button", { name: /Prescribe Medication \(Rx\)/ }).click();
  await expect(composer.locator(".drug-chip[aria-pressed='true']")).toHaveCount(0);
});
