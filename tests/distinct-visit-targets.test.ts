import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  checkAppointmentOverlap,
  CANCELLATION_REASONS,
  type ScheduleItem,
} from "../app/lib/schedule-data";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

test("checkAppointmentOverlap detects collisions accurately for same date and provider", () => {
  const existingAppointments: ScheduleItem[] = [
    {
      id: "apt-1",
      patientId: "pat-1",
      patientName: "Alice Walker",
      dob: "1980-01-01",
      age: 46,
      mrn: "MRN-001",
      date: "2026-09-14",
      time: "09:00",
      duration: "30 min", // 09:00 - 09:30
      type: "30-min Med Check",
      status: "scheduled",
      chiefComplaint: "Med check",
      insurance: "Blue Cross Blue Shield",
      providerId: "dr-smith",
    },
    {
      id: "apt-2",
      patientId: "pat-2",
      patientName: "Bob Jones",
      dob: "1975-05-12",
      age: 51,
      mrn: "MRN-002",
      date: "2026-09-14",
      time: "10:00",
      duration: "45 min", // 10:00 - 10:45
      type: "45-min Therapy + Meds",
      status: "scheduled",
      chiefComplaint: "Follow-up",
      insurance: "Aetna",
      providerId: "dr-smith",
    },
    {
      id: "apt-3",
      patientId: "pat-3",
      patientName: "Charlie Brown",
      dob: "1990-11-20",
      age: 35,
      mrn: "MRN-003",
      date: "2026-09-14",
      time: "09:15",
      duration: "30 min",
      type: "Psychotherapy + Meds",
      status: "scheduled",
      chiefComplaint: "Anxiety",
      insurance: "Medicare",
      providerId: "dr-taylor", // Different provider
    },
    {
      id: "apt-4",
      patientId: "pat-4",
      patientName: "David Miller",
      dob: "1985-03-08",
      age: 41,
      mrn: "MRN-004",
      date: "2026-09-14",
      time: "11:00",
      duration: "30 min",
      type: "60-min Intake",
      status: "cancelled", // Cancelled appointment
      chiefComplaint: "Intake",
      insurance: "United Healthcare",
      providerId: "dr-smith",
    },
  ];

  // 1. Exact collision with dr-smith
  const overlap1 = checkAppointmentOverlap(existingAppointments, {
    date: "2026-09-14",
    time: "09:15",
    duration: "30 min",
    providerId: "dr-smith",
  });
  assert.ok(overlap1);
  assert.equal(overlap1.appointment.id, "apt-1");
  assert.equal(overlap1.conflictType, "provider");

  // 2. Adjacent appointment: ends right when next begins (08:30 - 09:00), should NOT overlap
  const adjacentBefore = checkAppointmentOverlap(existingAppointments, {
    date: "2026-09-14",
    time: "08:30",
    duration: "30 min",
    providerId: "dr-smith",
  });
  assert.equal(adjacentBefore, null);

  // 3. Adjacent appointment: starts right when previous ends (09:30 - 10:00), should NOT overlap
  const adjacentBetween = checkAppointmentOverlap(existingAppointments, {
    date: "2026-09-14",
    time: "09:30",
    duration: "30 min",
    providerId: "dr-smith",
  });
  assert.equal(adjacentBetween, null);

  // 4. Same time but different provider (dr-taylor): collision only with dr-taylor slot
  const diffProvider = checkAppointmentOverlap(existingAppointments, {
    date: "2026-09-14",
    time: "09:00",
    duration: "30 min",
    providerId: "dr-taylor",
  });
  // 09:00 - 09:30 overlaps with dr-taylor's apt-3 (09:15 - 09:45), but NOT dr-smith's apt-1
  assert.ok(diffProvider);
  assert.equal(diffProvider.appointment.id, "apt-3");
  assert.equal(diffProvider.conflictType, "provider");

  // 5. Exclude self when editing existing appointment apt-1
  const selfEdit = checkAppointmentOverlap(existingAppointments, {
    date: "2026-09-14",
    time: "09:00",
    duration: "45 min",
    providerId: "dr-smith",
    excludeAppointmentId: "apt-1",
  });
  assert.equal(selfEdit, null);

  // 6. Slot over cancelled appointment: cancelled appointment is ignored
  const overCancelled = checkAppointmentOverlap(existingAppointments, {
    date: "2026-09-14",
    time: "11:00",
    duration: "30 min",
    providerId: "dr-smith",
  });
  assert.equal(overCancelled, null);
});

test("CANCELLATION_REASONS provides standardized non-clinical operational categories", () => {
  assert.ok(CANCELLATION_REASONS.length >= 6);
  assert.ok(CANCELLATION_REASONS.includes("Patient rescheduled"));
  assert.ok(CANCELLATION_REASONS.includes("Patient cancelled"));
  assert.ok(CANCELLATION_REASONS.includes("Practice cancelled"));
  assert.ok(CANCELLATION_REASONS.includes("Coverage or authorization problem"));
  assert.ok(CANCELLATION_REASONS.includes("Clinic closure"));
  assert.ok(CANCELLATION_REASONS.includes("Other — see note"));
});

