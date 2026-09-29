import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const VERIFY_DIR = path.resolve(process.cwd(), "docs/gemini-context/screenshots/deep-review/verification");
fs.mkdirSync(VERIFY_DIR, { recursive: true });

async function snap(page: Page, filename: string) {
  const target = path.join(VERIFY_DIR, filename);
  await page.screenshot({ path: target, fullPage: false });
  console.log(`Saved verification screenshot: ${filename}`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  console.log("Navigating to http://localhost:3000/...");
  await page.goto("http://localhost:3000/");
  await page.waitForTimeout(1000);

  const devLoginBtn = page.getByRole("button", { name: "Prototype provider" });
  if (await devLoginBtn.isVisible().catch(() => false)) {
    await devLoginBtn.click();
    await page.waitForTimeout(2000);
  }
  await page.locator(".app-shell").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // 1. SELECT MAYA CHEN WORKSPACE
  console.log("--- 1. SELECT MAYA CHEN ---");
  const mayaTab = page.locator(".browser-tab, .workspace-tab, tr, .roster-row").filter({ hasText: "Maya Chen" }).first();
  if (await mayaTab.isVisible().catch(() => false)) {
    await mayaTab.click();
    await page.waitForTimeout(1000);
  }

  // 2. AI COMPANION TARGET CONTEXT
  console.log("--- 2. AI COMPANION TARGET CONTEXT ---");
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("ehr-open-companion", { detail: { tool: "ai" } }));
  });
  await page.waitForTimeout(1000);
  await page.mouse.move(0, 0);
  await snap(page, "v10_companion_ai_target_context.png");

  // 3. TASKS COMPANION VYVANSE MULTI-LINE WRAPPING
  console.log("--- 3. TASKS COMPANION VYVANSE MULTI-LINE WRAPPING ---");
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("ehr-open-companion", { detail: { tool: "tasks" } }));
  });
  await page.waitForTimeout(1000);
  await page.mouse.move(0, 0);
  await snap(page, "v11_companion_tasks_vyvanse_wrap.png");

  // 4. DOCUMENTS TAB ADDED BY CREDENTIALS
  console.log("--- 4. DOCUMENTS TAB ADDED BY CREDENTIALS ---");
  const docsTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Documents" }).first();
  if (await docsTab.isVisible().catch(() => false)) {
    await docsTab.click();
    await page.waitForTimeout(800);
    await snap(page, "v12_documents_added_by_credentials.png");
  }

  // 5. PATIENT MESSAGES SMART REPLY
  console.log("--- 5. PATIENT MESSAGES SMART REPLY ---");
  const msgsTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Messages" }).first();
  if (await msgsTab.isVisible().catch(() => false)) {
    await msgsTab.click();
    await page.waitForTimeout(800);
    await snap(page, "v14_patient_messages_smart_reply.png");
  }

  // 6. PRIVACY DISPLAY MODE MASKING
  console.log("--- 6. PRIVACY DISPLAY MODE MASKING ---");
  // Go to Encounter tab to verify clinical note and companion masking
  const encTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Encounter" }).first();
  if (await encTab.isVisible().catch(() => false)) {
    await encTab.click();
    await page.waitForTimeout(800);
  }
  // Open AI companion so companion header is also visible
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("ehr-open-companion", { detail: { tool: "ai" } }));
  });
  await page.waitForTimeout(600);

  // Enable privacy mode on app-shell
  await page.evaluate(() => {
    document.querySelector(".app-shell")?.classList.add("privacy-mode-active");
  });
  await page.waitForTimeout(500);
  await page.mouse.move(0, 0);
  await snap(page, "v15_privacy_mode_note_and_companion_masked.png");

  // Remove privacy mode
  await page.evaluate(() => {
    document.querySelector(".app-shell")?.classList.remove("privacy-mode-active");
  });
  await page.waitForTimeout(300);

  // 7. INTAKE WORKSPACE PROGRESS TIMELINE
  console.log("--- 7. INTAKE WORKSPACE PROGRESS TIMELINE ---");
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "intake" } }));
  });
  await page.waitForTimeout(1200);

  // Select Logan Carton to view detail panel
  const loganRow = page.locator(".intake-queue-item, .iq-card, tr").filter({ hasText: "Logan Carton" }).first();
  if (await loganRow.isVisible().catch(() => false)) {
    await loganRow.click();
    await page.waitForTimeout(800);
    await snap(page, "v13_intake_timeline_9_steps.png");
  }

  // 8. CALENDAR AT 1280x800 WITH COMPANION OPEN
  console.log("--- 8. CALENDAR AT 1280x800 WITH COMPANION OPEN ---");
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "calendar" } }));
  });
  await page.waitForTimeout(1200);

  // Open companion Calculators / Rating Scales to create docked companion (380px)
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("ehr-open-companion", { detail: { tool: "calculators" } }));
  });
  await page.waitForTimeout(800);

  // Set viewport to 1280x800
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.mouse.move(0, 0); // ensure cursor does not trigger rail tooltips
  await page.waitForTimeout(800);
  await snap(page, "v9_calendar_1280x800_companion_open.png");

  console.log("--- ALL VERIFICATION SCREENSHOTS SAVED ---");
  await browser.close();
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
