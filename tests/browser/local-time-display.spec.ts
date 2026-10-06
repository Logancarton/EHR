import { expect, test, type Page } from "@playwright/test";
import { resetWorkspaceLayout, signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * Clinical instants are shown on the practice's clock (app/lib/clinical-date.ts).
 *
 * Every chart date used to be formatted in UTC, so vitals recorded at 7:07 PM on
 * Oct 4 in Phoenix read "Oct 5, 2026 · 2:07 AM", and the History timeline put
 * them on tomorrow. The browser here runs in Tokyo: the display must follow
 * the practice zone (America/Phoenix), not UTC and not the host the server runs on.
 */
test.use({ timezoneId: "Asia/Tokyo" });

const PRACTICE_ZONE = "America/Phoenix";

function practiceDateTime(iso: string, timeZone = PRACTICE_ZONE) {
  const instant = new Date(iso);
  const date = instant.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone });
  const time = instant.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  return `${date} · ${time}`;
}

function practiceDay(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PRACTICE_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));
}

async function openHistory(page: Page) {
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();
  const history = page.locator('.companion-rail-btn[data-tool-id="history"]');
  // Companion selection has its own durable lifecycle, outside layout reset.
  if (await history.getAttribute("aria-pressed") !== "true") await history.click();
  const panel = page.locator('[data-patient-record-tool="history"]');
  await expect(panel.getByRole("textbox", { name: "Search clinical history", exact: true })).toBeVisible();
  return panel;
}

test("recorded vitals show the practice's local date and time, not UTC", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");

  // An evening reading whose UTC day is the next day: 7:07 PM Sep 14 in Phoenix.
  const evening = "2026-09-15T02:07:00.000Z";
  const seeded = await page.request.post("/api/clinical-records", {
    headers: { "x-ehr-patient-id": "maya-chen" },
    data: { type: "record_vitals", payload: { patientId: "maya-chen", systolic: 117, diastolic: 77, heartRate: 71, effectiveAt: evening } },
  });
  expect(seeded.ok(), "synthetic evening vitals should be recorded").toBeTruthy();

  const panel = await openHistory(page);
  expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe("Asia/Tokyo");

  // Record a set through the real dialog and read back the server's timestamp.
  await panel.getByRole("button", { name: "Record Vitals", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("120").fill("124");
  await dialog.getByPlaceholder("80").fill("82");
  const [saved] = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/clinical-records") && response.request().method() === "POST"),
    dialog.getByRole("button", { name: "Record Measurements" }).click(),
  ]);
  expect(saved.ok()).toBeTruthy();
  const recordedAt = ((await saved.json()) as { result: { recordedAt: string } }).result.recordedAt;
  expect(recordedAt).toMatch(/Z$/);

  const rows = dialog.locator("tbody tr");
  const nowRow = rows.filter({ hasText: "124/82" }).first();
  await expect(nowRow.locator("td").first()).toHaveText(practiceDateTime(recordedAt));
  await expect(nowRow.locator("td").first()).not.toHaveText(practiceDateTime(recordedAt, "UTC"));

  const eveningRow = rows.filter({ hasText: "117/77" }).first();
  await expect(eveningRow.locator("td").first()).toHaveText("Sep 14, 2026 · 7:07 PM");
  await page.screenshot({ path: "output/playwright/local-time-vitals-dialog.png" });
  await dialog.locator(".modal-card-footer").getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // The History timeline places the evening reading on its practice day.
  await panel.locator(".history-stream-tabs").getByRole("button", { name: /^Vitals \(/ }).click();
  const eveningEvent = panel.locator(".event-content").filter({ hasText: "BP 117/77" }).first();
  await expect(eveningEvent.locator(".event-date")).toHaveText("2026-09-14");
  const nowEvent = panel.locator(".event-content").filter({ hasText: "BP 124/82" }).first();
  await expect(nowEvent.locator(".event-date")).toHaveText(practiceDay(recordedAt));
  await eveningEvent.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "output/playwright/local-time-history.png" });
});

const CANDIDATE_PATIENTS = ["sofia-martinez", "david-kim", "elena-rostova", "marcus-vance", "jordan-reed"];

async function savedDraftIds(page: Page, patientId: string) {
  const listed = await page.request.get(`/api/encounters?patientId=${patientId}`, { headers: { "x-ehr-patient-id": patientId } });
  expect(listed.ok()).toBeTruthy();
  const { encounters } = (await listed.json()) as { encounters: Array<{ id: string; status: string }> };
  return encounters.filter((encounter) => encounter.status === "draft").map((encounter) => encounter.id);
}

function displayName(patientId: string) {
  return patientId.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

async function openEncounter(page: Page, name: string) {
  await page.locator(".browser-tab").filter({ hasText: name }).click();
  const pane = page.locator(".primary-workspace-pane");
  // The chart-section tab, or the chart header's Encounter control when the tabs are collapsed.
  await pane.getByRole("tab", { name: "Encounter", exact: true })
    .or(pane.getByRole("button", { name: "Encounter", exact: true }))
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.locator(".encounter-top-toolbar")).toBeVisible();
  // Hydration has finished once signing is offered.
  await expect(page.getByRole("button", { name: "Review & Sign", exact: true }).first()).toBeEnabled({ timeout: 15_000 });
}

/**
 * Opening Encounter on a patient whose note exists only in this browser must not
 * ask the server for references of an encounter it has never received, and once
 * the note is saved its references load as before.
 */
test("an unsaved Encounter requests no references until the server holds it", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");

  // A patient with no saved draft, so the note opens on a client-only id.
  let patientId: string | null = null;
  for (const candidate of CANDIDATE_PATIENTS) {
    if ((await savedDraftIds(page, candidate)).length === 0) {
      patientId = candidate;
      break;
    }
  }
  test.skip(!patientId, "every synthetic patient already has a saved draft in this browser-suite database");
  const name = displayName(patientId!);
  await resetWorkspaceLayout(page, [patientId!, "maya-chen"]);

  const references: Array<{ method: string; status: number }> = [];
  page.on("response", (response) => {
    if (/\/api\/encounters\/[^/]+\/references/.test(response.url())) {
      references.push({ method: response.request().method(), status: response.status() });
    }
  });
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await openEncounter(page, name);
  // Longer than the 1.5 s reference-extraction debounce.
  await page.waitForTimeout(2_500);
  expect(references, "an encounter the server has never received is not asked for references").toEqual([]);
  expect(consoleErrors.filter((text) => /404/.test(text)), "no 404 console errors").toEqual([]);
  await page.screenshot({ path: "output/playwright/local-time-encounter-open.png" });

  // Typing saves the note; the server now holds it and the references load.
  const complaint = page.locator(".primary-workspace-pane .encounter-workspace-root").getByRole("textbox", { name: "Chief Complaint", exact: true });
  await complaint.fill("Synthetic follow-up for reference loading check.");
  await expect
    .poll(() => references.filter((entry) => entry.method === "GET" && entry.status === 200).length, {
      message: "a saved encounter reads its references",
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  expect(references.filter((entry) => entry.status === 404), "no reference request 404s").toEqual([]);
  expect(consoleErrors.filter((text) => /404/.test(text)), "no 404 console errors after save").toEqual([]);
});
