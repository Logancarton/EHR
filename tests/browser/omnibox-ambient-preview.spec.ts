import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test.describe("Omnibox ambient clinical answers", () => {
  test("answers a medication question inline before offering navigation", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const input = page.getByLabel("Ask AI or search the EHR");
    await input.click();

    const requestPromise = page.waitForRequest(
      (request) =>
        request.url().includes("/api/ai/omnibox/plan")
        && request.method() === "POST",
      { timeout: 15_000 },
    );

    await input.fill("What medications is Maya Chen taking?");
    const request = await requestPromise;
    expect(request.postDataJSON().query).toBe("What medications is Maya Chen taking?");

    const preview = page.locator('[data-omnibox-ambient-preview="medications"]');
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText("Maya Chen — Active Medications (2)");
    await expect(preview).toContainText("Sertraline 100 mg daily");
    await expect(preview).toContainText("Guanfacine ER 2 mg nightly");
    await expect(preview.locator('[data-omnibox-provenance="true"]')).toHaveCount(2);

    // The old router-first row is intentionally absent for informational questions.
    await expect(page.locator(".ai-command-result")).toHaveCount(0);
    await expect(preview.getByRole("button", { name: "Stage Refill…" })).toBeVisible();
    await expect(preview.getByRole("button", { name: "Review Monitoring" })).toBeVisible();

    await preview.getByRole("button", { name: "Open medications" }).click();
    // The chart's section tabs were retired (D-116); the chart tab records which
    // view is in front, and the Medications view must be what the pane shows.
    await expect(page.locator(".browser-tab.active")).toHaveAttribute("data-patient-section", "Meds", { timeout: 15_000 });
    await expect(page.locator(".primary-workspace-pane")).toContainText("Current medications");
    await expect(page.locator(".primary-workspace-pane .patient-header h1")).toHaveText("Maya Chen");
  });
});
