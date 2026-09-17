import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Clinical Bond Intake — the staff-workflow spine over the queue (D-075).
 *
 * Exercises the real repository/service/database path rather than pure
 * functions: episode lifecycle, disposition, queue membership, access
 * boundaries, audit trail, and the immutability of a signed consent.
 */
test("Intake: queue membership, staff workflow, disposition, and safety boundaries", async () => {
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-intake-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-intake-workflow-secret-0123456789";

  try {
    const [
      { grantSyntheticOrganizationAccess },
      { PatientRepository },
      { AppointmentRepository },
      { AuditRepository },
      { IntakeRepository },
      { intakeService, IntakeError },
      { getDatabase },
    ] = await Promise.all([
      import("./helpers/organization-access"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/appointment-repository"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/repositories/intake-repository"),
      import("../app/server/services/intake-service"),
      import("../app/server/db/connection"),
    ]);

    const orgId = await grantSyntheticOrganizationAccess(["staff-jordan"], { role: "staff", patientAccessScope: "organization" });
    const otherOrgId = await grantSyntheticOrganizationAccess(["staff-outside"], {
      organizationId: "org-outside-intake",
      role: "staff",
      patientAccessScope: "organization",
    });

    const staff = {
      userId: "staff-jordan",
      displayName: "Jordan Rivera",
      organizationId: orgId,
      role: "staff" as const,
      capabilities: ["edit_patient" as const, "manage_appointments" as const, "read_schedule" as const],
    };
    const outsideStaff = {
      userId: "staff-outside",
      displayName: "Outside Staff",
      organizationId: otherOrgId,
      role: "staff" as const,
      capabilities: ["edit_patient" as const],
    };
    const context = { source: "api" as const };

    const patient = PatientRepository.create(
      {
        id: "patient-intake-1",
        mrn: "MRN-INTAKE-001",
        name: "Riley Caller",
        initials: "RC",
        dob: "1995-05-05",
        age: 30,
        pronouns: "they/them",
        status: "New Patient",
        diagnoses: [],
        allergies: [],
        meds: [],
        vitals: {},
        lastVisit: "Never",
        nextVisit: "Unscheduled",
        contact: { mobilePhone: "555-777-1234", email: "riley@example.test" },
      } as any,
      orgId,
    );

    // A real coverage policy, seeded directly: the eligibility and plan-acceptance
    // steps have nothing to evaluate for a patient with no insurance on file at all.
    {
      const db = getDatabase();
      const at = new Date().toISOString();
      db.prepare(
        `INSERT INTO insurance_policies (
          id, patient_id, payer_name, status, coverage_priority, coverage_type, is_self_pay, created_at, updated_at
        ) VALUES ('cov-intake-1', ?, 'Acme Health Plan', 'active', 1, 'commercial', 0, ?, ?)`,
      ).run(patient.id, at, at);
    }

    const appointment = AppointmentRepository.create({
      id: "apt-intake-1",
      date: "2026-09-25",
      patientId: patient.id,
      patientName: patient.name,
      dob: patient.dob,
      age: patient.age,
      mrn: patient.mrn,
      time: "10:00 AM",
      duration: "60 min",
      type: "60-min Intake",
      status: "tentative",
      chiefComplaint: "New patient intake",
      insurance: "Self-Pay / Commercial",
      intakeStatus: "pending",
    } as any);

    // --- Queue membership: a tentative, intake-pending appointment appears ---
    let queue = intakeService.buildQueue(staff);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].patientId, patient.id);
    assert.equal(queue[0].stage, "waiting_on_patient");
    const episodeId = queue[0].episode.id;

    // --- Access boundary: staff outside the owning organization see nothing ---
    assert.equal(intakeService.buildQueue(outsideStaff).length, 0);
    assert.throws(() => intakeService.getDetail(outsideStaff, patient.id));

    // --- Assignment persists and is auditable ---
    const assigned = intakeService.assign(staff, context, episodeId, staff.userId, staff.displayName);
    assert.equal(assigned.assignedStaffName, "Jordan Rivera");
    const afterAssignAudit = AuditRepository.getRecent(20, patient.id);
    assert.ok(afterAssignAudit.some((e) => e.eventType === "intake_episode_updated"));

    // --- Notes/outreach persist, and outreach updates lastOutreachAt ---
    intakeService.addNote(staff, context, episodeId, "Left a voicemail about the ID upload.", "outreach");
    const notes = IntakeRepository.listNotes(episodeId);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].kind, "outreach");
    const afterOutreach = IntakeRepository.getEpisodeById(episodeId)!;
    assert.ok(afterOutreach.lastOutreachAt, "an outreach note stamps last-outreach");
    assert.ok(AuditRepository.getRecent(20, patient.id).some((e) => e.eventType === "intake_note_added"));

    // --- Follow-up date persists ---
    const followUp = "2026-09-20T15:00:00.000Z";
    intakeService.setFollowUp(staff, context, episodeId, followUp);
    assert.equal(IntakeRepository.getEpisodeById(episodeId)!.followUpAt, followUp);

    // --- Unconfigured eligibility and payment read as honestly "needed", not silently satisfied ---
    let detail = intakeService.getDetail(staff, patient.id);
    const eligibilityStep = detail.steps.find((s) => s.id === "eligibility")!;
    const paymentStep = detail.steps.find((s) => s.id === "payment")!;
    assert.equal(eligibilityStep.state, "needed");
    assert.equal(paymentStep.state, "needed");
    assert.match(paymentStep.detail, /Not configured/i);

    // --- A staff-attested payment waiver requires a reason, and is auditable ---
    assert.throws(() => intakeService.recordPaymentReadiness(staff, context, { patientId: patient.id, status: "waived" }), IntakeError);
    intakeService.recordPaymentReadiness(staff, context, { patientId: patient.id, status: "waived", waiverReason: "Practice fee waiver approved by owner" });
    detail = intakeService.getDetail(staff, patient.id);
    assert.equal(detail.steps.find((s) => s.id === "payment")!.state, "recorded");
    assert.ok(AuditRepository.getRecent(20, patient.id).some((e) => e.eventType === "intake_payment_readiness_recorded"));

    // --- Staff review sign-off is required and reversible, and gates readiness ---
    assert.equal(intakeService.getDetail(staff, patient.id).steps.find((s) => s.id === "staff_review")!.state, "needed");
    intakeService.resolveStaffReview(staff, context, episodeId);
    assert.ok(IntakeRepository.getEpisodeById(episodeId)!.staffReviewResolvedAt);
    intakeService.reopenStaffReview(staff, context, episodeId);
    assert.equal(IntakeRepository.getEpisodeById(episodeId)!.staffReviewResolvedAt, undefined);

    // --- A signed consent is immutable at the database level ---
    const db = getDatabase();
    const signature = intakeService.recordConsentSignature(staff, context, {
      patientId: patient.id,
      templateId: "consent-treatment",
      signerName: patient.name,
      signerRelationship: "self",
    });
    assert.throws(
      () => db.prepare(`UPDATE consent_signatures SET signer_name = 'Tampered' WHERE id = ?`).run(signature.id),
      /immutable/i,
    );
    assert.throws(
      () => db.prepare(`DELETE FROM consent_signatures WHERE id = ?`).run(signature.id),
      /immutable/i,
    );
    assert.ok(AuditRepository.getRecent(20, patient.id).some((e) => e.eventType === "intake_consent_signed"));

    // --- A form submission can be saved as a draft and later submitted ---
    const draft = intakeService.saveFormSubmission(staff, context, {
      patientId: patient.id,
      templateId: "form-psychiatric-intake",
      answers: { chief_concern: "Anxiety" },
      status: "in_progress",
    });
    const submitted = intakeService.saveFormSubmission(staff, context, {
      patientId: patient.id,
      templateId: "form-psychiatric-intake",
      submissionId: draft.id,
      answers: { chief_concern: "Anxiety", symptom_duration: "3 months" },
      status: "submitted",
    });
    assert.equal(submitted.id, draft.id, "an in-progress draft updates in place rather than duplicating");
    assert.equal(submitted.status, "submitted");

    // --- Manual eligibility attestation is distinguished from a vendor adapter ---
    const insurance = intakeService.recordEligibilityCheck(staff, context, {
      patientId: patient.id,
      coveragePolicyId: "cov-intake-1",
      result: "active",
      note: "Called payer directly, verbally confirmed active coverage.",
    });
    assert.equal(insurance.source, "manual_staff_attestation", "no vendor is configured; this can never be reported as an automated check");
    detail = intakeService.getDetail(staff, patient.id);
    assert.equal(detail.steps.find((s) => s.id === "eligibility")!.state, "recorded", "a fresh, matching staff attestation satisfies the step");

    // --- Disposition removes an intake from the active queue, with a reason and provenance ---
    intakeService.dispose(staff, context, episodeId, "unable_to_reach", "Three attempts, no response.");
    queue = intakeService.buildQueue(staff);
    assert.equal(queue.length, 0, "an archived intake is not part of the active queue");
    const disposed = IntakeRepository.getEpisodeById(episodeId)!;
    assert.equal(disposed.dispositionStatus, "archived");
    assert.equal(disposed.dispositionReason, "unable_to_reach");
    const dispositionNotes = IntakeRepository.listNotes(episodeId);
    assert.ok(dispositionNotes.some((n) => n.kind === "disposition"));

    // --- Reactivating brings it back into the queue ---
    intakeService.reactivate(staff, context, episodeId);
    queue = intakeService.buildQueue(staff);
    assert.equal(queue.length, 1);

    // --- A no-show remains visible in intake; a completed first visit does not ---
    AppointmentRepository.updateStatus(appointment.id, "no-show");
    queue = intakeService.buildQueue(staff);
    assert.equal(queue.length, 1, "a no-show is kept in intake for rescheduling/outreach");

    AppointmentRepository.update(appointment.id, { status: "completed" });
    queue = intakeService.buildQueue(staff);
    assert.equal(queue.length, 0, "the first completed visit removes the patient from the active queue");

    // --- Confirmation is never automatic: it stays "tentative"/"scheduled" until an explicit human action ---
    const secondAppointment = AppointmentRepository.create({
      id: "apt-intake-2",
      date: "2026-09-26",
      patientId: patient.id,
      patientName: patient.name,
      dob: patient.dob,
      age: patient.age,
      mrn: patient.mrn,
      time: "11:00 AM",
      duration: "60 min",
      type: "60-min Intake",
      status: "tentative",
      chiefComplaint: "Re-held after completing the first appointment's intake",
      insurance: "Self-Pay / Commercial",
      intakeStatus: "pending",
    } as any);
    assert.equal(secondAppointment.status, "tentative", "readiness alone never flips the appointment to confirmed");
    const confirmed = AppointmentRepository.updateStatus(secondAppointment.id, "confirmed");
    assert.equal(confirmed!.status, "confirmed", "confirmation only happens through an explicit status change");
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
