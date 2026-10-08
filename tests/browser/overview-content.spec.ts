import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout, waitForAuthenticatedShell } from "./workspace-fixtures";

async function openMaya(page: Page) {
  await page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Maya Chen" }).click();
  await expect(page.getByRole("heading", { name: "Last Visit & Follow-up" })).toBeVisible();
}
const card = (page: Page, name: string) => page.locator(".overview-card-container").filter({ has: page.getByRole("heading", { name, exact: true }) });

test("current problems and medications precede continuity; new sections stay restorable", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  // Establish the unsigned-work precondition in the synthetic response; a fresh
  // clinic may contain only signed history and must not depend on another spec.
  const response = await page.request.get("/api/clinical-records?patientId=maya-chen", { headers: { "x-ehr-patient-id": "maya-chen" } });
  const body = await response.json();
  body.record.encounters.push({ id: "synthetic-content-draft", patientId: "maya-chen", status: "draft", date: "2026-09-20", type: "Synthetic unsigned follow-up", summary: "Synthetic workflow fixture" });
  await page.route("**/api/clinical-records?patientId=maya-chen", (route) => route.fulfill({ json: body }));
  await openMaya(page);
  const headings = await page.locator(".overview-grid > .overview-card-container h2").allTextContents();
  expect(headings.slice(0, 7)).toEqual(["Active Diagnoses", "Active Medications", "Last Visit & Follow-up", "Symptoms & Measurements", "Results & Outstanding Orders", "History & Treatment Trials", "Recent Clinical Changes"]);
  await expect(card(page, "Last Visit & Follow-up")).toContainText("Next Visit");
  await expect(card(page, "Care Team & Logistics")).not.toContainText("Next Visit");
  await expect(page.getByLabel("Clinical attention").locator("[data-attention-category='unsigned']")).toContainText("unsigned draft");
  const history = card(page, "History & Treatment Trials");
  await history.locator(".overview-card-menu summary").click();
  await history.getByRole("menuitem", { name: "Hide card" }).click();
  await expect(history).toHaveCount(0);
  await expect(page.getByLabel("Clinical attention")).toBeVisible();
  await page.reload();
  await waitForAuthenticatedShell(page);
  await expect(history).toHaveCount(0);
  await page.getByRole("button", { name: "Show History & Treatment Trials", exact: true }).click();
  await expect(history).toBeVisible();
  for (const [width, height, zoom] of [[1440,900,1],[1280,800,1],[1024,800,1],[1440,900,2]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((value) => { document.documentElement.style.zoom = String(value); }, zoom);
    await page.locator(".overview-container").evaluate((element) => {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) parent.scrollTop = 0;
    });
    await page.screenshot({ path: `output/playwright/overview-content-${width}-${zoom}x.png` });
  }
  await page.evaluate(() => { document.documentElement.style.zoom = "1"; });
  await page.setViewportSize({ width: 1440, height: 900 });
  await history.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "output/playwright/overview-content-history.png" });
  await card(page, "Results & Outstanding Orders").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "output/playwright/overview-content-results.png" });
});

