import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * UI-6 — decomposing the Practice menu one child at a time.
 *
 * Each child leaves the menu only once something else provably opens the same work.
 * These tests are that gate: they check the replacement path reaches the module, that
 * it focuses an already-open workspace instead of stacking a second tab, and that the
 * old menu entry is gone — in that order, so a passing run means the capability moved
 * rather than disappeared.
 */

const PRACTICE_MENU = "Practice options";

async function openPracticeMenu(page: Page) {
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  const menu = page.getByRole("region", { name: PRACTICE_MENU });
  await expect(menu).toBeVisible();
  return menu;
}

async function openLauncher(page: Page) {
  await page.locator("button[data-workspace-control='open-workspace-launcher']").click();
  const popover = page.locator("[data-testid='open-workspace-launcher-popover']");
  await expect(popover).toBeVisible();
  return popover;
}

test.describe("UI-6a: Billing leaves the Practice menu", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDefaultLayout(page, "Prototype provider");
  });

  test("the `+` launcher opens Billing and the Practice menu no longer lists it", async ({
    page,
  }) => {
    const launcher = await openLauncher(page);
    await launcher.locator("button[data-workspace-id='billing']").click();

    await expect(page.locator(".global-module-shell")).toHaveAttribute(
      "data-active-module",
      "billing",
      { timeout: 20_000 },
    );
    await expect(page.locator("[data-billing-surface='authoritative']")).toBeVisible({
      timeout: 20_000,
    });

    const menu = await openPracticeMenu(page);
    await expect(
      menu.getByRole("button", { name: "Billing", exact: true }),
      "Billing is retired from Practice now that the launcher owns it",
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("re-opening Billing from the launcher focuses the existing tab rather than duplicating it", async ({
    page,
  }) => {
    const first = await openLauncher(page);
    await first.locator("button[data-workspace-id='billing']").click();
    await expect(page.locator(".global-module-shell")).toHaveAttribute(
      "data-active-module",
      "billing",
      { timeout: 20_000 },
    );

    const billingTabs = page.locator(".browser-tab").filter({ hasText: "Billing" });
    const openedCount = await billingTabs.count();
    expect(openedCount, "opening Billing should produce a workspace tab").toBeGreaterThan(0);

    // Leave and come back the same way a clinician would.
    await page.locator(".brand-home-button").click();
    const second = await openLauncher(page);
    await second.locator("button[data-workspace-id='billing']").click();

    await expect(page.locator(".global-module-shell")).toHaveAttribute(
      "data-active-module",
      "billing",
      { timeout: 20_000 },
    );
    await expect(
      billingTabs,
      "a singleton workspace is focused, not stacked a second time",
    ).toHaveCount(openedCount);
  });

  test("the Home suite tile still reaches Billing", async ({ page }) => {
    await page.locator(".brand-home-button").click();
    await page.locator(".zen-home-pane").getByRole("button", { name: /Billing/ }).first().click();

    await expect(page.locator(".global-module-shell")).toHaveAttribute(
      "data-active-module",
      "billing",
      { timeout: 20_000 },
    );
  });

  test("the children Practice still owns remain reachable", async ({ page }) => {
    const menu = await openPracticeMenu(page);
    for (const name of ["Staff directory", "Practice settings", "Website", "Social media"]) {
      await expect(
        menu.getByRole("button", { name, exact: true }),
        `${name} has no replacement yet, so it must stay in Practice`,
      ).toBeVisible();
    }
    await page.keyboard.press("Escape");
  });
});
