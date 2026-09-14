import test from "node:test";
import assert from "node:assert/strict";
import {
  PREVIEW_PERSONAS,
  PREVIEW_ROSTER_FIELDS,
  PREVIEW_WINDOWS,
  activeVisits,
  addableWindows,
  cancelledVisits,
  deleteSavedLayout,
  findSavedLayout,
  matchesLayoutRef,
  saveLayout,
  savedLayoutsFor,
  toggleRosterField as toggleField,
  type PreviewSavedLayout,
  canHide,
  canMove,
  cycleSpan,
  hiddenWindows,
  layoutForPersona,
  matchesPreset,
  moveWindow,
  presetLayout,
  previewPersona,
  previewWindow,
  setWindowVisible,
  toggleCollapse,
  toggleRosterField,
  visibleWindows,
  type PreviewPersonaId,
  type PreviewWindowId,
} from "../app/lib/preview/dashboard-preview-model";
import {
  PREVIEW_CANCELLATION_REASONS,
  PREVIEW_DAYS,
  PREVIEW_FOLLOWUP_ITEMS,
  previewDay,
} from "../app/lib/preview/dashboard-preview-fixtures";
import { isPreviewRoute } from "../app/lib/preview/preview-route";

/**
 * The dashboard prototype's rules (roadmap §21, DB-1).
 *
 * These assert the product decisions the preview is being reviewed *for*, not its
 * pixels: the schedule dominates and cannot be dismissed, arrivals stay off in the
 * clinician previews, a persona is a starting layout rather than a permission, and
 * every rearrangement has a keyboard path. A preview that quietly lost one of these
 * would still look fine in a screenshot, which is why they are checked here.
 */

const PERSONA_IDS: PreviewPersonaId[] = ["pmhnp", "owner", "manager"];

test("the schedule is on every persona's start and cannot be taken off", () => {
  for (const personaId of PERSONA_IDS) {
    const layout = presetLayout(personaId, "calm");
    const schedule = layout.windows.find((window) => window.id === "schedule");
    assert.ok(schedule, `${personaId} must start with the schedule`);
    assert.equal(schedule.visible, true);
    assert.equal(schedule.span, "full", "the schedule is the dominant surface, not a tile beside others");

    assert.equal(canHide("schedule"), false);
    const attempted = setWindowVisible(layout, "schedule", false);
    assert.equal(
      attempted.windows.find((window) => window.id === "schedule")?.visible,
      true,
      "hiding the schedule must be refused, not merely discouraged",
    );
  }
});

test("the schedule leads every persona's calm layout", () => {
  for (const personaId of PERSONA_IDS) {
    const order = visibleWindows(presetLayout(personaId, "calm")).map((window) => window.id);
    assert.equal(order[0], "schedule", `${personaId}'s home opens on the schedule`);
  }
});

test("arrivals and the waiting room are off in the clinician previews and on for the front desk", () => {
  for (const personaId of ["pmhnp", "owner"] as PreviewPersonaId[]) {
    const arrivals = presetLayout(personaId, "calm").windows.find((window) => window.id === "arrivals");
    assert.equal(arrivals?.visible, false, `${personaId} must not start with arrivals`);
  }

  const manager = presetLayout("manager", "calm").windows.find((window) => window.id === "arrivals");
  assert.equal(manager?.visible, true, "the practice manager starts from schedule operations");
});

test("the owner starts clinically, with the business windows available and off", () => {
  const calm = presetLayout("owner", "calm");
  const order = visibleWindows(calm).map((window) => window.id);

  assert.equal(order[0], "schedule");
  for (const businessWindow of ["billing", "business"] as PreviewWindowId[]) {
    assert.ok(
      !order.includes(businessWindow),
      `${businessWindow} must not be on the owner's calm home — this is not a finance-first dashboard`,
    );
    assert.ok(
      previewWindow(businessWindow).availableTo.includes("owner"),
      `${businessWindow} must still be addable by the owner`,
    );
  }

  // And the deliberately dense owner layout is where they appear.
  const dense = visibleWindows(presetLayout("owner", "dense")).map((window) => window.id);
  assert.ok(dense.includes("business") && dense.includes("billing"));
});

test("every window carrying money is marked Demo", () => {
  for (const window of PREVIEW_WINDOWS) {
    if (window.category !== "business") continue;
    assert.equal(
      window.financialDemo,
      true,
      `${window.id} carries sample figures and must be marked Demo wherever it renders`,
    );
  }
});

