import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test.describe("CB-2: Prototype Containment & Integration Honesty", () => {
  test("prototype workspaces declare unconfigured banners and operate as drafts without fake external transmission", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDefaultLayout(page, "Prototype provider");

    // 1. Email Workspace Containment
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("ehr-switch-view", { detail: { view: "email" } })
      );
    });

    const emailBanner = page.locator('[data-email-transport="unavailable"]');
    await expect(emailBanner).toBeVisible();
    await expect(emailBanner).toContainText("Practice email integration is unconfigured");

    // Compose an email and save draft
    await page.getByRole("button", { name: "Compose Email" }).click();
    await page.locator('input[placeholder="colleague@domain.org or patient"]').fill("consultant@psych.org");
    await page.locator('input[placeholder="Regarding patient consultation or clinical inquiry"]').fill("Patient referral inquiry");
    await page.locator('textarea[placeholder="Write message... (Encrypted HIPAA transport)"]').fill("Drafting referral notes for discussion.");
    
    // Save draft button
    const saveEmailDraftBtn = page.getByRole("button", { name: "Save as Draft (Transport Unavailable)" });
    await expect(saveEmailDraftBtn).toBeVisible();
    await saveEmailDraftBtn.click();

    // Verify draft folder shows draft without fake dispatch claim
    await expect(page.locator(".email-compose-box")).not.toBeVisible();
    await expect(page.locator("text=Secure email dispatched")).toHaveCount(0);

    // 2. Fax Workspace Containment
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("ehr-switch-view", { detail: { view: "fax" } })
      );
    });

    const faxBanner = page.locator('[data-fax-transport="unavailable"]');
    await expect(faxBanner).toBeVisible();
    await expect(faxBanner).toContainText("e-Fax transport is unconfigured");

    // Compose fax
    await page.getByRole("button", { name: "Draft New Fax" }).click();
    await page.locator('input[placeholder="(415) 555-0199"]').fill("(415) 555-0199");
    await page.locator('input[placeholder="e.g. Psychiatric Consultation Note"]').fill("Records request");
    await page.locator('textarea[placeholder="Transmitting clinical documentation. Please confirm receipt..."]').fill("Clinical records transmission note");
    
    const sendFaxBtn = page.getByRole("button", { name: "Save as Draft (Transport Unavailable)" });
    await expect(sendFaxBtn).toBeVisible();
    await sendFaxBtn.click();

    // Verify it was saved as draft and no fake confirmation CONF-EHR was generated
    await expect(page.locator("text=CONF-EHR-")).toHaveCount(0);
    await expect(page.locator("text=Draft (Not Transmitted)").first()).toBeVisible();

    // 3. Patient Communication (SMS) Workspace Containment
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("ehr-switch-view", { detail: { view: "patient_communication" } })
      );
    });

    const smsBanner = page.locator('[data-sms-transport="unavailable"]');
    await expect(smsBanner).toBeVisible();
    await expect(smsBanner).toContainText("Two-way SMS telephony gateway is unconfigured");

    // Type a reply
    const replyInput = page.locator(".chat-input-bar textarea");
    await replyInput.fill("Appointment confirmed for tomorrow morning.");
    const draftSmsBtn = page.getByRole("button", { name: "Save as Draft (Transport Unavailable)" });
    await expect(draftSmsBtn).toBeVisible();
    await draftSmsBtn.click();

    // Verify truthful warning banner and offline draft indicator
    await expect(page.locator(".practice-banner-warning")).toContainText("SMS transport unavailable");
    await expect(page.locator("text=Draft (Offline)").first()).toBeVisible();

    // 4. Social Media Workspace Containment
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("ehr-switch-view", { detail: { view: "social_media" } })
      );
    });

    const socialBanner = page.locator('[data-social-integration="unconfigured"]');
    await expect(socialBanner).toBeVisible();
    await expect(socialBanner).toContainText("Social media & reputation platforms");
    await expect(page.locator("text=Google rating 4.9")).toHaveCount(0);
    await expect(page.locator("text=12.4K")).toHaveCount(0);

    // 5. HR Workspace Containment
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("ehr-switch-view", { detail: { view: "hr" } })
      );
    });

    const hrBanner = page.locator('[data-hr-credentialing="unconfigured"]');
    await expect(hrBanner).toBeVisible();
    await expect(hrBanner).toContainText("Provider credentialing and regulatory compliance operate in demonstration mode");
    // Confirm Logan Carton is not used with fictional MD/NPI credentials
    await expect(page.locator("text=Logan Carton, MD")).toHaveCount(0);
    await expect(page.locator("text=1841920391")).toHaveCount(0);
  });
});
