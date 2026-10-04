import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

async function chart(page: Page, name: string) {
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: name }).click();
}
async function dashboard(page: Page) {
  await page.locator('.browser-tab[data-workspace-tab="dashboard"]').click();
}

for (const [id, label] of [["medications", "Medications"], ["documents", "Documents"], ["history", "History"]]) {
  test(`${label} follows the chart, makes retained binding explicit, and resets on close`, async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    await chart(page, "Maya Chen");
    await page.locator(`.companion-rail-btn[data-tool-id="${id}"]`).click();
    const panel = page.locator(`[data-patient-record-tool="${id}"]`);
    await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
    await expect(panel).toHaveAttribute("data-patient-binding", "following");
    await expect(panel.getByRole("status", { name: "Companion patient binding" })).toHaveText("Following active chart · Maya Chen");
    await expect(panel.getByRole("combobox")).toHaveCount(0);

    await chart(page, "Jordan Reed");
    await expect(panel).toHaveAttribute("data-bound-patient-id", "jordan-reed");
    await expect(panel.getByRole("status", { name: "Companion patient binding" })).toHaveText("Following active chart · Jordan Reed");

    await panel.getByRole("button", { name: "Pin another patient" }).click();
    await panel.getByRole("combobox").selectOption("maya-chen");
    await expect(panel).toHaveAttribute("data-patient-binding", "pinned");
    await expect(panel.getByRole("status", { name: "Companion patient binding" })).toHaveText("Pinned to Maya Chen · Not current chart");
    if (id === "medications") {
      await panel.getByRole("button", { name: "New prescription", exact: true }).click();
      const composer = page.getByRole("dialog", { name: "Clinical Orders & Prescription Intent" });
      await expect(composer.locator(".patient-pill-meta")).toContainText("Maya Chen");
      await expect(composer.locator(".patient-pill-meta")).not.toContainText("Jordan Reed");
      await composer.getByRole("button", { name: "Close modal", exact: true }).click();
    }
    await chart(page, "Maya Chen");
    await expect(panel.getByRole("status", { name: "Companion patient binding" })).toHaveText("Pinned to Maya Chen · Current chart");
    await chart(page, "Jordan Reed");
    await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
    await panel.getByRole("button", { name: "Expand to main canvas" }).click();
    await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
    await panel.getByRole("button", { name: "Redock to companion rail" }).click();
    await expect(panel).toHaveAttribute("data-patient-binding", "pinned");
    for (const [width, zoom] of [[1440, 1], [1280, 1], [1024, 1], [1440, 2]]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((scale) => { document.documentElement.style.zoom = String(scale); }, zoom);
      await expect(panel.getByRole("status", { name: "Companion patient binding" })).toBeInViewport();
      await expect(panel.getByRole("button", { name: "Follow active chart" })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await dashboard(page);
    await expect(panel.getByRole("status", { name: "Companion patient binding" })).toHaveText("Pinned to Maya Chen · Not current chart");
    await panel.getByRole("button", { name: "Follow active chart" }).click();
    await expect(panel).toHaveAttribute("data-patient-binding", "retained");
    await page.evaluate(() => { document.documentElement.style.zoom = "1"; });
    await chart(page, "Maya Chen");
    await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
    await chart(page, "Jordan Reed");
    await expect(panel.getByRole("status", { name: "Companion patient binding" })).toHaveText("Following active chart · Jordan Reed");

    await dashboard(page);
    await expect(panel).toHaveAttribute("data-bound-patient-id", "jordan-reed");
    await expect(panel).toHaveAttribute("data-patient-binding", "retained");
    await expect(panel.getByRole("status", { name: "Companion patient binding" })).toHaveText("Last chart context · Jordan Reed");
    await expect(panel.getByRole("button", { name: "Change patient" })).toBeVisible();

    await panel.getByRole("button", { name: "Expand to main canvas" }).click();
    await expect(panel).toHaveClass(/companion-expanded-canvas/);
    await expect(panel).toHaveAttribute("data-bound-patient-id", "jordan-reed");
    await panel.getByRole("button", { name: "Redock to companion rail" }).click();
    await panel.getByRole("button", { name: `Close ${label.toLowerCase()}`, exact: true }).click();
    await page.locator(`.companion-rail-btn[data-tool-id="${id}"]`).click();
    await expect(panel).toHaveAttribute("data-bound-patient-id", "");
    await panel.getByRole("combobox").selectOption("maya-chen");
    await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
    await expect(panel).toContainText("Pinned to Maya Chen · Not current chart");
  });
}

test("lab draft remains owned by its patient while the tool follows charts and stays usable on Dashboard", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await chart(page, "Maya Chen");
  await page.locator('.companion-rail-btn[data-tool-id="labs"]').click();
  const picker = page.getByRole("combobox", { name: "Choose patient for labs" });
  await expect(picker).toHaveValue("maya-chen");
  const panel = page.locator('[data-companion-panel="labs"]');
  await panel.getByRole("tab", { name: /Order/ }).click();
  const indication = panel.getByRole("textbox", { name: "Lab indication" });
  await indication.fill("Synthetic Maya-specific indication");
  await chart(page, "Jordan Reed");
  await expect(picker).toHaveValue("jordan-reed");
  await expect(indication).toHaveValue("");
  await chart(page, "Maya Chen");
  await expect(indication).toHaveValue("Synthetic Maya-specific indication");
  await dashboard(page);
  await expect(picker).toHaveValue("maya-chen");
  await expect(panel).toContainText("Selected Patient");
});

