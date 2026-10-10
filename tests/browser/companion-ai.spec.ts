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

  test("keeps one conversation per patient across follow-ups, chart switches and clearing (D-132 CONV-1)", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const maya = page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" });
    await maya.click();
    await page.locator(".companion-rail-btn[aria-label='Clinical AI']").click();
    const panel = page.getByRole("complementary", { name: "Clinical AI Companion", exact: true });
    const input = panel.locator("#ai-composer-input");
    const turns = panel.locator(".ai-thread-turns > li");

    // First question, then a follow-up that names nobody: both stay with Maya.
    await input.fill("What medications is she taking?");
    const [first] = await Promise.all([
      page.waitForRequest((candidate) => candidate.url().includes("/api/ai/omnibox/plan")),
      input.press("Enter"),
    ]);
    expect(first.postDataJSON().activePatientId).toBe("maya-chen");
    await expect(turns).toHaveCount(1);
    await expect(turns.first()).toHaveAttribute("data-ai-turn-status", "answered", { timeout: 20_000 });

    await input.fill("Summarize chart");
    const [followUp] = await Promise.all([
      page.waitForRequest((candidate) => candidate.url().includes("/api/ai/omnibox/plan")),
      input.press("Enter"),
    ]);
    expect(followUp.postDataJSON().activePatientId).toBe("maya-chen");
    await expect(turns).toHaveCount(2);
    await expect(turns.nth(1)).toHaveAttribute("data-ai-turn-status", "answered", { timeout: 20_000 });

    // The earlier answer collapses to one line and reopens on demand; the latest stays open.
    await expect(turns.first().locator("[data-omnibox-plan-card]")).toHaveCount(0);
    await expect(turns.first().locator(".ai-turn-question")).toContainText("What medications is she taking?");
    await expect(turns.nth(1).locator("[data-omnibox-plan-answer]")).toContainText("Bounded chart recap for Maya Chen");
    await turns.first().locator(".ai-turn-summary").click();
    await expect(turns.first().locator("[data-omnibox-plan-card]")).toBeVisible();
    await turns.first().getByRole("button", { name: "Collapse" }).click();
    await expect(turns.first().locator("[data-omnibox-plan-card]")).toHaveCount(0);

    // Naming another patient answers about them, says so, and leaves the thread with Maya.
    await input.fill("What medications is David Kim taking?");
    await input.press("Enter");
    await expect(turns).toHaveCount(3);
    const aboutDavid = turns.nth(2);
    await expect(aboutDavid).toHaveAttribute("data-ai-turn-status", "answered", { timeout: 20_000 });
    await expect(aboutDavid.locator("[data-ai-turn-other-patient]")).toContainText(
      "This answer is about David Kim, not Maya Chen",
    );
    // An answer about David cannot be inserted into Maya's note.
    await expect(aboutDavid.getByRole("button", { name: "Insert into Note" })).toHaveCount(0);
    await expect(panel.locator("#ai-target-context-label")).toContainText("Maya Chen");
    await page.screenshot({ path: "output/playwright/conv-1-thread.png" });

    // Another chart in front parks the panel; returning restores the same conversation.
    const otherTab = page.locator('.browser-tab[data-workspace-tab="patient"]:not(.active)').first();
    await otherTab.click();
    await expect(page.locator("aside.companion-ai-panel[data-patient-tool='clinical-ai']")).toContainText("Clinical AI is parked");
    await maya.click();
    await expect(turns).toHaveCount(3);
    await expect(turns.first().locator(".ai-turn-question")).toContainText("What medications is she taking?");

    // Closing and reopening the panel keeps it too; clearing empties it.
    await panel.getByRole("button", { name: /close/i }).first().click();
    await page.locator(".companion-rail-btn[aria-label='Clinical AI']").click();
    await expect(turns).toHaveCount(3);
    await panel.getByRole("button", { name: "Clear conversation" }).click();
    await expect(turns).toHaveCount(0);
    await expect(panel.locator(".ai-empty-state")).toBeVisible();
  });
});
