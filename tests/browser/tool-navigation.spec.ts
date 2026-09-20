import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

const TOP_LEVEL_DESTINATIONS = [
  "Clinical",
  "Calendar",
  "Intake",
  "Team",
  "Practice",
  "Dashboard",
] as const;

async function expectDesktopTopbarFit(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });

  const topbar = page.locator(".topbar");
  const brand = page.locator(".brand-nav-group");
  const navigation = page.locator(".topbar-navigation-slot");
  const navigationRow = page.locator(".tool-navigation-row");
  const omnibox = page.locator(".patient-search-wrap");
  const utilities = page.locator(".top-actions");
  const dashboard = page.getByRole("button", { name: "Dashboard", exact: true });

  await expect(topbar).toBeVisible();
  await expect(brand).toBeVisible();
  await expect(navigation).toBeVisible();
  await expect(omnibox).toBeVisible();
  await expect(utilities).toBeVisible();
  await expect(dashboard).toBeVisible();

  for (const label of TOP_LEVEL_DESTINATIONS) {
    const destination = page.locator(".tool-menu-trigger").filter({ hasText: label });
    await expect(destination).toBeVisible();
    const destinationBox = (await destination.boundingBox())!;
    const navigationBox = (await navigation.boundingBox())!;
    expect(destinationBox.x).toBeGreaterThanOrEqual(navigationBox.x - 1);
    expect(destinationBox.x + destinationBox.width).toBeLessThanOrEqual(
      navigationBox.x + navigationBox.width + 1,
    );
  }

  const topbarBox = (await topbar.boundingBox())!;
  const brandBox = (await brand.boundingBox())!;
  const navigationBox = (await navigation.boundingBox())!;
  const dashboardBox = (await dashboard.boundingBox())!;
  const omniboxBox = (await omnibox.boundingBox())!;
  const utilitiesBox = (await utilities.boundingBox())!;

  expect(omniboxBox.y - topbarBox.y).toBeGreaterThanOrEqual(6);
  expect(topbarBox.y + topbarBox.height - (omniboxBox.y + omniboxBox.height)).toBeGreaterThanOrEqual(4);
  expect(brandBox.x + brandBox.width).toBeLessThanOrEqual(navigationBox.x - 5);
  expect(dashboardBox.x + dashboardBox.width).toBeLessThanOrEqual(
    navigationBox.x + navigationBox.width + 1,
  );
  expect(navigationBox.x + navigationBox.width).toBeLessThanOrEqual(omniboxBox.x - 5);
  expect(omniboxBox.x + omniboxBox.width).toBeLessThanOrEqual(utilitiesBox.x - 5);
  expect(omniboxBox.width).toBeGreaterThanOrEqual(width <= 1100 ? 250 : 310);

  const navigationScroll = await navigationRow.evaluate((element) => ({
    clientWidth: (element as HTMLElement).clientWidth,
    scrollWidth: (element as HTMLElement).scrollWidth,
  }));
  expect(navigationScroll.scrollWidth).toBeLessThanOrEqual(navigationScroll.clientWidth + 1);

  await page.screenshot({ path: `test-results/navigation-fit-${width}.png` });
}