test("primary tools stay immediately reachable, lower-frequency Orders stays reachable through More, and tabs show no decorative dirty dot", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await chart(page, "Maya Chen");
  await expect(page.locator(".browser-tabs .tab-dot")).toHaveCount(0);

  for (const [width, height] of [[1440, 900], [1280, 800], [1024, 800], [720, 800]]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".primary-workspace-pane .patient-chart-sidebar")).toHaveCount(0);
    const controls = page.locator(".primary-workspace-pane .patient-header-actions");
    await expect(controls.getByRole("button", { name: "Overview", exact: true })).toBeVisible();
    await expect(controls.getByRole("button", { name: "Encounter", exact: true })).toBeVisible();
    for (const id of ["medications", "labs", "documents", "communication", "history"]) {
      const tool = page.locator(`.companion-rail-btn[data-tool-id="${id}"]`);
      await tool.scrollIntoViewIfNeeded();
      await expect(tool).toBeInViewport();
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "More companion tools" }).click();
  const more = page.locator(".companion-add-menu");
  await expect(more).toBeVisible();
  await more.getByRole("button", { name: "Pin Orders to Right Rail" }).click();
  const orders = page.locator('.companion-rail-btn[data-tool-id="orders"]');
  await expect(orders).toBeVisible();
  await orders.click();
  await expect(page.locator('[data-patient-record-tool="orders"]')).toHaveAttribute("data-bound-patient-id", "maya-chen");

  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await expect.poll(() => page.evaluate(() => {
    const rail = document.querySelector(".companion-rail")!.getBoundingClientRect();
    const strip = document.querySelector(".browser-tabs")!.getBoundingClientRect();
    return Math.abs(rail.top - strip.bottom);
  })).toBeLessThanOrEqual(2);
  await expect(page.locator(".primary-workspace-pane .patient-header-actions").getByRole("button", { name: "Encounter", exact: true })).toBeVisible();
  await orders.scrollIntoViewIfNeeded();
  await expect(orders).toBeInViewport();
  await page.screenshot({ path: "output/playwright/patient-record-chart-200-percent.png", fullPage: false });
});

test("Messages retains access to intake contacts without an active chart", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await dashboard(page);
  await page.route("**/api/intake", (route) => route.fulfill({ json: { success: true, queue: [{ prospectivePersonId: "synthetic-intake-contact", patientName: "Synthetic Intake Contact", patientId: null }] } }));
  await page.locator('.companion-rail-btn[data-tool-id="communication"]').click();
  const panel = page.locator('[data-companion-panel="communication"]');
  await panel.locator('[data-channel="patient"]').click();
  await expect(panel.locator('option[value="synthetic-intake-contact"]')).toHaveCount(1);
  await panel.getByRole("combobox").selectOption("synthetic-intake-contact");
  await expect(panel.getByRole("combobox")).toHaveValue("synthetic-intake-contact");
  await panel.getByRole("button", { name: "Expand to main canvas" }).click();
  await expect(panel.getByRole("combobox")).toHaveValue("synthetic-intake-contact");
  await expect(panel).toHaveAttribute("data-bound-patient-id", "");
});

test("document retrieval failure remains patient-bound and recovers through Retry", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await chart(page, "Maya Chen");
  let fail = true;
  await page.route("**/api/clinical-records?patientId=maya-chen", async (route) => {
    if (fail) await route.fulfill({ status: 503, json: { success: false, error: "Synthetic document retrieval unavailable" } });
    else await route.continue();
  });
  await page.locator('.companion-rail-btn[data-tool-id="documents"]').click();
  const panel = page.locator('[data-patient-record-tool="documents"]');
  await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
  await expect(panel.locator(".global-inline-error")).toContainText("Synthetic document retrieval unavailable");
  fail = false;
  await panel.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(panel.locator(".patient-doc-row").first()).toBeVisible();
  await expect(panel.locator(".global-inline-error")).toHaveCount(0);
});

