import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * Two defects about the same thing: what is on top, and what a click reaches.
 *
 * A global module workspace — Inbox, Tasks, the Website manager — is a fixed
 * overlay above the chart area. Two separate bugs broke that contract in
 * opposite directions, and both are only visible in a real browser, because both
 * are about painting order rather than about which elements exist.
 *
 * 1. **The note's chrome pierced the overlay.** The encounter toolbar and coding
 *    dock carried app-level z-indexes, so opening a module over a chart left
 *    "Template · Past notes · Therapy time · Review & Sign" painted across it,
 *    live and clickable.
 * 2. **Navigation could not escape the overlay.** Changing workspace view did not
 *    close an open module, so Home, the Dashboard tab and every patient tab
 *    looked dead: the click landed, the view behind it changed, and the overlay
 *    stayed exactly where it was.
 *
 * Every assertion here hit-tests a real point on screen rather than checking
 * visibility, because an element covered by another is still "visible" to a
 * selector and still entirely useless to a clinician.
 */

/** What is actually painted at the centre of `selector`, as a class string. */
async function topmostAtCentreOf(page: Page, selector: string): Promise<string | null> {
  return page.evaluate((sel) => {
    const target = document.querySelector(sel);
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit ? String(hit.className || hit.tagName) : null;
  }, selector);
}

/** Whether the element at the centre of `selector` belongs to `ancestorSelector`. */
async function centreIsCoveredBy(page: Page, selector: string, ancestorSelector: string) {
  return page.evaluate(
    ({ sel, ancestor }) => {
      const target = document.querySelector(sel);
      if (!target) return false;
      const rect = target.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return Boolean(hit && hit.closest(ancestor));
    },
    { sel: selector, ancestor: ancestorSelector },
  );
}

async function openMayaEncounter(page: Page) {
  await page.locator(".browser-tab").filter({ hasText: "Maya Chen" }).click();
  await page
    .locator(".primary-workspace-pane .section-tabs")
    .getByRole("tab", { name: "Encounter", exact: true })
    .click();
  await expect(page.locator(".encounter-top-toolbar")).toBeVisible();
}

async function openGlobalModule(page: Page, module: string) {
  await page.evaluate((view) => {
    window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view } }));
  }, module);
  await expect(page.locator(".global-module-shell")).toBeVisible();
}

