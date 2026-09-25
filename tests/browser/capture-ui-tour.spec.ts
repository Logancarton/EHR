import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { resetWorkspaceLayout, signInDevelopmentUser, waitForAuthenticatedShell } from "./workspace-fixtures";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "docs/gemini-context/screenshots");

test.describe("Capture UI Tour for Gemini Analysis", () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test("captures comprehensive suite of UI screenshots", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });

    // 1. Auth Sign-in Gate
    await page.context().clearCookies();
    await page.goto("/");
    await page.locator(".auth-checking").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
    await expect(page.locator(".auth-development")).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "01_auth_signin_gate.png"),
      fullPage: false,
    });

    // 2. Sign in and Reset Workspace to Today Dashboard (Cockpit view)
    await signInDevelopmentUser(page, "Prototype provider");
    await resetWorkspaceLayout(page, ["maya-chen", "jordan-reed"]);
    await waitForAuthenticatedShell(page);

    // Make sure Today dashboard is in front
    const dashboardTab = page.locator("[data-workspace-tab='dashboard'], [data-workspace-view='today']").first();
    if (await dashboardTab.isVisible().catch(() => false)) {
      await dashboardTab.click();
    }
    await page.locator(".today-dashboard").waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForTimeout(1200);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "02_today_clinical_cockpit.png"),
      fullPage: false,
    });

    // 2b. Outstanding Work - Grouped Outstanding Labs by Lab Order (commit 41d9c02)
    const labsFilterBtn = page.locator(".queue-filter-bar button").filter({ hasText: /Labs/i }).first();
    if (await labsFilterBtn.isVisible().catch(() => false)) {
      await labsFilterBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "02b_today_grouped_lab_orders.png"),
        fullPage: false,
      });
      // Click back to All
      const allFilterBtn = page.locator(".queue-filter-bar button").filter({ hasText: /All/i }).first();
      if (await allFilterBtn.isVisible().catch(() => false)) {
        await allFilterBtn.click();
      }
    }

    // 3. Open Workspace Launcher (+)
    const launcherBtn = page.locator("button[data-workspace-control='open-workspace-launcher']");
    await expect(launcherBtn).toBeVisible({ timeout: 5_000 });
    await launcherBtn.click();
    const popover = page.locator("[data-testid='open-workspace-launcher-popover']");
    await expect(popover).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "03_open_workspace_launcher.png"),
      fullPage: false,
    });
    // Close launcher popover by pressing Escape
    await page.keyboard.press("Escape");
    await expect(popover).not.toBeVisible();

    // 4. Patient Workspace Overview (Maya Chen - Redesigned for Visit Readiness 1fd1131)
    const mayaTab = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Maya Chen" }).first();
    await expect(mayaTab).toBeVisible({ timeout: 5_000 });
    await mayaTab.click();
    await page.waitForTimeout(600);

    // Click Overview section tab
    const overviewTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Overview" }).first();
    if (await overviewTab.isVisible().catch(() => false)) {
      await overviewTab.click();
    }
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "04_patient_workspace_overview.png"),
      fullPage: false,
    });

    // 5. Clinical Encounter Note Editor
    const encounterTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Encounter" }).first();
    await expect(encounterTab).toBeVisible({ timeout: 5_000 });
    await encounterTab.click();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "05_encounter_note_editor.png"),
      fullPage: false,
    });

    // 5b. Encounter Visit Readiness Panel (D-100 / b6a3733)
    const readinessPanel = page.locator(".primary-workspace-pane").getByRole("complementary", { name: "Visit readiness" });
    if (await readinessPanel.isVisible().catch(() => false)) {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "05b_encounter_visit_readiness.png"),
        fullPage: false,
      });
    }

    // 6. Documents Reader with SHA-256 Provenance
    const docsTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Documents" }).first();
    await expect(docsTab).toBeVisible({ timeout: 5_000 });
    await docsTab.click();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "06_documents_provenance_sha.png"),
      fullPage: false,
    });

    // 7. Right Companion Rail (Communication Companion)
    const commBtn = page.locator(".companion-rail-btn[data-tool-id='communication']");
    if (await commBtn.isVisible().catch(() => false)) {
      await commBtn.click();
      await page.locator(".companion-panel[data-companion-panel='communication']").waitFor({ state: "visible", timeout: 5000 });
      await page.waitForTimeout(600);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "07_communication_companion.png"),
        fullPage: false,
      });
    }

    // 7b. Labs Ordering Companion (feat 1540c8f)
    const labsRailBtn = page.locator(".companion-rail-btn[data-tool-id='labs']");
    if (await labsRailBtn.isVisible().catch(() => false)) {
      await labsRailBtn.click();
      await page.locator(".companion-panel[data-companion-panel='labs']").waitFor({ state: "visible", timeout: 5000 });
      await page.waitForTimeout(600);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "07b_labs_ordering_companion.png"),
        fullPage: false,
      });
    }

    // 7c. Clinical Calculators & ASRS v1.1 Assessment Tool (feat 45bdb66)
    const calcRailBtn = page.locator(".companion-rail-btn[data-tool-id='calc']");
    if (await calcRailBtn.isVisible().catch(() => false)) {
      await calcRailBtn.click();
      const calcPanel = page.locator(".companion-panel").filter({ hasText: "Clinical Rating Scales" });
      await expect(calcPanel).toBeVisible({ timeout: 5000 });
      // Click on ASRS tab
      const asrsTab = calcPanel.getByRole("button", { name: "ASRS", exact: true });
      if (await asrsTab.isVisible().catch(() => false)) {
        await asrsTab.click();
      }
      await page.waitForTimeout(600);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "07c_asrs_adhd_assessment_tool.png"),
        fullPage: false,
      });
    }

    // 8. Clinical Monitoring Settings Modal (D-099 / bb8b5b2)
    const prefsBtn = page.locator("button[aria-label='Preferences']").first();
    if (await prefsBtn.isVisible().catch(() => false)) {
      await prefsBtn.click();
      await page.waitForTimeout(300);
      const monitoringBtn = page.getByRole("button", { name: "Clinical monitoring" });
      if (await monitoringBtn.isVisible().catch(() => false)) {
        await monitoringBtn.click();
        const monitoringDialog = page.getByRole("dialog", { name: "Medication monitoring" });
        await expect(monitoringDialog).toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(500);
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, "08_clinical_monitoring_settings.png"),
          fullPage: false,
        });
        await monitoringDialog.getByRole("button", { name: "Close clinical monitoring" }).click().catch(() => page.keyboard.press("Escape"));
      }
    }

    // 9. Billing & Superbill Workspace (D-101 / b6a3733)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "billing" } }));
    });
    const billingSurface = page.locator("[data-billing-surface='authoritative']");
    if (await billingSurface.waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false)) {
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "09_billing_superbill_workspace.png"),
        fullPage: false,
      });
    }

    // 10. Workspace Customizer (Adaptive Layout Drawer)
    const layoutBtn = page.locator(".patient-header").getByRole("button", { name: /Layout/i }).first();
    if (await layoutBtn.isVisible().catch(() => false)) {
      await layoutBtn.click();
    } else if (await prefsBtn.isVisible().catch(() => false)) {
      await prefsBtn.click();
      await page.waitForTimeout(300);
      const customizePick = page.locator(".profile-menu-pick").filter({ hasText: "Customize layout" });
      if (await customizePick.isVisible().catch(() => false)) {
        await customizePick.click();
      }
    }
    const customizerDrawer = page.locator(".customizer-drawer");
    if (await customizerDrawer.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false)) {
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "14_adaptive_layout_customizer.png"),
        fullPage: false,
      });
      // Close customizer drawer
      await page.locator(".customizer-close-btn").click().catch(() => page.keyboard.press("Escape"));
    }

    // 11. Zen Home Suite Launcher
    const homeBtn = page.locator("button.brand-home-button");
    if (await homeBtn.isVisible().catch(() => false)) {
      await homeBtn.click();
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "10_zen_home_launcher.png"),
        fullPage: false,
      });
    }

    // 12. Calendar Workspace (opened via + launcher)
    await page.locator("[data-workspace-control='open-workspace-launcher']").click();
    const calendarBtn = page
      .getByTestId("open-workspace-launcher-popover")
      .locator(".open-workspace-item[data-workspace-id='calendar']");
    if (await calendarBtn.isVisible().catch(() => false)) {
      await calendarBtn.click();
      await page.locator(".gcal-root").waitFor({ state: "visible", timeout: 10_000 });
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "11_calendar_workspace.png"),
        fullPage: false,
      });
    }

    // 13. Intake Workspace
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "intake" } }));
    });
    await page.locator(".global-module-shell[data-active-module='intake']").waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "12_intake_workspace.png"),
      fullPage: false,
    });

    // 14. Omnibox AI Intent / Search
    const searchInput = page.locator(".patient-search-wrap input");
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill("What medications is Maya Chen taking?");
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "13_omnibox_ai_intent.png"),
        fullPage: false,
      });
    }
  });
});
