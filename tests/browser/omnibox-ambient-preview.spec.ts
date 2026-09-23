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

    await preview.getByRole("button", { name: "Open Meds Tab" }).click();
    await expect(page.getByRole("tab", { name: "Meds", exact: true }).first()).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 15_000 },
    );
  });
});
