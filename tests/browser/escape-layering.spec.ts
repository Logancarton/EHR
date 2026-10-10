import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * CB-6f — one Escape, one layer.
 *
 * Every layered surface used to listen for Escape on its own, so a single press
 * was answered by all of them at once: an expanded companion redocked *and* the
 * module underneath closed; the Open-workspace launcher closed *and* took the
 * companion with it. The topmost layer — the one opened most recently — answers,
 * and focus goes back to the control that opened what was closed.
 */

async function openModule(page: Page, view: string) {
  const shell = page.locator(".global-module-shell");
  await page.evaluate((v) => {
    window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: v } }));
  }, view);
  await expect(shell).toBeVisible({ timeout: 20_000 });
  return shell;
}

async function openCompanion(page: Page, label: string) {
  const button = page.locator(`.companion-rail-btn[aria-label='${label}']`).first();
  await expect(button).toBeVisible({ timeout: 15_000 });
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  return button;
}

test.describe("CB-6f Escape answers one layer at a time", () => {
  test("an expanded companion over a module: redock, then close, then the module", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    const shell = await openModule(page, "billing");

    const railButton = await openCompanion(page, "Communication");
    const panel = page.locator(".companion-panel[data-companion-panel='communication']");
    await panel.locator("button[data-action='expand-companion']").click();
    await expect(panel).toHaveAttribute("data-companion-presentation", "expanded");
    await panel.locator("button[data-action='redock-companion']").focus();

    await page.keyboard.press("Escape");
    await expect(panel).toHaveAttribute("data-companion-presentation", "docked");
    await expect(shell, "the module underneath is untouched").toBeVisible();

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(shell, "still untouched").toBeVisible();
    await expect(railButton, "focus returns to the rail button that opened it").toBeFocused();

    await page.keyboard.press("Escape");
    await expect(shell, "the module is the next layer down").toHaveCount(0);
  });

  test("every docked companion closes on Escape and returns focus to its rail button", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    const labels = await page
      .locator(".companion-rail-btn[data-tool-id]")
      .evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label") ?? ""));
    expect(labels.length).toBeGreaterThan(0);

    for (const label of labels) {
      const railButton = await openCompanion(page, label);
      const panel = page.locator(".companion-panel").first();
      await expect(panel, `${label} opens`).toBeVisible();
      // Focus somewhere neutral inside the panel's header, not a text field.
      await panel.locator(".companion-close-btn").first().focus();
      await page.keyboard.press("Escape");
      await expect(railButton, `${label} closes on Escape`).toHaveAttribute("aria-pressed", "false");
      await expect(railButton, `${label} returns focus to its rail button`).toBeFocused();
    }
  });

  test("a companion text field keeps Escape, and the draft is not lost", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    const railButton = await openCompanion(page, "Tasks");
    const input = page.getByRole("textbox", { name: "New task" });
    await expect(input).toBeEnabled({ timeout: 15_000 });
    await input.fill("Call pharmacy about prior auth");
    await page.keyboard.press("Escape");
    await expect(railButton, "Escape in a field does not close the panel").toHaveAttribute("aria-pressed", "true");
    await expect(input).toHaveValue("Call pharmacy about prior auth");
  });

  test("the Open-workspace launcher over a companion closes alone", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    const railButton = await openCompanion(page, "Tasks");

    const plus = page.locator("button[aria-label='Open workspace']").first();
    await plus.click();
    const launcher = page.locator(".open-workspace-popover");
    await expect(launcher).toBeVisible();
    // Escape from where the cursor actually is once the launcher has opened.
    await expect(launcher.getByRole("textbox", { name: "Find workspace or patient" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(launcher).toHaveCount(0);
    await expect(plus, "focus returns to +").toBeFocused();
    await expect(railButton, "the companion underneath stays open").toHaveAttribute("aria-pressed", "true");
  });
  test("expanding a companion opened before the module puts it on top", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    await openCompanion(page, "Communication");
    const shell = await openModule(page, "billing");
    const panel = page.locator(".companion-panel[data-companion-panel='communication']");
    await panel.locator("button[data-action='expand-companion']").click();
    await expect(panel).toHaveAttribute("data-companion-presentation", "expanded");
    await panel.locator("button[data-action='redock-companion']").focus();

    await page.keyboard.press("Escape");
    await expect(panel, "the expanded canvas answers first").toHaveAttribute("data-companion-presentation", "docked");
    await expect(shell).toBeVisible();
  });
});
