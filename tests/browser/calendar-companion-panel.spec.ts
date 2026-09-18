import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test.describe("Calendar Right Rail Companion Panel", () => {
  test("opens quick schedule from right rail and books appointment from any screen", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    // 1. Locate Calendar button on right companion rail
    const calendarRailBtn = page.locator(".companion-rail-btn[title*='Calendar']").first();
    await expect(calendarRailBtn).toBeVisible({ timeout: 10_000 });
    await calendarRailBtn.click();

    // 2. Verify companion panel opens directly into Quick Schedule
    const panel = page.locator("aside.companion-calendar-panel");
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByText("Quick Schedule")).toBeVisible();
    await expect(panel.getByText("Calendar & Schedule")).toBeVisible();

    // 3. Fill in complaint
    const complaintInput = panel.locator(".complaint-input");
    await complaintInput.fill("Companion quick schedule test");

    // 4. Click a slot chip or select time
    const openSlot = panel.locator(".slot-chip:not(:disabled)").first();
    if (await openSlot.isVisible()) {
      await openSlot.click();
    }

    // 5. Submit booking
    const bookBtn = panel.locator("button.calendar-btn-primary", { hasText: "Confirm & Book Appointment" });
    await expect(bookBtn).toBeVisible();
    await bookBtn.click();

    // 6. Verify appointment confirmation
    const successCard = panel.locator(".companion-calendar-success");
    await expect(successCard).toBeVisible({ timeout: 10_000 });
    await expect(successCard.getByText("Appointment Confirmed!")).toBeVisible();

    // 7. Verify Schedule Another resets the form
    const scheduleAnotherBtn = successCard.getByRole("button", { name: "Schedule Another Appointment" });
    await expect(scheduleAnotherBtn).toBeVisible();
    await scheduleAnotherBtn.click();
    await expect(panel.locator(".companion-schedule-form")).toBeVisible();

    // 8. Verify Day Schedule timeline tab shows appointments
    const dayTab = panel.locator("button.companion-calendar-tab-btn", { hasText: /Day Schedule/ });
    await dayTab.click();
    await expect(panel.locator(".companion-agenda-view")).toBeVisible();
  });
});
