import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInDevelopmentUser } from "./workspace-fixtures";
import { previewDay } from "../../app/lib/preview/dashboard-preview-fixtures";
import { activeVisits, cancelledVisits } from "../../app/lib/preview/dashboard-preview-model";

/**
 * The DB-1 dashboard prototype, in a browser (roadmap §21).
 *
 * DB-1 asks for the preview to be *inspected* — at several widths, at 200% zoom and
 * from the keyboard — rather than reviewed as source. This spec is how those
 * screenshots are produced reproducibly, and it asserts the three claims a
 * screenshot cannot make on its own: that the preview carries none of the live
 * workspace chrome, that opening a visit changes nothing, and that every
 * rearrangement can be done without a pointer.
 */

const SCREENSHOTS = "test-results/preview-screenshots";

async function openPreview(page: Page) {
  await page.goto("/preview/dashboard");
  await expect(page.locator("[data-preview='dashboard']")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-preview-banner]")).toBeVisible();
}

/**
 * One review frame.
 *
 * `animations: "disabled"` matters here rather than being tidiness: the chips carry
 * a 0.2s colour transition, and a frame taken the instant after a click caught the
 * *previous* selection still fading out — a screenshot that showed the wrong persona
 * highlighted over the right persona's dashboard.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SCREENSHOTS}/${name}.png`, animations: "disabled" });
}

/** Scrolls whichever column owns the overflow at this width to its end. */
async function scrollPreviewToEnd(page: Page) {
  await page.evaluate(() => {
    for (const selector of [".dash-preview-shell", ".dash-preview-main"]) {
      const column = document.querySelector(selector);
      if (column && column.scrollHeight > column.clientHeight) {
        column.scrollTop = column.scrollHeight;
        return;
      }
    }
  });
  // One frame for the scroll to land before the shutter.
  await page.waitForTimeout(120);
}

/** Walks Tab from the current position until `target` has focus, or gives up. */
async function tabTo(page: Page, target: Locator, limit = 60): Promise<boolean> {
  for (let step = 0; step < limit; step += 1) {
    if (await target.evaluate((node) => node === document.activeElement)) return true;
    await page.keyboard.press("Tab");
  }
  return target.evaluate((node) => node === document.activeElement);
}

test.beforeEach(async ({ page }) => {
  await signInDevelopmentUser(page, "Prototype provider");
  // The arrangement is kept per browser tab, so each test starts from the default
  // rather than from whatever the previous one left behind.
  await page.goto("/preview/dashboard");
  await page.evaluate(() => window.sessionStorage.removeItem("ehr_dashboard_preview_v1"));
  await openPreview(page);
});

test("the preview is a separate surface, and the schedule dominates it", async ({ page }) => {
  // None of the live workspace chrome mounts here: no rail, no window manager, and
  // above all no workspace restoration looking for tabs this page does not have.
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await expect(page.locator(".ehr-sidebar")).toHaveCount(0);
  await expect(page.locator(".detached-patient-pane")).toHaveCount(0);

  const schedule = page.locator("[data-preview-window='schedule']");
  await expect(schedule).toBeVisible();
  await expect(schedule).toHaveAttribute("data-span", "full");

  // The clinician preview opens without arrivals or the waiting room.
  await expect(page.locator("[data-preview-window='arrivals']")).toHaveCount(0);

  // And the schedule cannot be taken off the dashboard.
  await expect(schedule.getByRole("button", { name: /cannot be hidden/i })).toBeDisabled();
});

test("a row has two targets, and opening the visit changes nothing", async ({ page }) => {
  const row = page.locator("[data-visit-id='apt-p11']");
  // The status word itself, not the badge — the badge also contains the icon
  // ligature, which is text to `innerText` and not to `toHaveText`.
  const status = row.locator(".dp-row-status .ui-status > span:not(.icon)");
  await expect(status).toHaveText("Scheduled");

  await row.locator(".dp-row-visit").click();

  const detail = page.locator("[data-detail-kind='visit']");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("No status moved, no encounter was created");
  await expect(detail).toContainText("apt-p11");

  // The patient stays anchored: the schedule is still on screen behind the detail.
  await expect(page.locator("[data-preview-window='schedule']")).toBeVisible();

  // Nothing about the appointment moved.
  await expect(status).toHaveText("Scheduled");
  await expect(detail.getByRole("button", { name: "Start the visit" })).toBeDisabled();

  // Two visits for one patient, each its own appointment.
  await expect(detail).toContainText("This patient has 2 visits on this day");

  // The other target opens the chart rather than the visit.
  await row.locator(".dp-row-name").click();
  await expect(page.locator("[data-detail-kind='chart']")).toBeVisible();
  await expect(page.locator("[data-detail-kind='visit']")).toHaveCount(0);
});

