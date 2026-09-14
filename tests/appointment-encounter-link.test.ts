import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

/**
 * Which visit a note belongs to.
 *
 * The dashboard used to close appointments by matching the signed encounter's
 * patient, so a patient with two visits on one day had both marked completed when
 * the first note was signed — and so did next week's follow-up and a cancelled
 * slot. A visit is a specific appointment, and only the record can say which.
 *
 * The link is set once, by the workflow that started the visit, and validated
 * server-side: an appointment that does not exist, or that belongs to somebody
 * else, is refused rather than stored. An encounter with no recorded appointment
 * stays that way — absence is the honest answer, and it closes nothing.
 */
test("an encounter records the appointment it was started from, and only that one", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-appointment-link-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { ClinicalActionGateway },
      { AppointmentRepository },
      { EncounterRepository },
      { PracticeQueueRepository },
    ] = await Promise.all([
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/appointment-repository"),
      import("../app/server/repositories/encounter-repository"),
      import("../app/server/repositories/practice-queue-repository"),
    ]);

    await grantSyntheticOrganizationAccess(["link-provider"]);
    const actor = {
      userId: "link-provider",
      displayName: "Link Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const context = { source: "api" as const, requestId: "appointment-encounter-link" };

    const makePatient = (id: string, mrn: string, name: string) =>
      ClinicalActionGateway.execute({
        actor,
        context,
        action: {
          type: "create_patient",
          payload: {
            id, name, mrn,
            initials: name.split(" ").map((part) => part[0]).join("").slice(0, 2),
            dob: "01/01/1990", age: 36, pronouns: "they/them", status: "Established",
            allergies: [], diagnoses: [], meds: [], vitals: {},
            lastVisit: "Initial", nextVisit: "Unscheduled",
          },
        },
      });

    await makePatient("link-patient", "LINK-001", "Link Patient");
    await makePatient("other-patient", "LINK-002", "Other Patient");

    // The case the old matching got wrong: one patient, two visits on one day.
    const morning = await ClinicalActionGateway.execute({
      actor, context, expectedPatientId: "link-patient",
      action: {
        type: "create_appointment",
        payload: {
          id: "apt-morning", patientId: "link-patient", date: "2026-09-04", time: "09:00 AM",
          status: "waiting", chiefComplaint: "Morning visit",
        },
      },
    }) as { id: string };
    const afternoon = await ClinicalActionGateway.execute({
      actor, context, expectedPatientId: "link-patient",
      action: {
        type: "create_appointment",
        payload: {
          id: "apt-afternoon", patientId: "link-patient", date: "2026-09-04", time: "03:30 PM",
          status: "scheduled", chiefComplaint: "Afternoon visit",
        },
      },
    }) as { id: string };

    const draft = await ClinicalActionGateway.execute({
      actor, context, expectedPatientId: "link-patient",
      action: {
        type: "save_encounter_draft",
        payload: {
          id: "enc-morning",
          patientId: "link-patient",
          appointmentId: morning.id,
          chiefComplaint: "Morning visit",
        },
      },
    }) as { id: string; appointmentId?: string };

    assert.equal(draft.appointmentId, "apt-morning", "the visit that was started is recorded");

    // A later autosave that carries no appointment must not clear the link.
    const resaved = await ClinicalActionGateway.execute({
      actor, context, expectedPatientId: "link-patient",
      action: {
        type: "save_encounter_draft",
        payload: { id: "enc-morning", patientId: "link-patient", assessment: "Stable." },
      },
    }) as { appointmentId?: string };
    assert.equal(resaved.appointmentId, "apt-morning", "an autosave does not unlink the visit");

    // ...and cannot silently move the note to the other visit either.
    const moved = await ClinicalActionGateway.execute({
      actor, context, expectedPatientId: "link-patient",
      action: {
        type: "save_encounter_draft",
        payload: {
          id: "enc-morning", patientId: "link-patient", appointmentId: afternoon.id,
        },
      },
    }) as { appointmentId?: string };
    assert.equal(moved.appointmentId, "apt-morning", "the recorded visit is not re-pointed by a save");

    // The afternoon visit is untouched by the morning note, which is the whole point.
    assert.equal(AppointmentRepository.getById("apt-afternoon")?.status, "scheduled");

    await ClinicalActionGateway.execute({
      actor, context, expectedPatientId: "link-patient",
      action: { type: "sign_encounter", payload: { encounterId: "enc-morning" } },
    });

    const signed = EncounterRepository.getById("enc-morning");
    assert.equal(signed?.status, "signed");
    assert.equal(signed?.appointmentId, "apt-morning", "the signed record still names its visit");
    assert.equal(
      AppointmentRepository.getById("apt-afternoon")?.status,
      "scheduled",
      "signing the morning note leaves the afternoon visit exactly where it was",
    );

    // An encounter opened outside the schedule genuinely has no appointment.
    const unlinked = await ClinicalActionGateway.execute({
      actor, context, expectedPatientId: "other-patient",
      action: {
        type: "save_encounter_draft",
        payload: { id: "enc-unlinked", patientId: "other-patient", chiefComplaint: "Walk-in" },
      },
    }) as { appointmentId?: string };
    assert.equal(unlinked.appointmentId, undefined, "absence stays visible rather than being guessed");

    // Someone else's appointment is refused, not stored.
    await assert.rejects(
      () => ClinicalActionGateway.execute({
        actor, context, expectedPatientId: "other-patient",
        action: {
          type: "save_encounter_draft",
          payload: {
            id: "enc-crossed", patientId: "other-patient", appointmentId: "apt-afternoon",
          },
        },
      }),
      /Patient binding mismatch/,
      "an encounter cannot claim a visit that belongs to a different patient",
    );

    await assert.rejects(
      () => ClinicalActionGateway.execute({
        actor, context, expectedPatientId: "other-patient",
        action: {
          type: "save_encounter_draft",
          payload: {
            id: "enc-missing", patientId: "other-patient", appointmentId: "apt-does-not-exist",
          },
        },
      }),
      /Appointment not found/,
      "an appointment that does not exist cannot be asserted into the record",
    );

    // Unfinished work is discoverable across the whole population, not just today.
    const unsigned = PracticeQueueRepository.unsignedEncounters(50, ["link-patient", "other-patient"]);
    const unsignedIds = unsigned.map((row) => row.encounterId);
    assert.ok(unsignedIds.includes("enc-unlinked"), "a draft for an unscheduled patient stays reachable");
    assert.ok(!unsignedIds.includes("enc-morning"), "a signed note is no longer outstanding work");

    // And the queue is scoped: an out-of-reach patient contributes nothing.
    const scopedOut = PracticeQueueRepository.unsignedEncounters(50, ["link-patient"]);
    assert.ok(
      scopedOut.every((row) => row.patientId === "link-patient"),
      "the unsigned queue is narrowed to the caller's population before it is returned",
    );
  } finally {
    process.chdir(originalCwd);
  }
});