test("Labs rejects another patient's records and does not claim current monitoring on failure", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await chart(page, "Maya Chen");
  await page.route("**/api/clinical-records?patientId=maya-chen", (route) => route.fulfill({
    json: { success: true, record: { medications: [{ patient_id: "jordan-reed", status: "active", display_text: "Wrong patient medication" }], observations: [], vitals: [] } },
  }));
  await page.locator('.companion-rail-btn[data-tool-id="labs"]').click();
  const panel = page.locator('[data-companion-panel="labs"]');
  await expect(panel).toContainText("Patient binding mismatch");
  await expect(panel).toContainText("Medication surveillance unavailable");
  await expect(panel).not.toContainText("Recorded Monitoring Checks Current");
  await expect(panel).not.toContainText("Wrong patient medication");
});

test("responsive fit preserves the mounted lab draft and preferred width through resize and zoom", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");
  await chart(page, "Maya Chen");
  await page.locator('.companion-rail-btn[data-tool-id="labs"]').click();
  const panel = page.locator('[data-companion-panel="labs"]');
  await panel.getByRole("tab", { name: /Order/ }).click();
  const indication = panel.getByRole("textbox", { name: "Lab indication" });
  await indication.fill("Synthetic responsive draft");
  await panel.evaluate((element) => { element.setAttribute("data-mount-probe", "retained"); });
  const handle = page.getByRole("separator", { name: "Resize panel width" });
  await handle.focus();
  await page.keyboard.press("End");
  const preferred = await page.evaluate(() => localStorage.getItem("ehr-companion-panel-width-v1"));
  expect(preferred).toBe("840");
  for (const [width, height, zoom, mode] of [
    [1440, 900, 1, "beside"], [1280, 800, 1, "beside"],
    [1024, 800, 1, "single"], [1440, 900, 2, "single"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate((value) => { document.documentElement.style.zoom = String(value); }, zoom);
    await expect(page.locator("html")).toHaveAttribute("data-companion-layout", mode);
    await expect(indication).toHaveValue("Synthetic responsive draft");
    await expect(panel).toHaveAttribute("data-mount-probe", "retained");
    await expect(panel.getByRole("combobox", { name: "Choose patient for labs" })).toHaveValue("maya-chen");
    expect(await page.evaluate(() => localStorage.getItem("ehr-companion-panel-width-v1"))).toBe(preferred);
    const box = (await panel.boundingBox())!;
    const strip = (await page.locator(".browser-tabs").boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(strip.y + strip.height - 1);
    if (mode === "beside") {
      await expect(panel.getByRole("button", { name: "Return to workspace" })).toBeHidden();
      const canvas = (await page.locator(".workspace-body").boundingBox())!;
      expect(canvas.x + canvas.width).toBeLessThanOrEqual(box.x + 1);
      expect(box.width).toBeCloseTo(width - 720 - 52, 0);
    } else {
      expect(box.x).toBe(0);
      expect(box.width).toBeCloseTo(width - 52 * zoom, 0);
      await expect(panel.getByRole("button", { name: "Return to workspace" })).toBeInViewport({ ratio: 1 });
      await expect(page.locator(".workspace-body")).toHaveAttribute("inert", "");
    }
    if (zoom === 2) {
      const body = (await panel.locator(".companion-frame-body").boundingBox())!;
      expect(body.height, "zoom retains a usable scrolling work area").toBeGreaterThanOrEqual(100 * zoom);
    }
    await page.screenshot({ path: `output/playwright/companion-fit-${width}-${zoom}x.png` });
  }
  await page.evaluate(() => { document.documentElement.style.zoom = "1"; });
  await expect(page.locator("html")).toHaveAttribute("data-companion-layout", "beside");
  await expect(indication).toHaveValue("Synthetic responsive draft");
  await expect(handle).toHaveAttribute("aria-valuenow", "668");
  await panel.getByRole("button", { name: "Expand to main canvas" }).click();
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(panel).toHaveClass(/companion-expanded-canvas/);
  await panel.getByRole("button", { name: "Redock to companion rail" }).click();
  await expect(indication).toHaveValue("Synthetic responsive draft");
  await page.setViewportSize({ width: 1024, height: 800 });
  await panel.getByRole("button", { name: "Return to workspace" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".workspace-body")).not.toHaveAttribute("inert", "");
  await expect(page.locator('.companion-rail-btn[data-tool-id="labs"]')).toBeFocused();
  await expect(page.locator(".patient-header").first()).toBeInViewport();
});