test("a window can be hidden and restored without a pointer", async ({ page }) => {
  const prep = page.locator("[data-preview-window='prep']");
  await expect(prep).toBeVisible();

  const hide = prep.getByRole("button", { name: "Hide Pre-visit preparation" });
  await page.locator("body").click();
  await page.keyboard.press("Tab");
  expect(await tabTo(page, hide), "the hide control must be reachable by Tab alone").toBe(true);
  await page.keyboard.press("Enter");

  await expect(prep).toHaveCount(0);

  const restore = page.getByRole("button", { name: "Restore Pre-visit preparation" });
  await expect(restore).toBeVisible();
  expect(await tabTo(page, restore), "the restore control must be reachable by Tab alone").toBe(true);
  await page.keyboard.press("Enter");

  await expect(page.locator("[data-preview-window='prep']")).toBeVisible();
});

test("a failed schedule load never looks like an empty day", async ({ page }) => {
  const schedule = page.locator("[data-preview-window='schedule']");
  await schedule.getByRole("button", { name: "Today's schedule settings" }).click();

  await page.locator("[data-window-phase='error']").click();
  await expect(schedule.locator(".ui-state-error")).toContainText("could not be loaded");
  await expect(schedule.locator(".ui-state-empty")).toHaveCount(0);

  await page.locator("[data-window-phase='ready']").click();
  await page.locator("[data-preview-day='empty']").click();
  await expect(schedule.locator(".ui-state-empty")).toContainText("Nothing is scheduled");
  await expect(schedule.locator(".ui-state-error")).toHaveCount(0);
});

test("each persona starts where its work is, and money is always marked Demo", async ({ page }) => {
  // Practice manager: schedule operations, and no clinical windows offered.
  await page.locator("[data-persona-choice='manager']").click();
  await expect(page.locator("[data-preview-window='arrivals']")).toBeVisible();
  await expect(page.locator("[data-preview-window='prep']")).toHaveCount(0);
  await expect(page.locator("[data-preview-window='followups']")).toHaveCount(0);

  await page.getByRole("button", { name: "Add window" }).click();
  const addMenu = page.getByRole("menu", { name: "Add a window" });
  await expect(addMenu.locator("[data-add-window='followups']")).toHaveCount(0);
  await expect(addMenu.locator("[data-add-window='medwork']")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Owner: clinical first, business available and off until asked for.
  await page.locator("[data-persona-choice='owner']").click();
  await expect(page.locator("[data-preview-window='schedule']")).toBeVisible();
  await expect(page.locator("[data-preview-window='business']")).toHaveCount(0);

  await page.locator("[data-preset-choice='dense']").click();
  const business = page.locator("[data-preview-window='business']");
  await expect(business).toBeVisible();
  await expect(business.locator(".dpw-demo-tag")).toHaveText("Demo");
  // Every figure says so on its own, so a cropped screenshot still cannot mislead.
  const notes = business.locator(".dp-figure-note");
  const count = await notes.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await expect(notes.nth(index)).toContainText("Demo");
  }
});


/* --- Changes from Logan's DB-1 review, 2026-09-13 -------------------------- */

test("a cancelled visit is off the roster, reachable, and can be given a reason", async ({ page }) => {
  const schedule = page.locator("[data-preview-window='schedule']");

  // Off the day's work. Counted from the fixture so the assertion cannot drift
  // out of agreement with it when a visit is added.
  const day = previewDay("full");
  const expectedActive = activeVisits(day.visits).length;
  const expectedCancelled = cancelledVisits(day.visits).length;
  expect(expectedCancelled).toBeGreaterThan(1);

  await expect(schedule.locator("[data-visit-id='apt-p12']")).toHaveCount(0);
  await expect(schedule.locator(".dp-row")).toHaveCount(expectedActive);

  // Still on the day, behind its own count.
  const strip = schedule.locator(".dp-cancelled-strip");
  await expect(strip).toHaveAttribute("data-cancelled-count", String(expectedCancelled));
  await strip.getByRole("button", { name: /cancelled/ }).click();

  // One cancellation has a reason on file; the other says it has none rather than
  // having one inferred from the status.
  await expect(strip.locator("[data-cancelled-visit='apt-p6']")).toContainText("Patient rescheduled");
  const unexplained = strip.locator("[data-cancelled-visit='apt-p12']");
  await expect(unexplained).toContainText("No reason recorded");

  await unexplained.click();
  const detail = page.locator("[data-detail-kind='visit']");
  await expect(detail).toContainText("No reason was recorded");
  await expect(detail).toContainText("off the day's roster");

  await detail.getByRole("button", { name: "Record a reason" }).click();
  await detail.getByRole("textbox", { name: "Note" }).fill("Called first thing; wants next week.");
  await detail.getByRole("button", { name: "Record it" }).click();

  await expect(detail).toContainText("Called first thing; wants next week.");
  await expect(detail).toContainText("In this preview only");
  // And the list beside it stops saying the reason is missing.
  await expect(unexplained).not.toContainText("No reason recorded");
});

