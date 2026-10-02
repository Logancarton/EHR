import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout, waitForAuthenticatedShell } from "./workspace-fixtures";

async function openMaya(page: Page) {
  await page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Maya Chen" }).click();
  await expect(page.getByRole("heading", { name: "Last Visit & Follow-up" })).toBeVisible();
}

const card = (page: Page, name: string) => page.locator(".overview-card-container").filter({ has: page.getByRole("heading", { name, exact: true }) });

test("empty authoritative clinical lists do not resurrect summary medications or diagnoses", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.route("**/api/clinical-records?patientId=maya-chen", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.record.problems = [];
    body.record.medications = [];
    await route.fulfill({ response, json: body });
  });
  await openMaya(page);
  await expect(card(page, "Active Medications")).toContainText("No active medications recorded.");
  await expect(card(page, "Active Medications")).not.toContainText("Sertraline");
  await expect(card(page, "Active Diagnoses")).toContainText("No active psychiatric conditions");
  await expect(card(page, "Active Diagnoses")).not.toContainText("Generalized anxiety disorder");
});

test("care details use the patient record, reject mismatched identity, and recover from failure", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  const sourceResponse = await page.request.get("/api/patients/maya-chen/administration", { headers: { "x-ehr-patient-id": "maya-chen" } });
  const source = await sourceResponse.json();
  let mode: "failed" | "mismatch" | "ready" = "failed";
  await page.route("**/api/patients/maya-chen/administration", async (route) => {
    if (mode === "failed") return route.fulfill({ status: 503, json: { success: false, error: "Unavailable" } });
    const body = structuredClone(source);
    body.record.patientId = mode === "mismatch" ? "jordan-reed" : "maya-chen";
    body.record.pharmacies = [{ pharmacyId: "synthetic-review", name: "Synthetic record pharmacy", status: "active", priority: 1 }];
    await route.fulfill({ json: body });
  });
  await openMaya(page);
  const details = card(page, "Care Team & Logistics");
  await expect(details).toContainText("Care details could not be loaded.");
  await expect(card(page, "Active Medications")).toContainText("Sertraline");
  await expect(details).not.toContainText("CVS Pharmacy #4102");
  mode = "mismatch";
  await details.getByRole("button", { name: "Try again" }).click();
  await expect(details).toContainText("different patient were rejected");
  await expect(details).not.toContainText("Synthetic record pharmacy");
  mode = "ready";
  await details.getByRole("button", { name: "Try again" }).click();
  await expect(details).toContainText("Synthetic record pharmacy");
  await expect(details).not.toContainText("e-Prescribe configured");
  await expect(details).not.toContainText("Active on file");
  await details.getByRole("button", { name: "Review patient information" }).click();
  await expect(page.getByRole("complementary", { name: "Patient information for Maya Chen" })).toBeVisible();
});

test("missing monitoring evidence cannot become a green current status", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.route("**/api/clinical-monitoring-policies**", (route) => route.fulfill({ status: 503, json: { success: false, error: "Unavailable" } }));
  await openMaya(page);
  const meds = card(page, "Active Medications");
  await expect(meds).toContainText("Monitoring unavailable");
  await expect(meds).not.toContainText("Monitoring: Current");
  await expect(page.locator(".overview-container")).not.toContainText("All clinical safety checks");
});

test("width, pin, hide and recovery controls change the rendered layout and persist", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");
  await openMaya(page);
  const meds = card(page, "Active Medications");
  await meds.locator("summary").click();
  await meds.getByRole("menuitem", { name: "Expand (full width)" }).click();
  await expect(meds).toHaveClass(/col-span-2/);
  await meds.locator("summary").click();
  await meds.getByRole("menuitem", { name: "Pin to top" }).click();
  await expect(page.locator(".overview-grid > .overview-card-container").first()).toContainText("Active Medications");
  await page.reload();
  await waitForAuthenticatedShell(page);
  await expect(meds).toHaveClass(/col-span-2/);
  await expect(page.locator(".overview-grid > .overview-card-container").first()).toContainText("Active Medications");
  const snapshot = card(page, "Last Visit & Follow-up");
  await snapshot.locator("summary").click();
  await snapshot.getByRole("menuitem", { name: "Hide card" }).click();
  await expect(snapshot).toHaveCount(0);
  await expect(page.locator(".overview-attention-recovery")).toBeVisible();
  await page.getByRole("button", { name: "Review visit summary" }).click();
  await expect(snapshot).toBeVisible();
  // Narrow panes must remain a single column even after saving full-width cards.
  await page.setViewportSize({ width: 1024, height: 800 });
  const bounds = await meds.boundingBox();
  const grid = await page.locator(".overview-grid").boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(grid!.width + 1);
  await page.screenshot({ path: "output/playwright/overview-review-1024.png" });
});

