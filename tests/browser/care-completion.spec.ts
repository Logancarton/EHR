import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { resetWorkspaceLayout, signInDevelopmentUser } from "./workspace-fixtures";

/**
 * DB-10 — the care-completion board in a real browser.
 *
 * The sequence this suite exists for is the one a provider will care about most:
 * a visit with a follow-up plan and no appointment shows an open loop, the
 * provider schedules the follow-up through the ordinary scheduling workflow,
 * and the board closes the loop by itself, with the real date and time, without
 * asking for a second confirmation.
 *
 * Everything else here guards the rules around that: a deferral survives a
 * reload and never looks complete, two pinned patients never bleed into each
 * other, and unpinning changes only the personal board.
 */

const PATIENT_A = { id: "maya-chen", name: "Maya Chen" };
const PATIENT_B = { id: "jordan-reed", name: "Jordan Reed" };

function board(page: Page) {
  return page.locator('[data-module-id="care-completion"]');
}

function card(page: Page, patientId: string) {
  return board(page).locator(`.ccb-card[data-patient-id="${patientId}"]`);
}

function item(page: Page, patientId: string, itemKeyPrefix: string) {
  return card(page, patientId).locator(`.ccb-item[data-item-key^="${itemKeyPrefix}"]`);
}

/**
 * The follow-up appointments this suite books, so it can take them back out.
 *
 * Every spec in a run shares one database, and this one books real follow-ups
 * four weeks after an origin visit it dates a few weeks back — which puts them
 * inside the demo practice's current week, for two patients who are already on
 * the demo schedule. `tool-navigation`'s CB-3 case then found Jordan Reed twice
 * in one week and failed on a strict-mode violation that had nothing to do with
 * what it was testing.
 *
 * Only the future follow-ups are taken back. The origin visits are deliberately
 * dated weeks in the past, carry the encounter the board reads, and sit outside
 * every week another spec looks at.
 */
const bookedFollowUps: { id: string; patientId: string }[] = [];

function recordFollowUp(patientId: string, appointment: { id?: string } | undefined) {
  if (appointment?.id) bookedFollowUps.push({ id: appointment.id, patientId });
}

async function removeBookedFollowUps(request: APIRequestContext) {
  while (bookedFollowUps.length > 0) {
    const booked = bookedFollowUps.pop()!;
    const response = await request.delete(`/api/appointments?id=${encodeURIComponent(booked.id)}`, {
      headers: { "x-ehr-patient-id": booked.patientId },
    });
    expect(
      response.ok(),
      "a follow-up this suite booked into the shared practice should be removable",
    ).toBeTruthy();
  }
}

/** Clears every pin this suite may have left behind, so a rerun starts clean. */
async function clearWorklist(request: APIRequestContext) {
  const response = await request.get("/api/care-completion");
  if (!response.ok()) return;
  const payload = await response.json();
  for (const entry of payload?.board?.cards ?? []) {
    await request.post("/api/care-completion", {
      data: { action: "unpin", patientId: entry.patientId },
    });
  }
}

/**
 * Creates the visit-with-a-plan this suite needs, through the real routes.
 *
 * An appointment the encounter was started from, and a draft note recording a
 * follow-up interval. That is the authoritative shape the follow-up rule reads,
 * and building it through the API rather than by hand keeps the fixture honest.
 */
