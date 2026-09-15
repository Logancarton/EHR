import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * Pinning tools to a rail.
 *
 * Two properties, both of which were wrong in ways that only show up on screen.
 *
 * 1. **A menu changes the rail it belongs to, and lists only what that rail can
 *    render.** The pin list used to render both rails' toggles in every menu, so
 *    the left rail's nine-dot menu could pin a tool to the right rail and vice
 *    versa — the button you opened had no relationship to the control you clicked.
 *    Tools the rail cannot render are absent rather than listed as unavailable: a
 *    row whose only content is "not here" is a line of a scrolling list spent on
 *    nothing you can act on.
 * 2. **The add button follows the tools.** It was parked at the foot of the rail
 *    with `margin-top: auto`, so a growing gap opened between the last pinned tool
 *    and the control that adds the next one.
 */

const RAIL_ITEM = ".dynamic-left-rail .rail-item";
const ADD_BUTTON = ".dynamic-left-rail .rail-item-add";

async function openLeftPinMenu(page: Page) {
  await page.locator(ADD_BUTTON).click();
  const menu = page.locator("[data-pin-menu-origin='left']");
  await expect(menu).toBeVisible({ timeout: 10_000 });
  return menu;
}

/** Vertical distance from the bottom of the last pinned tool to the add button. */
async function gapBelowLastTool(page: Page): Promise<number> {
  const items = page.locator(RAIL_ITEM);
  const lastBox = await items.last().boundingBox();
  const addBox = await page.locator(ADD_BUTTON).boundingBox();
  expect(lastBox, "the rail should have at least one pinned tool").not.toBeNull();
  expect(addBox, "the rail should offer an add button").not.toBeNull();
  return addBox!.y - (lastBox!.y + lastBox!.height);
}

test.describe("rail personalization", () => {
  test("a rail's menu offers that rail only", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const leftMenu = await openLeftPinMenu(page);

    // One column, named for the rail the menu belongs to.
    await expect(leftMenu.locator(".col-side-label")).toHaveCount(1);
    await expect(leftMenu.locator(".col-side-label")).toHaveText("Left Sidebar");

    // Not a single control on this menu can reach the other rail.
    const rightControls = leftMenu.getByRole("button", { name: /(Pin|Unpin) .* (to|from) Right Rail/ });
    await expect(rightControls, "the left menu must not pin anything to the right rail").toHaveCount(0);
    await expect(
      leftMenu.getByRole("button", { name: /(Pin|Unpin) .* (to|from) Left Sidebar/ }).first(),
    ).toBeVisible();

    // Panel-only tools are absent from the left menu entirely — not listed with a
    // placeholder saying they belong elsewhere.
    for (const panelOnly of ["Clinical AI", "Scratchpad", "Calculators"]) {
      await expect(
        leftMenu.locator(".tool-pin-row").filter({ hasText: panelOnly }),
        `${panelOnly} has no left-sidebar rendering, so the left menu should not list it`,
      ).toHaveCount(0);
    }
    // What is listed is pinnable. Every row offers a working control.
    const leftRows = await leftMenu.locator(".tool-pin-row").count();
    expect(leftRows).toBeGreaterThan(0);
    await expect(leftMenu.locator(".tool-pin-chip")).toHaveCount(leftRows);

    // Close it through its own control; the panel is a popover, not a dialog, so
    // Escape does not dismiss it and it would intercept the next click.
    await page.locator(".app-launcher-panel").getByRole("button", { name: "Close" }).click();
    await expect(page.locator(".app-launcher-panel")).toHaveCount(0);

    // The same rule from the other side.
    await page.locator(".companion-rail-btn.add-btn").click();
    const rightMenu = page.locator("[data-pin-menu-origin='right']");
    await expect(rightMenu).toBeVisible({ timeout: 10_000 });
    await expect(rightMenu.locator(".col-side-label")).toHaveText("Right Rail");
    await expect(
      rightMenu.getByRole("button", { name: /(Pin|Unpin) .* (to|from) Left Sidebar/ }),
      "the right menu must not pin anything to the left sidebar",
    ).toHaveCount(0);

    // And the mirror: full-workspace tools are absent from the right rail's menu.
    for (const fullOnly of ["Dashboard", "Schedule", "Billing"]) {
      await expect(
        rightMenu.locator(".tool-pin-row").filter({ hasText: fullOnly }),
        `${fullOnly} has no rail rendering, so the right menu should not list it`,
      ).toHaveCount(0);
    }
    const rightRows = await rightMenu.locator(".tool-pin-row").count();
    expect(rightRows).toBeGreaterThan(0);
    await expect(rightMenu.locator(".tool-pin-chip")).toHaveCount(rightRows);

    // The two menus are genuinely different lists, not one list styled twice.
    expect(rightRows).toBeLessThan(leftRows);
  });

  test("the add button sits under the last pinned tool and moves with the list", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const startingCount = await page.locator(RAIL_ITEM).count();
    expect(startingCount, "the default rail has tools to sit under").toBeGreaterThan(0);

    // Directly under the last tool, not parked at the foot of the rail. The rail is
    // full height, so a bottom-anchored button would sit hundreds of pixels away.
    const startingGap = await gapBelowLastTool(page);
    expect(startingGap, `the add button should follow the tools, gap was ${startingGap}px`).toBeLessThan(32);
    expect(startingGap, "and should not overlap the last tool").toBeGreaterThanOrEqual(0);

    const addBefore = (await page.locator(ADD_BUTTON).boundingBox())!;

    // Pin one more tool: the list grows and the button moves down with it.
    const menu = await openLeftPinMenu(page);
    await menu.getByRole("button", { name: "Pin Labs to Left Sidebar" }).click();
    await expect(page.locator(RAIL_ITEM)).toHaveCount(startingCount + 1);

    const addAfterPin = (await page.locator(ADD_BUTTON).boundingBox())!;
    expect(addAfterPin.y, "the add button moves down when a tool is pinned").toBeGreaterThan(addBefore.y);
    expect(await gapBelowLastTool(page), "and stays against the new last tool").toBeLessThan(32);

    // Unpin it: the list shrinks and the button comes back up.
    await menu.getByRole("button", { name: "Unpin Labs from Left Sidebar" }).click();
    await expect(page.locator(RAIL_ITEM)).toHaveCount(startingCount);

    const addAfterUnpin = (await page.locator(ADD_BUTTON).boundingBox())!;
    expect(
      Math.abs(addAfterUnpin.y - addBefore.y),
      "the add button returns to where it started when the tool is removed",
    ).toBeLessThan(2);

    // Hiding the rail is chrome for the rail, not a list entry, so it keeps the
    // foot of the column while the add button moves.
    const collapse = page.locator(".dynamic-left-rail .rail-item-collapse");
    const collapseBox = (await collapse.boundingBox())!;
    expect(
      collapseBox.y,
      "the hide control stays anchored below the add button",
    ).toBeGreaterThan(addAfterUnpin.y);
  });
});
