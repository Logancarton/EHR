import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test.describe("UI-3/UI-5: Communication companion on the right rail, now the sole communications route", () => {
  test("Communication button is pinned to the right companion rail and opens the Communication panel", async ({
    page,
  }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    // Communication button must be visible on the right companion rail
    const commRailBtn = page
      .locator(".companion-rail-btn")
      .filter({ hasText: /^forum$/ })
      .or(page.locator(".companion-rail-btn[aria-label='Communication']"));

    await expect(commRailBtn.first()).toBeVisible();
    await expect(commRailBtn.first()).toHaveAttribute("aria-pressed", "false");

    // Click to open companion panel
    await commRailBtn.first().click();

    const panel = page.locator(".companion-panel[data-companion-panel='communication']");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Communication" }).or(panel.locator("strong").filter({ hasText: "Communication" }).first())).toBeVisible();
    await expect(commRailBtn.first()).toHaveAttribute("aria-pressed", "true");

    // UI-5 retired the Level 1 Team menu; UI-8 removed the row that held it, so the
    // check is against the top bar itself rather than against a row that is gone.
    const teamTopNav = page.locator(".topbar").getByRole("button", { name: "Team", exact: true });
    await expect(teamTopNav).toHaveCount(0);

    for (const name of ["Patient", "Team", "External"]) await expect(panel.getByRole("tab", { name, exact: true })).toBeVisible();
  });

  test("Team channel loads team collaboration, partner strip, chat and shared tasks", async ({
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

    // Team channel is active by default
    await expect(panel.locator("[data-channel='team']")).toHaveAttribute("aria-selected", "true");

    // Chat subtab is visible
    await expect(panel.getByRole("tab", { name: "Chat" })).toBeVisible();
    await expect(panel.getByRole("tab", { name: "Shared Tasks" })).toBeVisible();

    // Partner strip loads teammates
    await expect(panel.locator(".comm-partner-strip")).toBeVisible();
    await expect(panel.locator(".comm-partner-chip").first()).toBeVisible();

    // Switch to Shared Tasks subtab
    await panel.getByRole("tab", { name: "Shared Tasks" }).click();
    await expect(panel.locator(".comm-tasks-view")).toBeVisible();
    await expect(panel.getByPlaceholder(/Delegate a task/i)).toBeVisible();

    // Switch back to Chat
    await panel.getByRole("tab", { name: "Chat" }).click();
    await expect(panel.locator(".comm-chat-view")).toBeVisible();
  });

  test("Inbox channel renders message filter chips and module link", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const commRailBtn = page
      .locator(".companion-rail-btn")
      .filter({ hasText: /^forum$/ })
      .or(page.locator(".companion-rail-btn[aria-label='Communication']"));
    await commRailBtn.first().click();

    const panel = page.locator(".companion-panel[data-companion-panel='communication']");
    await expect(panel).toBeVisible();

    await panel.locator("[data-channel=patient]").click();
    // Switch to Inbox
    await panel.locator("[data-channel='inbox']").click();
    await expect(panel.locator("[data-channel='inbox']")).toHaveAttribute("aria-selected", "true");

    // Filter chips present
    await expect(panel.locator(".comm-filter-chip").filter({ hasText: /All/ })).toBeVisible();
    await expect(panel.locator(".comm-filter-chip").filter({ hasText: /Unread/ })).toBeVisible();
    await expect(panel.locator(".comm-filter-chip").filter({ hasText: /Priority/ })).toBeVisible();
    await expect(panel.locator(".comm-filter-chip").filter({ hasText: /Refills/ })).toBeVisible();

    await expect(panel.getByRole("button", { name: /Open Full Inbox Workspace/i })).toHaveCount(0);
    await panel.getByRole("button", { name: "Expand to main canvas" }).click();
    await expect(panel.locator("[data-comm-section=inbox]")).toBeVisible();
  });

  test("External channels (Email, Fax, Community) preserve honest unconfigured draft states", async ({
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

    await panel.locator("[data-channel=patient]").click();
    await expect(panel.locator("[data-sms-transport=unconfigured]")).toContainText("delivery is not connected");
    await panel.getByRole("tab", { name: "External", exact: true }).click();
    for (const ch of ["email", "fax", "community"]) {
      await panel.locator(`[data-channel=${ch}]`).click();
      await expect(panel.locator(`[data-comm-section=${ch}]`)).toContainText("nothing is sent or received");
    }
    await panel.locator("[data-channel=email]").click();
    await panel.getByLabel("Email recipient").fill("outside@example.test");
    await panel.getByLabel("Email draft").fill("Synthetic draft");
    await panel.locator("[data-channel=fax]").click();
    await panel.locator("[data-channel=email]").click();
    await expect(panel.getByLabel("Email recipient")).toHaveValue("outside@example.test");
    await expect(panel.getByLabel("Email draft")).toHaveValue("Synthetic draft");
  });

  test("Communication companion can be closed via Close button and toggled cleanly", async ({
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

    // Close using companion header close button
    const closeBtn = panel.locator(".companion-close-btn");
    await closeBtn.click();
    await expect(panel).toHaveCount(0);
    await expect(commRailBtn.first()).toHaveAttribute("aria-pressed", "false");

    // Toggle again via rail button
    await commRailBtn.first().click();
    await expect(panel).toBeVisible();
    await expect(commRailBtn.first()).toHaveAttribute("aria-pressed", "true");

    // Press Escape to dismiss
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(commRailBtn.first()).toHaveAttribute("aria-pressed", "false");
  });
});
