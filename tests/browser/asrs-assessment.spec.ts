import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * The full ASRS v1.1 clinician path.
 *
 * Unit coverage protects the Part A scoring thresholds and repository validation.
 * This browser test protects the workflow around them: the 18-item Part A + Part B
 * instrument must actually be reachable, incomplete administrations must not be
 * saveable, and a completed administration must persist through the same clinical
 * record API used by the rest of the chart.
 */
test("ASRS v1.1 completes all 18 items and persists from the patient rating-scales workflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInWithDefaultLayout(page, "Prototype provider");

  const mayaTab = page
    .locator(".browser-tab[data-workspace-tab='patient']")
    .filter({ hasText: "Maya Chen" });
  await expect(mayaTab).toBeVisible();
  await mayaTab.click();

  await expect(page.locator(".patient-overview")).toBeVisible({ timeout: 20_000 }).catch(async () => {
    await expect(page.getByText("Rating Scales", { exact: true })).toBeVisible({ timeout: 20_000 });
  });

  await page.getByRole("button", { name: "Scales →", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "ASRS v1.1 (Adult ADHD)", exact: true }).click();

  await expect(dialog.getByText("Part A — Screener", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Part B — Additional symptoms", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/0\/18 questions answered/)).toBeVisible();

  const questionCards = dialog.locator("form").locator("div").filter({
    has: page.locator("button", { hasText: "Very Often" }),
  });
  // Use the numbered question blocks directly: each ASRS item exposes exactly one
  // "4 · Very Often" choice, and there must be eighteen of them.
  const veryOftenChoices = dialog.getByRole("button", { name: "4 · Very Often", exact: true });
  await expect(veryOftenChoices).toHaveCount(18);

  const saveButton = dialog.getByRole("button", { name: "Save to Medical Record", exact: true });
  await expect(saveButton).toBeDisabled();

  for (let index = 0; index < 18; index += 1) {
    await veryOftenChoices.nth(index).click();
  }

  await expect(dialog.getByText(/18\/18 questions answered/)).toBeVisible();
  await expect(saveButton).toBeEnabled();
  await expect(dialog.getByText("Positive ADHD Screen", { exact: true })).toBeVisible();

  const saveResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/clinical-records") &&
      response.request().method() === "POST" &&
      response.ok(),
  );

  await saveButton.click();
  const saveResponse = await saveResponsePromise;
  const saveBody = await saveResponse.json();

  expect(saveBody.success).toBe(true);
  expect(saveBody.result.instrument).toBe("asrs-v1.1");
  expect(saveBody.result.instrumentVersion).toBe("1.1");
  expect(saveBody.result.totalScore).toBe(72);
  expect(saveBody.result.maxScore).toBe(72);
  expect(saveBody.result.severity).toBe("Positive ADHD Screen");
  expect(Object.keys(saveBody.result.responses)).toHaveLength(18);

  await expect(
    dialog.getByText("Longitudinal Assessment Trajectory (1 administrations)", { exact: true }),
  ).toBeVisible().catch(async () => {
    await expect(dialog.getByText(/Longitudinal Assessment Trajectory \(\d+ administrations\)/)).toBeVisible();
  });

  const snapshotResponse = await page.request.get("/api/clinical-records?patientId=maya-chen", {
    headers: { "x-ehr-patient-id": "maya-chen" },
  });
  expect(snapshotResponse.ok()).toBeTruthy();
  const snapshot = await snapshotResponse.json();
  const persisted = snapshot.record.assessments.find(
    (assessment: Record<string, unknown>) => assessment.id === saveBody.result.id,
  );

  expect(persisted).toBeTruthy();
  expect(persisted.instrument).toBe("asrs-v1.1");
  expect(persisted.instrumentVersion).toBe("1.1");
  expect(persisted.totalScore).toBe(72);
  expect(Object.keys(persisted.responses)).toHaveLength(18);

  // Silence the unused locator guard while keeping the selector shape documented for
  // future per-question assertions.
  void questionCards;
});