test("psychiatric history displays source dates and treatment outcomes without claiming current risk", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  const snapshotResponse = await page.request.get("/api/clinical-records?patientId=maya-chen", { headers: { "x-ehr-patient-id": "maya-chen" } });
  const snapshotBody = await snapshotResponse.json();
  await page.route("**/api/clinical-records?patientId=maya-chen", async (route) => {
    const body = structuredClone(snapshotBody);
    body.record.psychiatricHistory = [
      { id: "synthetic-trial", patientId: "maya-chen", category: "medication_trial", title: "Synthetic prior trial", details: { drug: "Synthetic medication", outcome: "Stopped because of recorded nausea", reasonForDiscontinuation: "Poor tolerability" }, status: "historical", sourceSystem: "synthetic record", sourceRef: "trial-source", recordedBy: "Synthetic clinician", recordedAt: "2020-03-01T12:00:00Z", updatedAt: "2020-03-01T12:00:00Z" },
      { id: "synthetic-risk", patientId: "maya-chen", category: "safety_risk", title: "Synthetic historical safety event", details: { description: "Historical event; current risk not assessed here" }, status: "historical", sourceSystem: "synthetic record", recordedBy: "Synthetic clinician", recordedAt: "2020-03-01T12:00:00Z", updatedAt: "2020-03-01T12:00:00Z" },
      { id: "synthetic-error", patientId: "maya-chen", category: "medication_trial", title: "Entered-in-error trial", details: {}, status: "entered-in-error" },
    ];
    await route.fulfill({ json: body });
  });
  await openMaya(page);
  const history = card(page, "History & Treatment Trials");
  await expect(history).toContainText("Stopped because of recorded nausea");
  await expect(history).toContainText("Poor tolerability");
  await expect(history).toContainText("Mar 1, 2020");
  await expect(history).toContainText("trial-source");
  await expect(history).not.toContainText("Entered-in-error trial");
  await history.getByRole("button", { name: "Review psychiatric history", exact: true }).click();
  // The patient pane now renders the selected section without a section-tab row.
  const pane = page.locator(".primary-workspace-pane");
  await expect(pane).toHaveAttribute("data-scroll-patient-id", "maya-chen");
  await expect(pane).toHaveAttribute("data-scroll-section", "History");
  await expect(pane.getByRole("heading", { name: "Patient Timeline & Trajectory", exact: true })).toBeVisible();
});

test("results remain visible when orders fail; mismatched orders are rejected and retry recovers", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  let mode = "error";
  await page.route("**/api/orders?patientId=maya-chen", async (route) => {
    if (mode === "error") return route.fulfill({ status: 503, json: { success: false, error: "Unavailable" } });
    return route.fulfill({ json: { success: true, orders: [{ id: "synthetic-lab", patientId: mode === "mismatch" ? "jordan-reed" : "maya-chen", type: "lab", name: "Synthetic staged monitoring order", status: "staged", createdAt: "2026-09-20T12:00:00Z", details: {} }] } });
  });
  await openMaya(page);
  const results = card(page, "Results & Outstanding Orders");
  await expect(results).toContainText("Lab orders could not be loaded");
  await expect(results.getByLabel("Latest lab results")).toBeVisible();
  mode = "mismatch";
  await results.getByRole("button", { name: "Try again" }).click();
  await expect(results).toContainText("Lab orders could not be loaded");
  await expect(results).not.toContainText("Synthetic staged monitoring order");
  mode = "ready";
  await results.getByRole("button", { name: "Try again" }).click();
  await expect(results).toContainText("Synthetic staged monitoring order");
  await expect(results).toContainText("staged");
  await expect(results).not.toContainText("delivered");
});

test("empty history is explicit and history from another patient is never displayed", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  let mismatch = false;
  const snapshotResponse = await page.request.get("/api/clinical-records?patientId=maya-chen", { headers: { "x-ehr-patient-id": "maya-chen" } });
  const snapshotBody = await snapshotResponse.json();
  await page.route("**/api/clinical-records?patientId=maya-chen", async (route) => {
    const body = structuredClone(snapshotBody);
    body.record.psychiatricHistory = mismatch ? [{ patientId: "jordan-reed", title: "Other patient history" }] : [];
    await route.fulfill({ json: body });
  });
  await openMaya(page);
  await expect(card(page, "History & Treatment Trials")).toContainText("No structured prior medication trials recorded");
  mismatch = true;
  await page.reload(); await waitForAuthenticatedShell(page);
  await expect(page.locator(".overview-container")).toContainText("clinical overview could not be loaded");
  await expect(page.locator(".overview-container")).not.toContainText("Other patient history");
});

