import { expect, test, type Page } from "@playwright/test";
import { resetWorkspaceLayout, signInDevelopmentUser } from "./workspace-fixtures";

/**
 * The shared interaction system (roadmap phase P1).
 *
 * The queues are where the grammar is proven: they are the surfaces that previously
 * each grew their own `loading -> empty -> rows` chain, most of them with no error
 * branch at all — so a queue that failed to load was indistinguishable from a queue
 * with nothing in it. These tests are about the lifecycle a clinician can see and
 * act on, not about how the controls are painted.
 */

async function railTool(page: Page, name: string) {
  await page.getByRole("button", { name: name === "Inbox" ? "Team" : "Clinical", exact: true }).click();
  return page.locator(".tool-menu-panel").getByRole("button", { name, exact: true });
}

test("groups communication channels in the Team menu", async ({ page }) => {
  await signInDevelopmentUser(page, "Prototype provider");
  await resetWorkspaceLayout(page, []);
  await page.getByRole("button", { name: "Team", exact: true }).click();
  const menu = page.getByRole("region", { name: "Team options" });
  for (const name of ["Inbox", "Team collaboration", "Patient communication", "Email", "Fax", "Community"]) {
    await expect(menu.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await menu.getByRole("button", { name: "Inbox", exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator(".global-inbox-list")).toBeVisible();
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await menu.getByRole("button", { name: "Team collaboration", exact: true }).click();
  await expect(page.getByLabel("Communications and collaboration dock")).toBeVisible();
});

test("keeps workspace layout controls inside Preferences instead of the tool row", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await signInDevelopmentUser(page, "Prototype provider");
  await resetWorkspaceLayout(page, []);

  const preferences = page.locator(".topbar").getByRole("button", { name: "Preferences", exact: true });
  await expect(preferences).toBeVisible();
  await expect(page.locator(".topbar .current-user-menu")).toBeVisible();
  await expect(page.getByRole("button", { name: "Google Apps Launcher" })).toHaveCount(0);
  await expect(
    page.locator(".tool-navigation-row").getByRole("button", { name: "Workspace", exact: true }),
    "Workspace is configuration, not a peer work destination",
  ).toHaveCount(0);

  const search = page.getByRole("textbox", { name: "Ask AI or search the EHR" });
  await expect(search).toHaveAttribute("placeholder", "Search or ask AI…");
  const idleWidth = (await page.locator(".patient-search-wrap").boundingBox())!.width;
  await search.focus();
  await expect.poll(async () => (await page.locator(".patient-search-wrap").boundingBox())!.width).toBeGreaterThan(idleWidth);

  await preferences.click();
  const workspaceSettings = page.getByRole("region", { name: "Workspace options" });
  await expect(workspaceSettings).toBeVisible();
  await expect(workspaceSettings.getByText("Workspace Layout", { exact: true })).toBeVisible();
  await workspaceSettings.getByRole("button", { name: /Open Layout Customizer/i }).click();

  const customizer = page.getByRole("dialog", { name: "Workspace Layout Preferences" });
  await expect(customizer.getByRole("button", { name: "Presets", exact: true })).toBeVisible();
  await expect(customizer.getByText("Add / Arrange Windows", { exact: true })).toBeVisible();
});

test.describe("shared interaction system", () => {
  test("a queue that fails to load says so and recovers on retry", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInDevelopmentUser(page, "Prototype provider");
    await resetWorkspaceLayout(page, []);

    let failing = true;
    await page.route("**/api/messages?**", async (route) => {
      if (!failing) return route.continue();
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: "Simulated queue outage" }),
      });
    });

    await (await railTool(page, "Inbox")).click();
    const inbox = page.locator(".global-inbox-list");
    await expect(inbox).toBeVisible();

    // The inbox loads once on mount, so the failing backend is exercised through a
    // refresh — the same path a clinician takes when a queue looks stale.
    //
    // Scoped to the module shell and matched exactly. A bare /Refresh/ used to be
    // unique; the shared schedule added "Refresh schedule now" (DB-6), so the loose
    // pattern started resolving to two controls and the click failed before the
    // behaviour under test ran. The assertion was never wrong — the handle was.
    await page.locator(".global-module-shell").getByRole("button", { name: "Refresh", exact: true }).click();

    const staleWarning = page.locator(".global-inbox-workspace > .ui-state-error");
    await expect(
      staleWarning,
      "a failed refresh is announced without erasing previously loaded threads",
    ).toBeVisible();
    await expect(staleWarning).toHaveAttribute("role", "alert");
    await expect(staleWarning).toContainText(/could not be refreshed|may be stale/i);
    await expect(
      inbox.locator(".global-inbox-row").first(),
      "last-known inbox data remains visible while its stale state is explicit",
    ).toBeVisible();

    failing = false;
    await staleWarning.getByRole("button", { name: "Try again" }).click();

    await expect(staleWarning, "retrying from where it failed clears the stale warning").toHaveCount(0);
    await expect(inbox.locator(".global-inbox-row").first()).toBeVisible();
  });

  test("an unavailable action explains itself and becomes available when it can run", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInDevelopmentUser(page, "Prototype provider");
    await resetWorkspaceLayout(page, []);

    await (await railTool(page, "Tasks")).click();
    const compose = page.locator(".global-task-compose");
    await expect(compose).toBeVisible();

    const addTask = compose.getByRole("button", { name: "Add task" });
    await expect(addTask).toBeDisabled();
    await expect(
      addTask,
      "a control the clinician cannot use has to say why rather than sit there dead",
    ).toHaveAttribute("title", "Type a task first.");

    await compose.getByRole("textbox").fill("Confirm the shared button states");
    await expect(addTask).toBeEnabled();
    await expect(addTask).not.toHaveAttribute("title", /.+/);
  });

  test("filter controls report their pressed state and are reachable from the keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInDevelopmentUser(page, "Prototype provider");
    await resetWorkspaceLayout(page, []);

    await (await railTool(page, "Tasks")).click();
    const filters = page.locator(".global-task-filters");
    await expect(filters).toBeVisible();

    const open = filters.getByRole("button", { name: /^Open/ });
    const completed = filters.getByRole("button", { name: /^Completed/ });

    await expect(open, "the active filter is announced, not only tinted").toHaveAttribute("aria-pressed", "true");
    await expect(completed).toHaveAttribute("aria-pressed", "false");

    // Reachable and operable without a mouse.
    await completed.focus();
    await expect(completed).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(completed).toHaveAttribute("aria-pressed", "true");
    await expect(open).toHaveAttribute("aria-pressed", "false");
  });
});
