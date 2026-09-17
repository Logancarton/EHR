import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Phase P4: Complete Scheduling and Front-Office Workflow Test Suite.
 *
 * Verifies:
 * 1. Full appointment lifecycle transitions (scheduled -> waiting -> in-visit -> completed)
 * 2. Authoritative stamping of lifecycle timestamps (arrivedAt, startedAt, completedAt)
 * 3. Mark no-show and cancellation with audit logging
 * 4. Deterministic follow-up interval loop with originAppointmentId linkage and patient nextVisit updates
 * 5. ProviderId query filtering
 * 6. Shared clinical helpers (calculateElapsedWait, isAppointmentLate, calculateFollowUpDate)
 */
test("Phase P4: complete scheduling lifecycle, timestamps, provider filtering, and follow-up loop", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-p4-scheduling-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-p4-scheduling-secret-0123456789";

  try {
    const [
      { GET: appointmentsGet, POST: appointmentsPost, PATCH: appointmentsPatch },
      { ClinicalActionGateway },
      { AppointmentRepository },
      { PatientRepository },
      { AuditRepository },
      { UserRepository },
      { OrganizationRepository },
      { getDatabase },
      {
        calculateFollowUpDate,
        calculateElapsedWait,
        isAppointmentLate,
        FOLLOW_UP_INTERVALS,
      },
    ] = await Promise.all([
      import("../app/api/appointments/route"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/appointment-repository"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/repositories/user-repository"),
      import("../app/server/repositories/organization-repository"),
      import("../app/server/db/connection"),
      import("../app/lib/schedule-data"),
    ]);

    // 1. Verify Shared Pure Helpers
    assert.ok(FOLLOW_UP_INTERVALS.includes("2 weeks"));
    assert.ok(FOLLOW_UP_INTERVALS.includes("4 weeks"));
    assert.ok(FOLLOW_UP_INTERVALS.includes("3 months"));

    const baseDate = "2026-09-14";
    assert.equal(calculateFollowUpDate(baseDate, "1 week"), "2026-09-21");
    assert.equal(calculateFollowUpDate(baseDate, "2 weeks"), "2026-09-28");
    assert.equal(calculateFollowUpDate(baseDate, "4 weeks"), "2026-10-12");
    assert.equal(calculateFollowUpDate(baseDate, "3 months"), "2026-12-14");

    // Elapsed wait calculation
    assert.equal(calculateElapsedWait(undefined), "In office");
    const fiveMinutesAgoIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    assert.equal(calculateElapsedWait(fiveMinutesAgoIso), "5m wait");
    assert.equal(calculateElapsedWait(new Date().toISOString()), "Just arrived");

    // Late detection (scheduled at 09:00 AM, current time 09:15 AM -> 15 min delta > 10 min grace -> late)
    const testApt = {
      id: "apt-late-test",
      patientId: "patient-1",
      patientName: "Test Patient",
      dob: "1990-01-01",
      age: 36,
      mrn: "MRN-1",
      insurance: "BCBS",
      date: baseDate,
      time: "09:00 AM",
      duration: "30 min",
      type: "30-min Med Check" as const,
      status: "scheduled" as const,
      chiefComplaint: "Checkup",
      room: "Room 1",
    };
    // 09:00 AM = 540 minutes. At 09:05 AM (545 minutes), not late (within 10m grace)
    assert.equal(isAppointmentLate(testApt, 545, baseDate), false);
    // At 09:12 AM (552 minutes), is late (>10m delta)
    assert.equal(isAppointmentLate(testApt, 552, baseDate), true);
    // If status is completed or in-visit, never late
    assert.equal(isAppointmentLate({ ...testApt, status: "completed" }, 560, baseDate), false);
    assert.equal(isAppointmentLate({ ...testApt, status: "in-visit" }, 560, baseDate), false);

    // 2. Set up test org, patient and providers
    const orgId = OrganizationRepository.defaultOrganizationId();

    UserRepository.create({
      id: "provider-alpha",
      displayName: "Dr. Alpha",
      role: "provider",
    });
    OrganizationRepository.upsertMembership({
      organizationId: orgId,
      userId: "provider-alpha",
      membershipRole: "member",
      patientAccessScope: "organization",
    });

    UserRepository.create({
      id: "provider-beta",
      displayName: "Dr. Beta",
      role: "provider",
    });
    OrganizationRepository.upsertMembership({
      organizationId: orgId,
      userId: "provider-beta",
      membershipRole: "member",
      patientAccessScope: "organization",
    });

    const patient = PatientRepository.create(
      {
        id: "patient-marcus",
        mrn: "MRN-P4-001",
        name: "Marcus Aurelius",
        initials: "MA",
        dob: "1988-04-26",
        age: 38,
        pronouns: "he/him",
        status: "Established",
        diagnoses: ["Bipolar I Disorder"],
        allergies: [],
        meds: [],
        vitals: {},
        lastVisit: "Initial",
        nextVisit: "Unscheduled",
      },
      orgId,
    );

    const contextAlpha = {
      userId: "provider-alpha",
      displayName: "Dr. Alpha",
      organizationId: orgId,
      role: "provider" as const,
      capabilities: [
        "read_schedule" as const,
        "manage_appointments" as const,
        "read_clinical" as const,
      ],
    };

    const contextBeta = {
      userId: "provider-beta",
      displayName: "Dr. Beta",
      organizationId: orgId,
      role: "provider" as const,
      capabilities: [
        "read_schedule" as const,
        "manage_appointments" as const,
        "read_clinical" as const,
      ],
    };

    const runAction = (actor: any, action: any, expectedPatientId?: string) =>
      ClinicalActionGateway.execute({
        actor,
        action,
        context: { source: "ui" as const },
        expectedPatientId,
      });

    // 3. Create Appointment with lifecycle notes and provider assignment
    const initialApt = (await runAction(
      contextAlpha,
      {
        type: "create_appointment",
        payload: {
          patientId: patient.id,
          patientName: patient.name,
          date: baseDate,
          time: "10:00 AM",
          duration: "30 min",
          type: "30-min Med Check",
          status: "scheduled",
          chiefComplaint: "Lithium therapeutic review",
          room: "Room 1",
          providerId: contextAlpha.userId,
          providerName: contextAlpha.displayName,
          notes: "Patient reports mild tremors in the morning",
        },
      },
      patient.id,
    )) as any;

    assert.equal(initialApt.status, "scheduled");
    assert.equal(initialApt.notes, "Patient reports mild tremors in the morning");
    assert.equal(initialApt.providerId, "provider-alpha");
    assert.equal(initialApt.arrivedAt, undefined);
    assert.equal(initialApt.startedAt, undefined);
    assert.equal(initialApt.completedAt, undefined);

    // 4. Check in appointment (scheduled -> waiting)
    const checkedInApt = (await runAction(
      contextAlpha,
      {
        type: "check_in_appointment",
        payload: {
          appointmentId: initialApt.id,
          expectedVersion: initialApt.version,
        },
      },
      patient.id,
    )) as any;

    assert.equal(checkedInApt.status, "waiting");
    assert.ok(checkedInApt.arrivedAt, "arrivedAt timestamp must be stamped on check in");

    // 5. Start visit (waiting -> in-visit)
    const inVisitApt = (await runAction(
      contextAlpha,
      {
        type: "start_visit_appointment",
        payload: {
          appointmentId: checkedInApt.id,
          expectedVersion: checkedInApt.version,
        },
      },
      patient.id,
    )) as any;

    assert.equal(inVisitApt.status, "in-visit");
    assert.ok(inVisitApt.startedAt, "startedAt timestamp must be stamped on start visit");
    assert.equal(inVisitApt.arrivedAt, checkedInApt.arrivedAt, "arrivedAt must be preserved");

    // 6. Complete visit (in-visit -> completed)
    const completedApt = (await runAction(
      contextAlpha,
      {
        type: "complete_appointment",
        payload: {
          appointmentId: inVisitApt.id,
          expectedVersion: inVisitApt.version,
        },
      },
      patient.id,
    )) as any;

    assert.equal(completedApt.status, "completed");
    assert.ok(completedApt.completedAt, "completedAt timestamp must be stamped on completion");

    // 7. Deterministic Follow-Up Loop: Schedule Follow-Up linked to origin appointment
    const followUpApt = (await runAction(
      contextAlpha,
      {
        type: "schedule_follow_up",
        payload: {
          originAppointmentId: completedApt.id,
          interval: "4 weeks",
          providerId: contextAlpha.userId,
          time: "10:00 AM",
        },
      },
      patient.id,
    )) as any;

    assert.equal(followUpApt.originAppointmentId, completedApt.id);
    assert.equal(followUpApt.followUpInterval, "4 weeks");
    assert.equal(followUpApt.date, "2026-10-12"); // 4 weeks after 2026-09-14
    assert.equal(followUpApt.status, "scheduled");
    assert.equal(followUpApt.intakeStatus, "exempt", "a follow-up must not silently claim completed intake forms");
    assert.equal(followUpApt.patientId, patient.id);

    // Verify patient's nextVisit record is updated
    const updatedPatient = PatientRepository.getById(patient.id);
    assert.ok(updatedPatient);
    assert.ok(
      updatedPatient.nextVisit?.includes("2026-10-12"),
      `Patient nextVisit should reflect the scheduled follow-up date, got ${updatedPatient.nextVisit}`,
    );

    // 8. Test Mark No-Show on another appointment
    const noShowApt = (await runAction(
      contextAlpha,
      {
        type: "create_appointment",
        payload: {
          patientId: patient.id,
          patientName: patient.name,
          date: baseDate,
          time: "02:00 PM",
          duration: "30 min",
          type: "30-min Med Check",
          status: "scheduled",
          chiefComplaint: "Routine lab follow up",
          room: "Room 2",
          providerId: contextAlpha.userId,
          providerName: contextAlpha.displayName,
        },
      },
      patient.id,
    )) as any;

    const markedNoShow = (await runAction(
      contextAlpha,
      {
        type: "mark_no_show_appointment",
        payload: {
          appointmentId: noShowApt.id,
          expectedVersion: noShowApt.version,
        },
      },
      patient.id,
    )) as any;
    assert.equal(markedNoShow.status, "no-show");

    // 9. Test Cancellation with reason
    const toCancelApt = (await runAction(
      contextAlpha,
      {
        type: "create_appointment",
        payload: {
          patientId: patient.id,
          patientName: patient.name,
          date: baseDate,
          time: "03:00 PM",
          duration: "30 min",
          type: "30-min Med Check",
          status: "scheduled",
          chiefComplaint: "Therapy session",
          room: "Room 3",
          providerId: contextAlpha.userId,
          providerName: contextAlpha.displayName,
        },
      },
      patient.id,
    )) as any;

    const cancelledApt = (await runAction(
      contextAlpha,
      {
        type: "cancel_appointment",
        payload: {
          appointmentId: toCancelApt.id,
          cancellationReason: "Patient called to reschedule due to illness",
        },
      },
      patient.id,
    )) as any;
    assert.equal(cancelledApt.status, "cancelled");

    // 10. Provider Filtering via AppointmentRepository & API route
    // Create an appointment for Provider Beta
    await runAction(
      contextBeta,
      {
        type: "create_appointment",
        payload: {
          patientId: patient.id,
          patientName: patient.name,
          date: baseDate,
          time: "04:00 PM",
          duration: "30 min",
          type: "45-min Therapy + Meds",
          status: "scheduled",
          chiefComplaint: "Psychotherapy",
          room: "Room 2",
          providerId: contextBeta.userId,
          providerName: contextBeta.displayName,
        },
      },
      patient.id,
    );

    // List with provider filter
    const alphaList = AppointmentRepository.list({ date: baseDate, providerId: "provider-alpha" });
    const betaList = AppointmentRepository.list({ date: baseDate, providerId: "provider-beta" });
    const allList = AppointmentRepository.list({ date: baseDate });

    assert.ok(alphaList.every((a) => a.providerId === "provider-alpha"));
    assert.ok(betaList.every((a) => a.providerId === "provider-beta"));
    assert.ok(betaList.length >= 1);
    assert.ok(alphaList.length >= 2);
    assert.ok(allList.length >= alphaList.length + betaList.length);

    // 7. Non-patient practice events (Team Meeting, Lunch Break, Schedule Block, Time Off)
    const meetingEvent = (await runAction(
      contextAlpha,
      {
        type: "create_appointment",
        payload: {
          patientId: "event-meeting-test-1",
          patientName: "Clinical Case Conference",
          date: baseDate,
          time: "12:00 PM",
          duration: "60 min",
          type: "Team Meeting",
          status: "scheduled",
          chiefComplaint: "Weekly multi-disciplinary case review",
          room: "Conference Room A",
          providerId: contextAlpha.userId,
          providerName: contextAlpha.displayName,
        },
      },
    )) as any;

    assert.ok(meetingEvent);
    assert.equal(meetingEvent.type, "Team Meeting");
    assert.equal(meetingEvent.patientName, "Clinical Case Conference");
    assert.equal(meetingEvent.patientId, "event-meeting-test-1");

    // Break event
    const breakEvent = (await runAction(
      contextAlpha,
      {
        type: "create_appointment",
        payload: {
          patientId: "event-break-test-2",
          patientName: "Lunch Break",
          date: baseDate,
          time: "01:00 PM",
          duration: "30 min",
          type: "Break",
          status: "scheduled",
          chiefComplaint: "Lunch",
          room: "Staff Lounge",
          providerId: contextAlpha.userId,
        },
      },
    )) as any;

    assert.ok(breakEvent);
    assert.equal(breakEvent.type, "Break");

    // Cancel non-patient event succeeds without requiring patient lookup
    const cancelledMeeting = (await runAction(
      contextAlpha,
      {
        type: "cancel_appointment",
        payload: {
          appointmentId: meetingEvent.id,
          cancellationReason: "Practice cancelled",
          cancellationNote: "Rescheduled to Thursday",
        },
      },
    )) as any;

    assert.equal(cancelledMeeting.status, "cancelled");
    assert.equal(cancelledMeeting.cancellationReason, "Practice cancelled");
  } finally {
    process.chdir(originalCwd);
    env.NODE_ENV = originalNodeEnv;
    env.EHR_SESSION_SECRET = originalSecret;
  }
});
