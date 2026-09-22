import { expect, test, type Page } from "@playwright/test";
import { openWorkspaceFromLauncher, signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * The two-level chrome.
 *
 * This file is named for the work-navigation row it used to drive. UI-5, UI-6 and
 * UI-7 emptied that row one destination at a time — each one rehomed and proven
 * before its entry was removed — and UI-8 removed the row itself once Dashboard, the
 * last destination the `+` launcher did not offer, had an entry there.
 *
 * The file keeps its name: it is cited by SHA and by name across the roadmap's
 * evidence entries, and renaming it would make that history unreadable to make the
 * present tidier. What it holds is unchanged in kind — row one's geometry, the tab
 * strip below it, and the Calendar workspace — read against the chrome that exists.
 */

/** The destinations the removed row carried, now offered by the `+` launcher. */
const REHOMED_DESTINATIONS = ["calendar", "intake", "dashboard"] as const;

/**
 * Row one holds identity, the omnibox and account/preferences — and nothing else.
 *
 * The version of this that walked the navigation row asserted each destination sat
 * inside the slot reserved for it and that the row never overflowed. With the row
 * gone the geometry question is what is left of it: the three remaining regions stay
 * in order, the omnibox keeps its share of the width it inherited, and nothing wraps.
 */
async function expectDesktopTopbarFit(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });

  const topbar = page.locator(".topbar");
  const brand = page.locator(".brand-nav-group");
  const omnibox = page.locator(".patient-search-wrap");
  const utilities = page.locator(".top-actions");

  await expect(topbar).toBeVisible();
  await expect(brand).toBeVisible();
  await expect(omnibox).toBeVisible();
  await expect(utilities).toBeVisible();

  await expect(
    page.locator(".tool-navigation, .tool-menu-trigger, .topbar-navigation-slot"),
    "no work-navigation row is reintroduced at any width",
  ).toHaveCount(0);

  const topbarBox = (await topbar.boundingBox())!;
  const brandBox = (await brand.boundingBox())!;
  const omniboxBox = (await omnibox.boundingBox())!;
  const utilitiesBox = (await utilities.boundingBox())!;

  expect(omniboxBox.y - topbarBox.y).toBeGreaterThanOrEqual(6);
  expect(topbarBox.y + topbarBox.height - (omniboxBox.y + omniboxBox.height)).toBeGreaterThanOrEqual(4);
  expect(brandBox.x + brandBox.width).toBeLessThanOrEqual(omniboxBox.x - 5);
  expect(omniboxBox.x + omniboxBox.width).toBeLessThanOrEqual(utilitiesBox.x - 5);

  // The omnibox inherits the width the navigation row used to take, so the floor it
  // has to clear is higher than the one the row left it, not lower.
  expect(omniboxBox.width).toBeGreaterThanOrEqual(width <= 1100 ? 250 : 310);

  // Every region stays on one line inside the header rather than wrapping under it.
  for (const [name, box] of [
    ["brand", brandBox],
    ["omnibox", omniboxBox],
    ["utilities", utilitiesBox],
  ] as const) {
    expect(box.y, `${name} stays inside the header`).toBeGreaterThanOrEqual(topbarBox.y - 1);
    expect(
      box.y + box.height,
      `${name} stays inside the header`,
    ).toBeLessThanOrEqual(topbarBox.y + topbarBox.height + 1);
  }

  await page.screenshot({ path: `test-results/navigation-fit-${width}.png` });
}