test("a person can save more than the two layouts they started with", async ({ page }) => {
  await page.getByRole("button", { name: "Save layout" }).click();
  await page.getByLabel("Name for this layout").fill("Intake-heavy Thursday");
  await page.keyboard.press("Enter");

  const saved = page.locator("[data-saved-layout]");
  await expect(saved).toHaveCount(1);
  await expect(saved).toHaveText(/Intake-heavy Thursday/);

  // A second one, so "multiple" is actually demonstrated rather than implied.
  await page.locator("[data-preset-choice='dense']").click();
  await page.getByRole("button", { name: "Save layout" }).click();
  await page.getByLabel("Name for this layout").fill("Catch-up afternoon");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-saved-layout]")).toHaveCount(2);

  // Editing a saved layout stops it claiming the name.
  await page.locator("[data-preview-window='prep']").getByRole("button", { name: /Hide/ }).click();
  await expect(page.locator("[data-layout-edited]")).toContainText("Catch-up afternoon · edited");

  // Saved layouts belong to the persona that saved them.
  await page.locator("[data-persona-choice='manager']").click();
  await expect(page.locator("[data-saved-layout]")).toHaveCount(0);
  await page.locator("[data-persona-choice='pmhnp']").click();
  await expect(page.locator("[data-saved-layout]")).toHaveCount(2);

  await page.getByRole("button", { name: "Delete the saved layout Intake-heavy Thursday" }).click();
  await expect(page.locator("[data-saved-layout]")).toHaveCount(1);
});

/**
 * The DB-1 review screenshots.
 *
 * Kept as one test so the widths are captured from the same arrangement, and left
 * in `test-results/` where the rest of the suite's evidence lives.
 */
test("captures the review screenshots at each inspected width", async ({ page }) => {
  const widths = [
    { name: "1440", width: 1440, height: 900 },
    { name: "1280", width: 1280, height: 860 },
    { name: "768", width: 768, height: 1000 },
    // 200% browser zoom is the same layout problem as half the CSS viewport at
    // twice the device scale, which is what this is.
    { name: "1440-zoom200", width: 720, height: 450 },
  ];

  for (const { name, width, height } of widths) {
    await page.setViewportSize({ width, height });
    await openPreview(page);
    await expect(page.locator("[data-preview-window='schedule']")).toBeVisible();
    await shot(page, `pmhnp-calm-${name}`);

    // The shell owns the viewport and scrolls its own column, so `fullPage` cannot
    // reach past the fold. The second frame is the rest of the dashboard as the
    // reader would actually meet it.
    await scrollPreviewToEnd(page);
    await shot(page, `pmhnp-calm-${name}-lower`);

    // Nothing may scroll sideways at any of these widths.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `the preview must not scroll horizontally at ${name}`).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await openPreview(page);

  await page.locator("[data-persona-choice='owner']").click();
  await page.locator("[data-preset-choice='dense']").click();
  await shot(page, `owner-dense-1440`);
  await scrollPreviewToEnd(page);
  await shot(page, `owner-dense-1440-lower`);

  await page.locator("[data-persona-choice='manager']").click();
  await shot(page, `manager-calm-1440`);
  await scrollPreviewToEnd(page);
  await shot(page, `manager-calm-1440-lower`);

  await page.locator("[data-persona-choice='pmhnp']").click();
  await page.locator("[data-visit-id='apt-p11'] .dp-row-visit").click();
  await expect(page.locator("[data-detail-kind='visit']")).toBeVisible();
  await shot(page, `pmhnp-visit-detail-1440`);
});
