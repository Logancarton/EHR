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

    const panel = page.locator('[data-companion-panel="communication"]');
    await expect(panel.locator('[data-email-transport="unconfigured"]')).toContainText("nothing is sent or received");
    await panel.getByLabel("Email recipient").fill("consultant@example.test");
    await panel.getByLabel("Email draft").fill("Synthetic referral notes");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "fax" } })));
    await expect(panel.locator('[data-fax-transport="unconfigured"]')).toBeVisible();
    await panel.getByLabel("Fax recipient").fill("4155550199");
    await panel.getByLabel("Fax subject").fill("Synthetic records request");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "email" } })));
    await expect(panel.getByLabel("Email draft")).toHaveValue("Synthetic referral notes");
    await expect(panel.getByLabel("Email recipient")).toHaveValue("consultant@example.test");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "patient_communication" } })));
    await expect(panel.locator('[data-sms-transport="unconfigured"]')).toContainText("delivery is not connected");
    await expect(page.locator(".global-workspace-shell")).toHaveCount(0);
    await panel.getByRole("button", { name: "Close", exact: true }).click();

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
    // D-086 reworded this to say what is actually unverified. The dates on the screen
    // are what the practice recorded; nothing checks them against a licensing board.
    await expect(hrBanner).toContainText("primary-source verification are not configured");
    await expect(hrBanner).toContainText("not verified status");
    // Confirm Logan Carton is not used with fictional MD/NPI credentials
    await expect(page.locator("text=Logan Carton, MD")).toHaveCount(0);
    await expect(page.locator("text=1841920391")).toHaveCount(0);
  });
});
