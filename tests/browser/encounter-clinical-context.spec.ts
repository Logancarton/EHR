import { expect, test, type Page } from "@playwright/test";
import { selectPrimaryPatientSection, signInWithDefaultLayout } from "./workspace-fixtures";

async function openEncounter(page: Page, name = "Maya Chen") {
  await page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: name }).click();
  await selectPrimaryPatientSection(page, "Encounter");
  const workspace = page.locator(".primary-workspace-pane .encounter-workspace-root");
  await expect(workspace.locator(".btn-toolbar-primary")).toBeEnabled();
  return workspace;
}

const clinical = (page: Page) => page.locator(".primary-workspace-pane [data-clinical-patient]");
const disclosure = (page: Page, name: string) => clinical(page).locator(":scope > details").filter({ has: page.locator("summary").filter({ hasText: name }) });

test("Clinical is primary, source-backed and keeps tools and patient-bound ordering available", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  const response = await page.request.get("/api/clinical-records?patientId=maya-chen", { headers: { "x-ehr-patient-id": "maya-chen" } });
  const { record } = await response.json();
  const workspace = await openEncounter(page);
  await expect(clinical(page)).toHaveAttribute("data-clinical-patient", "maya-chen");
  await expect(workspace.getByRole("button", { name: "Clinical", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "output/playwright/enc-ctx-default.png" });
  await clinical(page).locator("summary").filter({ hasText: "Current Medications" }).first().click();
  const meds = disclosure(page, "Current Medications");
  for (const medication of record.medications.filter((item: { status: string }) => item.status === "active")) {
    await expect(meds).toContainText(medication.display_text || medication.medication_name);
  }
  await meds.getByRole("button", { name: "Prescribe", exact: true }).click();
  await expect(page.getByRole("dialog").filter({ hasText: "Maya Chen" }).first()).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close modal" }).click();
  await workspace.getByRole("button", { name: "Note Tools", exact: true }).click();
  await workspace.getByRole("button", { name: "Context", exact: true }).click();
  await workspace.getByRole("textbox", { name: "Add context" }).fill("Unsent clinician context");
  await workspace.getByRole("button", { name: "Clinical", exact: true }).click();
  await workspace.getByRole("button", { name: "Note Tools", exact: true }).click();
  await workspace.getByRole("button", { name: "Context", exact: true }).click();
  await expect(workspace.getByRole("textbox", { name: "Add context" })).toHaveValue("Unsent clinician context");
  await workspace.getByRole("button", { name: "Scribe", exact: true }).click();
  await expect(workspace.getByRole("button", { name: "Run demo transcript" })).toBeVisible();
  await workspace.getByRole("button", { name: "Clinical", exact: true }).click();
  await clinical(page).locator("summary").filter({ hasText: "Previous Assessment / Plan" }).click();
  await clinical(page).getByRole("button", { name: "Inspect signed encounter" }).click();
  await expect(workspace.locator(".past-notes-drawer-card")).toBeVisible();
  await workspace.getByRole("button", { name: "Close signed encounter history" }).click();
  await expect(workspace.locator(".past-notes-drawer-card")).toHaveCount(0);
});

test("Encounter copilot reuses the patient-bound planner for read-only chart AI", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  const workspace = await openEncounter(page);
  const copilot = workspace.locator("section[aria-label='Provider copilot']");
  await expect(copilot).toBeVisible();

  const [request] = await Promise.all([
    page.waitForRequest((candidate) => candidate.url().includes("/api/ai/omnibox/plan"), { timeout: 15_000 }),
    copilot.getByRole("button", { name: "Chart recap", exact: true }).click(),
  ]);

  expect(request.method()).toBe("POST");
  const body = request.postDataJSON();
  expect(body.activePatientId).toBe("maya-chen");
  expect(body.activeSurface).toBe("encounter");

  const result = copilot.locator(".copilot-ai-result");
  await expect(result).toBeVisible({ timeout: 15_000 });
  await expect(result).toContainText("Bounded chart recap for Maya Chen");
  await expect(result).toContainText("Read only · no clinical mutation");
  await expect(result.getByText(/Sources · \d+/)).toBeVisible();
  await expect(workspace).toHaveAttribute("data-encounter-patient-id", "maya-chen");
});

