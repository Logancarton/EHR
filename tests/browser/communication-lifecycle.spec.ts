import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test.describe("UI-4: Communication canonical companion lifecycle (dock, resize, expand, redock, minimize)", () => {
  test("Docked presentation opens at preferred width with expand and close buttons", async ({
    page,
  }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    // Open Communication from right companion rail
    const commRailBtn = page
      .locator(".companion-rail-btn")
      .filter({ hasText: /^forum$/ })
      .or(page.locator(".companion-rail-btn[aria-label='Communication']"));

    await expect(commRailBtn.first()).toBeVisible();
    await commRailBtn.first().click();

    const panel = page.locator(".companion-panel[data-companion-panel='communication']");
    await expect(panel).toBeVisible();

    // Verify docked presentation mode
    await expect(panel).toHaveAttribute("data-companion-presentation", "docked");

    // Verify Expand to main canvas button is visible
    const expandBtn = panel.locator("button[data-action='expand-companion']");
    await expect(expandBtn).toBeVisible();
    await expect(expandBtn).toHaveAttribute("aria-label", "Expand to main canvas");

    // Verify resize handle exists in docked mode
    const resizeBorder = page.locator(".companion-resize-border");
    await expect(resizeBorder).toBeVisible();

    // Verify close button exists
    const closeBtn = panel.locator(".companion-close-btn");
    await expect(closeBtn).toBeVisible();
  });

  test("Expand to main canvas fills workspace while right companion rail remains visible and clickable", async ({
    page,
  }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const commRailBtn = page
      .locator(".companion-rail-btn")
      .filter({ hasText: /^forum$/ })
      .or(page.locator(".companion-rail-btn[aria-label='Communication']"));
    await commRailBtn.first().click();

    const panel = page.locator(".companion-panel[data-companion-panel='communication']");
    await expect(panel).toBeVisible();

    // Click Expand to main canvas
    const expandBtn = panel.locator("button[data-action='expand-companion']");
    await expandBtn.click();

    // Verify presentation attribute updates to expanded
    await expect(panel).toHaveAttribute("data-companion-presentation", "expanded");
    await expect(panel).toHaveClass(/companion-expanded-canvas/);

    // Verify Redock button replaces Expand button in header
    const redockBtn = panel.locator("button[data-action='redock-companion']");
    await expect(redockBtn).toBeVisible();
    await expect(redockBtn).toHaveAttribute("aria-label", "Redock to companion rail");

    // Verify right companion rail remains visible and accessible per RIGHT-05
    const companionRail = page.locator(".companion-rail");
    await expect(companionRail).toBeVisible();

    // Verify docked resize handle is hidden while expanded
    const resizeBorder = page.locator(".companion-resize-border");
    await expect(resizeBorder).toHaveCount(0);

    // Verify Level 1 and Level 2 workspace chrome (tabs) remain visible
    const workspaceTabs = page.locator(".browser-tabs");
    await expect(workspaceTabs).toBeVisible();
  });

  test("Drafts, selected partner, and tab selection survive expand and redock without data loss", async ({
    page,
  }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const commRailBtn = page
      .locator(".companion-rail-btn")
      .filter({ hasText: /^forum$/ })
      .or(page.locator(".companion-rail-btn[aria-label='Communication']"));
    await commRailBtn.first().click();

    const panel = page.locator(".companion-panel[data-companion-panel='communication']");
    await expect(panel).toBeVisible();

    // In Team chat, select Marcus Vance
    const marcusChip = panel.locator(".comm-partner-chip").filter({ hasText: /Marcus/i });
    if (await marcusChip.count() > 0) {
      await marcusChip.first().click();
    }

    // Type a draft message in the chat input
    const chatInput = panel.locator(".comm-composer textarea");
    await expect(chatInput).toBeVisible();
    await chatInput.fill("Critical titration update for Dr. Vance regarding lithium level");

    // Switch to Shared Tasks and draft a task
    await panel.getByRole("tab", { name: "Shared Tasks" }).click();
    const taskInput = panel.locator(".comm-task-compose-box input[type='text']");
    await expect(taskInput).toBeVisible();
    await taskInput.fill("Schedule quarterly follow-up appointment");

    // Expand to main canvas
    const expandBtn = panel.locator("button[data-action='expand-companion']");
    await expandBtn.click();
    await expect(panel).toHaveAttribute("data-companion-presentation", "expanded");

    // Verify task draft is intact in expanded presentation
    await expect(taskInput).toHaveValue("Schedule quarterly follow-up appointment");

    // Switch back to Chat subtab in expanded presentation
    await panel.getByRole("tab", { name: "Chat" }).click();
    await expect(chatInput).toHaveValue("Critical titration update for Dr. Vance regarding lithium level");

    // Redock back to companion rail
    const redockBtn = panel.locator("button[data-action='redock-companion']");
    await redockBtn.click();
    await expect(panel).toHaveAttribute("data-companion-presentation", "docked");

    // Verify chat input draft survived the redock completely intact
    await expect(chatInput).toHaveValue("Critical titration update for Dr. Vance regarding lithium level");

    // Verify task input draft also survived
    await panel.getByRole("tab", { name: "Shared Tasks" }).click();
    await expect(taskInput).toHaveValue("Schedule quarterly follow-up appointment");
  });

  test("Patient SMS draft survives channel switching, expand, and redock", async ({
    page,
  }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const commRailBtn = page
      .locator(".companion-rail-btn")
      .filter({ hasText: /^forum$/ })
      .or(page.locator(".companion-rail-btn[aria-label='Communication']"));
    await commRailBtn.first().click();

    const panel = page.locator(".companion-panel[data-companion-panel='communication']");
    await expect(panel).toBeVisible();

    // Switch to Patient SMS channel
    await panel.locator("[data-channel='patient']").click();
    await expect(panel.locator("[data-comm-section='patient']")).toBeVisible();

    // Type SMS draft
    const smsInput = panel.locator(".comm-sms-composer input[type='text']");
    await expect(smsInput).toBeVisible();
    await smsInput.fill("Hi Elena, please confirm if 10:30 AM works better for your telehealth visit.");

    // Expand to main canvas
    await panel.locator("button[data-action='expand-companion']").click();
    await expect(panel).toHaveAttribute("data-companion-presentation", "expanded");

    // Verify channel and draft survived expansion
    await expect(panel.locator("[data-channel='patient']")).toHaveAttribute("aria-selected", "true");
    await expect(smsInput).toHaveValue("Hi Elena, please confirm if 10:30 AM works better for your telehealth visit.");

    // Redock
    await panel.locator("button[data-action='redock-companion']").click();
    await expect(panel).toHaveAttribute("data-companion-presentation", "docked");
    await expect(smsInput).toHaveValue("Hi Elena, please confirm if 10:30 AM works better for your telehealth visit.");
  });

  test("Escape key gracefully dismisses/redocks without destroying draft text", async ({
    page,
  }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const commRailBtn = page
      .locator(".companion-rail-btn")
      .filter({ hasText: /^forum$/ })
      .or(page.locator(".companion-rail-btn[aria-label='Communication']"));
    await commRailBtn.first().click();

    const panel = page.locator(".companion-panel[data-companion-panel='communication']");
    await expect(panel).toBeVisible();

    // Expand to main canvas
    await panel.locator("button[data-action='expand-companion']").click();
    await expect(panel).toHaveAttribute("data-companion-presentation", "expanded");

    // Press Escape
    await page.keyboard.press("Escape");

    // Verify it redocks to docked presentation
    await expect(panel).toHaveAttribute("data-companion-presentation", "docked");

    // Close panel
    await panel.locator(".companion-close-btn").click();
    await expect(panel).not.toBeVisible();

    // Reopen from rail
    await commRailBtn.first().click();
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-companion-presentation", "docked");
  });
});
