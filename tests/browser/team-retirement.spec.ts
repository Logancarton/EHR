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

  test("the top bar carries no work navigation, so no retired destination can return to it", async ({
    page,
  }) => {
    // UI-5 asserted Team's absence against the row that still held Calendar, Intake
    // and Dashboard. UI-6 and UI-7 rehomed Practice's and Clinical's children and
    // removed each group last; UI-8 gave Dashboard a `+` launcher entry — the one
    // destination that lacked one — and then removed the row itself.
    //
    // So the assertion is no longer "Team is missing from the row": there is no row.
    // That is the strongest form of the same rule, because a destination cannot be
    // restored to a surface the shell does not render.
    await expect(
      page.locator(".tool-navigation, .topbar-navigation-slot"),
      "the top bar renders no work-navigation row",
    ).toHaveCount(0);

    const topbar = page.locator(".topbar");
    await expect(topbar).toBeVisible();
    for (const retired of ["Team", "Practice", "Clinical", "Inbox"]) {
      await expect(
        topbar.getByRole("button", { name: retired, exact: true }),
        `${retired} is reached from the surface that owns it, not from the top bar`,
      ).toHaveCount(0);
    }

    // Row one is identity, the omnibox and account/preferences — nothing else.
    await expect(topbar.locator(".brand-nav-group")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Ask AI or search the EHR" })).toBeVisible();
    await expect(topbar.getByRole("button", { name: "Preferences", exact: true })).toBeVisible();
    await expect(topbar.getByRole("button", { name: /Account menu for/ })).toBeVisible();

    // The three destinations the row carried are still reachable, from the launcher
    // this slice made their only durable route.
    const launcher = page.locator("[data-workspace-control='open-workspace-launcher']");
    await launcher.click();
    const popover = page.getByTestId("open-workspace-launcher-popover");
    await expect(popover).toBeVisible();
    for (const destination of ["calendar", "intake", "dashboard"]) {
      await expect(
        popover.locator(`.open-workspace-item[data-workspace-id="${destination}"]`),
        `${destination} is offered by the '+' launcher`,
      ).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(popover).toHaveCount(0);
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