test("failed, wrong-patient and empty reads remain distinct and recoverable", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  let mode = "failed";
  await page.route("**/api/clinical-records?patientId=maya-chen", async (route) => {
    if (mode === "failed") return route.fulfill({ status: 403, json: { success: false, error: "Access unavailable" } });
    const record = { problems: [], allergies: [], medications: [], observations: [], vitals: [], assessments: [], psychiatricHistory: [], encounters: [], documents: [], upcomingAppointments: [] };
    if (mode === "foreign") Object.assign(record, { medications: [{ patient_id: "jordan-reed", medication_name: "Foreign medication" }] });
    await route.fulfill({ json: { success: true, record } });
  });
  const workspace = await openEncounter(page);
  await expect(workspace.locator(".context-rail")).toContainText("could not be loaded");
  mode = "foreign";
  await workspace.getByRole("button", { name: "Retry clinical context" }).click();
  await expect(workspace.locator(".context-rail")).toContainText("could not be loaded");
  await expect(workspace).not.toContainText("Foreign medication");
  await expect(workspace.locator(".note-doc")).toContainText("Medications could not be loaded");
  mode = "empty";
  await workspace.getByRole("button", { name: "Retry clinical context" }).click();
  await expect(clinical(page)).toContainText("No prior signed encounter to compare");
  await expect(workspace.locator(".note-doc")).toContainText("No active medications recorded");
  await expect(workspace.locator(".note-doc")).not.toContainText("Sertraline");
  await clinical(page).locator("summary").filter({ hasText: "Measures" }).first().click();
  await expect(clinical(page)).toContainText("No PHQ-9, GAD-7 or ASRS scores on record");
});

test("late patient responses cannot leak, and source mutations refresh Encounter and Overview", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let started!: () => void;
  const requested = new Promise<void>((resolve) => { started = resolve; });
  await page.route("**/api/clinical-records?patientId=maya-chen", async (route) => {
    const response = await route.fetch();
    started();
    await delayed;
    await route.fulfill({ response });
  });
  await openEncounter(page);
  await requested;
  await openEncounter(page, "Jordan Reed");
  await expect(clinical(page)).toHaveAttribute("data-clinical-patient", "jordan-reed");
  release();
  await expect(clinical(page)).not.toContainText("Sertraline");
  await page.unroute("**/api/clinical-records?patientId=maya-chen");
  const marker = `Synthetic context refresh ${Date.now()}`;
  const saved = await page.request.post("/api/clinical-records", { headers: { "x-ehr-patient-id": "jordan-reed" },
    data: { type: "add_problem", payload: { patientId: "jordan-reed", displayText: marker } } });
  expect(saved.ok()).toBeTruthy();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("ehr-patient-updated", { detail: { patientId: "jordan-reed" } })));
  await clinical(page).locator("summary").filter({ hasText: "Diagnoses / Problems" }).first().click();
  await expect(clinical(page)).toContainText(marker);
  await selectPrimaryPatientSection(page, "Overview");
  await expect(page.locator(".primary-workspace-pane .overview-container")).toContainText(marker);
  const { result } = await saved.json();
  const resolved = await page.request.post("/api/clinical-records", { headers: { "x-ehr-patient-id": "jordan-reed" },
    data: { type: "update_problem", payload: { recordId: result.id, patch: { status: "resolved" } } } });
  expect(resolved.ok()).toBeTruthy();
});

