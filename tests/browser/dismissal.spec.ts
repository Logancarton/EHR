import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout, waitForAuthenticatedShell } from "./workspace-fixtures";

/**
 * Getting out of a layered surface without reaching for the ×.
 *
 * `PatientInformationDrawer` has carried the comment "Escape closes, like every
 * other layered surface in the workspace" for some time; it was aspiration rather
 * than description. The drawers honoured Escape, the right rail's menu honoured
 * Escape and a click past it, and the left rail's identical menu honoured neither
 * keystroke. The Clinical AI answer card had no exit at all except its ×.
 *
 * Which gestures a surface gets is a property of the surface, and these tests
 * encode the distinctions rather than asserting one blanket rule:
 *
 * - A **popover** — a rail menu, an overlay card — takes Escape and a click past it.
 * - A surface that **fills the content area** takes Escape only. "Past it" is the
 *   rail and the header, and a stray click must not close what is being worked in.
 * - A card that sits **in the flow** takes Escape only, for a different reason:
 *   dismissing on the press reflows what is underneath before the click lands.
 * - A **text field keeps Escape** unless the surface is layered above it.
 */

async function openShortcutRail(page: import("@playwright/test").Page) {
  const trigger = page.getByRole("button", { name: "Open sidebar shortcuts" });
  if (await trigger.isVisible().catch(() => false)) await trigger.click();
  await expect(page.locator(".dynamic-left-rail")).toBeVisible();
}

