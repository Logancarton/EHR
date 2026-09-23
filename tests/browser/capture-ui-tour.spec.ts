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

    // 4. Patient Workspace Overview (Maya Chen)
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

    // 8. Workspace Customizer (Adaptive Layout Drawer)
    const layoutBtn = page.locator(".patient-header").getByRole("button", { name: /Layout/i }).first();
    const prefsBtn = page.locator("button[aria-label='Preferences']").first();
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
    await expect(customizerDrawer).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "12_adaptive_layout_customizer.png"),
      fullPage: false,
    });
    // Close customizer drawer
    await page.locator(".customizer-close-btn").click().catch(() => page.keyboard.press("Escape"));
    await expect(customizerDrawer).not.toBeVisible();

    // 9. Zen Home Suite Launcher
    const homeBtn = page.locator("button.brand-home-button");
    if (await homeBtn.isVisible().catch(() => false)) {
      await homeBtn.click();
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "08_zen_home_launcher.png"),
        fullPage: false,
      });
    }

    // 10. Calendar Workspace
    // UI-8 removed the top-bar work navigation; the `+` launcher is the open path.
    await page.locator("[data-workspace-control='open-workspace-launcher']").click();
    const calendarBtn = page
      .getByTestId("open-workspace-launcher-popover")
      .locator(".open-workspace-item[data-workspace-id='calendar']");
    if (await calendarBtn.isVisible().catch(() => false)) {
      await calendarBtn.click();
      await page.locator(".gcal-root").waitFor({ state: "visible", timeout: 10_000 });
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "09_calendar_workspace.png"),
        fullPage: false,
      });
    }

    // 11. Intake Workspace
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "intake" } }));
    });
    await page.locator(".global-module-shell[data-active-module='intake']").waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "10_intake_workspace.png"),
      fullPage: false,
    });

    // 12. Omnibox AI Intent / Search
    const searchInput = page.locator(".patient-search-wrap input");
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill("What medications is Maya Chen taking?");
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "11_omnibox_ai_intent.png"),
        fullPage: false,
      });
    }
  });
});