test("a persona is a starting layout, never a permission", () => {
  // Switching persona rebuilds from that persona's own preset rather than carrying
  // the previous one's windows across: a clinical window must not ride into the
  // practice-manager view on the back of a layout choice.
  const clinical = presetLayout("pmhnp", "dense");
  assert.ok(visibleWindows(clinical).some((window) => window.id === "medwork"));

  const switched = layoutForPersona("manager", "calm");
  const offered = new Set(visibleWindows(switched).map((window) => window.id));
  for (const clinicalWindow of ["prep", "followups", "medwork"] as PreviewWindowId[]) {
    assert.ok(!offered.has(clinicalWindow), `${clinicalWindow} must not follow a layout switch into the manager view`);
    assert.ok(
      !previewWindow(clinicalWindow).availableTo.includes("manager"),
      `${clinicalWindow} is not offered to the manager persona`,
    );
  }

  // The Add-window menu is shaped the same way.
  assert.ok(
    addableWindows(switched, "manager").every((window) => window.availableTo.includes("manager")),
  );
});

test("a hidden window is recoverable, and comes back expanded", () => {
  const layout = presetLayout("pmhnp", "calm");
  const folded = toggleCollapse(layout, "prep");
  assert.equal(folded.windows.find((window) => window.id === "prep")?.collapsed, true);

  const hiddenLayout = setWindowVisible(folded, "prep", false);
  assert.ok(
    hiddenWindows(hiddenLayout).some((window) => window.id === "prep"),
    "hiding drops the window into the restore bar rather than deleting it",
  );

  const restored = setWindowVisible(hiddenLayout, "prep", true);
  const prep = restored.windows.find((window) => window.id === "prep");
  assert.equal(prep?.visible, true);
  assert.equal(prep?.collapsed, false, "a window restored while folded would come back as an empty strip");
});

test("moving a window walks the visible order, so a keyboard press always does something", () => {
  const layout = presetLayout("pmhnp", "calm");
  // medwork and messages are present but hidden, and sit between the visible ones
  // in the raw array. Moving against the raw array would swallow a press.
  const before = visibleWindows(layout).map((window) => window.id);
  assert.deepEqual(before, ["schedule", "prep", "followups"]);

  const moved = moveWindow(layout, "followups", "up");
  assert.deepEqual(visibleWindows(moved).map((window) => window.id), ["schedule", "followups", "prep"]);

  assert.equal(canMove(layout, "schedule", "up"), false, "the first window cannot move up");
  assert.equal(canMove(layout, "followups", "down"), false, "the last window cannot move down");
  assert.deepEqual(
    visibleWindows(moveWindow(layout, "schedule", "up")).map((window) => window.id),
    before,
    "a refused move changes nothing rather than throwing",
  );

  // A hidden window is not in the visible order at all.
  assert.equal(canMove(layout, "medwork", "up"), false);
});

test("resizing is a two-position snap, reachable from the keyboard", () => {
  const layout = presetLayout("pmhnp", "calm");
  const widened = cycleSpan(layout, "prep");
  assert.equal(widened.windows.find((window) => window.id === "prep")?.span, "full");
  const restored = cycleSpan(widened, "prep");
  assert.equal(restored.windows.find((window) => window.id === "prep")?.span, "half");
});

test("an edited arrangement stops claiming to be the preset it came from", () => {
  const layout = presetLayout("pmhnp", "calm");
  assert.equal(matchesPreset(layout, "pmhnp", "calm"), true);

  const edited = toggleRosterField(layout, "mrn");
  assert.equal(
    matchesPreset(edited, "pmhnp", "calm"),
    false,
    "showing a preset's name over an arrangement that is no longer it is the fabrication DASH-08 rules out",
  );

  // And re-applying the preset is a true return, not an approximation.
  assert.equal(matchesPreset(presetLayout("pmhnp", "calm"), "pmhnp", "calm"), true);
});

test("the calm start is calm and the dense preset is deliberately denser", () => {
  for (const persona of PREVIEW_PERSONAS) {
    const calm = persona.presets.calm.layout;
    const dense = persona.presets.dense.layout;

    assert.ok(
      visibleWindows(calm).length <= 4,
      `${persona.id}'s first run must not open behind a wall of windows`,
    );
    assert.ok(
      visibleWindows(dense).length >= visibleWindows(calm).length,
      `${persona.id}'s dense preset shows at least as much as the calm one`,
    );
    assert.ok(
      dense.rosterFields.length > calm.rosterFields.length,
      `${persona.id}'s dense preset is where the extra row fields are turned on`,
    );
    assert.equal(dense.density, "compact");
    assert.equal(calm.density, "comfortable");
  }
});

test("every window a preset names is a real window, offered to that persona", () => {
  for (const persona of PREVIEW_PERSONAS) {
    for (const preset of [persona.presets.calm, persona.presets.dense]) {
      for (const window of preset.layout.windows) {
        const definition = previewWindow(window.id);
        assert.ok(
          definition.availableTo.includes(persona.id),
          `${persona.id}'s ${preset.label} names ${window.id}, which that persona is not offered`,
        );
      }
      for (const field of preset.layout.rosterFields) {
        assert.ok(
          PREVIEW_ROSTER_FIELDS.some((candidate) => candidate.id === field),
          `${preset.label} names an unknown row field: ${field}`,
        );
      }
    }
  }
});

