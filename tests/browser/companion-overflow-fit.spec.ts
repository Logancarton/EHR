import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

// QA review 2026-10-04: controls that `toBeVisible` called visible were in fact
// clipped to a sliver or painted over by their neighbours. Every check here
// measures the rendered geometry: the element's box is inside the viewport and
// its pane, and `elementFromPoint` at its centre lands on the element itself.
// 720x450 is the CSS-pixel viewport of a 1440x900 window at 200% zoom.

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 800 },
  { width: 720, height: 450 },
] as const;

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box, "element is laid out").not.toBeNull();
  return box!;
}

function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
}

/** Scrolls the element into view, then proves it is on screen and on top. */
async function expectHittable(page: Page, locator: Locator, label: string, within?: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await boxOf(locator);
  const viewport = page.viewportSize()!;
  expect(box.width, `${label}: has width`).toBeGreaterThan(8);
  expect(box.height, `${label}: has height`).toBeGreaterThan(8);
  expect(box.x, `${label}: left edge on screen`).toBeGreaterThanOrEqual(-1);
  expect(box.y, `${label}: top edge on screen`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${label}: right edge on screen`).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height, `${label}: bottom edge on screen`).toBeLessThanOrEqual(viewport.height + 1);
  if (within) {
    const pane = await boxOf(within);
    expect(box.x, `${label}: inside its pane (left)`).toBeGreaterThanOrEqual(pane.x - 1);
    expect(box.x + box.width, `${label}: inside its pane (right)`).toBeLessThanOrEqual(pane.x + pane.width + 1);
  }
  const onTop = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return Boolean(hit && (hit === element || element.contains(hit)));
  });
  expect(onTop, `${label}: nothing covers or clips its centre`).toBe(true);
}

async function settle(panel: Locator) {
  // Only the panel's own entry animation; loading spinners inside it never finish.
  await panel.evaluate((element) =>
    Promise.race([
      Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 1_000)),
    ]),
  );
}

async function openToolOnMaya(page: Page, toolId: string, selector: string) {
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();
  // Rail buttons toggle, and companion selection is restored apart from layout
  // reset, so the tool may already be open; a second click would close it.
  const rail = page.locator(`.companion-rail-btn[data-tool-id="${toolId}"]`);
  if ((await rail.getAttribute("aria-pressed")) !== "true") await rail.click();
  const panel = page.locator(selector).first();
  await expect(panel.locator(".companion-panel-header strong")).toBeVisible();
  await settle(panel);
  return panel;
}

const COMMUNICATION = ".companion-panel[data-companion-panel='communication']";
const LABS = ".companion-frame[data-companion-panel='labs']";

for (const viewport of VIEWPORTS) {
  test.describe(`at ${viewport.width}x${viewport.height}`, () => {
    test.beforeEach(async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
    });

    test("Calendar companion Follow-up presets and toolbar are on screen, not clipped", async ({ page }) => {
      await signInWithDefaultLayout(page, "Prototype provider");
      const calendarRail = page.locator(".companion-rail-btn[aria-label='Calendar']").first();
      if ((await calendarRail.getAttribute("aria-pressed")) !== "true") await calendarRail.click();
      const panel = page.locator("aside.companion-calendar-panel");
      await expect(panel.locator('.gcal-root[data-calendar-presentation="companion"]')).toBeVisible();
      await settle(panel);

      // Every toolbar control stays reachable; none has scrolled out of a strip.
      for (const name of ["Follow-up"]) {
        await expectHittable(page, panel.getByRole("button", { name, exact: true }), `toolbar ${name}`, panel);
      }
      const views = panel.locator(".gcal-view-tab");
      for (let index = 0; index < (await views.count()); index += 1) {
        await expectHittable(page, views.nth(index), `view tab ${index}`, panel);
      }
      await expectHittable(page, panel.locator(".gcal-btn-schedule-quick").first(), "New event", panel);

      await panel.getByRole("button", { name: "Follow-up", exact: true }).click();
      const followUp = panel.getByRole("dialog", { name: "Clinical follow-up date" });
      await expect(followUp).toBeVisible();
      const popover = await boxOf(followUp);
      const pane = await boxOf(panel);
      expect(popover.width, "the popover is a usable width, not its trigger's").toBeGreaterThan(Math.min(240, pane.width - 24));
      expect(popover.x).toBeGreaterThanOrEqual(pane.x - 1);
      expect(popover.x + popover.width).toBeLessThanOrEqual(pane.x + pane.width + 1);
      expect(popover.y + popover.height, "popover ends on screen").toBeLessThanOrEqual(viewport.height + 1);

      await expectHittable(page, followUp.locator(".gcal-jump-days-input"), "days input", panel);
      const presets = followUp.locator(".gcal-preset-pill");
      expect(await presets.count()).toBeGreaterThanOrEqual(3);
      for (let index = 0; index < (await presets.count()); index += 1) {
        await expectHittable(page, presets.nth(index), `preset ${await presets.nth(index).innerText()}`, panel);
      }
      await page.screenshot({ path: `output/playwright/companion-overflow-calendar-followup-${viewport.width}.png` });

      const plus28 = presets.filter({ hasText: "+28d" });
      await plus28.click();
      await expect(plus28, "the click reached the preset and moved the calendar").toHaveClass(/active/);
    });

    test("Communication thread keeps a usable conversation and no overlap while composing", async ({ page }) => {
      await signInWithDefaultLayout(page, "Prototype provider");
      const panel = await openToolOnMaya(page, "communication", COMMUNICATION);
      await panel.locator(".thread-item").first().click();
      const draft = panel.locator(".message-composer textarea");
      await draft.fill("Synthetic overflow-fit draft");

      const heading = panel.locator(".sidebar-heading");
      const compose = panel.locator(".sidebar-top-bar").getByRole("button", { name: "Compose", exact: true });
      const threadHeader = panel.locator(".thread-header");
      const feed = panel.locator(".messages-conversation-feed");
      // Measured from the top of the panel's single scroll region. The composer is
      // left out: on tall screens it is pinned (sticky) to the bottom of that region
      // and deliberately sits over content scrolling beneath it.
      await panel.locator(".comm-panel-body").evaluate((element) => { element.scrollTop = 0; });
      const regions = [heading, compose, panel.locator(".messages-filter-pills"), panel.locator(".thread-list"), threadHeader, feed];
      const boxes = await Promise.all(regions.map(boxOf));
      for (let a = 0; a < boxes.length; a += 1) {
        for (let b = a + 1; b < boxes.length; b += 1) {
          if (a === 0 && b === 1) continue; // heading and Compose share a row by design
          expect(overlaps(boxes[a], boxes[b]), `regions ${a} and ${b} do not paint over each other`).toBe(false);
        }
      }
      expect(overlaps(boxes[0], boxes[1]), "heading and Compose sit side by side, not on top of each other").toBe(false);
      expect(boxes[5].height, "conversation is tall enough to read").toBeGreaterThanOrEqual(110);

      await expectHittable(page, compose, "Compose", panel);
      await expectHittable(page, panel.locator(".message-bubble-row").first(), "first message", panel);
      await expectHittable(page, draft, "draft textarea", panel);
      await expect(draft).toHaveValue("Synthetic overflow-fit draft");
      await page.screenshot({ path: `output/playwright/companion-overflow-comms-draft-${viewport.width}.png` });

      await panel.getByRole("button", { name: "Expand to main canvas" }).click();
      await expect(panel.getByRole("button", { name: "Redock to companion rail" })).toBeVisible();
      await settle(panel);
      await expect(draft, "draft survives expand").toHaveValue("Synthetic overflow-fit draft");
      expect((await boxOf(feed)).height, "expanded conversation is tall enough to read").toBeGreaterThanOrEqual(110);
      expect(overlaps(await boxOf(threadHeader), await boxOf(heading))).toBe(false);
      await expectHittable(page, draft, "expanded draft textarea", panel);
      await page.screenshot({ path: `output/playwright/companion-overflow-comms-expanded-${viewport.width}.png` });

      await panel.getByRole("button", { name: "Redock to companion rail" }).click();
      await expect(panel.getByRole("button", { name: "Expand to main canvas" })).toBeVisible();
      await expect(draft, "draft survives redock").toHaveValue("Synthetic overflow-fit draft");
    });

    test("Labs companion tabs show their full labels with the patient named", async ({ page }) => {
      await signInWithDefaultLayout(page, "Prototype provider");
      const panel = await openToolOnMaya(page, "labs", LABS);
      await expect(panel.locator(".companion-panel-header small")).toContainText("Maya Chen");
      await expect(panel.getByText("Loading medication surveillance records…", { exact: true })).toHaveCount(0);
      const tabs = panel.getByRole("tablist", { name: "Labs view options" }).getByRole("tab");
      await expect(tabs).toHaveCount(3);
      for (let index = 0; index < 3; index += 1) {
        const tab = tabs.nth(index);
        await expectHittable(page, tab, `labs tab ${index}`, panel);
        const truncated = await tab.evaluate((element) =>
          [...element.querySelectorAll("span")].some((span) => span.scrollWidth > span.clientWidth + 1),
        );
        expect(truncated, `labs tab ${index} label is not cut off`).toBe(false);
      }
      // The header naming the patient is still on screen with the tabs scrolled into view.
      await expectHittable(page, panel.locator(".companion-panel-header strong"), "labs header title", panel);
      await expect(panel.locator(".companion-panel-header small")).toBeInViewport();
      await page.screenshot({ path: `output/playwright/companion-overflow-labs-${viewport.width}.png` });

      await tabs.nth(1).click();
      await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    });

    test("Open workspace and patient overflow stay reachable with six patient tabs", async ({ page }) => {
      await signInWithDefaultLayout(page, "Prototype provider");
      // Opened the way a clinician does, from the omnibox, on top of the two default charts.
      for (const name of ["Sofia Martinez", "Marcus Vance", "Elena Rostova", "David Kim"]) {
        const input = page.getByLabel("Ask AI or search the EHR");
        await input.click();
        await input.fill(name);
        const result = page.locator(".search-results button[data-omnibox-result=\"patient\"]").filter({ hasText: name }).first();
        await expect(result).toBeVisible({ timeout: 15_000 });
        await result.click();
        await expect(page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: name })).toHaveCount(1);
      }
      const strip = page.locator(".browser-tabs");
      const overflow = page.getByRole("button", { name: /More patient tabs/ });
      const launcher = page.locator("[data-workspace-control='open-workspace-launcher']");
      await expect(overflow).toHaveAccessibleName("More patient tabs (2)");
      // Scroll the strip to its start, the position that hid them before.
      await strip.evaluate((element) => { element.scrollLeft = 0; });
      await expectHittable(page, overflow, "Patients +N", strip);
      await expectHittable(page, launcher, "Open workspace +", strip);
      expect(overlaps(await boxOf(overflow), await boxOf(launcher))).toBe(false);
      await page.screenshot({ path: `output/playwright/companion-overflow-tabs-${viewport.width}.png` });

      await launcher.click();
      await expect(page.getByTestId("open-workspace-launcher-popover")).toBeVisible();
      await page.keyboard.press("Escape");
      await overflow.click();
      await expect(page.getByRole("menu", { name: "Open patient tabs" }).getByRole("menuitem")).toHaveCount(2);
    });
  });
}

test("Communication sub-tabs and thread details fit the minimum dock", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");
  // The width preference already has an owner; reload only establishes the minimum-dock precondition.
  await page.evaluate(() => window.localStorage.setItem("ehr-companion-panel-width-v1", "260"));
  await page.reload();
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-workspace-restored", "true");

  const panel = await openToolOnMaya(page, "communication", COMMUNICATION);
  const subTabs = panel.getByRole("tablist", { name: "Patient communication views" }).getByRole("tab");
  await expect(subTabs).toHaveCount(2);
  const tabBoxes = [await boxOf(subTabs.nth(0)), await boxOf(subTabs.nth(1))];
  expect(overlaps(tabBoxes[0], tabBoxes[1]), "Patient threads and Practice inbox do not overlap").toBe(false);
  for (let index = 0; index < 2; index += 1) {
    const overflowing = await subTabs.nth(index).evaluate((element) => element.scrollWidth > element.clientWidth + 1);
    expect(overflowing, `sub-tab ${index} label fits inside its tab`).toBe(false);
    await expectHittable(page, subTabs.nth(index), `sub-tab ${index}`, panel);
  }

  await panel.locator(".thread-item").first().click();
  const pairs = await panel.locator(".thread-meta-row").evaluate((row) => {
    const rowWidth = row.getBoundingClientRect().width;
    return [...row.querySelectorAll<HTMLElement>(":scope > .thread-meta-pair")].map((pair) => {
      const width = pair.getBoundingClientRect().width;
      const previous = pair.style.whiteSpace;
      pair.style.whiteSpace = "nowrap";
      const natural = pair.scrollWidth;
      pair.style.whiteSpace = previous;
      return { text: pair.textContent, width, natural, rowWidth };
    });
  });
  expect(pairs.length).toBe(2);
  for (const pair of pairs) {
    // A pair either fits on its line or takes the whole row; it is never
    // squeezed into a narrow column beside another pair.
    expect(pair.width, `"${pair.text}" is not squeezed`).toBeGreaterThanOrEqual(Math.min(pair.natural, pair.rowWidth) - 1);
  }
  const draft = panel.locator(".message-composer textarea");
  await draft.fill("Synthetic minimum-dock draft");
  expect((await boxOf(panel.locator(".messages-conversation-feed"))).height).toBeGreaterThanOrEqual(110);
  await expectHittable(page, draft, "minimum-dock draft", panel);
  await page.screenshot({ path: "output/playwright/companion-overflow-comms-min-dock.png" });

  const labs = await openToolOnMaya(page, "labs", LABS);
  const labTabs = labs.getByRole("tablist", { name: "Labs view options" }).getByRole("tab");
  for (let index = 0; index < 3; index += 1) {
    await expectHittable(page, labTabs.nth(index), `min-dock labs tab ${index}`, labs);
    const truncated = await labTabs.nth(index).evaluate((element) =>
      [...element.querySelectorAll("span")].some((span) => span.scrollWidth > span.clientWidth + 1),
    );
    expect(truncated, `min-dock labs tab ${index} label is not cut off`).toBe(false);
  }
  await page.screenshot({ path: "output/playwright/companion-overflow-labs-min-dock.png" });
});

test("actual 200% enlargement retains Labs identity, Communication draft and Calendar popovers", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  const labs = await openToolOnMaya(page, "labs", LABS);
  const tabs = labs.getByRole("tablist", { name: "Labs view options" }).getByRole("tab");
  for (let index = 0; index < 3; index += 1) await expectHittable(page, tabs.nth(index), `enlarged Labs tab ${index}`, labs);
  await expect(labs.locator(".companion-panel-header small")).toBeInViewport();
  await page.screenshot({ path: "output/playwright/companion-fit-1440-2x-labs.png" });
  const communication = await openToolOnMaya(page, "communication", COMMUNICATION);
  await communication.locator(".thread-item").first().click();
  const draft = communication.locator(".message-composer textarea");
  await draft.fill("Synthetic enlarged draft");
  await expect(page.locator("html")).toHaveAttribute("data-companion-short", "true");
  await expect(communication.locator(".message-composer")).toHaveCSS("position", "static");
  await expectHittable(page, draft, "enlarged draft", communication);
  await page.screenshot({ path: "output/playwright/companion-fit-1440-2x-communication.png" });
  await page.locator(".companion-rail-btn[aria-label='Calendar']").click();
  const calendar = page.locator("aside.companion-calendar-panel");
  await calendar.getByRole("button", { name: "Follow-up", exact: true }).click();
  const followUp = calendar.getByRole("dialog", { name: "Clinical follow-up date" });
  const box = await boxOf(followUp);
  expect(box.y + box.height, "enlarged popover ends on screen").toBeLessThanOrEqual(901);
  const preset = followUp.locator(".gcal-preset-pill").filter({ hasText: "+28d" });
  await expectHittable(page, preset, "enlarged interval preset", calendar);
  await page.screenshot({ path: "output/playwright/companion-fit-1440-2x-calendar.png" });
  await preset.click();
  await expect(preset).toHaveClass(/active/);
});
