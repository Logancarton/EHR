import { expect, test, type Page } from "@playwright/test";

async function signInDevelopmentUser(page: Page, buttonName: string) {
  await page.context().clearCookies();
  await page.goto("/");
  await page.locator(".auth-checking").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
  const developmentLogin = page.getByRole("button", { name: buttonName, exact: true });
  await expect(developmentLogin).toBeVisible({ timeout: 15_000 });
  await developmentLogin.click();
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-ehr-role", "provider", { timeout: 15_000 });
  await expect(page.locator(".app-shell")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-workspace-restored", "true", { timeout: 15_000 });
}

async function navigateToTodayDashboard(page: Page) {
  const todayDashboard = page.locator(".today-dashboard");
  if (await todayDashboard.isVisible().catch(() => false)) {
    return;
  }
  await page.waitForTimeout(400);
  if (await todayDashboard.isVisible().catch(() => false)) {
    return;
  }
  await expect(async () => {
    if (await todayDashboard.isVisible().catch(() => false)) return;
    const railToday = page.locator("button.rail-item").filter({ hasText: "Today" }).first();
    const homeTab = page.locator("button.home-tab").first();
    if (await railToday.isVisible().catch(() => false)) {
      await railToday.click();
    } else if (await homeTab.isVisible().catch(() => false)) {
      await homeTab.click();
    }
    await expect(todayDashboard).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

test.describe("synthetic visit and document intake lifecycle", () => {
  test.beforeEach(async ({ request }) => {
    try {
      await request.patch("/api/appointments", {
        headers: {
          "Content-Type": "application/json",
          "x-ehr-patient-id": "elena-rostova",
        },
        data: { id: "apt-3", status: "waiting" },
      });
    } catch {}
  });

  test("completes synthetic visit: Today -> Encounter -> Documents reader & intake -> Sign Note -> Completed Schedule", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await signInDevelopmentUser(page, "Prototype provider");

    // 1. Ensure on Today schedule
    await navigateToTodayDashboard(page);
    await expect(page.locator(".today-dashboard")).toBeVisible();

    // 2. Click "Start Visit" on Elena Rostova
    const elenaRow = page.locator(".schedule-row").filter({ hasText: "Elena Rostova" }).first();
    await expect(elenaRow).toBeVisible();
    const startVisitBtn = elenaRow.getByRole("button", { name: /start visit/i });
    await expect(startVisitBtn).toBeVisible();
    await startVisitBtn.click();

    // 3. Elena's chart opens in Encounter section
    const patientHeader = page.locator(".primary-workspace-pane .patient-header h1");
    await expect(patientHeader).toHaveText("Elena Rostova");
    const activeSection = page.locator(".primary-workspace-pane .section-tabs button.active");
    await expect(activeSection).toHaveText("Encounter");

    // 4. Inspect Related Evidence: Documents Reader & Upload
    const docsTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("button", { name: "Documents", exact: true });
    await docsTab.click();
    await expect(docsTab).toHaveClass(/active/);

    // Verify document reader card with SHA-256 badge
    const readerCard = page.locator(".patient-document-reader-card");
    await expect(readerCard).toBeVisible();
    const shaBadge = page.locator(".patient-document-sha-badge");
    await expect(shaBadge).toBeVisible();
    await expect(shaBadge).toContainText("SHA-256");

    // Test Document Intake: click "+ Upload"
    const uploadBtn = page.locator(".patient-doc-upload-btn");
    await expect(uploadBtn).toBeVisible();
    await uploadBtn.click();

    const uploadModal = page.locator(".patient-doc-modal");
    await expect(uploadModal).toBeVisible();

    await page.locator(".patient-doc-modal input[type='text']").fill("Sleep Architecture Consultation");
    await page.locator(".patient-doc-modal textarea").fill("POLYSOMNOGRAPHY RESULTS:\nSleep onset latency 14 min. REM density normal. No periodic limb movements.");
    await page.locator(".patient-doc-modal-submit").click();

    // Verify modal closes and new document is selected with its SHA-256 hash
    await expect(uploadModal).not.toBeVisible();
    await expect(page.locator(".patient-document-detail-header h2")).toHaveText("Sleep Architecture Consultation");
    await expect(page.locator(".patient-document-reader-content")).toContainText("POLYSOMNOGRAPHY RESULTS");

    // 5. Return to Encounter section and sign the note
    const encounterTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("button", { name: "Encounter", exact: true });
    await encounterTab.click();
    await expect(encounterTab).toHaveClass(/active/);

    // Open Review & Sign modal
    const reviewSignBtn = page.locator(".btn-toolbar-primary");
    await expect(reviewSignBtn).toBeVisible();
    await reviewSignBtn.click();

    // Sign modal: step through closing ceremony
    const signModal = page.locator(".review-sign-modal");
    await expect(signModal).toBeVisible();

    // Step through wizard steps
    while (await signModal.getByRole("button", { name: /continue/i }).isVisible().catch(() => false)) {
      const followupCheck = signModal.locator("label").filter({ hasText: "follow-up plan" }).locator("input[type='checkbox']");
      if (await followupCheck.isVisible().catch(() => false)) {
        await followupCheck.check();
      }
      await signModal.getByRole("button", { name: /continue/i }).click();
    }

    // Now on final sign step: check legal attestation
    const attestationCheckbox = signModal.locator("label").filter({ hasText: "I attest" }).locator("input[type='checkbox']");
    await expect(attestationCheckbox).toBeVisible();
    await attestationCheckbox.check();

    const confirmSignBtn = signModal.getByRole("button", { name: /sign legal record|sign note/i });
    await expect(confirmSignBtn).toBeVisible();
    await confirmSignBtn.click();

    // After signing, the modal displays the confirmed signed record with a Close button
    const closeBtn = signModal.getByRole("button", { name: "Close" });
    await expect(closeBtn).toBeVisible({ timeout: 15_000 });
    await closeBtn.click();

    // Verify modal closes and locked/signed state appears in toolbar
    await expect(signModal).not.toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".status-locked-pill")).toBeVisible();

    // 6. Return to Today Schedule and verify appointment is completed
    await navigateToTodayDashboard(page);

    // Verify Elena's status on schedule is completed
    const updatedElenaRow = page.locator(".schedule-row").filter({ hasText: "Elena Rostova" }).first();
    await expect(updatedElenaRow).toBeVisible();
    await expect(updatedElenaRow.locator("select.status-dropdown")).toHaveValue("completed");
  });
});