test("the row action menu is a list of labels, and the model grants nothing", () => {
  for (const persona of PREVIEW_PERSONAS) {
    assert.ok(persona.rowActions.length > 0);
    for (const action of persona.rowActions) {
      assert.equal(typeof action, "string", "an action is a label in the preview, never a callable");
    }
  }

  // The clinical personas are the only ones offered a clinical start.
  assert.ok(previewPersona("pmhnp").rowActions.includes("Start the visit"));
  assert.ok(!previewPersona("manager").rowActions.includes("Start the visit"));
});

/* --- Fixtures -------------------------------------------------------------- */

test("the fixtures cover the cases DB-1 asks the prototype to be inspected against", () => {
  const full = previewDay("full");
  const empty = previewDay("empty");

  assert.ok(full.visits.length >= 8, "a full day is a day a clinician would recognise");
  assert.equal(empty.visits.length, 0, "the empty day is genuinely empty, not a thin day");

  // Two patients sharing a name, who are different people.
  const alvarez = full.visits.filter((visit) => visit.patientName === "Maria Alvarez");
  assert.equal(alvarez.length, 2);
  assert.notEqual(alvarez[0].patientId, alvarez[1].patientId, "duplicate names must be different patients");
  assert.notEqual(alvarez[0].mrn, alvarez[1].mrn);
  assert.notEqual(alvarez[0].dob, alvarez[1].dob);

  // One patient with two visits on the same day, each its own appointment.
  const webb = full.visits.filter((visit) => visit.patientId === "prv-webb");
  assert.equal(webb.length, 2);
  assert.notEqual(webb[0].id, webb[1].id, "two visits for one patient are two appointments");

  assert.ok(full.visits.some((visit) => visit.status === "cancelled"));
  assert.ok(full.visits.some((visit) => visit.status === "no-show"));
  assert.ok(full.visits.some((visit) => visit.telehealth));

  // Pending work belonging to someone who is not on the day.
  const offSchedule = PREVIEW_FOLLOWUP_ITEMS.filter((item) => item.offSchedule);
  assert.ok(offSchedule.length > 0, "unfinished work is not limited to today's list");
  for (const item of offSchedule) {
    assert.ok(
      !full.visits.some((visit) => visit.patientName === item.patientName),
      `${item.patientName} is marked off-schedule but appears on the day`,
    );
  }
});

test("the clinic day is in chronological order", () => {
  for (const day of PREVIEW_DAYS) {
    const minutes = day.visits.map((visit) => visit.startMinutes);
    assert.deepEqual(
      minutes,
      [...minutes].sort((a, b) => a - b),
      `${day.label} must not open with its afternoon`,
    );
  }
});

test("every appointment id is unique", () => {
  for (const day of PREVIEW_DAYS) {
    const ids = day.visits.map((visit) => visit.id);
    assert.equal(new Set(ids).size, ids.length, `${day.label} reuses an appointment id`);
  }
});

/* --- Route isolation ------------------------------------------------------- */

test("the preview routes are recognised, and nothing else is", () => {
  assert.equal(isPreviewRoute("/preview"), true);
  assert.equal(isPreviewRoute("/preview/dashboard"), true);
  assert.equal(isPreviewRoute("/preview/dashboard/anything"), true);

  assert.equal(isPreviewRoute("/"), false, "the live workspace must keep its chrome");
  assert.equal(isPreviewRoute("/previews"), false, "a near-miss path is not a preview");
  assert.equal(isPreviewRoute("/patients/preview"), false);
  assert.equal(isPreviewRoute(null), false);
  assert.equal(isPreviewRoute(undefined), false);
  assert.equal(isPreviewRoute(""), false);
});


/* --- Logan's DB-1 review, 2026-09-13 --------------------------------------- */

/**
 * "I think cancel to be removed from the active schedule but there should be a
 * option to click on cancelled apts with an option to put why canceled or a note
 * of some sort."
 */
test("a cancelled visit leaves the roster but not the day", () => {
  const day = previewDay("full");
  const active = activeVisits(day.visits);
  const cancelled = cancelledVisits(day.visits);

  assert.ok(cancelled.length >= 2, "the fixture needs a cancelled visit with a reason and one without");
  assert.equal(active.length + cancelled.length, day.visits.length, "nothing is lost between the two lists");

  for (const visit of active) {
    assert.notEqual(visit.status, "cancelled", "a cancellation is not the day's work");
  }

  // A no-show is an outcome of a visit that was still on the schedule, so it stays.
  assert.ok(
    active.some((visit) => visit.status === "no-show"),
    "a no-show is not a cancellation and must not be filtered out with them",
  );
});