test("appointment update and operational cancellation persist and generate HIPAA audit logs", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-appointment-ops-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { ClinicalActionGateway },
      { AppointmentRepository },
      { AuditRepository },
    ] = await Promise.all([
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/appointment-repository"),
      import("../app/server/repositories/audit-repository"),
    ]);

    await grantSyntheticOrganizationAccess(["apt-ops-staff", "apt-ops-provider"]);
    const actor = {
      userId: "apt-ops-staff",
      displayName: "Front Desk Coordinator",
      credentials: "MA",
      role: "staff" as const,
    };
    const context = { source: "api" as const, requestId: "apt-ops-req" };

    // 1. Create a patient first
    const patientResult = await ClinicalActionGateway.execute({
      actor: {
        userId: "apt-ops-provider",
        displayName: "Dr. Clinician",
        role: "provider",
      },
      context,
      action: {
        type: "create_patient",
        payload: {
          id: "pat-distinct-1",
          mrn: "MRN-DIST-01",
          name: "Jordan Hayes",
          initials: "JH",
          dob: "04/12/1991",
          age: 35,
          pronouns: "they/them",
          status: "Established",
          allergies: [],
          diagnoses: [],
          meds: [],
          vitals: {},
          lastVisit: "Initial",
          nextVisit: "Unscheduled",
        },
      },
    });
    assert.equal(patientResult.id, "pat-distinct-1");

    // 2. Schedule an appointment
    const createdApt = AppointmentRepository.create({
      id: "apt-test-1",
      patientId: "pat-distinct-1",
      patientName: "Jordan Hayes",
      dob: "1991-04-12",
      age: 35,
      mrn: "MRN-DIST-01",
      date: "2026-09-14",
      time: "14:00",
      duration: "30 min",
      type: "30-min Med Check",
      status: "scheduled",
      chiefComplaint: "Psychiatric consultation",
      insurance: "Aetna Choice POS II",
      modality: "in-person",
      room: "Exam Room 2",
      providerId: "apt-ops-provider",
      providerName: "Dr. Clinician",
    });
    assert.equal(createdApt.id, "apt-test-1");
    assert.equal(createdApt.room, "Exam Room 2");

    // 3. Update appointment (reschedule time, change room, assign staff) via ClinicalActionGateway
    const updateResult = await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: "pat-distinct-1",
      action: {
        type: "update_appointment",
        payload: {
          appointmentId: "apt-test-1",
          updates: {
            time: "15:00",
            duration: "45 min",
            room: "Telehealth Room A",
            modality: "video",
            assignedStaffId: "apt-ops-staff",
            assignedStaffName: "Front Desk Coordinator",
          },
        },
      },
    });
    assert.equal(updateResult.id, "apt-test-1");

    const fetchedAfterUpdate = AppointmentRepository.getById("apt-test-1");
    assert.ok(fetchedAfterUpdate);
    assert.equal(fetchedAfterUpdate.time, "15:00");
    assert.equal(fetchedAfterUpdate.duration, "45 min");
    assert.equal(fetchedAfterUpdate.room, "Telehealth Room A");
    assert.equal(fetchedAfterUpdate.modality, "video");
    assert.equal(fetchedAfterUpdate.assignedStaffName, "Front Desk Coordinator");

    // 4. Cancel appointment with operational cancellation reason and note
    const cancelResult = await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: "pat-distinct-1",
      action: {
        type: "cancel_appointment",
        payload: {
          appointmentId: "apt-test-1",
          cancellationReason: "Patient rescheduled",
          cancellationNote: "Patient requested morning slot next week due to work conflict.",
        },
      },
    });
    assert.equal(cancelResult.id, "apt-test-1");
    assert.equal(cancelResult.status, "cancelled");

    const fetchedAfterCancel = AppointmentRepository.getById("apt-test-1");
    assert.ok(fetchedAfterCancel);
    assert.equal(fetchedAfterCancel.status, "cancelled");
    assert.equal(fetchedAfterCancel.cancellationReason, "Patient rescheduled");
    assert.equal(
      fetchedAfterCancel.cancellationNote,
      "Patient requested morning slot next week due to work conflict.",
    );
    assert.equal(fetchedAfterCancel.cancelledBy, "Front Desk Coordinator");
    assert.ok(fetchedAfterCancel.cancelledAt);

    // 5. Verify audit log entry was generated for cancellation
    const auditLogs = AuditRepository.getRecent(100, "pat-distinct-1");
    const cancelAudit = auditLogs.find((entry) => entry.eventType === "appointment_cancelled");
    assert.ok(cancelAudit, "Expected appointment_cancelled audit log entry");
    assert.equal(cancelAudit.userId, "apt-ops-staff");
    assert.ok(cancelAudit.description.includes("Patient rescheduled"));
  } finally {
    process.chdir(originalCwd);
  }
});