async function seedVisitWithFollowUpPlan(
  request: APIRequestContext,
  patientId: string,
  fixtureIndex: number,
  retry: number,
) {
  // Browser specs share one database for the whole run. Give every test/retry
  // its own synthetic originating-visit date so a successful earlier fixture
  // cannot trigger the real appointment-overlap guard in a later test. Later
  // cases must also be newer than earlier drafts: the board correctly focuses
  // the newest draft encounter, so making later fixtures older would cause the
  // test to keep resolving an encounter created by a previous case.
  const fixtureDate = new Date();
  const daysAgo = 30 - fixtureIndex * 2 - retry;
  fixtureDate.setUTCDate(fixtureDate.getUTCDate() - daysAgo);
  const today = fixtureDate.toISOString().slice(0, 10);

  const appointment = await request.post("/api/appointments", {
    headers: { "x-ehr-patient-id": patientId },
    data: {
      patientId,
      date: today,
      time: "09:00 AM",
      duration: "30 min",
      type: "Follow-up",
      status: "completed",
      chiefComplaint: "Care-completion browser fixture",
    },
  });
  expect(appointment.ok(), "seeding the originating visit should succeed").toBeTruthy();
  const appointmentId = (await appointment.json()).appointment.id as string;

  const encounter = await request.post("/api/encounters", {
    headers: { "x-ehr-patient-id": patientId },
    data: {
      patientId,
      appointmentId,
      date: today,
      type: "Follow-up",
      chiefComplaint: "Care-completion browser fixture",
      followUp: "4 weeks",
    },
  });
  expect(encounter.ok(), "seeding the encounter draft should succeed").toBeTruthy();
  const encounterId = (await encounter.json()).encounter.id as string;

  return { appointmentId, encounterId };
}

async function showCareCompletionWindow(page: Page) {
  const { defaultPreferences } = await import("../../app/lib/preference-engine");
  const response = await page.request.put("/api/preferences", {
    data: {
      preferences: {
        ...defaultPreferences,
        today: { ...defaultPreferences.today, showCareCompletion: true },
      },
    },
  });
  expect(response.ok(), "enabling the Care Completion window should succeed").toBeTruthy();
  await page.goto("/");
  await expect(board(page)).toBeVisible({ timeout: 20_000 });
}

