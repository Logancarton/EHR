import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test.describe("Calendar right-rail companion", () => {
  test("uses the real Calendar workspace and expands without losing the working state", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const calendarRailBtn = page.locator(".companion-rail-btn[aria-label='Calendar']").first();
    await expect(calendarRailBtn).toBeVisible({ timeout: 10_000 });
    await calendarRailBtn.click();

    const panel = page.locator("aside.companion-calendar-panel");
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByText("Full interactive schedule")).toBeVisible();

    const compactCalendar = panel.locator(".gcal-root-compact");
    await expect(compactCalendar).toBeVisible();
    await expect(compactCalendar.locator(".gcal-day-view")).toBeVisible();
    await expect(panel.getByText("Quick Schedule")).toHaveCount(0);

    // Prove this is the full Calendar interaction model, not a separate
    // quick-book form: change date, open the real event editor, and enter draft
    // state before expanding.
    await compactCalendar.getByRole("button", { name: "Next period" }).click();
    const compactHeading = await compactCalendar.locator(".gcal-heading-date").textContent();

    await compactCalendar.getByRole("button", { name: "New Event", exact: true }).click();
    const editor = panel.locator(".gcal-modal-body");
    await expect(editor).toBeVisible();

    await panel.locator(".gcal-event-tabs-bar").getByRole("tab", { name: "Schedule" }).click();
    const draftTitle = `Side-panel schedule draft ${Date.now()}`;
    await editor.locator("input[type=text]").first().fill(draftTitle);

    await compactCalendar.getByRole("button", { name: "Expand to full view", exact: true }).click();

    await expect(panel).toHaveCount(0);
    const fullCalendar = page.locator('.gcal-root[data-calendar-presentation="workspace"]');
    await expect(fullCalendar).toBeVisible({ timeout: 10_000 });
    await expect(fullCalendar.locator(".gcal-heading-date")).toHaveText(compactHeading ?? "");
    await expect(fullCalendar.getByRole("tab", { name: "Day", exact: true })).toHaveAttribute("aria-selected", "true");

    const restoredEditor = fullCalendar.locator(".gcal-modal-body");
    await expect(restoredEditor).toBeVisible();
    await expect(restoredEditor.locator("input[type=text]").first()).toHaveValue(draftTitle);
  });
});
