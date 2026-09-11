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
    await page.getByRole("button", { name: /Refresh/ }).click();

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
