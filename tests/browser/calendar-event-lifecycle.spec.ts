import { expect, test, type Page } from "@playwright/test";
import { openWorkspaceFromLauncher, signInWithDefaultLayout } from "./workspace-fixtures";
import {
  durationStringToMinutes,
  timeStringToMinutes,
  type ScheduleItem,
} from "../../app/lib/schedule-data";

/**
 * Regression coverage for the CalendarWorkspace decomposition
 * (docs/DECISIONS.md, calendar/* extraction): before this, no browser test
 * ever opened the event detail popover, the month view, or the agenda view,
 * or exercised cancellation from the popover. Those are exactly the pieces
 * CalendarViews.tsx / CalendarEventDetails.tsx / calendar-actions.ts now
 * own, so this locks their behavior in.
 *
 * Uses a varying quarter-hour slot (see slotIndex below) rather than the New
 * Event button's fixed 10:30 AM default, both to avoid colliding with the
 * fixed 10:30 AM appointments other specs in this suite create and because
 * the suite's database persists across runs of this file itself.
 */

async function openCalendar(page: Page) {
  await openWorkspaceFromLauncher(page, "calendar");
  await expect(page.locator(".gcal-root")).toBeVisible({ timeout: 20_000 });
}

test.describe("Calendar event lifecycle", () => {
  test("a schedule block can be created, inspected across views, and cancelled", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    await openCalendar(page);

    const title = `Regression Coverage Block ${Date.now()}`;

    // 1. Create a non-patient schedule block at a distinctive time.
    await page.getByRole("button", { name: "New Event", exact: true }).click();
    const modal = page.locator(".gcal-modal-body");
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // "Schedule" is ambiguous with the header's own Schedule view tab, so this
    // is scoped to the editor's own tab bar.
    await page.locator(".gcal-event-tabs-bar").getByRole("tab", { name: "Schedule" }).click();
    await modal.locator("input[type=text]").first().fill(title);

    // The backend correctly rejects overlapping schedule blocks. This suite
    // shares a persistent browser-test database, so a random quarter-hour can
    // legitimately collide with another spec's appointment. Choose from the
    // editor's real options using the authoritative appointment list instead.
    const bookingDate = await modal.locator('input[type="date"]').inputValue();
    const appointmentResponse = await page.request.get(`/api/appointments?date=${bookingDate}`);
    expect(appointmentResponse.ok(), "loading the day's schedule should succeed").toBeTruthy();
    const existing = ((await appointmentResponse.json()).appointments ?? []) as ScheduleItem[];
    const active = existing.filter(
      (appointment) => appointment.status !== "cancelled" && appointment.status !== "no-show",
    );

    const timeSelect = modal.locator("select").nth(1);
    const timeOptions = await timeSelect.locator("option").allTextContents();
    const slotLabel = timeOptions.find((label) => {
      const proposedStart = timeStringToMinutes(label);
      const proposedEnd = proposedStart + 30;
      return active.every((appointment) => {
        const appointmentStart = timeStringToMinutes(appointment.time);
        const appointmentEnd =
          appointmentStart + durationStringToMinutes(appointment.duration);
        return proposedEnd <= appointmentStart || proposedStart >= appointmentEnd;
      });
    });
    expect(slotLabel, "the current calendar day should have an open 30-minute editor slot").toBeTruthy();
    await timeSelect.selectOption(slotLabel!);
    await page.getByRole("button", { name: "Save Schedule Block", exact: true }).click();
    await expect(modal).toBeHidden({ timeout: 15_000 });

    // 2. It renders as a chip in the week view.
    const chip = page.locator(".gcal-event-chip.type-schedule", { hasText: title });
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await expect(chip).toBeEnabled();
    await expect(chip).toHaveClass(/status-(scheduled|confirmed)/);

    // 3. Clicking it opens the detail popover with non-patient semantics
    //    (category badge, no status dropdown, "Cancel Event" not "Open Chart").
    await chip.click();
    const popover = page.locator(".gcal-event-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText(title);
    await expect(popover).toContainText("Schedule Block");
    await expect(popover.locator(".gcal-select-field")).toHaveCount(0);
    await expect(popover.getByRole("button", { name: "Open Chart" })).toHaveCount(0);
    await expect(popover.getByRole("button", { name: "Cancel Event" })).toBeVisible();

    // Close without cancelling yet.
    await popover.getByRole("button", { name: "Close" }).click();
    await expect(popover).toBeHidden();

    // 4. The month view renders without error and highlights today — not a
    //    stronger claim than that, since a day's cell only ever shows its
    //    first 3 events (by design) and today may already hold that many
    //    from fixture data.
    const viewSelector = page.locator(".gcal-view-selector");
    await viewSelector.getByRole("tab", { name: "Month" }).click();
    await expect(page.locator(".gcal-month-view")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".gcal-month-cell.is-today")).toBeVisible();

    // 5. ...and the agenda/schedule view, which lists every event for the day
    //    with no such cap.
    await viewSelector.getByRole("tab", { name: "Schedule" }).click();
    const agendaRow = page.locator(".gcal-agenda-row", { hasText: title });
    await expect(agendaRow).toBeVisible({ timeout: 10_000 });

    // 6. Cancelling from the popover marks it cancelled. The row stays in the
    //    agenda list (cancellation is a status, not a deletion — the calendar
    //    filters never exclude "cancelled" for meetings/blocks) but now
    //    carries the cancelled status class and label.
    await agendaRow.click();
    await expect(popover).toBeVisible();
    page.once("dialog", (dialog) => void dialog.accept());
    await popover.getByRole("button", { name: "Cancel Event" }).click();
    await expect(popover).toBeHidden({ timeout: 10_000 });
    await expect(agendaRow.locator(".gcal-agenda-status")).toHaveClass(/status-cancelled/);
    await expect(agendaRow.locator(".gcal-agenda-status")).toContainText("Cancelled");
  });
});