test("a cancellation reason is recorded or absent, never inferred", () => {
  const cancelled = cancelledVisits(previewDay("full").visits);

  const withReason = cancelled.filter((visit) => visit.cancellation);
  const withoutReason = cancelled.filter((visit) => !visit.cancellation);
  assert.ok(withReason.length > 0 && withoutReason.length > 0,
    "both cases have to be inspectable: a reason on file, and none");

  for (const visit of withReason) {
    const cancellation = visit.cancellation!;
    assert.ok(
      PREVIEW_CANCELLATION_REASONS.includes(cancellation.reason),
      `${visit.id} carries a reason outside the offered vocabulary`,
    );
    assert.ok(cancellation.recordedBy, "a recorded reason has an author");
    assert.ok(cancellation.recordedAt, "and a time");
  }
});

test("the cancellation vocabulary stays operational, never clinical", () => {
  // A dropdown offering clinical explanations invites a clinical claim being
  // recorded by whoever answered the phone. These are facts about a calendar.
  const clinicalWords = ["symptom", "diagnos", "sick", "ill", "unwell", "relapse", "crisis", "side effect"];
  for (const reason of PREVIEW_CANCELLATION_REASONS) {
    for (const word of clinicalWords) {
      assert.ok(
        !reason.toLowerCase().includes(word),
        `"${reason}" reads as a clinical reason; cancellation reasons are scheduling facts`,
      );
    }
  }
  assert.ok(PREVIEW_CANCELLATION_REASONS.some((reason) => reason.toLowerCase().includes("other")),
    "there must be somewhere to put what actually happened");
});

/** "User should be able to save multiple dashboard preferences." */
test("layouts can be saved, applied and deleted, more than two of them", () => {
  const base = presetLayout("pmhnp", "calm");
  let saved: PreviewSavedLayout[] = [];

  const first = saveLayout(saved, { name: "Busy Tuesday", personaId: "pmhnp", layout: base });
  assert.ok(first);
  saved = first.saved;

  const denser = toggleField(base, "mrn");
  const second = saveLayout(saved, { name: "Intake day", personaId: "pmhnp", layout: denser });
  assert.ok(second);
  saved = second.saved;

  assert.equal(savedLayoutsFor(saved, "pmhnp").length, 2, "two is not the limit");
  assert.equal(findSavedLayout(saved, second.id)?.name, "Intake day");

  // A saved layout is its own baseline, so editing it reads as edited rather than
  // silently continuing to claim the name.
  const ref = { kind: "saved" as const, id: second.id };
  assert.equal(matchesLayoutRef(denser, "pmhnp", ref, saved), true);
  assert.equal(matchesLayoutRef(toggleField(denser, "room"), "pmhnp", ref, saved), false);

  saved = deleteSavedLayout(saved, first.id);
  assert.equal(savedLayoutsFor(saved, "pmhnp").length, 1);
  assert.equal(findSavedLayout(saved, first.id), undefined);
});

test("a saved layout belongs to the persona that saved it", () => {
  let saved: PreviewSavedLayout[] = [];
  saved = saveLayout(saved, { name: "Mine", personaId: "pmhnp", layout: presetLayout("pmhnp", "calm") })!.saved;
  saved = saveLayout(saved, { name: "Desk", personaId: "manager", layout: presetLayout("manager", "calm") })!.saved;

  assert.deepEqual(savedLayoutsFor(saved, "pmhnp").map((entry) => entry.name), ["Mine"]);
  assert.deepEqual(savedLayoutsFor(saved, "manager").map((entry) => entry.name), ["Desk"]);
  assert.deepEqual(savedLayoutsFor(saved, "owner"), [],
    "a clinical arrangement offered in another persona's list is the layout-implies-access confusion again");
});

test("saving over a name you already used updates it rather than duplicating", () => {
  const calm = presetLayout("pmhnp", "calm");
  const dense = presetLayout("pmhnp", "dense");
  const first = saveLayout([], { name: "Clinic", personaId: "pmhnp", layout: calm });
  assert.ok(first);

  // Same name, differently cased and padded: that is someone reusing the name.
  const again = saveLayout(first.saved, { name: "  clinic ", personaId: "pmhnp", layout: dense });
  assert.ok(again);

  assert.equal(again.saved.length, 1, "two entries both reading Clinic would be worse than one that updated");
  assert.equal(again.id, first.id, "and it stays the same layout, not a new one");
  assert.equal(matchesLayoutRef(dense, "pmhnp", { kind: "saved", id: again.id }, again.saved), true);
});

test("an unnamed layout is not saved", () => {
  assert.equal(saveLayout([], { name: "   ", personaId: "pmhnp", layout: presetLayout("pmhnp", "calm") }), null);
});