test("two chrome levels stay stable while a module opens and patient context survives navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");
  await expect(page.getByPlaceholder("Search or ask AI…")).toBeVisible();
  for (const width of [1680, 1440, 1280, 1024]) {
    await expectDesktopTopbarFit(page, width);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const card = page.locator(".dmf").first();
  const more = card.locator(".dmf-more > summary");
  await expect(card.locator(".dmf-more-panel")).not.toBeVisible();
  await more.click();
  await expect(card.locator(".dmf-more-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card.locator(".dmf-more-panel")).not.toBeVisible();
  await expect(more).toBeFocused();
  const header = (await page.locator(".topbar").boundingBox())!;
  const tabs = (await page.locator(".browser-tabs").boundingBox())!;
  expect(tabs.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
  await expect(page.locator(".dynamic-left-rail, .sidebar-drawer-trigger, .waffle-launcher")).toHaveCount(0);
  await expect(
    page.locator(".tool-navigation, .tool-menu-trigger, .topbar-navigation-slot"),
    "level 1 is identity, omnibox and account — no work-navigation row",
  ).toHaveCount(0);

  // The `+` launcher is level 2's own control and the durable open path. Its
  // geometry is what the navigation row's used to be: a stable hit target that does
  // not resize under the pointer and does not move the strip it sits in.
  const launcher = page.locator("[data-workspace-control='open-workspace-launcher']");
  const resting = (await launcher.boundingBox())!;
  expect(resting.height).toBeLessThanOrEqual(40);
  expect(resting.y).toBeGreaterThanOrEqual(tabs.y - 1);

  const home = (await page.getByRole("button", { name: "Home Launchpad" }).boundingBox())!;
  expect(home.height).toBeLessThanOrEqual(40);
  expect(home.y).toBeGreaterThan(header.y);
  expect(home.y + home.height).toBeLessThan(header.y + header.height);
  await launcher.hover();
  const hovered = (await launcher.boundingBox())!;
  expect(Math.abs(hovered.width - resting.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(hovered.height - resting.height)).toBeLessThanOrEqual(1);
  expect((await page.locator(".browser-tabs").boundingBox())!.y).toBe(tabs.y);
  await page.screenshot({ path: "test-results/navigation-hover.png" });
  await page.mouse.move(800, 400);
  await page.screenshot({ path: "test-results/navigation-overview.png" });
  const maya = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Maya Chen" });
  await maya.click();
  // A work destination opens over the workspace without taking the open chart's tab
  // away, and the tab strip does not move while it does. This reached its module
  // through the Clinical menu until UI-7d rehomed the last child and removed the
  // group, then through a direct top-bar destination until UI-8 removed the row —
  // so it now goes the way every destination goes, through the `+` launcher.
  await openWorkspaceFromLauncher(page, "intake");
  await expect(page.locator(".global-module-shell[data-active-module='intake']")).toBeVisible({
    timeout: 20_000,
  });
  expect((await page.locator(".browser-tabs").boundingBox())!.y).toBe(tabs.y);
  await expect(maya, "the open chart keeps its tab while a module is in front").toBeVisible();
  await expect(
    page.getByTestId("open-workspace-launcher-popover"),
    "no launcher popover is left open behind it",
  ).toHaveCount(0);
  await maya.click();
  await expect(maya).toHaveClass(/active/);
  await expect(page.locator(".global-module-shell")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Workspace", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/navigation-desktop.png" });
});

/**
 * Level 1 is keyboard-operable and fits a narrow viewport.
 *
 * This drove the Clinical menu's arrow-key list until UI-7d rehomed its last child
 * and removed the group, then the three direct destinations that outlived it until
 * UI-8 removed the row. The arrow-navigable popover contract did not disappear with
 * either — it belongs to the `+` Open workspace launcher, which is where
 * `workspace-open-launcher.spec.ts` asserts it.
 *
 * What is unique to this surface, and still true, is that the chrome a clinician is
 * left with is reachable and activable from the keyboard and survives 640px: the
 * omnibox, Preferences and the account menu in row one, and the `+` launcher below
 * it, which is where every work destination now lives.
 */
test("level 1 is keyboard operable and fits a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");

  await expect(
    page.locator(".tool-navigation, .tool-menu-trigger, .topbar-navigation-slot"),
    "no work-navigation row survives, at any width",
  ).toHaveCount(0);

  const topbar = page.locator(".topbar");
  const row = (await topbar.boundingBox())!;
  expect(row.x).toBeGreaterThanOrEqual(0);
  expect(row.x + row.width).toBeLessThanOrEqual(640);

  for (const control of [
    page.getByRole("textbox", { name: "Ask AI or search the EHR" }),
    topbar.getByRole("button", { name: "Preferences", exact: true }),
    topbar.getByRole("button", { name: /Account menu for/ }),
    page.locator("[data-workspace-control='open-workspace-launcher']"),
  ]) {
    await control.focus();
    await expect(control, "the control takes keyboard focus").toBeFocused();
    const box = (await control.boundingBox())!;
    expect(box.x, "the control stays inside a 640px viewport").toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(640);
  }

  // Enter activates the launcher, and every destination the removed row carried is
  // reachable and activable from the keyboard inside it — so the replacement route is
  // not mouse-only either.
  await page.locator("[data-workspace-control='open-workspace-launcher']").focus();
  await page.keyboard.press("Enter");
  const popover = page.getByTestId("open-workspace-launcher-popover");
  await expect(popover).toBeVisible();
  for (const destination of REHOMED_DESTINATIONS) {
    const item = popover.locator(`.open-workspace-item[data-workspace-id="${destination}"]`);
    await expect(item, `${destination} is offered`).toBeVisible();
    const box = (await item.boundingBox())!;
    expect(box.x, `${destination} stays inside a 640px viewport`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(640);
  }
  // Arrow to Intake and open it with Enter, with no pointer involved at all. What is
  // highlighted is asserted rather than counted, so a catalog reordering fails here
  // as a wrong highlight instead of silently opening a different workspace.
  for (let step = 0; step < 4; step += 1) await page.keyboard.press("ArrowDown");
  await expect(
    popover.locator(".open-workspace-item[aria-selected='true']"),
  ).toHaveAttribute("data-workspace-id", "intake");
  await page.keyboard.press("Enter");
  await expect(page.locator(".global-module-shell[data-active-module='intake']")).toBeVisible({
    timeout: 20_000,
  });
  await page.keyboard.press("Escape");

  // Reports is `planned` in the tool registry and was filtered out of the Practice
  // menu that used to list it. Both that menu and the row it sat in are gone, so the
  // assertion is now the whole shell: a destination with nothing behind it is offered
  // nowhere, and neither is a retired group.
  for (const absent of ["Practice", "Clinical", "Team", "Reports"]) {
    await expect(page.getByRole("button", { name: absent, exact: true })).toHaveCount(0);
  }
  await page.screenshot({ path: "test-results/navigation-narrow.png" });

  await page.getByRole("button", { name: "Home Launchpad" }).click();
  await expect(page.getByRole("textbox", { name: "Ask AI or search the EHR" })).toBeVisible();
  await expect(topbar).toBeVisible();
  await expect(
    page.locator("[data-workspace-control='open-workspace-launcher']"),
    "the open path is on screen from Home too",
  ).toBeVisible();

  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  const preferencesMenu = page.getByRole("region", { name: "Workspace options" });
  await expect(preferencesMenu).toBeVisible();
  await preferencesMenu.getByRole("button", { name: /Customize layout|Open Layout Customizer/i }).click();
  const preferences = page.getByRole("dialog", { name: "Workspace Layout Preferences" });
  await expect(preferences).toBeVisible();
  await preferences.getByRole("button", { name: "Close", exact: true }).click();
  const account = page.getByRole("button", { name: /Account menu for/ });
  await expect(account).toBeVisible();
  await account.click();
  await expect(page.getByRole("menuitem", { name: "Help", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(account).toBeFocused();
  await page.screenshot({ path: "test-results/navigation-home.png" });
});


test("Calendar opens directly as its own scheduling workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");

  await openWorkspaceFromLauncher(page, "calendar");

  const calendarSurface = page.locator(".gcal-root");
  await expect(calendarSurface).toBeVisible();
  await expect(page.locator(".browser-tab[data-workspace-tab='calendar']")).toBeVisible();
  await expect(page.locator(".global-module-shell[data-active-module='calendar']")).toHaveCount(0);
  await expect(calendarSurface.getByRole("button", { name: /New Event/i })).toBeVisible();
  await expect(calendarSurface.getByRole("tab", { name: "Day", exact: true })).toHaveCount(1);
  await expect(calendarSurface.getByRole("tab", { name: "Week", exact: true })).toHaveCount(1);
  await expect(calendarSurface.getByRole("tab", { name: "Month", exact: true })).toHaveCount(1);
  await expect(calendarSurface.getByRole("tab", { name: "Schedule", exact: true })).toHaveCount(1);
});

test("CB-3: Home tab cascade preserves readable tabs, active state, close controls, and keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");

  // Open Maya Chen and Elena Rostova tabs
  const mayaTab = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Maya Chen" });
  await expect(mayaTab).toBeVisible();
  await mayaTab.click();

  // Switch to Home Launchpad
  const homeBtn = page.getByRole("button", { name: "Home Launchpad" });
  await expect(homeBtn).toBeVisible();
  await homeBtn.click();

  // 1. Home button active state is crisp and high contrast
  await expect(page.locator(".app-shell")).toHaveClass(/view-zen-home/);
  await expect(homeBtn).toHaveClass(/active/);

  // 2. Open tabs in browser-tabs remain visible and readable on Home
  const tabsStrip = page.locator(".browser-tabs");
  await expect(tabsStrip).toBeVisible();

  // Maya Chen tab must still be visible and readable
  await expect(mayaTab).toBeVisible();
  const mayaText = mayaTab.locator(".tab-name");
  await expect(mayaText).toBeVisible();
  await expect(mayaText).toHaveText("Maya Chen");

  // Verify text color contrast: tab-name color should NOT be white (#ffffff) on light tab strip
  const textColor = await mayaText.evaluate((el) => window.getComputedStyle(el).color);
  expect(textColor).not.toBe("rgb(255, 255, 255)");

  // 3. Close controls are visible, accessible, and not masked
  const mayaCloseBtn = mayaTab.getByRole("button", { name: "Close Maya Chen" });
  await expect(mayaCloseBtn).toBeVisible();
  const closeBtnColor = await mayaCloseBtn.evaluate((el) => window.getComputedStyle(el).color);
  expect(closeBtnColor).not.toBe("rgb(255, 255, 255)");

  // 4. Keyboard focus on tabs and close controls
  await mayaCloseBtn.focus();
  await expect(mayaCloseBtn).toBeFocused();

  // 5. Work destinations keep readable text labels rather than icons to memorise.
  //    They were top-bar triggers when this was written; UI-8 moved the last three
  //    into the `+` launcher, so the requirement is checked where they now live.
  const popover = await (async () => {
    await page.locator("[data-workspace-control='open-workspace-launcher']").click();
    const node = page.getByTestId("open-workspace-launcher-popover");
    await expect(node).toBeVisible();
    return node;
  })();
  for (const destination of REHOMED_DESTINATIONS) {
    const item = popover.locator(`.open-workspace-item[data-workspace-id="${destination}"]`);
    await expect(item).toBeVisible();
    const title = item.locator(".open-workspace-item-title");
    await expect(title, "the destination is named in words, not by icon alone").toBeVisible();
    await expect(title).not.toBeEmpty();
    await expect(
      item.locator(".open-workspace-item-desc"),
      "and says what it opens",
    ).toBeVisible();
  }
  // UI-5: Team is retired, and neither surface offers it.
  await expect(popover.getByRole("button", { name: "Team", exact: true })).toHaveCount(0);
  await expect(page.locator(".topbar").getByRole("button", { name: "Team", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("CB-3: Calendar displays non-color waiting and operational status cues across week, day, and month views", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");

  // Navigate to Calendar
  await openWorkspaceFromLauncher(page, "calendar");
  await expect(page.locator(".gcal-root")).toBeVisible();

  // 1. Week View: verify non-color waiting badge for Jordan Reed
  const weekView = page.locator(".gcal-week-view");
  await expect(weekView).toBeVisible();

  // Jordan Reed has status "waiting" in seed fixtures
  const jordanEvent = weekView.locator(".gcal-event-row").filter({ hasText: "Jordan Reed" });
  await expect(jordanEvent).toBeVisible();
  
  // Non-color waiting cue: text "In Office" is present and visible
  const waitingCue = jordanEvent.locator('[data-status-cue="waiting"]');
  await expect(waitingCue).toBeVisible();
  await expect(waitingCue).toContainText("In Office");

  // Accessible aria-label includes explicit status name
  const ariaLabel = await jordanEvent.getAttribute("aria-label");
  expect(ariaLabel).toContain("Status: In Office");

  // 2. Day View: switch to Day view for the active clinic day and verify non-color status cue.
  //    The clinic day is addressed as today rather than by weekday name: the demo
  //    practice is seeded onto whatever day it is opened on, so "Fri" named the
  //    right column only while the fixtures were still pinned to their anchor.
  await weekView.locator(".gcal-week-header-col.is-today").click();
  const dayView = page.locator(".gcal-day-view");
  await expect(dayView).toBeVisible();

  // Verify non-color status cues render on day view events
  const dayStatusCue = dayView.locator(".gcal-event-row [data-status-cue]").first();
  await expect(dayStatusCue).toBeVisible();

  // 3. Month View: switch to Month view and verify non-color status cue in event pills
  await page.locator(".gcal-header-right").getByRole("tab", { name: "Month", exact: true }).click();
  const monthView = page.locator(".gcal-month-view");
  await expect(monthView).toBeVisible();

  // Non-color waiting cue in month view
  const monthWaitingCue = monthView.locator('.gcal-month-event-pill [data-status-cue="waiting"]').first();
  await expect(monthWaitingCue).toBeVisible();
  await expect(monthWaitingCue).toHaveText("In Office");
});