test("latest coded and uncoded result versions share one attention item and reviewed results do not alert", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  const response = await page.request.get("/api/clinical-records?patientId=maya-chen", { headers: { "x-ehr-patient-id": "maya-chen" } });
  const body = await response.json();
  const sample = body.record.observations.find((item: { category: string }) => item.category === "laboratory");
  expect(sample).toBeTruthy();
  body.record.observations = [
    { ...sample, id: "synthetic-old", test_name: "Synthetic latest test", code: "SYN-1", coding_system: "synthetic", effective_at: "2026-09-01T12:00:00Z", value_text: "7", interpretation: "low", acknowledged_at: null },
    { ...sample, id: "synthetic-new", test_name: "Synthetic latest test", code: null, effective_at: "2026-09-20T12:00:00Z", value_text: "8", interpretation: "critical", acknowledged_at: null },
    { ...sample, id: "synthetic-reviewed", test_name: "Synthetic reviewed test", code: "SYN-2", effective_at: "2026-09-20T12:00:00Z", interpretation: "abnormal", acknowledged_at: "2026-09-21T12:00:00Z" },
  ];
  await page.route("**/api/clinical-records?patientId=maya-chen", (route) => route.fulfill({ json: body }));
  await openMaya(page);
  const attention = page.getByLabel("Clinical attention");
  await expect(attention.getByText("Recorded result flagged critical: Synthetic latest test", { exact: true })).toHaveCount(1);
  await expect(attention).toContainText("Sep 20, 2026");
  await expect(attention).not.toContainText("Synthetic reviewed test");
  const results = card(page, "Results & Outstanding Orders");
  await expect(results.getByText("Synthetic latest test", { exact: true })).toHaveCount(1);
  await expect(results).toContainText("Reviewed Sep 21, 2026");
});

test("Compact density fits the same clinical content in less space and survives reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");
  await openMaya(page);
  const medications = card(page, "Active Medications");
  const snapshot = () => medications.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    text: element.textContent,
    medicationFont: getComputedStyle(element.querySelector("strong")!).fontSize,
    headingFont: getComputedStyle(element.querySelector("h2")!).fontSize,
  }));
  async function selectDensity(name: "Compact" | "Comfortable") {
    const factsMenu = page.locator(
      '.primary-workspace-pane summary[aria-label="Edit problems, allergies, and layout"]',
    );
    await factsMenu.click();
    await factsMenu.locator("..").getByRole("menu", { name: "Edit options", exact: true })
      .getByRole("menuitem", { name: "Customize layout", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Workspace Layout Preferences" });
    await dialog.getByRole("button", { name: "Density & Shell" }).click();
    await dialog.locator(".density-option").filter({ has: page.getByText(name, { exact: true }) }).click();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator(`.app-shell.density-${name.toLowerCase()}`)).toBeVisible();
  }
  await selectDensity("Comfortable");
  // Wait for the asynchronous monitoring source before comparing full content.
  await expect(medications).not.toContainText("Loading monitoring policy");
  const comfortable = await snapshot();
  await selectDensity("Compact");
  const compact = await snapshot();
  expect(compact.height).toBeLessThan(comfortable.height);
  expect(compact.text).toEqual(comfortable.text);
  expect(compact.medicationFont).toEqual(comfortable.medicationFont);
  expect(parseFloat(compact.medicationFont)).toBeGreaterThanOrEqual(14);
  expect(parseFloat(compact.headingFont)).toBeGreaterThanOrEqual(16);
  await page.reload();
  await waitForAuthenticatedShell(page);
  await expect(page.locator(".app-shell.density-compact")).toBeVisible();
  await expect(medications).not.toContainText("Loading monitoring policy");
  expect((await snapshot()).text).toEqual(comfortable.text);
  await page.screenshot({ path: "output/playwright/overview-density-compact.png" });
  await selectDensity("Comfortable");
  await page.screenshot({ path: "output/playwright/overview-density-comfortable.png" });
});
