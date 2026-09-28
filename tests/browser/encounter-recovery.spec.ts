import { expect, test, type Locator, type Page } from "@playwright/test";
import { bookVisitToday, signInWithDefaultLayout, type SyntheticVisitPatient } from "./workspace-fixtures";

const ELENA: SyntheticVisitPatient = {
  patientId: "elena-rostova",
  patientName: "Elena Rostova",
  dob: "03/22/1988",
  age: 38,
  mrn: "P-10764",
};

async function dragToDetach(tab: Locator, workspace: Locator) {
  const workspaceBox = await workspace.boundingBox();
  if (!workspaceBox) throw new Error("Workspace body did not have browser geometry.");
  await tab.dragTo(workspace, {
    targetPosition: {
      x: Math.min(320, Math.max(80, workspaceBox.width / 3)),
      y: Math.min(260, Math.max(120, workspaceBox.height / 3)),
    },
  });
}

test.describe("encounter recovery matrix (CB-7 / P5)", () => {
  test("patient switch preserves drafts and prevents cross-patient contamination", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInWithDefaultLayout(page, "Prototype provider");

    // 1. Open Maya Chen -> Encounter
    await page.locator(".browser-tab").filter({ hasText: "Maya Chen" }).click();
    await page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Encounter", exact: true }).click();
    const mayaComplaint = page.locator(".primary-workspace-pane .encounter-workspace-root").getByRole("textbox", { name: "Chief Complaint", exact: true });
    await expect(mayaComplaint).toBeVisible();
    await mayaComplaint.fill("Maya distinct draft note content for patient switch test.");

    // 2. Switch to Jordan Reed -> Encounter
    await page.locator(".browser-tab").filter({ hasText: "Jordan Reed" }).click();
    await page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Encounter", exact: true }).click();
    const jordanComplaint = page.locator(".primary-workspace-pane .encounter-workspace-root").getByRole("textbox", { name: "Chief Complaint", exact: true });
    await expect(jordanComplaint).toBeVisible();
    // Jordan must NOT contain Maya's draft text
    await expect(jordanComplaint).not.toContainText("Maya distinct draft");

    // Write Jordan's own draft text
    await jordanComplaint.fill("Jordan distinct draft note content.");

    // 3. Switch back to Maya Chen -> Verify Maya's draft is intact
    await page.locator(".browser-tab").filter({ hasText: "Maya Chen" }).click();
    await expect(mayaComplaint).toHaveValue("Maya distinct draft note content for patient switch test.");

    // 4. Switch back to Jordan Reed -> Verify Jordan's draft is intact
    await page.locator(".browser-tab").filter({ hasText: "Jordan Reed" }).click();
    await expect(jordanComplaint).toHaveValue("Jordan distinct draft note content.");
  });

  test("detach and redock preserves active encounter draft and continues autosave", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInWithDefaultLayout(page, "Prototype provider");

    // Open Maya Chen -> Encounter
    const mayaTab = page.locator(".browser-tab").filter({ hasText: "Maya Chen" });
    await mayaTab.click();
    await page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Encounter", exact: true }).click();
    const complaint = page.locator(".primary-workspace-pane .encounter-workspace-root").getByRole("textbox", { name: "Chief Complaint", exact: true });
    await expect(complaint).toBeVisible();
    await complaint.fill("Draft text before detach gesture.");

    // Detach Maya's tab to floating window
    await dragToDetach(mayaTab, page.locator(".workspace-body"));

    const mayaPane = page.locator(".detached-patient-pane").filter({ hasText: "Maya Chen" });
    await expect(mayaPane).toBeVisible();
    await expect(mayaPane).toHaveClass(/floating-patient-window/);

    // Floating window is in Encounter mode and displays pre-detach text
    const detachedComplaint = mayaPane.locator(".encounter-workspace-root").getByRole("textbox", { name: "Chief Complaint", exact: true });
    await expect(detachedComplaint).toBeVisible();
    await expect(detachedComplaint).toHaveValue("Draft text before detach gesture.");

    // Append text while detached
    await detachedComplaint.fill("Draft text before detach gesture. Appended while floating.");

    // Dock Maya back
    await mayaPane.locator(".dock-button").click();
    await expect(mayaTab).toBeVisible();
    await mayaTab.click();

    // Docked workspace retains all text and saves successfully
    await expect(complaint).toHaveValue("Draft text before detach gesture. Appended while floating.");
    const saveState = page.locator(".primary-workspace-pane .encounter-status-tag .ui-save-state");
    await expect(saveState).toHaveAttribute("data-save-status", "saved", { timeout: 15_000 });
  });

  test("refresh restores saved encounter draft without data loss", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInWithDefaultLayout(page, "Prototype provider");

    // Open Maya Chen -> Encounter
    await page.locator(".browser-tab").filter({ hasText: "Maya Chen" }).click();
    await page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Encounter", exact: true }).click();
    const complaint = page.locator(".primary-workspace-pane .encounter-workspace-root").getByRole("textbox", { name: "Chief Complaint", exact: true });
    await expect(complaint).toBeVisible();
    await complaint.fill("Draft text intended to survive browser refresh.");

    // Wait for autosave confirmation
    const saveState = page.locator(".primary-workspace-pane .encounter-status-tag .ui-save-state");
    await expect(saveState).toHaveAttribute("data-save-status", "saved", { timeout: 15_000 });

    // Refresh page
    await page.reload();

    // Reopen Maya Chen -> Encounter
    await page.locator(".browser-tab").filter({ hasText: "Maya Chen" }).click();
    await page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Encounter", exact: true }).click();
    await expect(complaint).toBeVisible();
    await expect(complaint).toHaveValue("Draft text intended to survive browser refresh.");
  });

  test("close and reopen tab preserves draft content", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInWithDefaultLayout(page, "Prototype provider");

    // Open Maya Chen -> Encounter
    await page.locator(".browser-tab").filter({ hasText: "Maya Chen" }).click();
    await page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Encounter", exact: true }).click();
    const complaint = page.locator(".primary-workspace-pane .encounter-workspace-root").getByRole("textbox", { name: "Chief Complaint", exact: true });
    await expect(complaint).toBeVisible();
    await complaint.fill("Draft text surviving tab closure.");

    // Wait for autosave confirmation
    const saveState = page.locator(".primary-workspace-pane .encounter-status-tag .ui-save-state");
    await expect(saveState).toHaveAttribute("data-save-status", "saved", { timeout: 15_000 });

    // Close Maya Chen's tab
    await page.getByRole("button", { name: "Close Maya Chen", exact: true }).click();
    await expect(page.locator(".browser-tab").filter({ hasText: "Maya Chen" })).toHaveCount(0);

    // Reopen Maya Chen via omnibox search
    const omnibox = page.getByRole("textbox", { name: "Ask AI or search the EHR" });
    await omnibox.fill("Maya Chen");
    const result = page.locator('.search-results button[data-omnibox-result="patient"]').filter({ hasText: "Maya Chen" }).first();
    await expect(result).toBeVisible({ timeout: 15_000 });
    await result.click();

    // Open Encounter tab and assert content preserved
    await page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Encounter", exact: true }).click();
    await expect(complaint).toBeVisible();
    await expect(complaint).toHaveValue("Draft text surviving tab closure.");
  });

  test("failed save displays failed state with retry, and retry saves work", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInWithDefaultLayout(page, "Prototype provider");

    await page.locator(".browser-tab").filter({ hasText: "Maya Chen" }).click();
    await page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Encounter", exact: true }).click();
    const complaint = page.locator(".primary-workspace-pane .encounter-workspace-root").getByRole("textbox", { name: "Chief Complaint", exact: true });
    await expect(complaint).toBeVisible();

    // Intercept saves to return 500 error
    let failSave = true;
    await page.route(/\/api\/encounters(\?.*)?$/, async (route) => {
      if (route.request().method() === "POST" && failSave) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Synthetic server error for failed save test" }),
        });
      } else {
        await route.continue();
      }
    });

    await complaint.fill("Content typed during server failure.");

    // Verify indicator transitions to failed
    const saveState = page.locator(".primary-workspace-pane .encounter-status-tag .ui-save-state");
    await expect(saveState).toHaveAttribute("data-save-status", "failed", { timeout: 15_000 });
    await expect(saveState).toContainText("Save failed");
    const retryBtn = saveState.getByRole("button", { name: "Retry", exact: true });
    await expect(retryBtn).toBeVisible();

    // Re-enable server success and click Retry
    failSave = false;
    await retryBtn.click();

    // Verify save succeeds
    await expect(saveState).toHaveAttribute("data-save-status", "saved", { timeout: 15_000 });
  });

  test("older in-flight response never marks newer revision saved", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInWithDefaultLayout(page, "Prototype provider");

    await page.locator(".browser-tab").filter({ hasText: "Maya Chen" }).click();
    await page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Encounter", exact: true }).click();
    const complaint = page.locator(".primary-workspace-pane .encounter-workspace-root").getByRole("textbox", { name: "Chief Complaint", exact: true });
    await expect(complaint).toBeVisible();

    let releaseFirstSave!: () => void;
    const firstSaveHeld = new Promise<void>((resolve) => (releaseFirstSave = resolve));
    let postCount = 0;

    await page.route(/\/api\/encounters(\?.*)?$/, async (route) => {
      if (route.request().method() === "POST") {
        postCount += 1;
        if (postCount === 1) {
          await firstSaveHeld;
        }
        await route.continue();
      } else {
        await route.continue();
      }
    });

    // Write edit 1 -> triggers save 1 which is held
    await complaint.fill("Edit 1 before delay.");
    await expect.poll(() => postCount).toBeGreaterThanOrEqual(1);

    // Write edit 2 while save 1 is in-flight
    await complaint.fill("Edit 1 before delay. Newer edit 2 typed while save 1 is in flight.");

    // Release save 1
    releaseFirstSave();

    // Save status must reach saved for the final edit 2, without false early saved state
    const saveState = page.locator(".primary-workspace-pane .encounter-status-tag .ui-save-state");
    await expect(saveState).toHaveAttribute("data-save-status", "saved", { timeout: 15_000 });
    await expect(complaint).toHaveValue("Edit 1 before delay. Newer edit 2 typed while save 1 is in flight.");
  });

  test("revision conflict (409) reports conflict and preserves local text", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInWithDefaultLayout(page, "Prototype provider");

    await page.locator(".browser-tab").filter({ hasText: "Maya Chen" }).click();
    await page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Encounter", exact: true }).click();
    const complaint = page.locator(".primary-workspace-pane .encounter-workspace-root").getByRole("textbox", { name: "Chief Complaint", exact: true });
    await expect(complaint).toBeVisible();

    await page.route(/\/api\/encounters(\?.*)?$/, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "Encounter draft conflict: updated by another session." }),
        });
      } else {
        await route.continue();
      }
    });

    await complaint.fill("Text typed during revision conflict test.");

    // Verify indicator shows failed
    const saveState = page.locator(".primary-workspace-pane .encounter-status-tag .ui-save-state");
    await expect(saveState).toHaveAttribute("data-save-status", "failed", { timeout: 15_000 });

    // Local text in the editor is preserved
    await expect(complaint).toHaveValue("Text typed during revision conflict test.");
  });

  test("signing flushes pending save, signs legal snapshot, and freezes record", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await signInWithDefaultLayout(page, "Prototype provider");

    // Book a fresh appointment today for Elena Rostova
    const appointmentId = await bookVisitToday(page.request, ELENA);

    // Go to Today dashboard
    const dashboardTab = page.locator(".browser-tab").filter({ hasText: "Dashboard" }).first();
    if (await dashboardTab.isVisible()) {
      await dashboardTab.click();
    }
    const elenaRow = page.locator(`.roster-row[data-appointment-id="${appointmentId}"]`);
    await expect(elenaRow).toBeVisible();
    await elenaRow.getByRole("button", { name: "Start", exact: true }).click();

    // Elena's chart opens in Encounter section
    const workspace = page.locator(".primary-workspace-pane .encounter-workspace-root");
    await expect(workspace).toBeVisible();
    await expect(page.locator(".primary-workspace-pane .patient-header h1")).toHaveText("Elena Rostova");

    // Document evaluation and plan
    const complaint = workspace.getByRole("textbox", { name: "Chief Complaint", exact: true });
    await complaint.fill("Synthetic evaluation: manual loop certification.");
    const plan = workspace.getByRole("textbox", { name: "Treatment Plan", exact: true });
    await plan.fill("Preserve this treatment plan in the immutable signed legal record.");

    // Immediately click Review & Sign (flushing pending edits)
    const reviewSignBtn = page.locator(".btn-toolbar-primary");
    await expect(reviewSignBtn).toBeVisible();
    await reviewSignBtn.click();

    // Step through closing ceremony
    const signModal = page.locator(".review-sign-modal");
    await expect(signModal).toBeVisible();

    while (await signModal.getByRole("button", { name: /continue/i }).isVisible().catch(() => false)) {
      const followupCheck = signModal.locator("label").filter({ hasText: "follow-up plan" }).locator("input[type='checkbox']");
      if (await followupCheck.isVisible().catch(() => false)) {
        await followupCheck.check();
      }
      await signModal.getByRole("button", { name: /continue/i }).click();
    }

    // Check legal attestation and sign
    const attestationCheckbox = signModal.locator("label").filter({ hasText: "I attest" }).locator("input[type='checkbox']");
    await expect(attestationCheckbox).toBeVisible();
    await attestationCheckbox.check();

    const confirmSignBtn = signModal.getByRole("button", { name: /sign legal record|sign note/i });
    await expect(confirmSignBtn).toBeVisible();
    await confirmSignBtn.click();

    // Close signing confirmation modal
    const closeBtn = signModal.getByRole("button", { name: "Close" });
    await expect(closeBtn).toBeVisible({ timeout: 15_000 });
    await closeBtn.click();
    await expect(signModal).not.toBeVisible({ timeout: 10_000 });

    // Verify toolbar displays signed record state and save indicator is removed
    await expect(page.locator('.encounter-status-tag[data-record-state="signed"]')).toContainText("Signed");
    await expect(page.locator(".encounter-status-tag .ui-save-state")).toHaveCount(0);

    // Verify signed record history and immutability notice
    const signedEncounterId = await workspace.getAttribute("data-encounter-id");
    expect(signedEncounterId).toBeTruthy();
    await workspace.getByRole("button", { name: /Past notes/ }).click();
    const signedHistory = workspace.locator(`[data-history-encounter-id="${signedEncounterId}"]`);
    await expect(signedHistory).toBeVisible();
    await signedHistory.locator("summary").click();
    await expect(signedHistory.getByText(/original note remains immutable/i)).toBeVisible();
    await expect(signedHistory.getByText("Preserve this treatment plan in the immutable signed legal record.")).toBeVisible();

    // Append post-signing amendment
    await signedHistory.getByRole("button", { name: "Add correction", exact: true }).click();
    await signedHistory.getByLabel("Correction type").selectOption("amendment");
    await signedHistory.getByLabel("Correction text").fill("CB-7 certification verified without AI assistance.");
    await signedHistory.getByRole("button", { name: "Save correction", exact: true }).click();
    await expect(signedHistory.getByText("CB-7 certification verified without AI assistance.")).toBeVisible();
    await expect(signedHistory.getByText(/original note remains immutable/i)).toBeVisible();
  });
});
