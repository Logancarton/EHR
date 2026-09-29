import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "docs/gemini-context/screenshots/deep-review");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function snap(page: Page, filename: string) {
  const target = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: target, fullPage: false });
  console.log(`Saved screenshot: ${filename}`);
}

async function closeAnyBackdrop(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll(".modal-backdrop").forEach((el) => (el as HTMLElement).remove());
    document.querySelectorAll(".patient-info-drawer, .patient-information-drawer").forEach((el) => {
      (el as HTMLElement).style.display = "none";
    });
  });
  await page.waitForTimeout(200);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  console.log("Navigating to http://localhost:3000/...");
  await page.goto("http://localhost:3000/");
  await page.waitForTimeout(1000);

  // Check if sign-in is needed
  const devLoginBtn = page.getByRole("button", { name: "Prototype provider" });
  if (await devLoginBtn.isVisible().catch(() => false)) {
    console.log("Clicking Prototype provider sign in...");
    await devLoginBtn.click();
    await page.waitForTimeout(2000);
  }

  // Wait for shell
  await page.locator(".app-shell").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Clean omnibox if needed
  const omnibox = page.locator(".patient-search-wrap input");
  if (await omnibox.isVisible().catch(() => false)) {
    await omnibox.fill("");
    await omnibox.blur();
  }

  // 1. TODAY DASHBOARD
  console.log("--- 1. TODAY DASHBOARD ---");
  const dashboardTab = page.locator("[data-workspace-tab='dashboard'], [data-workspace-view='today']").first();
  if (await dashboardTab.isVisible().catch(() => false)) {
    await dashboardTab.click();
    await page.waitForTimeout(800);
  }
  await snap(page, "01_today_dashboard_roster.png");

  // Day Grid view
  const dayGridBtn = page.getByRole("button", { name: "Day Grid" });
  if (await dayGridBtn.isVisible().catch(() => false)) {
    await dayGridBtn.click();
    await page.waitForTimeout(800);
    await snap(page, "02_today_dashboard_day_grid.png");
    // Switch back to Roster
    const rosterBtn = page.getByRole("button", { name: "Roster" });
    if (await rosterBtn.isVisible().catch(() => false)) {
      await rosterBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // Book a visit modal
  const bookVisitBtn = page.getByRole("button", { name: "Book a visit" });
  if (await bookVisitBtn.isVisible().catch(() => false)) {
    await bookVisitBtn.click();
    await page.waitForTimeout(600);
    await snap(page, "03_book_visit_modal.png");
    // Close modal
    const closeBtn = page.locator(".modal-close, [aria-label='Close without booking'], button:has-text('Cancel')").first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(500);
  }
  await closeAnyBackdrop(page);

  // 2. PATIENT WORKSPACE (Maya Chen)
  console.log("--- 2. PATIENT WORKSPACE (Maya Chen) ---");
  const mayaTab = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Maya Chen" }).first();
  if (await mayaTab.isVisible().catch(() => false)) {
    await mayaTab.click();
    await page.waitForTimeout(800);
  }

  // 2a. Overview
  const overviewTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Overview" }).first();
  if (await overviewTab.isVisible().catch(() => false)) {
    await overviewTab.click();
    await page.waitForTimeout(500);
  }
  await snap(page, "04_maya_overview.png");

  // Patient Info modal
  const patientInfoBtn = page.getByRole("button", { name: "Patient info" });
  if (await patientInfoBtn.isVisible().catch(() => false)) {
    await patientInfoBtn.click();
    await page.waitForTimeout(600);
    await snap(page, "05_maya_patient_info_modal.png");
    const closePatientInfo = page.locator("button[aria-label='Close patient information']").first();
    if (await closePatientInfo.isVisible().catch(() => false)) {
      await closePatientInfo.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(500);
  }
  await closeAnyBackdrop(page);

  // Orders modal
  const ordersBtn = page.locator("button:has-text('Orders')").first();
  if (await ordersBtn.isVisible().catch(() => false)) {
    await ordersBtn.click();
    await page.waitForTimeout(600);
    await snap(page, "06_maya_orders_modal.png");
    // Click Prescribe Rx tab inside orders modal
    const prescribeRxTab = page.locator("button:has-text('Prescribe Medication')").first();
    if (await prescribeRxTab.isVisible().catch(() => false)) {
      await prescribeRxTab.click();
      await page.waitForTimeout(400);
      await snap(page, "06b_orders_prescribe_rx.png");
    }
    const closeOrders = page.locator("button[aria-label='Close modal'], .orders-modal-close, button:has-text('Cancel')").first();
    if (await closeOrders.isVisible().catch(() => false)) {
      await closeOrders.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(500);
  }
  await closeAnyBackdrop(page);

  // 2b. Encounter Tab
  const encounterTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Encounter" }).first();
  if (await encounterTab.isVisible().catch(() => false)) {
    await encounterTab.click();
    await page.waitForTimeout(800);
    await snap(page, "07_maya_encounter_top.png");

    // Click "Insert normal exam"
    const insertNormalBtn = page.getByRole("button", { name: "Insert normal exam" });
    if (await insertNormalBtn.isVisible().catch(() => false)) {
      console.log("Clicking Insert normal exam...");
      await insertNormalBtn.click();
      await page.waitForTimeout(500);
    }

    // Scroll down to MSE / Diagnoses
    await page.evaluate(() => {
      const el = document.querySelector("#note-heading-mse");
      if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
    });
    await page.waitForTimeout(400);
    await snap(page, "08_maya_encounter_mse_inserted.png");

    // Click "Review & Sign" button
    const reviewSignBtn = page.getByRole("button", { name: "Review & Sign" });
    if (await reviewSignBtn.isVisible().catch(() => false)) {
      await reviewSignBtn.click();
      await page.waitForTimeout(800);
      await snap(page, "09_review_and_sign_modal.png");
      const backToEditBtn = page.getByRole("button", { name: "Back to Edit" }).first();
      if (await backToEditBtn.isVisible().catch(() => false)) {
        await backToEditBtn.click();
      } else {
        const closeBtn = page.locator(".modal-close, button[aria-label='Close']").first();
        await closeBtn.click().catch(() => page.keyboard.press("Escape"));
      }
      await page.waitForTimeout(500);
    }
  }
  await closeAnyBackdrop(page);

  // 2c. Meds Tab
  const medsTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Meds" }).first();
  if (await medsTab.isVisible().catch(() => false)) {
    await medsTab.click();
    await page.waitForTimeout(800);
    await snap(page, "10_maya_meds_tab.png");
  }

  // 2d. Labs Tab
  const labsTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Labs" }).first();
  if (await labsTab.isVisible().catch(() => false)) {
    await labsTab.click();
    await page.waitForTimeout(800);
    await snap(page, "11_maya_labs_tab.png");
  }

  // 2e. Documents Tab
  const docsTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Documents" }).first();
  if (await docsTab.isVisible().catch(() => false)) {
    await docsTab.click();
    await page.waitForTimeout(800);
    await snap(page, "12_maya_documents_tab.png");
  }

  // 2f. Messages Tab
  const msgsTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Messages" }).first();
  if (await msgsTab.isVisible().catch(() => false)) {
    await msgsTab.click();
    await page.waitForTimeout(800);
    await snap(page, "13_maya_messages_tab.png");
  }

  // 2g. History Tab
  const histTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "History" }).first();
  if (await histTab.isVisible().catch(() => false)) {
    await histTab.click();
    await page.waitForTimeout(800);
    await snap(page, "14_maya_history_tab.png");
  }

  // 3. JORDAN REED (Overdue Monitoring / Vitals alert)
  console.log("--- 3. PATIENT WORKSPACE (Jordan Reed) ---");
  const jordanTab = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Jordan Reed" }).first();
  if (await jordanTab.isVisible().catch(() => false)) {
    await jordanTab.click();
    await page.waitForTimeout(800);
    await snap(page, "15_jordan_overview_alerts.png");
  }

  // 4. RIGHT COMPANIONS
  console.log("--- 4. COMPANIONS ---");
  // 4a. Tasks companion
  const tasksRailBtn = page.locator(".companion-rail-btn[data-tool-id='tasks']");
  if (await tasksRailBtn.isVisible().catch(() => false)) {
    await tasksRailBtn.click();
    await page.waitForTimeout(600);
    await snap(page, "16_companion_tasks.png");
  }

  // 4b. AI companion
  const aiRailBtn = page.locator(".companion-rail-btn[data-tool-id='ai']");
  if (await aiRailBtn.isVisible().catch(() => false)) {
    await aiRailBtn.click();
    await page.waitForTimeout(600);
    await snap(page, "17_companion_ai.png");
  }

  // 4c. Clinical Calculators - Medical & Dosing tab
  const calcRailBtn = page.locator(".companion-rail-btn[data-tool-id='calc']");
  if (await calcRailBtn.isVisible().catch(() => false)) {
    await calcRailBtn.click();
    await page.waitForTimeout(600);
    // Click "Medical & Dosing" tab
    const medDosingTab = page.locator("button:has-text('Medical & Dosing')").first();
    if (await medDosingTab.isVisible().catch(() => false)) {
      await medDosingTab.click();
      await page.waitForTimeout(500);
      await snap(page, "18_companion_medical_calculators.png");
    }
  }

  // 5. INTAKE WORKSPACE
  console.log("--- 5. INTAKE WORKSPACE ---");
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "intake" } }));
  });
  await page.waitForTimeout(1000);
  await snap(page, "19_intake_workspace_list.png");

  // Click on first intake prospect card
  const firstIntakeCard = page.locator(".iq-card").first();
  if (await firstIntakeCard.isVisible().catch(() => false)) {
    await firstIntakeCard.click();
    await page.waitForTimeout(800);
    await snap(page, "20_intake_detail_view.png");
  }

  // 6. CALENDAR FULL WORKSPACE
  console.log("--- 6. CALENDAR FULL WORKSPACE ---");
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "calendar" } }));
  });
  await page.waitForTimeout(1000);
  await snap(page, "21_calendar_week_view.png");

  // Click Day view in calendar
  const calDayBtn = page.getByRole("button", { name: "Day", exact: true });
  if (await calDayBtn.isVisible().catch(() => false)) {
    await calDayBtn.click();
    await page.waitForTimeout(600);
    await snap(page, "22_calendar_day_view.png");
  }

  // Click "+ New Event"
  const newEventBtn = page.getByRole("button", { name: "New Event" });
  if (await newEventBtn.isVisible().catch(() => false)) {
    await newEventBtn.click();
    await page.waitForTimeout(600);
    await snap(page, "23_calendar_new_event_modal.png");
    const closeCalEditor = page.locator("button[aria-label='Close event editor'], button:has-text('Cancel')").first();
    if (await closeCalEditor.isVisible().catch(() => false)) {
      await closeCalEditor.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(400);
  }
  await closeAnyBackdrop(page);

  // 7. SETTINGS / LAYOUT PREFERENCES
  console.log("--- 7. SETTINGS / LAYOUT PREFERENCES ---");
  const prefsBtn = page.locator("button[aria-label='Preferences']").first();
  if (await prefsBtn.isVisible().catch(() => false)) {
    await prefsBtn.click();
    await page.waitForTimeout(400);
    const customizePick = page.locator(".profile-menu-pick").filter({ hasText: "Customize layout" });
    if (await customizePick.isVisible().catch(() => false)) {
      await customizePick.click();
      await page.waitForTimeout(600);
      await snap(page, "24_settings_layout_preferences.png");
      const doneBtn = page.locator(".customizer-drawer button:has-text('Done'), button:has-text('Done')").first();
      if (await doneBtn.isVisible().catch(() => false)) {
        await doneBtn.click();
      } else {
        await page.keyboard.press("Escape");
      }
      await page.waitForTimeout(400);
    }
  }
  await closeAnyBackdrop(page);

  // 8. OMNIBOX SEARCH
  console.log("--- 8. OMNIBOX SEARCH ---");
  const searchInput = page.locator(".patient-search-wrap input").first();
  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.click();
    await searchInput.fill("Maya Chen");
    await page.waitForTimeout(600);
    await snap(page, "25_omnibox_query_results.png");
  }

  // 9. RESPONSIVE / COMPACT VIEWPORT (1280x800)
  console.log("--- 9. COMPACT VIEWPORT (1280x800) ---");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(600);
  await snap(page, "26_viewport_1280x800.png");

  console.log("--- DEEP REVIEW COMPLETE ---");
  console.log("Total console errors encountered:", consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.log("Errors:", consoleErrors);
  }

  await browser.close();
}

run().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