test.describe("care completion board", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await signInDevelopmentUser(page, "Taylor · Provider");
    await resetWorkspaceLayout(page, []);
    await clearWorklist(page.request);
  });

  test.afterEach(async ({ page }) => {
    await removeBookedFollowUps(page.request);
  });

  test("a follow-up loop opens, closes from the real appointment, and shows its date", async ({ page }, testInfo) => {
    const { encounterId, appointmentId } = await seedVisitWithFollowUpPlan(page.request, PATIENT_A.id, 0, testInfo.retry);
    await showCareCompletionWindow(page);

    // 1. Empty board says so, and says how to fill it.
    await expect(board(page).locator(".ui-state-empty")).toContainText("No patients are pinned");

    // 2. Pin the patient from the window itself.
    await board(page).getByRole("button", { name: "Pin patient" }).click();
    await board(page).getByRole("searchbox", { name: "Search patients to pin" }).fill(PATIENT_A.name);
    await board(page).getByRole("button", { name: new RegExp(PATIENT_A.name) }).first().click();
    await expect(card(page, PATIENT_A.id)).toBeVisible();

    // 3. The follow-up is visibly incomplete, and names the recommended interval.
    await board(page).getByRole("button", { name: "Show full checklists" }).click();
    const followUp = item(page, PATIENT_A.id, `follow-up-appointment:${encounterId}`);
    await expect(followUp).toHaveAttribute("data-state", "open");
    await expect(followUp).toContainText("Schedule follow-up");
    await expect(followUp).toContainText("4 weeks");
    await expect(followUp).toContainText("No linked follow-up appointment exists");

    // 4. Schedule it through the ordinary scheduling workflow — not from here.
    const scheduled = await page.request.post("/api/appointments", {
      headers: { "x-ehr-patient-id": PATIENT_A.id },
      data: {
        action: "schedule_follow_up",
        originAppointmentId: appointmentId,
        interval: "4 weeks",
        time: "02:00 PM",
      },
    });
    expect(scheduled.ok(), "scheduling the follow-up should succeed").toBeTruthy();
    const followUpAppointment = (await scheduled.json()).appointment;
    recordFollowUp(PATIENT_A.id, followUpAppointment);

    // 5. The board closes the loop on its own. No second confirmation is asked
    //    for: the projection is re-read and the appointment is simply there.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("ehr-appointment-updated")));
    await expect(followUp).toHaveAttribute("data-state", "complete", { timeout: 20_000 });

    // 6. The actual date and time are rendered, not the interval that was planned.
    const [year, month, day] = String(followUpAppointment.date).split("-").map(Number);
    const rendered = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    await expect(followUp).toContainText(rendered);
    await expect(followUp).toContainText(String(followUpAppointment.time));

    // 7. A completed item offers no way to defer work that is already done.
    await expect(followUp.getByRole("button", { name: "Defer" })).toHaveCount(0);
  });

  test("a deferral survives reload, never reads as complete, and resumes", async ({ page }, testInfo) => {
    const { encounterId } = await seedVisitWithFollowUpPlan(page.request, PATIENT_B.id, 1, testInfo.retry);
    await page.request.post("/api/care-completion", {
      data: { action: "pin", patientId: PATIENT_B.id },
    });
    await showCareCompletionWindow(page);
    await board(page).getByRole("button", { name: "Show full checklists" }).click();

    const followUp = item(page, PATIENT_B.id, `follow-up-appointment:${encounterId}`);
    await expect(followUp).toHaveAttribute("data-state", "open");

    // Defer with a reason and a resume date.
    await followUp.getByRole("button", { name: "Defer" }).click();
    const dialog = page.getByRole("dialog", { name: /^Defer / });
    await expect(dialog).toContainText("It does not complete the work");
    await expect(dialog).toContainText(PATIENT_B.name);
    await dialog.getByLabel("Reason").selectOption("patient-checking-schedule");
    await dialog.locator("textarea").fill("Patient is checking their work schedule.");
    await dialog.getByRole("button", { name: "In 1 week" }).click();
    await dialog.getByRole("button", { name: "Defer", exact: true }).click();
    await expect(dialog).toBeHidden();

    // Deferred, and visibly not complete.
    await expect(followUp).toHaveAttribute("data-state", "deferred");
    await expect(followUp).toHaveAttribute("data-classification", "deferred");
    await expect(followUp).toContainText("Deferred");
    await expect(followUp).toContainText("Patient needs to check schedule");
    await expect(followUp).toContainText("Patient is checking their work schedule.");
    await expect(followUp).not.toContainText("Complete");

    // The count keeps it separate from the work that is actually done.
    await expect(card(page, PATIENT_B.id)).toHaveAttribute("data-progress-deferred", "1");
    await expect(card(page, PATIENT_B.id)).toHaveAttribute("data-closed", "false");

    // Both the pin and the deferral survive a reload — and so does the window's
    // own expanded/compact mode, which is a display preference of its own.
    await page.reload();
    await expect(board(page)).toBeVisible({ timeout: 20_000 });
    await expect(
      board(page).getByRole("button", { name: "Show compact rows" }),
      "the expanded mode the clinician chose is remembered",
    ).toBeVisible();
    await expect(card(page, PATIENT_B.id)).toBeVisible();
    await expect(followUp).toHaveAttribute("data-state", "deferred");
    await expect(followUp).toContainText("Patient is checking their work schedule.");

    // Resuming returns it to unresolved — not to complete.
    await followUp.getByRole("button", { name: "Resume" }).click();
    await expect(followUp).toHaveAttribute("data-state", "open", { timeout: 15_000 });
    await expect(followUp).toContainText("Schedule follow-up");
  });

  test("two pinned patients keep their own state, and unpinning touches only the board", async ({ page }, testInfo) => {
    const seedA = await seedVisitWithFollowUpPlan(page.request, PATIENT_A.id, 2, testInfo.retry);
    const seedB = await seedVisitWithFollowUpPlan(page.request, PATIENT_B.id, 3, testInfo.retry);
    for (const patientId of [PATIENT_A.id, PATIENT_B.id]) {
      await page.request.post("/api/care-completion", { data: { action: "pin", patientId } });
    }
    await showCareCompletionWindow(page);
    await board(page).getByRole("button", { name: "Show full checklists" }).click();

    await expect(card(page, PATIENT_A.id)).toBeVisible();
    await expect(card(page, PATIENT_B.id)).toBeVisible();

    // Defer on A only.
    const followUpA = item(page, PATIENT_A.id, `follow-up-appointment:${seedA.encounterId}`);
    const followUpB = item(page, PATIENT_B.id, `follow-up-appointment:${seedB.encounterId}`);
    await followUpA.getByRole("button", { name: "Defer" }).click();
    const dialog = page.getByRole("dialog", { name: /^Defer / });
    await dialog.getByRole("button", { name: "Defer", exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(followUpA).toHaveAttribute("data-state", "deferred");
    await expect(
      followUpB,
      "one patient's deferral must not reach another patient's identical work item",
    ).toHaveAttribute("data-state", "open");

    // Schedule B's follow-up; A must not move.
    const scheduled = await page.request.post("/api/appointments", {
      headers: { "x-ehr-patient-id": PATIENT_B.id },
      data: {
        action: "schedule_follow_up",
        originAppointmentId: seedB.appointmentId,
        interval: "4 weeks",
        time: "11:00 AM",
      },
    });
    expect(scheduled.ok()).toBeTruthy();
    recordFollowUp(PATIENT_B.id, (await scheduled.json()).appointment);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("ehr-appointment-updated")));

    await expect(followUpB).toHaveAttribute("data-state", "complete", { timeout: 20_000 });
    await expect(
      followUpA,
      "completing one patient's loop must not complete another's",
    ).toHaveAttribute("data-state", "deferred");

    // Unpinning removes the card and nothing else.
    await card(page, PATIENT_A.id)
      .getByRole("button", { name: `Clear ${PATIENT_A.name} from my worklist` })
      .click();
    await expect(card(page, PATIENT_A.id)).toHaveCount(0, { timeout: 15_000 });
    await expect(card(page, PATIENT_B.id)).toBeVisible();

    // The chart and the schedule are untouched by unpinning.
    const patient = await page.request.get(`/api/patients/${PATIENT_A.id}`);
    expect(patient.ok(), "the chart still exists after unpinning").toBeTruthy();
    const appointments = await page.request.get(`/api/appointments?patientId=${PATIENT_A.id}`);
    expect(appointments.ok()).toBeTruthy();
    const stillScheduled = (await appointments.json()).appointments as unknown[];
    expect(stillScheduled.length, "unpinning removed no appointment").toBeGreaterThan(0);
  });

  test("the window reports its states distinctly and stays usable when narrow", async ({ page }) => {
    await page.request.post("/api/care-completion", {
      data: { action: "pin", patientId: PATIENT_A.id },
    });
    await showCareCompletionWindow(page);

    // Compact mode renders a chip per item, each carrying an icon AND a word so
    // state never depends on colour alone.
    const chips = card(page, PATIENT_A.id).locator(".ccb-chip");
    await expect(chips.first()).toBeVisible();
    for (const chip of await chips.all()) {
      await expect(chip.locator(".icon")).toHaveCount(1);
      await expect(chip).not.toBeEmpty();
    }

    // The unavailable-rule boundary is stated rather than hidden.
    const unavailable = board(page).locator(".ccb-unavailable");
    await expect(unavailable).toContainText("cannot run here yet");
    await unavailable.locator("summary").click();
    await expect(unavailable).toContainText(/release-of-information|authoritative patient balance/i);

    // No fabricated money anywhere on the surface.
    await expect(board(page)).not.toContainText(/\$\s?\d/);

    // Narrow window: the board still lays out without a horizontal scrollbar.
    await page.setViewportSize({ width: 900, height: 900 });
    await expect(board(page)).toBeVisible();
    const overflows = await board(page).evaluate(
      (element) => element.scrollWidth > element.clientWidth + 2,
    );
    expect(overflows, "the board must not scroll sideways at a narrow width").toBeFalsy();

    // Keyboard reachability: every control on the card takes focus.
    const disclosure = card(page, PATIENT_A.id).getByRole("button", { name: /Expand|Collapse/ });
    await disclosure.focus();
    await expect(disclosure).toBeFocused();
    await disclosure.press("Enter");
    await expect(card(page, PATIENT_A.id).locator(".ccb-card-items")).toBeVisible();
  });
});
