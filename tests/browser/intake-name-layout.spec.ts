import { expect, test, type Locator } from "@playwright/test";
import type { IntakeQueueRow } from "../../app/domain/intake";
import { signInWithDefaultLayout } from "./workspace-fixtures";

async function inside(child: Locator, parent: Locator) {
  const outer = await parent.boundingBox();
  const inner = await child.boundingBox();
  expect(outer).toBeTruthy();
  expect(inner).toBeTruthy();
  expect(inner!.x).toBeGreaterThanOrEqual(outer!.x - 1);
  expect(inner!.x + inner!.width).toBeLessThanOrEqual(outer!.x + outer!.width + 1);
}

test("long Intake names, prospect status and progress fit without hiding information", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await signInWithDefaultLayout(page, "Prototype provider");
  const name = "Synthetic Alexandria ExtraordinaryUnbrokenFamilyNameForLayoutReview";
  const created = await page.request.post("/api/prospective-persons", {
    data: { name, dob: "1990-01-15", mobilePhone: "555-010-0300", email: "name-review@example.test" },
  });
  expect(created.ok()).toBeTruthy();
  const { prospect } = await created.json() as { prospect: { id: string } };
  const started = await page.request.post("/api/intake", {
    headers: { "x-ehr-patient-id": prospect.id },
    data: { action: "start_standalone", prospectivePersonId: prospect.id },
  });
  expect(started.ok()).toBeTruthy();
  const response = await page.request.get("/api/intake");
  expect(response.ok()).toBeTruthy();
  const { queue } = await response.json() as { queue: IntakeQueueRow[] };
  const row = queue.find((entry) => entry.prospectivePersonId === prospect.id);
  expect(row).toBeDefined();
  await page.route("**/api/intake", (route) => route.fulfill({ json: { success: true, queue: [row] } }));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "intake" } })));
  const card = page.locator(".iq-card").first();
  const detail = page.locator(".intake-detail-pane");
  for (const width of [1024, 1440, 1280, 720]) {
    await page.setViewportSize({ width, height: width === 720 ? 450 : width === 1440 ? 900 : 800 });
    await expect(card.getByRole("button", { name, exact: true })).toBeVisible();
    await inside(card.locator(".iq-card-name-btn"), card);
    await inside(card.locator(".iq-prospect-badge"), card);
    await inside(card.locator(".iq-progress"), card);
    // The queue card opens detail by keyboard without invoking chart promotion.
    await card.focus();
    await card.press("Enter");
    await expect(detail).toBeVisible();
    await expect(detail.getByRole("button", { name, exact: true })).toBeVisible();
    await page.screenshot({ path: `output/playwright/intake-name-${width}.png` });
    await inside(detail.locator(".iq-card-name-btn"), detail);
    await inside(detail.locator(".iq-prospect-badge"), detail);
    if (width > 900) {
      await inside(card.locator(".iq-card-name-btn"), card);
      await inside(card.locator(".iq-prospect-badge"), card);
      await inside(card.locator(".iq-progress"), card);
      const identity = await card.locator(".iq-card-identity").boundingBox();
      const progress = await card.locator(".iq-progress").boundingBox();
      expect(
        identity!.x + identity!.width <= progress!.x + 1 || identity!.y + identity!.height <= progress!.y + 1,
        "readiness count must sit beside or below identity, never overlap it",
      ).toBeTruthy();
    }
    await detail.getByRole("button", { name: "Close", exact: true }).click();
    await expect(card).toBeVisible();
    await expect(page.locator(".browser-tab[data-workspace-tab='patient']")).toHaveCount(2);
  }
});
