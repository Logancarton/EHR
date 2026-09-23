import { expect, test, type Page } from "@playwright/test";
import {
  openWorkspaceFromLauncher,
  signInWithDefaultLayout,
} from "./workspace-fixtures";

async function openPatientByName(page: Page, name: string) {
  const input = page.getByLabel("Ask AI or search the EHR");
  await input.click();
  await input.fill(name);
  const result = page.locator(".search-results button").filter({ hasText: name }).first();
  await expect(result).toBeVisible({ timeout: 15_000 });
  await result.click();
  await expect(
    page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: name }),
  ).toHaveCount(1);
}

test.describe("workspace safety and browser ergonomics", () => {
  test("patient-bound rating scales park visibly when a practice canvas replaces the chart", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const maya = page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" });
    await maya.click();
    await page.locator(".companion-rail-btn[aria-label='Calculators']").click();

    const panel = page.locator('[data-patient-tool="rating-scales"]');
    await expect(panel.locator('[data-tool-scope="active"]')).toContainText("Maya Chen");
    await expect(panel.locator(".calc-question").first().getByRole("button").first()).toBeEnabled();

    await openWorkspaceFromLauncher(page, "intake");
    const inactive = panel.locator('[data-tool-scope="inactive"]');
    await expect(inactive).toContainText("Inactive Chart Pinned");
    await expect(inactive).toContainText("Maya Chen");
    await expect(panel.locator(".calc-question").first().getByRole("button").first()).toBeDisabled();

    await maya.click();
    await expect(panel.locator('[data-tool-scope="active"]')).toContainText("Active Chart");
  });

  test("Clinical AI keeps its patient binding and parks on practice canvases", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const maya = page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" });
    await maya.click();
    await page.locator(".companion-rail-btn[title*='Clinical AI']").click();

    const activePanel = page.getByRole("complementary", {
      name: "Clinical AI Companion",
      exact: true,
    });
    await expect(activePanel).toBeVisible();
    await expect(activePanel.getByText(/ISOLATED TO CHART \(maya-chen\)/)).toBeVisible();

    const draft = activePanel.locator("#ai-composer-input");
    await draft.fill("Keep this Maya-specific draft while I check Intake.");

    await openWorkspaceFromLauncher(page, "intake");

    const parked = page.locator(
      'aside[data-patient-tool="clinical-ai"][data-tool-scope-status="inactive"]',
    );
    await expect(parked).toBeVisible();
    await expect(parked.locator('[data-tool-scope="inactive"]')).toContainText("Maya Chen");
    await expect(parked.locator('[data-tool-scope="inactive"]')).toContainText("Inactive Chart Pinned");
    await expect(parked).toContainText("Clinical AI is parked");

    await maya.click();
    await expect(activePanel).toBeVisible();
    await expect(draft).toHaveValue("Keep this Maya-specific draft while I check Intake.");
  });

  test("assessment Insert opens the encounter first and requires a second explicit insertion", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const maya = page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" });
    await maya.click();
    await page.locator(".companion-rail-btn[aria-label='Calculators']").click();

    const panel = page.locator('[data-patient-tool="rating-scales"]');
    await panel.getByRole("button", { name: "ASRS", exact: true }).click();
    const questions = panel.locator(".calc-question");
    await expect(questions).toHaveCount(18);
    for (let index = 0; index < 18; index += 1) {
      await questions.nth(index).getByRole("button").first().click();
    }

    await page.locator(".primary-workspace-pane .section-tabs")
      .getByRole("tab", { name: "Documents", exact: true })
      .click();

    await panel.getByRole("button", { name: "Insert", exact: true }).click();
    await expect(page.locator(".workspace-toast")).toContainText("Encounter opened for Maya Chen");
    await expect(
      page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Encounter", exact: true }),
    ).toHaveAttribute("aria-selected", "true");

    await panel.getByRole("button", { name: "Insert", exact: true }).click();
    await expect(page.locator(".workspace-toast")).toContainText(
      "Inserted assessment into Maya Chen's encounter note",
    );
  });

  test("five patient charts collapse behind labeled overflow and global shortcuts stay deterministic", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    for (const name of ["Jordan Reed", "Elena Rostova", "David Kim", "Marcus Vance"]) {
      await openPatientByName(page, name);
    }

    const patientTabs = page.locator('.browser-tab[data-workspace-tab="patient"]');
    await expect(patientTabs).toHaveCount(5);
    await expect(page.locator('.browser-tab[data-workspace-tab="patient"]:visible')).toHaveCount(4);

    const overflow = page.getByRole("button", { name: /More patient tabs/ });
    await expect(overflow).toBeVisible();
    await overflow.click();
    const menu = page.getByRole("menu", { name: "Open patient tabs" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveCount(1);

    await page.keyboard.press("Escape");
    const input = page.getByLabel("Ask AI or search the EHR");
    await page.keyboard.press("Control+K");
    await expect(input).toBeFocused();

    const beforeClose = await patientTabs.count();
    const visiblePatient = page.locator('.browser-tab[data-workspace-tab="patient"]:visible').last();
    await visiblePatient.click();
    await page.keyboard.press("Alt+w");
    await expect(patientTabs).toHaveCount(beforeClose - 1);

    await page.keyboard.press("Control+1");
    await expect(page.locator('.browser-tab[data-workspace-tab="dashboard"]')).toHaveClass(/active/);
  });

  test("Stage Refill shortcut enters the staged order composer without transport", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const transportRequests: string[] = [];
    page.on("request", (request) => {
      if (/transmit|drfirst|surescripts|epcs/i.test(request.url())) {
        transportRequests.push(request.url());
      }
    });

    const input = page.getByLabel("Ask AI or search the EHR");
    await input.click();
    await input.fill("What medications is Maya Chen taking?");

    const preview = page.locator('[data-omnibox-ambient-preview="medications"]');
    await expect(preview).toBeVisible({ timeout: 15_000 });
    const stage = preview.getByRole("button", { name: "Stage Refill…" });
    await expect(stage).toHaveAttribute("data-order-route", "staged-cart-only");
    await stage.click();

    await expect(page.locator(".order-cart-modal")).toBeVisible();
    await expect(page.locator(".order-composer-body")).toBeVisible();
    expect(transportRequests).toEqual([]);
  });
});