for (const [width, height, zoom] of [[1440, 900, 1], [1280, 800, 1], [1024, 800, 1], [1440, 900, 2]]) {
  test(`Encounter clinical rail remains reachable at ${width}x${height}, zoom ${zoom}`, async ({ page }) => {
    await page.setViewportSize({ width: width / zoom, height: height / zoom });
    await signInWithDefaultLayout(page, "Prototype provider");
    const workspace = await openEncounter(page);
    await expect(clinical(page)).toBeVisible();
    await clinical(page).locator("summary").filter({ hasText: "Labs / Monitoring" }).first().click();
    const order = clinical(page).getByRole("button", { name: "Order labs", exact: true });
    await order.scrollIntoViewIfNeeded();
    await expect(order).toBeInViewport();
    await expect(workspace.getByRole("textbox", { name: "Interval History", exact: true })).toBeVisible();
    await page.screenshot({ path: `output/playwright/enc-ctx-${width}-${zoom}x.png` });
  });
}

test("crowded changes disclose every source row without copying historical content into the note", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.route("**/api/clinical-records?patientId=maya-chen", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.record.encounters = [{ id: "synthetic-context-prior", patientId: "maya-chen", status: "signed", date: "2026-09-01",
      assessment: "Synthetic historical assessment", plan: "Synthetic historical plan", followUp: "Historical follow-up" }];
    body.record.medications = [];
    body.record.vitals = [];
    body.record.observations = [];
    body.record.assessments = Array.from({ length: 5 }, (_, index) => ({ id: `synthetic-measure-${index}`, patientId: "maya-chen",
      instrument: "phq-9", title: "PHQ-9", flags: [], responses: {}, administeredAt: `2026-09-0${index + 2}`, totalScore: index + 6, maxScore: 27, severity: "Mild" }));
    await route.fulfill({ response, json: body });
  });
  const workspace = await openEncounter(page);
  const changes = clinical(page).locator(":scope > details").first();
  await expect(changes).toContainText("Since Last Visit 5");
  await expect(changes.locator(":scope > ul > li")).toHaveCount(3);
  await changes.locator("summary").filter({ hasText: "Show 2 more changes" }).click();
  await expect(changes.getByText("PHQ-9 6/27 · Mild", { exact: true })).toBeVisible();
  await clinical(page).locator("summary").filter({ hasText: "Previous Assessment / Plan" }).click();
  await expect(clinical(page)).toContainText("Synthetic historical assessment");
  await expect(workspace.getByRole("textbox", { name: "Clinical Assessment & Medical Decision Making", exact: true })).not.toHaveValue(/Synthetic historical/);
  await expect(workspace.getByRole("textbox", { name: "Treatment Plan", exact: true })).not.toHaveValue(/Synthetic historical/);
  await page.screenshot({ path: "output/playwright/enc-ctx-crowded.png" });
});

test("due monitoring opens the existing patient-bound lab composer and returns to the same note", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.route("**/api/visit-readiness**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.readiness.monitoring = { items: [{ ruleId: "synthetic-tsh", medication: "Synthetic medicine", canonicalMedication: "synthetic",
      measureKind: "lab", requiredMeasure: "TSH", requiredLab: "TSH", intervalDays: 180, intervalLabel: "Every 6 months",
      lastDoneDate: "2025-01-01", dueDate: "2025-07-01", status: "overdue", policySource: "system" }] };
    await route.fulfill({ response, json: body });
  });
  const workspace = await openEncounter(page);
  const encounterId = await workspace.getAttribute("data-encounter-id");
  await clinical(page).locator("summary").filter({ hasText: "Labs / Monitoring" }).click();
  const labs = disclosure(page, "Labs / Monitoring");
  await labs.getByRole("button", { name: "Order monitoring labs", exact: true }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Clinical Orders & Prescription Intent" });
  await expect(dialog).toContainText("Maya Chen");
  await expect(dialog.locator(".lab-catalog-card.selected")).toContainText("TSH");
  await dialog.getByRole("button", { name: "Close modal" }).click();
  await expect(workspace).toHaveAttribute("data-encounter-id", encounterId!);
  await expect(workspace.getByRole("textbox", { name: "Interval History", exact: true })).toBeVisible();
});
