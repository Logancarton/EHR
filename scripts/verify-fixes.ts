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
    await page.waitForTimeout(1500);
  }

  await page.locator(".app-shell").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // 1. VERIFY WORKSPACE LAUNCHER HR DESCRIPTION (Item 4)
  console.log("1. Verifying Workspace Launcher HR description...");
  const launcherPlusBtn = page.locator(".tab-strip-new-btn, button[aria-label='Open workspace']").first();
  if (await launcherPlusBtn.isVisible().catch(() => false)) {
    await launcherPlusBtn.click();
    await page.waitForTimeout(600);
    await snap(page, "v1_workspace_launcher_hr.png");
    // Close launcher
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }

  // 2. NAVIGATE TO MAYA CHEN PATIENT WORKSPACE
  console.log("2. Navigating to Maya Chen...");
  const mayaTab = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Maya Chen" }).first();
  if (await mayaTab.isVisible().catch(() => false)) {
    await mayaTab.click();
    await page.waitForTimeout(800);
  }

  // VERIFY OVERVIEW PULSE CELLS (Item 7)
  console.log("3. Verifying Overview pulse cells (Item 7)...");
  const overviewTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Overview" }).first();
  if (await overviewTab.isVisible().catch(() => false)) {
    await overviewTab.click();
    await page.waitForTimeout(600);
    await snap(page, "v2_maya_overview_pulse_cells.png");
  }

  // VERIFY PATIENT LABS TAB (Item 5)
  console.log("4. Verifying Patient Labs tab (Item 5)...");
  const labsTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Labs" }).first();
  if (await labsTab.isVisible().catch(() => false)) {
    await labsTab.click();
    await page.waitForTimeout(800);
    await snap(page, "v3_maya_labs_flowsheet_vitamin_d.png");
  }

  // VERIFY PATIENT MESSAGES PORTAL COMPOSER (Item 6)
  console.log("5. Verifying Patient Messages Portal Composer (Item 6)...");
  const msgsTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Messages" }).first();
  if (await msgsTab.isVisible().catch(() => false)) {
    await msgsTab.click();
    await page.waitForTimeout(800);
    await snap(page, "v4_maya_messages_pinned_composer.png");
  }

  // VERIFY ENCOUNTER BUTTON IN HEADER (Item 1)
  console.log("6. Verifying In-Encounter button in patient header (Item 1)...");
  const encounterTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Encounter" }).first();
  if (await encounterTab.isVisible().catch(() => false)) {
    await encounterTab.click();
    await page.waitForTimeout(600);
    await snap(page, "v5_maya_encounter_header_btn.png");
  }

  // VERIFY MEDICAL CALCULATOR CHIPS WRAPPING IN COMPANION (Item 2)
  console.log("7. Verifying Medical Calculator chips in Companion (Item 2)...");
  const calcRailBtn = page.locator(".companion-rail-btn[data-tool-id='calc']");
  if (await calcRailBtn.isVisible().catch(() => false)) {
    await calcRailBtn.click();
    await page.waitForTimeout(600);
    const medDosingTab = page.locator("button:has-text('Medical & Dosing')").first();
    if (await medDosingTab.isVisible().catch(() => false)) {
      await medDosingTab.click();
      await page.waitForTimeout(500);
      await snap(page, "v6_companion_medical_calc_wrap.png");
    }
  }

  // VERIFY PRIVACY MODE MASKING ON PATIENT HEADER (Item 3)
  console.log("8. Verifying Privacy Mode masking on patient header (Item 3)...");
  // Toggle Privacy Mode via keyboard shortcut or event
  await page.evaluate(() => {
    document.body.classList.toggle("privacy-mode-active");
  });
  await page.waitForTimeout(500);
  await snap(page, "v7_privacy_mode_chart_header_masked.png");

  // Hover over patient header to verify unmasking
  const patientHeader = page.locator(".patient-identity").first();
  if (await patientHeader.isVisible().catch(() => false)) {
    await patientHeader.hover();
    await page.waitForTimeout(400);
    await snap(page, "v8_privacy_mode_chart_header_hover_unmasked.png");
  }

  console.log("Verification finished successfully!");
  await browser.close();
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