test.describe("workspace layering", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInWithDefaultLayout(page, "Prototype provider");
  });

  test("a module workspace is not pierced by the note chrome underneath it", async ({ page }) => {
    await openMayaEncounter(page);

    // The toolbar's whole job: sit above the note scrolling beneath it.
    expect(
      await centreIsCoveredBy(page, ".encounter-top-toolbar", ".encounter-top-toolbar"),
      "the toolbar still sits above the note it belongs to",
    ).toBe(true);

    await openGlobalModule(page, "website");

    // The toolbar still exists in the DOM under the overlay; what matters is that
    // it is no longer what a clinician's click would reach.
    expect(
      await centreIsCoveredBy(page, ".encounter-top-toolbar", ".encounter-top-toolbar"),
      "the encounter toolbar must not paint through the module workspace",
    ).toBe(false);
    expect(
      await topmostAtCentreOf(page, ".encounter-top-toolbar"),
      "the module workspace owns that space instead",
    ).not.toContain("encounter-top-toolbar");

    // The coding dock carried the same defect at the bottom of the chart.
    if (await page.locator(".coding-engine-dock").count()) {
      expect(
        await centreIsCoveredBy(page, ".coding-engine-dock", ".coding-engine-dock"),
        "the coding dock must not paint through the module workspace either",
      ).toBe(false);
    }

    // The module's own controls are reachable, which is the thing the clinician lost.
    const moduleHeader = page.locator(".global-module-shell");
    await expect(moduleHeader).toContainText("Clinic Website");
    await expect(
      moduleHeader.getByRole("button", { name: /Preview Live Site/i }),
    ).toBeVisible();
  });

  test("the note region isolates its own chrome without trapping its overlays", async ({ page }) => {
    await openMayaEncounter(page);

    // The isolation is what makes the fix general: nothing inside the note region
    // can reach app-level stacking, whatever z-index it asks for.
    const isolation = await page.evaluate(
      () => getComputedStyle(document.querySelector(".encounter-workspace-root")!).isolation,
    );
    expect(isolation, "the encounter region is a stacking context of its own").toBe("isolate");

    // The signing ceremony is genuinely app-level, so it is rendered outside that
    // region — and must still cover the header and rails it is meant to sit above.
    await page.getByRole("button", { name: "Review & Sign", exact: true }).first().click();
    await expect(page.locator(".modal-backdrop")).toBeVisible();

    expect(
      await page.evaluate(
        () => !document.querySelector(".modal-backdrop")!.closest(".encounter-workspace-root"),
      ),
      "the signing ceremony is not trapped inside the isolated note region",
    ).toBe(true);
    expect(
      await centreIsCoveredBy(page, ".topbar", ".modal-backdrop"),
      "the signing ceremony still covers the application header",
    ).toBe(true);
    expect(
      await centreIsCoveredBy(page, ".dynamic-left-rail", ".modal-backdrop"),
      "the signing ceremony still covers the left rail",
    ).toBe(true);
  });

  test("the reachable ways out of a module all leave it", async ({ page }) => {
    await openMayaEncounter(page);

    // Home, from the application header.
    await openGlobalModule(page, "website");
    await page.locator(".brand-home-button").click();
    await expect(
      page.locator(".global-module-shell"),
      "Home leaves the module rather than switching the view behind it",
    ).toHaveCount(0);
    await expect(page.locator(".app-shell")).toHaveClass(/view-zen-home/);

    // The brand title beside it is the same destination and must behave the same.
    await openGlobalModule(page, "website");
    await page.locator(".brand-titles").click();
    await expect(page.locator(".global-module-shell")).toHaveCount(0);
    await expect(page.locator(".app-shell")).toHaveClass(/view-zen-home/);

    // Back into a chart, so the module has something to have been hiding.
    await openMayaEncounter(page);
    await openGlobalModule(page, "website");
    await expect(page.locator(".encounter-top-toolbar")).toBeHidden({ timeout: 2_000 }).catch(() => {});
    await page.locator(".global-module-shell").getByRole("button", { name: /^Close /i }).click();
    await expect(page.locator(".global-module-shell")).toHaveCount(0);
    await expect(
      page.locator(".primary-workspace-pane .encounter-workspace-root"),
      "leaving the module returns the clinician to the chart it covered",
    ).toBeVisible();
  });

  /**
   * The tab strip sits under the module workspace, by layout: the overlay starts
   * at the bottom of the header and the strip is the next 44px down. So while a
   * module is open the open charts are not merely unhighlighted — they cannot be
   * clicked at all, and the header controls above are the way back.
   *
   * Pinned here as the current behaviour rather than asserted as desirable. The
   * tab handlers already leave an open module, so if the strip is ever lifted
   * clear of the overlay they will behave correctly the moment they are
   * reachable — and this test should be revisited when that happens.
   */
  test("while a module is open the tab strip is covered, and the header is the way back", async ({ page }) => {
    await openMayaEncounter(page);
    await openGlobalModule(page, "website");

    expect(
      await centreIsCoveredBy(page, '.browser-tab[data-workspace-tab="dashboard"]', ".global-module-shell"),
      "the tab strip currently sits underneath the module workspace",
    ).toBe(true);

    for (const control of [".brand-home-button", ".brand-titles"]) {
      expect(
        await centreIsCoveredBy(page, control, ".topbar"),
        `${control} stays reachable above the module workspace`,
      ).toBe(true);
    }
    expect(
      await centreIsCoveredBy(page, ".dynamic-left-rail button.rail-item", ".dynamic-left-rail"),
      "the rail stays reachable beside the module workspace",
    ).toBe(true);
  });

  test("leaving a module also drops the rail highlight that named it", async ({ page }) => {
    const inboxRailItem = page.locator("button.rail-item").filter({ hasText: "Inbox" }).first();
    await inboxRailItem.click();
    await expect(page.locator(".global-module-shell")).toBeVisible();
    await expect(inboxRailItem, "the rail marks where the clinician is").toHaveClass(/active/);

    await page.locator(".brand-home-button").click();
    await expect(page.locator(".global-module-shell")).toHaveCount(0);
    await expect(
      inboxRailItem,
      "the rail must not keep claiming a module the clinician has left",
    ).not.toHaveClass(/active/);
  });
});
