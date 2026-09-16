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

function railTool(page: Page, name: string) {
  return page.locator(`.dynamic-left-rail .rail-item[title^="Open ${name}."]`);
}

test("uses one app launcher for workspaces and communication channels", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInDevelopmentUser(page, "Prototype provider");
  await resetWorkspaceLayout(page, []);

  await expect(
    page.getByRole("button", { name: "Communications Hub" }),
    "the redundant people-button launcher is removed",
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Google Apps Launcher" }).click();
  const launcher = page.getByRole("dialog", { name: "Clinical Bond workspaces" });
  await expect(launcher).toBeVisible();

  const communications = launcher.getByRole("button", { name: "Communications" });
  await expect(communications).toBeVisible();
  await expect(
    launcher.getByRole("button", { name: "Inbox", exact: true }),
    "Inbox is grouped under Communications rather than duplicated at the top level",
  ).toHaveCount(0);
  await expect(
    launcher.getByRole("button", { name: "Fax", exact: true }),
    "Fax is no longer duplicated as a top-level app tile",
  ).toHaveCount(0);
  await expect(
    launcher.getByRole("button", { name: "Community", exact: true }),
    "Community is no longer duplicated as a top-level app tile",
  ).toHaveCount(0);

  await communications.click();
  const channels = launcher.getByRole("region", { name: "Communication channels" });
  await expect(channels).toBeVisible();
  for (const channel of ["Inbox", "Team", "Patients", "Email", "Fax", "Community"]) {
    await expect(channels.getByRole("button", { name: new RegExp(`^${channel}`) })).toBeVisible();
  }

  await channels.getByRole("button", { name: /^Inbox/ }).click();
  await expect(launcher).toHaveCount(0);
  await expect(page.locator(".global-inbox-list")).toBeVisible();

  await page.getByRole("button", { name: "Google Apps Launcher" }).click();
  const reopenedLauncher = page.getByRole("dialog", { name: "Clinical Bond workspaces" });
  await reopenedLauncher.getByRole("button", { name: "Communications" }).click();
  const reopenedChannels = reopenedLauncher.getByRole("region", { name: "Communication channels" });
  await reopenedChannels.getByRole("button", { name: /^Team/ }).click();
  await expect(reopenedLauncher).toHaveCount(0);
  await expect(page.getByLabel("Communications and collaboration dock")).toBeVisible();
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

    await railTool(page, "Inbox").click();
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

    const failure = inbox.locator(".ui-state-error");
    await expect(failure, "a failed load is announced, not rendered as an empty queue").toBeVisible();
    await expect(failure).toHaveAttribute("role", "alert");
    await expect(failure).toContainText("could not be loaded");
    await expect(inbox.locator(".global-inbox-row")).toHaveCount(0);

    failing = false;
    await failure.getByRole("button", { name: "Try again" }).click();

    await expect(failure, "retrying from where it failed clears the error").toHaveCount(0);
    await expect(inbox.locator(".global-inbox-row").first()).toBeVisible();
  });

  test("an unavailable action explains itself and becomes available when it can run", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInDevelopmentUser(page, "Prototype provider");
    await resetWorkspaceLayout(page, []);

    await railTool(page, "Tasks").click();
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

    await railTool(page, "Tasks").click();
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
