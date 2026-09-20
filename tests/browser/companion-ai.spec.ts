import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test.describe("Clinical AI Companion Panel", () => {
  test("routes clinical questions through the server planner boundary and isolates context", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    // Ensure we are in a patient chart (e.g. Maya Chen or David Kim)
    const patientTab = page.locator(".browser-tab[data-workspace-tab='patient']").first();
    await expect(patientTab).toBeVisible({ timeout: 15_000 });
    await patientTab.click();
    await expect(patientTab).toHaveClass(/active/);

    // 1. Locate Clinical AI button on right companion rail
    const aiRailBtn = page.locator(".companion-rail-btn[title*='Clinical AI']").first();
    await expect(aiRailBtn).toBeVisible({ timeout: 15_000 });
    await aiRailBtn.click();

    // 2. Verify companion panel opens
    const panel = page.locator("aside.companion-ai-panel");
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByText("Clinical AI Companion", { exact: true })).toBeVisible();

    // 3. Submit a clinical question via companion composer
    const input = panel.locator("#ai-composer-input");
    await expect(input).toBeVisible();
    await input.fill(`What medications is the patient taking?`);

    const [request] = await Promise.all([
      page.waitForRequest((candidate) => candidate.url().includes("/api/ai/omnibox/plan"), { timeout: 15_000 }),
      input.press("Enter"),
    ]);

    expect(request.method()).toBe("POST");
    const postData = request.postDataJSON();
    expect(postData.activePatientId).toBeDefined();

    // 4. Verify OmniboxPlanCard renders within the companion panel
    const planCard = panel.locator("[data-omnibox-plan-card]");
    await expect(planCard).toBeVisible({ timeout: 15_000 });
    await expect(planCard.locator("[data-omnibox-plan-answer]")).toBeVisible({ timeout: 15_000 });
    await expect(planCard).toContainText(/Clinical mutation: none/i);

    // 5. Test deterministic workspace operator command
    await input.fill("compact mode");
    await input.press("Enter");
    const layoutFeedback = panel.locator("[role='status']").first();
    await expect(layoutFeedback).toBeVisible({ timeout: 10_000 });
    await expect(layoutFeedback).toContainText(/Workspace/i);

    // 6. Test patient switching isolation: open another patient tab if available
    const otherTab = page.locator(".browser-tab[data-workspace-tab='patient']:not(.active)").first();
    if (await otherTab.isVisible()) {
      const otherPatientName = (await otherTab.locator(".tab-name").innerText()).trim();
      await otherTab.click();
      // Target context label must update and old plan must be cleared
      await expect(panel.locator("#ai-target-context-label")).toContainText(otherPatientName);
      await expect(panel.locator("[data-omnibox-plan-card]")).toHaveCount(0);
    }
  });
});