test("a day's appointments come back in the order the clinic happens", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-appointment-order-"));
  process.chdir(isolatedRoot);

  try {
    const [{ AppointmentRepository }, { timeStringToMinutes }] = await Promise.all([
      import("../app/server/repositories/appointment-repository"),
      import("../app/lib/schedule-data"),
    ]);

    // Inserted out of order, and deliberately spanning noon and midnight: stored
    // clock text sorted alphabetically, so "01:15 PM" came before "09:00 AM" and a
    // roster opened with its afternoon.
    const base = {
      date: "2026-09-04", patientId: "order-patient", patientName: "Order Patient",
      dob: "01/01/1990", age: 36, mrn: "ORD-001", duration: "30 min",
      type: "30-min Med Check" as const, status: "scheduled" as const,
      chiefComplaint: "Visit", insurance: "Self-Pay",
    };
    for (const [id, time] of [
      ["apt-d", "04:30 PM"],
      ["apt-b", "09:00 AM"],
      ["apt-e", "12:15 PM"],
      ["apt-a", "12:15 AM"],
      ["apt-c", "10:30 AM"],
    ] as const) {
      AppointmentRepository.create({ ...base, id, time });
    }

    // Filtered to this test's own rows: the seeded practice has its own day on the
    // same date, and it is already interleaved correctly by the same comparator.
    const mine = new Set(["apt-a", "apt-b", "apt-c", "apt-d", "apt-e"]);
    const ordered = AppointmentRepository.list({ date: "2026-09-04" })
      .map((row) => row.id)
      .filter((id) => mine.has(id));
    assert.deepEqual(ordered, ["apt-a", "apt-b", "apt-c", "apt-e", "apt-d"]);

    const wholeDay = AppointmentRepository.list({ date: "2026-09-04" });
    const minutes = wholeDay.map((row) => timeStringToMinutes(row.time));
    assert.deepEqual(
      minutes,
      [...minutes].sort((a, b) => a - b),
      "every row on the day is in clock order, seeded rows included",
    );

    // A day with nothing booked is an empty list, not an error and not another day.
    assert.deepEqual(AppointmentRepository.list({ date: "2027-01-19" }), []);
  } finally {
    process.chdir(originalCwd);
  }
});