test("two chrome levels stay stable while menus open and patient context survives navigation", async ({ page }) => {
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
  const tools = (await page.locator(".tool-navigation").boundingBox())!;
  const tabs = (await page.locator(".browser-tabs").boundingBox())!;
  expect(tools.y).toBeGreaterThanOrEqual(header.y);
  expect(tools.y + tools.height).toBeLessThanOrEqual(header.y + header.height + 1);
  expect(tabs.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
  await expect(page.locator(".dynamic-left-rail, .sidebar-drawer-trigger, .waffle-launcher")).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "Clinical", exact: true });
  const resting = (await trigger.boundingBox())!;
  expect(resting.width).toBeGreaterThanOrEqual(60);
  expect(resting.height).toBeLessThanOrEqual(40);
  for (const label of TOP_LEVEL_DESTINATIONS) {
    const tab = page.locator(".tool-menu-trigger").filter({ hasText: label });
    const icon = tab.locator(".icon").first();
    const textLabel = tab.locator("span:not(.icon)").filter({ hasText: label });
    await expect(textLabel).toBeVisible();
    const iconBox = (await icon.boundingBox())!;
    const labelBox = (await textLabel.boundingBox())!;
    const tabBox = (await tab.boundingBox())!;
    expect(labelBox.x).toBeGreaterThanOrEqual(iconBox.x + iconBox.width - 1);
    expect(Math.abs((iconBox.y + iconBox.height / 2) - (labelBox.y + labelBox.height / 2))).toBeLessThanOrEqual(3);
    expect(labelBox.x).toBeGreaterThanOrEqual(tabBox.x + 2);
    expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(tabBox.x + tabBox.width - 2);
  }
  const home = (await page.getByRole("button", { name: "Home Launchpad" }).boundingBox())!;
  expect(home.height).toBeLessThanOrEqual(40);
  expect(home.y).toBeGreaterThan(header.y);
  expect(home.y + home.height).toBeLessThan(header.y + header.height);
  await trigger.hover();
  const hovered = (await trigger.boundingBox())!;
  expect(Math.abs(hovered.width - resting.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(hovered.height - resting.height)).toBeLessThanOrEqual(1);
  expect((await page.locator(".browser-tabs").boundingBox())!.y).toBe(tabs.y);
  await page.screenshot({ path: "test-results/navigation-hover.png" });
  await page.mouse.move(800, 400);
  await page.screenshot({ path: "test-results/navigation-overview.png" });
  const maya = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Maya Chen" });
  await maya.click();
  await page.getByRole("button", { name: "Clinical", exact: true }).click();
  await expect(page.getByRole("region", { name: "Clinical options" })).toBeVisible();
  expect((await page.locator(".browser-tabs").boundingBox())!.y).toBe(tabs.y);
  await page.getByRole("region", { name: "Clinical options" }).getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(page.locator(".global-tasks-workspace")).toBeVisible();
  await expect(maya).toBeVisible();
  await page.getByRole("button", { name: "Clinical", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".tool-menu-panel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clinical", exact: true })).toBeFocused();
  await expect(page.locator(".global-tasks-workspace")).toBeVisible();
  await maya.click();
  await expect(maya).toHaveClass(/active/);
  await expect(page.locator(".global-module-shell")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Workspace", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/navigation-desktop.png" });
});

test("tool menus support keyboard access and fit a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");
  const clinical = page.getByRole("button", { name: "Clinical", exact: true });
  await clinical.focus();
  await page.keyboard.press("ArrowDown");
  const panel = page.getByRole("region", { name: "Clinical options" });
  await expect(panel.getByRole("button", { name: "Patients", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(panel.getByRole("button", { name: "Tasks", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(clinical).toBeFocused();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  const box = (await page.getByRole("region", { name: "Practice options" }).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(640);
  await expect(page.getByRole("region", { name: "Practice options" }).getByRole("button", { name: "Reports" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/navigation-narrow.png" });
  await page.getByRole("button", { name: "Home Launchpad" }).click();
  await expect(page.getByRole("textbox", { name: "Ask AI or search the EHR" })).toBeVisible();
  await expect(page.locator(".tool-navigation")).toBeVisible();
  for (const label of TOP_LEVEL_DESTINATIONS) {
    await expect(page.locator(".tool-menu-trigger").filter({ hasText: label })).toBeVisible();
  }
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

  const calendar = page.locator(".tool-navigation").getByRole("button", { name: "Calendar", exact: true });
  await calendar.click();

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

  // 5. System modules in topbar maintain readable text labels (not forced to icon-only)
  for (const label of ["Clinical", "Calendar", "Intake", "Team", "Practice", "Dashboard"]) {
    const trigger = page.locator(".tool-menu-trigger").filter({ hasText: label });
    await expect(trigger).toBeVisible();
    const labelSpan = trigger.locator("span:not(.icon)").filter({ hasText: label });
    await expect(labelSpan).toBeVisible();
  }
});

test("CB-3: Calendar displays non-color waiting and operational status cues across week, day, and month views", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");

  // Navigate to Calendar
  await page.locator(".tool-navigation").getByRole("button", { name: "Calendar", exact: true }).click();
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

  // 2. Day View: switch to Day view and verify non-color status cue
  await page.locator(".gcal-header-right").getByRole("tab", { name: "Day", exact: true }).click();
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
