import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";
import { EMPTY_NOTE_SIGNING_REFUSAL, noteSigningBlocker } from "../app/domain/note-signing";
import { noteTypeForAppointment } from "../app/domain/note-types";
import { calculateFollowUpDate, nextBookedVisit, type ScheduleItem } from "../app/lib/schedule-data";
import { toCalendarDate } from "../app/lib/clinical-date";
import { displayablePatientAlert } from "../app/lib/clinical-protocols";
import { executeClinicalQuery } from "../app/domain/clinical-query";
import { RuleBasedOmniboxPlanningModel } from "../app/server/ai/omnibox-model-gateway";
import { patients as syntheticPatients } from "../app/domain/patient";

/**
 * The note-closing path a clinician walks at the end of every visit, held to what
 * the record actually says: an empty note cannot be signed, the follow-up dates
 * are real dates, an intake opens an intake note, and nothing on the way invents
 * a clinical statement.
 */

test("a note with no assessment or plan cannot be signed; either one is enough", () => {
  assert.equal(noteSigningBlocker({ assessment: "", plan: "" }), EMPTY_NOTE_SIGNING_REFUSAL);
  assert.equal(noteSigningBlocker({ assessment: "   ", plan: null }), EMPTY_NOTE_SIGNING_REFUSAL);
  assert.equal(noteSigningBlocker({ assessment: "Stable.", plan: "" }), null);
  assert.equal(noteSigningBlocker({ assessment: "", plan: "Return in 4 weeks." }), null);
});

test("the server refuses to sign an empty note, and signs it once it documents a plan", async () => {
  const originalCwd = process.cwd();
  process.chdir(mkdtempSync(join(tmpdir(), "ehr-empty-note-sign-")));
  try {
    const [{ ClinicalActionGateway }, { EncounterRepository }] = await Promise.all([
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/encounter-repository"),
    ]);
    await grantSyntheticOrganizationAccess(["empty-note-provider"]);
    const actor = { userId: "empty-note-provider", displayName: "Test Provider", credentials: "PMHNP-BC", role: "provider" as const };
    const context = { source: "api" as const };
    const patientId = "empty-note-patient";
    const encounterId = "empty-note-encounter";

    await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "create_patient",
        payload: {
          id: patientId, name: "Empty Note Test", initials: "EN", dob: "01/01/1990", age: 36,
          pronouns: "they/them", mrn: "TEST-EMPTY-001", status: "Established", allergies: [],
          diagnoses: [], meds: [], vitals: {}, lastVisit: "Initial", nextVisit: "Unscheduled",
        },
      },
    });
    const draft = { id: encounterId, patientId, date: "Sep 29, 2026", type: "Psychiatric Follow-Up", chiefComplaint: "", intervalHistory: "", assessment: "", plan: "" };
    await ClinicalActionGateway.execute({ actor, context, expectedPatientId: patientId, action: { type: "save_encounter_draft", payload: draft } });

    await assert.rejects(
      ClinicalActionGateway.execute({ actor, context, expectedPatientId: patientId, action: { type: "sign_encounter", payload: { encounterId } } }),
      (error: unknown) => error instanceof Error && error.message === EMPTY_NOTE_SIGNING_REFUSAL,
    );
    assert.equal(EncounterRepository.getById(encounterId)?.status, "draft", "a refused signature leaves the note a draft");

    await ClinicalActionGateway.execute({
      actor, context, expectedPatientId: patientId,
      action: { type: "save_encounter_draft", payload: { ...draft, plan: "Continue current medications." } },
    });
    const signed = await ClinicalActionGateway.execute({
      actor, context, expectedPatientId: patientId, action: { type: "sign_encounter", payload: { encounterId } },
    });
    assert.equal((signed as { status: string }).status, "signed");
  } finally {
    process.chdir(originalCwd);
  }
});

test("follow-up intervals are computed from the note's display date, not NaN", () => {
  const base = toCalendarDate("Sep 29, 2026");
  assert.equal(base, "2026-09-29");
  assert.equal(calculateFollowUpDate(base!, "2 weeks"), "2026-10-13");
  assert.equal(calculateFollowUpDate(base!, "3 months"), "2026-12-29");
});

test("the next booked visit comes from the schedule, skipping the visit being closed and finished ones", () => {
  const row = (overrides: Partial<ScheduleItem>): ScheduleItem =>
    ({ id: "x", date: "2026-09-29", patientId: "p1", patientName: "P", dob: "", age: 30, mrn: "", time: "09:00 AM",
      duration: "30 min", type: "30-min Med Check", status: "scheduled", chiefComplaint: "", insurance: "", ...overrides }) as ScheduleItem;
  const appointments = [
    row({ id: "today-open", status: "in-visit" }),
    row({ id: "past", date: "2026-09-04" }),
    row({ id: "cancelled", date: "2026-10-01", status: "cancelled" }),
    row({ id: "other-patient", date: "2026-10-02", patientId: "p2" }),
    row({ id: "later", date: "2026-10-20", time: "10:00 AM" }),
    row({ id: "sooner", date: "2026-10-13", time: "11:00 AM" }),
  ];
  assert.equal(nextBookedVisit(appointments, "p1", { today: "2026-09-29", excludeAppointmentId: "today-open" })?.id, "sooner");
  assert.equal(nextBookedVisit([row({ id: "past", date: "2026-09-04" })], "p1", { today: "2026-09-29" }), null);
});

test("a booked intake opens the intake note; a med check keeps the clinician's default", () => {
  assert.equal(noteTypeForAppointment("60-min Intake")?.id, "intake");
  assert.equal(noteTypeForAppointment("45-min Therapy + Meds")?.id, "psychotherapy");
  assert.equal(noteTypeForAppointment("30-min Med Check"), null);
  assert.equal(noteTypeForAppointment(undefined), null);
});

test("fixture-only monitoring alerts are hidden everywhere through one rule", () => {
  assert.equal(displayablePatientAlert("Overdue PHQ-9 & blood pressure monitoring"), null);
  assert.equal(displayablePatientAlert("Allergy reported by pharmacy"), "Allergy reported by pharmacy");
  assert.equal(displayablePatientAlert(undefined), null);
});

test("the omnibox lab shortcut states no lab facts it cannot know", () => {
  const jordan = syntheticPatients.find((patient) => patient.id === "jordan-reed")!;
  const answer = executeClinicalQuery("show Jordan's lithium level", jordan, undefined, [jordan]);
  assert.equal(answer?.type, "lab-status");
  assert.equal(answer?.actionSection, "Labs");
  assert.doesNotMatch(answer!.body, /lipid|OVERDUE|last completed/i, "no fixture lab facts in a browser-side shortcut");
  assert.equal(answer?.labOrderName, undefined);
});

test("the rule planner reads a possessive question as a question, not a chart named after it", async () => {
  const planner = new RuleBasedOmniboxPlanningModel();
  const question = await planner.plan({ query: "show Jordan's lithium level" } as never);
  assert.equal(question.intent.kind, "clinical_question");
  const navigation = await planner.plan({ query: "open Maya Chen's labs" } as never);
  assert.equal(navigation.intent.kind, "navigate_patient");
  assert.equal((navigation.intent as { patientRef?: string }).patientRef, "Maya Chen");
});