test("vitals remain available without assessment trajectories and snapshot errors offer recovery", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  let fail = true;
  await page.route("**/api/clinical-records?patientId=maya-chen", async (route) => {
    if (fail) return route.fulfill({ status: 403, json: { success: false, error: "Denied" } });
    const response = await route.fetch();
    const body = await response.json();
    body.record.assessments = [];
    await route.fulfill({ response, json: body });
  });
  await page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Maya Chen" }).click();
  await expect(page.locator(".overview-container")).toContainText("clinical overview could not be loaded");
  await expect(card(page, "Active Medications")).toHaveCount(0);
  fail = false;
  await page.locator(".overview-container").getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".overview-container")).toContainText("No PHQ-9, GAD-7, or ASRS trajectory is available yet.");
  await expect(page.locator(".overview-container")).toContainText("Latest vitals");
  await expect(page.getByRole("button", { name: /Flowsheet/ }).last()).toBeVisible();
});

test("a later unmet monitoring rule outranks an earlier current rule for the same medication", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  const sourceResponse = await page.request.get("/api/clinical-monitoring-policies?patientId=maya-chen");
  const source = await sourceResponse.json();
  const sodium = source.state.effectiveRules.find((rule: { id: string }) => rule.id === "sertraline-sodium");
  expect(sodium).toBeTruthy();
  source.state.effectiveRules = [sodium, {
    ...sodium, id: "synthetic-unmet-requirement", requiredMeasure: "Synthetic unmet requirement",
    requiredLab: "Synthetic unmet requirement", evidenceAliases: ["synthetic-no-matching-evidence"],
  }];
  await page.route("**/api/clinical-monitoring-policies?patientId=maya-chen", (route) => route.fulfill({ json: source }));
  await openMaya(page);
  const meds = card(page, "Active Medications");
  await expect(meds).toContainText("Synthetic unmet requirement Overdue");
  await expect(meds).not.toContainText("Monitoring: Current (Electrolytes / sodium)");
});

test("overview fits the viewport matrix with readable controls and recoverable navigation at enlarged scale", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");
  await openMaya(page);
  await expect(card(page, "Care Team & Logistics").getByRole("button", { name: "Review patient information" })).toBeVisible();
  for (const [width, height] of [[1440, 900], [1280, 800], [1024, 800]]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".overview-grid")).toBeVisible();
    expect(await page.locator(".overview-grid").evaluate((grid) => grid.scrollWidth <= grid.clientWidth + 1)).toBeTruthy();
    await page.screenshot({ path: `output/playwright/overview-review-${width}.png` });
  }
  await page.evaluate(() => { document.body.style.zoom = "2"; });
  const collapseNavigation = page.getByRole("button", { name: "Collapse chart navigation" });
  if (await collapseNavigation.count()) {
    await collapseNavigation.click();
    await expect(page.getByRole("button", { name: "Expand chart navigation" })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Open workspace", exact: true })).toBeVisible();
  const snapshot = card(page, "Last Visit & Follow-up");
  await snapshot.locator("summary").click();
  await expect(snapshot.getByRole("menuitem", { name: "Collapse card" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(snapshot.locator("details")).not.toHaveAttribute("open", "");
  expect(await page.locator(".overview-grid").evaluate((grid) => grid.scrollWidth <= grid.clientWidth + 1)).toBeTruthy();
  await page.screenshot({ path: "output/playwright/overview-review-200-percent.png" });
});

test("timeline shows each source measurement/update once and retains weight evidence", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider", ["david-kim"]);
  const response = await page.request.get("/api/clinical-records?patientId=david-kim", { headers: { "x-ehr-patient-id": "david-kim" } });
  expect(response.ok()).toBeTruthy();
  const { record } = await response.json();
  expect(record.vitals.length).toBeGreaterThan(0);
  expect(record.medications.length).toBeGreaterThan(0);
  await page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "David Kim" }).click();
  const timeline = card(page, "Recent Clinical Changes");
  await expect(timeline).toBeVisible();
  await timeline.getByRole("button", { name: "Vitals", exact: true }).click();
  await expect(timeline.locator("[data-timeline-type='vital']")).toHaveCount(1);
  const vital = record.vitals[0];
  if (vital.weightLbs != null) await expect(timeline).toContainText(`Weight ${vital.weightLbs} lb`);
  await timeline.getByRole("button", { name: "Meds", exact: true }).click();
  await expect(timeline.locator("[data-timeline-type='med']")).toHaveCount(1);
  await expect(timeline).not.toContainText("Medication Regimen");
  await timeline.getByRole("button", { name: "Visits", exact: true }).click();
  await expect(timeline.locator("[data-timeline-type='visit']")).toHaveCount(1);
  await timeline.getByRole("button", { name: /^All \(/ }).click();
  await expect(timeline.locator("[data-timeline-type='vital']")).toHaveCount(1);
  await expect(timeline.locator("[data-timeline-type='med']")).toHaveCount(1);
  await timeline.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "output/playwright/overview-timeline-deduplicated.png" });
});
