import { expect, test } from "@playwright/test";
import type { IntakeQueueRow } from "../../app/domain/intake";
import type { IntakeDetail } from "../../app/server/services/intake-service";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test.use({ timezoneId: "Asia/Tokyo" });

test("Intake outreach and follow-up display the practice clock regardless of browser timezone", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");
  // Own the precondition; do not depend on a prior spec creating intake rows.
  const created = await page.request.post("/api/prospective-persons", {
    data: { name: "Synthetic Date Review", dob: "1990-01-15", mobilePhone: "555-010-0200", email: "date-review@example.test" },
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
  expect(row, "own synthetic intake row").toBeDefined();
  if (!row) throw new Error("Synthetic intake fixture is missing");
  const stamp = "2026-10-07T01:30:00.000Z"; // Oct 6, 6:30 PM at the practice.
  row.episode.followUpAt = stamp;
  row.episode.lastOutreachAt = stamp;
  await page.route("**/api/intake**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.search) {
      await route.fulfill({ json: { success: true, queue: [row] } });
    } else if (url.searchParams.has("patientId") || url.searchParams.has("prospectivePersonId")) {
      const original = await route.fetch();
      const body = await original.json() as { detail: IntakeDetail };
      body.detail.notes = [{ id: "synthetic-date-note", episodeId: row.episode.id,
        kind: "outreach", authorId: "synthetic-reviewer", authorName: "Synthetic reviewer", body: "Synthetic outreach date verification", createdAt: stamp }];
      await route.fulfill({ response: original, json: body });
    } else await route.continue();
  });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "intake" } })));
  const card = page.locator(".iq-card").first();
  await expect(card).toContainText(row.patientName);
  await page.screenshot({ path: "output/playwright/intake-dates-queue.png" });
  await expect(card.locator(".iq-card-meta")).toContainText("Oct 6, 2026 · 6:30 PM");
  await expect(card.locator(".iq-card-meta")).not.toContainText("Oct 7");
  await card.click();
  const detail = page.locator(".intake-detail-pane");
  const note = detail.locator(".iqd-note").filter({ hasText: "Synthetic outreach date verification" });
  await expect(note).toContainText("Oct 6, 2026 · 6:30 PM");
  await note.scrollIntoViewIfNeeded();
  for (const width of [1440, 1280, 1024, 720]) {
    await page.setViewportSize({ width, height: width === 720 ? 450 : 800 });
    await note.scrollIntoViewIfNeeded();
    await expect(note).toBeVisible();
    await page.screenshot({ path: `output/playwright/intake-dates-detail-${width}.png` });
  }
});
