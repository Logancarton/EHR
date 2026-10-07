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
    const aiRailBtn = page.locator(".companion-rail-btn[aria-label='Clinical AI']").first();
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

    // 6. Patient switching isolation. Clinical AI stays bound to the chart it was
    // opened for: another chart in front parks it rather than silently retargeting
    // it, and nothing from the first chart's answer is shown over the second.
    const boundPatientName = (await panel.locator("#ai-target-context-label").innerText()).replace(/^Target:\s*/, "").split(" · ")[0].trim();
    const otherTab = page.locator(".browser-tab[data-workspace-tab='patient']:not(.active)").first();
    if (await otherTab.isVisible()) {
      await otherTab.click();
      const parked = page.locator("aside.companion-ai-panel[data-patient-tool='clinical-ai']");
      await expect(parked).toBeVisible();
      await expect(parked).toContainText("Clinical AI is parked until this pinned patient chart is back in the foreground.");
      await expect(parked).toContainText(`Target: ${boundPatientName}`);
      await expect(page.locator("[data-omnibox-plan-card]:visible")).toHaveCount(0);
      await expect(page.locator("#ai-composer-input:visible")).toHaveCount(0);
    }
  });
});
