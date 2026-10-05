import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

const panelFor = (page: Page) => page.locator('[data-patient-record-tool="medications"]');
async function openMedications(page: Page) {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();
  await page.locator('.companion-rail-btn[data-tool-id="medications"]').click();
  await expect(panelFor(page)).toHaveAttribute("data-bound-patient-id", "maya-chen");
}

test("active records and medication actions precede empty review details at every fit", async ({ page }) => {
  await page.route("**/api/medication-reconciliation?patientId=*", (route) => route.fulfill({ json: { success: true, candidates: [], reviews: [] } }));
  await openMedications(page);
  const panel = panelFor(page);
  const record = panel.locator("section").filter({ has: page.getByRole("heading", { name: "Current medications", exact: true }) });
  const review = panel.getByRole("group").filter({ has: page.locator("summary").filter({ hasText: "Medication reconciliation" }) });
  const firstMedication = record.locator("article").first();
  await expect(firstMedication).toBeVisible();
  await expect(review).not.toHaveAttribute("open", "");
  await expect(panel.getByRole("button", { name: "New prescription", exact: true })).toHaveCount(1);
  await expect(panel.getByRole("button", { name: "Add medication", exact: true })).toHaveCount(1);
  expect(await firstMedication.evaluate((element) => {
    const review = document.querySelector('section[aria-label="Medication reconciliation"]');
    return Boolean(review && (element.compareDocumentPosition(review) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
  for (const [width, height, zoom] of [[1440, 900, 1], [1280, 800, 1], [1024, 800, 1], [1440, 900, 2]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((value) => { document.documentElement.style.zoom = String(value); }, zoom);
    await panel.getByRole("heading", { name: "Current medications", exact: true }).scrollIntoViewIfNeeded();
    await expect(panel.getByRole("button", { name: "New prescription", exact: true })).toBeInViewport();
    await expect(panel.getByRole("button", { name: "Add medication", exact: true })).toBeInViewport();
    await expect(firstMedication).toBeInViewport();
    await page.screenshot({ path: `output/playwright/medication-hierarchy-${width}-${zoom}x.png` });
  }
  await page.evaluate(() => { document.documentElement.style.zoom = "1"; });
  await panel.getByRole("button", { name: "Add medication", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Clinical display text", exact: true })).toBeFocused();
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await panel.getByRole("button", { name: "New prescription", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Clinical Orders & Prescription Intent" })).toContainText("Maya Chen");
});

test("loading and failed medication reads never look like an empty record, and retry recovers", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let ready = false;
  await page.route("**/api/clinical-records?patientId=maya-chen", async (route) => {
    if (!ready) {
      await held;
      await route.fulfill({ status: 503, json: { success: false, error: "Synthetic medication read unavailable" } });
    } else {
      await route.fulfill({ json: { success: true, record: { medications: [] } } });
    }
  });
  await page.locator('.companion-rail-btn[data-tool-id="medications"]').click();
  const panel = panelFor(page);
  await expect(panel.getByText("Loading medications…", { exact: true })).toBeVisible();
  await expect(panel.getByText("No active medications recorded.", { exact: true })).toHaveCount(0);
  release();
  await expect(panel.getByRole("alert")).toContainText("Synthetic medication read unavailable");
  await expect(panel.getByText("No active medications recorded.", { exact: true })).toHaveCount(0);
  ready = true;
  await panel.getByRole("button", { name: "Retry medications", exact: true }).click();
  await expect(panel.getByText("No active medications recorded.", { exact: true })).toBeVisible();
});

test("reconciliation disclosure preserves report drafts and reopens pending evidence for the same patient", async ({ page }) => {
  await openMedications(page);
  const panel = panelFor(page);
  const summary = panel.locator("summary").filter({ hasText: "Medication reconciliation" }).first();
  await expect(summary).toContainText(/pending/);
  const details = summary.locator("..");
  if (!(await details.getAttribute("open") !== null)) await summary.click();
  const report = panel.getByRole("textbox", { name: "Patient-reported medication evidence", exact: true });
  const text = `Synthetic hierarchy review ${Date.now()}`;
  await report.fill(text);
  await summary.click();
  await summary.click();
  await expect(report).toHaveValue(text);
  await panel.getByRole("button", { name: "Add report", exact: true }).click();
  await expect(panel.getByText(text, { exact: true }).first()).toBeVisible();
  await panel.getByRole("button", { name: "Close medications", exact: true }).click();
  await page.locator('.companion-rail-btn[data-tool-id="medications"]').click();
  await expect(panel.getByText(text, { exact: true }).first()).toBeVisible();
  const candidate = panel.locator("article").filter({ has: page.getByText(text, { exact: true }) });
  await candidate.getByRole("button", { name: "Ignore", exact: true }).click();
  await expect(candidate).toHaveCount(0);
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Jordan Reed" }).click();
  await expect(panel).toHaveAttribute("data-bound-patient-id", "jordan-reed");
  await expect(panel.getByText(text, { exact: true })).toHaveCount(0);
});

test("unavailable reconciliation is visible while collapsed and retries without a false zero", async ({ page }) => {
  let ready = false;
  await page.route("**/api/medication-reconciliation?patientId=*", (route) => route.fulfill(ready
    ? { json: { success: true, candidates: [], reviews: [] } }
    : { status: 403, json: { success: false, error: "Synthetic reconciliation access unavailable" } }));
  await openMedications(page);
  const panel = panelFor(page);
  const summary = panel.locator("summary").filter({ hasText: "Medication reconciliation" }).first();
  await expect(summary).toContainText("Unavailable");
  await expect(summary).not.toContainText("0 pending");
  await expect(panel.getByRole("alert")).toContainText("Synthetic reconciliation access unavailable");
  await expect(panel.getByText("No medication evidence is waiting for review.", { exact: true })).toHaveCount(0);
  ready = true;
  await panel.getByRole("button", { name: "Retry reconciliation", exact: true }).click();
  await expect(summary).toContainText("0 pending");
  await expect(panel.getByText("No medication evidence is waiting for review.", { exact: true })).toBeVisible();
});

test("late medication data from the prior patient cannot replace the foreground record", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/clinical-records?patientId=maya-chen", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.record.medications[0].display_text = "Synthetic late Maya medication";
    await held;
    await route.fulfill({ json: body });
  });
  await page.locator('.companion-rail-btn[data-tool-id="medications"]').click();
  const panel = panelFor(page);
  await expect(panel.getByText("Loading medications…", { exact: true })).toBeVisible();
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Jordan Reed" }).click();
  await expect(panel).toHaveAttribute("data-bound-patient-id", "jordan-reed");
  await expect(panel.getByText("Loading medications…", { exact: true })).toHaveCount(0);
  const lateResponse = page.waitForResponse((response) => response.url().includes("/api/clinical-records?patientId=maya-chen"));
  release();
  await lateResponse;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(panel.getByText("Synthetic late Maya medication", { exact: true })).toHaveCount(0);
  await expect(panel.locator("article").first()).toContainText("Lamotrigine");
});
