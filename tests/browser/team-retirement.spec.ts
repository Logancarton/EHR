import { expect, test } from "@playwright/test";
import { defaultPreferences } from "../../app/lib/preference-engine";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * UI-5 — retiring the Level 1 Team menu.
 *
 * The migration invariant is that an old top-bar destination disappears only once its
 * replacement provably reaches the same work. These tests are the deletion gate: every
 * capability the Team menu used to open has to be reachable from the right companion
 * rail, including for a layout that was saved before the Communication tool existed,
 * and the legacy collaboration dock has to keep working on its own remaining entry
 * point rather than being summoned as a second competing surface.
 */

const COMMUNICATION_RAIL_BUTTON = ".companion-rail-btn[data-tool-id='communication']";
const COMMUNICATION_PANEL = ".companion-panel[data-companion-panel='communication']";

test.describe("UI-5: Team retirement with Communication companion parity", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDefaultLayout(page, "Prototype provider");
  });

  test("Team is gone from the top bar while every other destination still works", async ({
    page,
  }) => {
    const toolNav = page.locator(".tool-navigation");
    await expect(toolNav).toBeVisible();

    await expect(
      toolNav.getByRole("button", { name: "Team", exact: true }),
      "Team must be retired from top-bar tool navigation",
    ).toHaveCount(0);

    // Practice and Clinical are absent for the same reason Team is: UI-6 and UI-7
    // rehomed every child and then removed each group. The three retirements share
    // one rule, not one commit.
    for (const name of ["Calendar", "Intake", "Dashboard"]) {
      await expect(
        toolNav.getByRole("button", { name, exact: true }),
        `Top-bar navigation item '${name}' must remain visible`,
      ).toBeVisible();
    }
    for (const retired of ["Team", "Practice", "Clinical"]) {
      await expect(
        toolNav.getByRole("button", { name: retired, exact: true }),
        `${retired} was retired after its children were rehomed`,
      ).toHaveCount(0);
    }

    // A retired group must not leave its children stranded inside another menu.
    // With Clinical gone there is no grouped menu left at all, so the strongest
    // form of that is the one asserted: nothing in the work navigation opens a panel.
    await expect(
      page.locator(".tool-navigation [aria-expanded]"),
      "no work-navigation group survives to hold a stranded child",
    ).toHaveCount(0);
    await expect(
      toolNav.getByRole("button", { name: "Inbox", exact: true }),
      "Inbox is reached from the Communication companion, not from the top bar",
    ).toHaveCount(0);
  });

  test("all six retired communication capabilities are reachable from the companion rail", async ({
    page,
  }) => {
    const railButton = page.locator(COMMUNICATION_RAIL_BUTTON);
    await expect(railButton).toBeVisible();

    // Keyboard reachable, not mouse-only: the rail is now the sole durable entry point.
    await railButton.focus();
    await expect(railButton).toBeFocused();
    await page.keyboard.press("Enter");

    const panel = page.locator(COMMUNICATION_PANEL);
    await expect(panel).toBeVisible();
    await expect(railButton).toHaveAttribute("aria-pressed", "true");

    // Each channel replaces one retired Team menu item, and each keeps the
    // full-workspace escalation the old dock's fullscreen control provided.
    const channels = [
      { id: "team", launch: "Open Full Tasks Workspace" },
      { id: "inbox", launch: "Open Full Inbox Workspace" },
      { id: "patient", launch: "Open Full Patient Comms Workspace" },
      { id: "email", launch: "Open Full Email Workspace" },
      { id: "fax", launch: "Open Full Fax Workspace" },
      { id: "community", launch: "Open Full Community Workspace" },
    ];

    for (const { id, launch } of channels) {
      const tab = panel.locator(`[data-channel='${id}']`);
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(
        panel.locator(".comm-launch-workspace-btn"),
        `${id} must keep a path to its full workspace`,
      ).toContainText(launch);
    }
  });

  test("the Inbox channel opens the full inbox workspace", async ({ page }) => {
    const panel = page.locator(COMMUNICATION_PANEL);
    if (!await panel.isVisible()) {
      await page.locator(COMMUNICATION_RAIL_BUTTON).click();
      await expect(panel).toBeVisible();
    }

    await panel.locator("[data-channel='inbox']").click();

    const openFullInboxBtn = panel.getByRole("button", { name: /Open Full Inbox Workspace/i });
    await expect(openFullInboxBtn).toBeVisible();
    await openFullInboxBtn.click();

    // Verify the full global inbox workspace shell is displayed
    const inboxList = page.locator(".global-inbox-list");
    await expect(inboxList).toBeVisible({ timeout: 10_000 });
  });

  test("a layout saved before Communication existed still gets the rail entry", async ({
    page,
  }) => {
    // Exactly the shape a clinician's stored rail had before UI-3 added the tool.
    const legacyPreferences = {
      ...defaultPreferences,
      appliedRailBackfills: [],
      rails: {
        ...defaultPreferences.rails,
        right: ["calendar", "ai", "scratchpad", "tasks", "calc"],
      },
    };

    await page.goto("about:blank");
    const response = await page.request.put("/api/preferences", {
      data: { preferences: legacyPreferences },
    });
    expect(response.ok(), "seeding a pre-UI-3 layout should succeed").toBeTruthy();

    await page.goto("/");
    await expect(page.locator(".authenticated-app")).toHaveAttribute(
      "data-workspace-restored",
      "true",
      { timeout: 15_000 },
    );

    const railButton = page.locator(COMMUNICATION_RAIL_BUTTON);
    await expect(
      railButton,
      "retiring Team must not strand communications on an older saved layout",
    ).toBeVisible();

    await railButton.click();
    await expect(page.locator(COMMUNICATION_PANEL)).toBeVisible();
  });

  test("the legacy collaboration dock still opens from its own control, alone", async ({
    page,
  }) => {
    // The dock is a separate surface that UI-5 does not retire. Its remaining entry
    // point has to keep working, and it must not summon the companion as well — two
    // communication surfaces answering one request would be a worse result than the
    // menu this slice removed.
    await page.getByRole("button", { name: "Open Team Collaboration Dock" }).click();

    await expect(page.getByLabel("Communications and collaboration dock")).toBeVisible();
    await expect(
      page.locator(COMMUNICATION_PANEL),
      "opening the dock must not also open the Communication companion",
    ).toHaveCount(0);
  });
});
