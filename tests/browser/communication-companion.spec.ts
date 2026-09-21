import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test.describe("UI-3: Communication companion on right rail alongside Level 1 Team menu", () => {
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

    // Level 1 top-bar Team menu remains intact and visible (additive-first rule)
    const teamTopNav = page.locator(".tool-navigation").getByRole("button", { name: "Team", exact: true });
    await expect(teamTopNav).toBeVisible();

    // Verify all 6 communication channel tabs exist in the companion panel
    const channels = ["team", "inbox", "patient", "email", "fax", "community"];
    for (const ch of channels) {
      await expect(panel.locator(`[data-channel='${ch}']`)).toBeVisible();
    }
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

    // Switch to Inbox
    await panel.locator("[data-channel='inbox']").click();
    await expect(panel.locator("[data-channel='inbox']")).toHaveAttribute("aria-selected", "true");

    // Filter chips present
    await expect(panel.locator(".comm-filter-chip").filter({ hasText: /All/ })).toBeVisible();
    await expect(panel.locator(".comm-filter-chip").filter({ hasText: /Unread/ })).toBeVisible();
    await expect(panel.locator(".comm-filter-chip").filter({ hasText: /Priority/ })).toBeVisible();
    await expect(panel.locator(".comm-filter-chip").filter({ hasText: /Refills/ })).toBeVisible();

    // Full workspace launcher present
    await expect(
      panel.getByRole("button", { name: /Open Full Inbox Workspace/i }),
    ).toBeVisible();
  });

  test("External channels (SMS, Email, Fax, Community) preserve honest unconfigured draft states", async ({
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

    // 1. Patient SMS
    await panel.locator("[data-channel='patient']").click();
    await expect(panel.locator("[data-sms-transport='unconfigured']")).toBeVisible();
    await expect(panel.locator("[data-sms-transport='unconfigured']")).toContainText(
      "SMS transport unavailable: Telephony integration is not configured",
    );
    await expect(panel.getByRole("button", { name: /Save Draft/i })).toBeVisible();

    // 2. Email
    await panel.locator("[data-channel='email']").click();
    await expect(panel.locator("[data-email-transport='unconfigured']")).toBeVisible();
    await expect(panel.locator("[data-email-transport='unconfigured']")).toContainText(
      "Email transport unavailable: Inbound/outbound email integration is not configured",
    );
    await expect(panel.getByRole("button", { name: /Save Reply Draft/i })).toBeVisible();

    // 3. Fax
    await panel.locator("[data-channel='fax']").click();
    await expect(panel.locator("[data-fax-transport='unconfigured']")).toBeVisible();
    await expect(panel.locator("[data-fax-transport='unconfigured']")).toContainText(
      "e-Fax transport unavailable: No digital fax gateway configured",
    );
    await expect(
      panel.getByRole("button", { name: /Save as Draft \(No Gateway\)/i }),
    ).toBeVisible();

    // 4. Community
    await panel.locator("[data-channel='community']").click();
    await expect(panel.locator("[data-community-network='unconfigured']")).toBeVisible();
    await expect(panel.locator("[data-community-network='unconfigured']")).toContainText(
      "Provider community in demonstration mode",
    );
    await expect(panel.getByRole("button", { name: /Post Response/i })).toBeVisible();
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