test.describe("dismissing a layered surface", () => {
  test("the rail's pin menu closes on Escape as well as the ×", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    await openShortcutRail(page);

    const menu = page.locator("[data-pin-menu-origin='left']");

    await page.locator(".dynamic-left-rail .rail-item-add").click();
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu, "Escape leaves the menu").toHaveCount(0);

    // Clicking past it still works, and so does the × — none of the three exits
    // replaced the others.
    await page.locator(".dynamic-left-rail .rail-item-add").click();
    await expect(menu).toBeVisible();
    // Well clear of the popover, which is anchored beside the rail near the top.
    const dashboard = page.locator(".today-dashboard");
    const box = (await dashboard.boundingBox())!;
    await page.mouse.click(box.x + box.width - 40, box.y + box.height - 40);
    await expect(menu, "clicking past the menu leaves it").toHaveCount(0);

    await page.locator(".dynamic-left-rail .rail-item-add").click();
    await expect(menu).toBeVisible();
    await page.locator(".app-launcher-panel").getByRole("button", { name: "Close" }).click();
    await expect(menu, "the × still leaves it").toHaveCount(0);
  });

  test("a workspace module closes on Escape but not on a stray click", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    await openShortcutRail(page);

    const shell = page.locator(".global-module-shell");
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "billing" } }));
    });
    await expect(shell).toBeVisible({ timeout: 20_000 });

    // A click on the rail beside it must not close the thing being worked in.
    await page.locator(".dynamic-left-rail").click({ position: { x: 10, y: 400 } });
    await expect(shell, "a module is not a popover; clicking past it keeps it open").toBeVisible();

    await page.keyboard.press("Escape");
    await expect(shell, "Escape leaves the module").toHaveCount(0);
  });

  test("a composer inside a module keeps Escape for itself", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    await openShortcutRail(page);

    const shell = page.locator(".global-module-shell");
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "tasks" } }));
    });
    await expect(shell).toBeVisible({ timeout: 20_000 });

    // Half a task typed into the composer. Escape belongs to the field here, and
    // taking it to close the module would throw the draft away.
    const composer = shell.getByLabel("Add a practice task");
    await composer.click();
    await composer.fill("Call the pharmacy about the prior auth");
    await page.keyboard.press("Escape");

    await expect(shell, "a keystroke meant for a field must not close the workspace").toBeVisible();
  });

  test("the Clinical AI answer closes on Escape from the box that asked for it", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    await openShortcutRail(page);

    const omnibox = page.getByLabel("Ask AI or search the EHR");
    await omnibox.click();
    await omnibox.fill("What medications is Maya Chen taking?");
    await omnibox.press("Enter");

    const card = page.locator(".omnibox-plan-overlay [data-omnibox-plan-card]");
    // The settled card rather than its "Understanding request…" frame; the
    // mid-flight case has a test of its own below.
    await expect(card.locator(".omnibox-plan-body")).toBeVisible({ timeout: 20_000 });

    // Focus is still in the omnibox. The card is layered above it, so it answers
    // first — this is the case a blanket "never steal Escape from a field" rule
    // would have got wrong, leaving the × as the only way out.
    await expect(omnibox).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(card, "Escape from the asking box retires the answer").toHaveCount(0);

    // And it is an overlay, so clicking past it is safe and also closes it.
    await omnibox.click();
    await omnibox.fill("What medications is Maya Chen taking?");
    await omnibox.press("Enter");
    await expect(card.locator(".omnibox-plan-body")).toBeVisible({ timeout: 20_000 });
    const content = page.locator(".today-dashboard");
    const contentBox = (await content.boundingBox())!;
    await page.mouse.click(contentBox.x + contentBox.width - 40, contentBox.y + contentBox.height - 40);
    await expect(card, "clicking past an overlay leaves it").toHaveCount(0);
  });

  test("the home launcher's answer closes on Escape, and a click below it still lands", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    await openShortcutRail(page);
    await page.getByRole("button", { name: "Home Launchpad" }).click();
    await expect(page.locator(".zen-home-viewport")).toBeVisible({ timeout: 20_000 });

    const input = page.locator(".zen-pill-input");
    const card = page.locator(".zen-ai-plan-card [data-omnibox-plan-card]");

    await input.click();
    await input.fill("What medications is Maya Chen taking?");
    await input.press("Enter");
    await expect(card.locator(".omnibox-plan-body")).toBeVisible({ timeout: 20_000 });

    await page.keyboard.press("Escape");
    await expect(card, "Escape retires the answer here too").toHaveCount(0);

    /**
     * And deliberately no click-away on this one.
     *
     * This card is in the flow — it pushes the shortcut grid down. Dismissing it
     * on the press pulled the grid back up between press and release, so a click
     * aimed at the EHR tile landed on whatever slid under the cursor.
     */
    await input.click();
    await input.fill("What medications is Maya Chen taking?");
    await input.press("Enter");
    await expect(card.locator(".omnibox-plan-body")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "EHR" }).click();
    await expect(
      page.locator(".today-dashboard"),
      "a click below the card reaches the control it was aimed at",
    ).toBeVisible({ timeout: 20_000 });
  });

  test("dismissing while the answer is still in flight keeps it away when it lands", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    await openShortcutRail(page);

    /**
     * The regression this guards.
     *
     * The overlay decided it was showing from `loading || error || plan`, so
     * dismissing mid-flight cleared the plan and left the card up through
     * `loading` — and the answer, when it arrived, put it back. Someone who has
     * put the card away has put it away.
     *
     * The response is held open deliberately rather than raced against: this has
     * to press Escape while the request is genuinely outstanding, which is not
     * something a timing guess can promise.
     */
    let release: (() => void) | null = null;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/ai/omnibox/plan", async (route) => {
      await held;
      await route.continue();
    });

    const omnibox = page.getByLabel("Ask AI or search the EHR");
    await omnibox.click();
    await omnibox.fill("What medications is Maya Chen taking?");
    await omnibox.press("Enter");

    const card = page.locator(".omnibox-plan-overlay [data-omnibox-plan-card]");
    await expect(card, "the card appears while the request is in flight").toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText(/Understanding request/i);
    await expect(card.locator(".omnibox-plan-body"), "and has no answer in it yet").toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(card, "Escape closes it even though the request has not returned").toHaveCount(0);

    // Now let the answer arrive at a card nobody is waiting for any more.
    release!();
    await page.waitForResponse((response) => response.url().includes("/api/ai/omnibox/plan"));
    await page.waitForTimeout(600);
    await expect(card, "a late answer does not reopen a dismissed card").toHaveCount(0);

    // And the next question still works — dismissal is not a one-way door.
    await omnibox.click();
    await omnibox.fill("What medications is Maya Chen taking?");
    await omnibox.press("Enter");
    await expect(card.locator(".omnibox-plan-body")).toBeVisible({ timeout: 20_000 });
  });

  test("every dismissal leaves the workspace intact", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    await openShortcutRail(page);

    // Escape is now heard by several surfaces. Pressing it with nothing layered
    // open must not be a way to lose the workspace.
    await expect(page.locator(".today-dashboard")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.locator(".today-dashboard")).toBeVisible();
    await expect(page.locator(".dynamic-left-rail")).toBeVisible();

    await page.reload();
    await waitForAuthenticatedShell(page);
    await expect(page.locator(".today-dashboard")).toBeVisible();
  });
});
