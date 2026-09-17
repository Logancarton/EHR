import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout, waitForAuthenticatedShell } from "./workspace-fixtures";

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
 *    close an open module, so Home looked dead: the click landed, the view behind
 *    it changed, and the overlay stayed exactly where it was. The tab strip had
 *    it worse — the overlay began at the header's bottom edge and the strip was
 *    the next 44px down, so open charts could not be clicked at all.
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
      await centreIsCoveredBy(page, ".tool-navigation", ".modal-backdrop"),
      "the signing ceremony still covers the tool navigation",
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
   * The tab strip stays above a module workspace.
   *
   * It used to sit underneath one: the overlay began at the bottom of the header
   * and the strip was the next 44px down, so open charts were not merely
   * unhighlighted while a module was open — they could not be clicked at all, in
   * a product whose whole premise is that a patient stays reachable as a tab.
   * The overlay now begins below the measured chrome instead of at a hard-coded
   * header height.
   */
  test("the tab strip stays reachable above a module workspace", async ({ page }) => {
    await openMayaEncounter(page);
    await openGlobalModule(page, "website");

    await expect(async () => {
      const stripBox = await page.locator(".browser-tabs").boundingBox();
      const shellBox = await page.locator(".global-module-shell").boundingBox();
      expect(stripBox && shellBox, "both the strip and the overlay are laid out").toBeTruthy();
      expect(
        Math.round(shellBox!.y),
        "the module workspace begins below the tab strip, not on top of it",
      ).toBeGreaterThanOrEqual(Math.round(stripBox!.y + stripBox!.height));
    }).toPass({ timeout: 10_000 });

    expect(
      await centreIsCoveredBy(page, '.browser-tab[data-workspace-tab="dashboard"]', ".browser-tabs"),
      "the dashboard tab is what a click at the dashboard tab would reach",
    ).toBe(true);

    // The offset is the strip's own bottom edge, not a sum of heights. The shell
    // grid reserves a fixed header row whatever height the header takes, so in
    // compact density those two numbers differ by 16px and a sum would cover the
    // top of the tabs. Asserted against the edge so that stays true.
    const [chromeVar, stripBottom] = await page.evaluate(() => [
      getComputedStyle(document.documentElement).getPropertyValue("--workspace-chrome-h").trim(),
      `${Math.round(document.querySelector(".browser-tabs")!.getBoundingClientRect().bottom)}px`,
    ]);
    expect(chromeVar).toBe(stripBottom);

    // While the module is in front, no *chart* tab claims to be where the
    // clinician is. The module itself now has its own persistent tab (the
    // same tab-strip presence Dashboard/Calendar/patient charts already had),
    // so it is the one and only tab the strip marks active — not the chart
    // underneath, and not neither.
    await expect(page.locator(".browser-tab.active")).toHaveCount(1);
    await expect(page.locator(".browser-tab.active")).toHaveAttribute("data-workspace-tab", "module");
    await expect(page.locator(".browser-tab.active")).toContainText("Clinic Website & Portal");
  });

  test("the strip stays clear in compact density too, where a height sum would not", async ({ page }) => {
    // Compact is the case that exposed the defect: the header shrinks to 48px but
    // the shell grid keeps a 64px row for it, so header + strip heights come to
    // 92px while the strip really ends at 108px.
    const { defaultPreferences } = await import("../../app/lib/preference-engine");
    const response = await page.request.put("/api/preferences", {
      data: {
        preferences: { ...defaultPreferences, density: "compact", headerDensity: "compact" },
      },
    });
    expect(response.ok()).toBeTruthy();
    await page.goto("/");
    // Wait for the restore to finish before opening anything over it. The restore
    // announces its own destination through `ehr-switch-view`, and a module opened
    // before that lands is closed by it — which is exactly how this test failed on
    // CI while passing locally, where the restore always won the race.
    await waitForAuthenticatedShell(page);
    await expect(page.locator(".app-shell")).toHaveClass(/density-compact/);

    await openGlobalModule(page, "website");

    // Polled: the offset is published from a ResizeObserver, so it can settle a
    // frame after layout on a slower machine.
    await expect(async () => {
      const stripBox = await page.locator(".browser-tabs").boundingBox();
      const shellBox = await page.locator(".global-module-shell").boundingBox();
      expect(stripBox && shellBox, "both the strip and the overlay are laid out").toBeTruthy();
      expect(
        Math.round(shellBox!.y),
        "the overlay follows the strip's real edge, not a sum of heights",
      ).toBe(Math.round(stripBox!.y + stripBox!.height));
    }).toPass({ timeout: 10_000 });
    expect(
      await centreIsCoveredBy(page, '.browser-tab[data-workspace-tab="dashboard"]', ".browser-tabs"),
      "the tabs stay clickable at compact density",
    ).toBe(true);
  });

  test("a chart tab clicked from inside a module brings that chart to the front", async ({ page }) => {
    await openMayaEncounter(page);
    await openGlobalModule(page, "inbox");

    // A real click, hit-tested: this is the interaction that was impossible.
    await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();

    await expect(page.locator(".global-module-shell")).toHaveCount(0);
    await expect(page.locator(".patient-header h1")).toHaveText("Maya Chen");
    await expect(
      page.locator(".browser-tab.active"),
      "the chart the clinician chose is the one the strip now marks",
    ).toContainText("Maya Chen");

    // And back out to the roster the same way.
    await openGlobalModule(page, "inbox");
    await page.locator('.browser-tab[data-workspace-tab="dashboard"]').click();
    await expect(page.locator(".global-module-shell")).toHaveCount(0);
    await expect(page.locator(".today-dashboard")).toBeVisible();
  });

  test("leaving a module keeps tool menus closed and returns to Home", async ({ page }) => {
    await page.getByRole("button", { name: "Team", exact: true }).click();
    await page.getByRole("region", { name: "Team options" }).getByRole("button", { name: "Inbox", exact: true }).click();
    await expect(page.locator(".global-module-shell")).toBeVisible();
    await expect(page.locator(".tool-menu-panel")).toHaveCount(0);
    await page.locator(".brand-home-button").click();
    await expect(page.locator(".global-module-shell")).toHaveCount(0);
    await expect(page.locator(".tool-menu-panel")).toHaveCount(0);
    await expect(page.locator(".zen-home-viewport")).toBeVisible();
  });
});
