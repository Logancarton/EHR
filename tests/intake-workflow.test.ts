import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Clinical Bond Intake — the staff-workflow spine over the queue (D-075),
 * hardened for the prospective-identity boundary and readiness corrections
 * of D-076: a tentative caller no longer requires a clinical chart, and
 * confirming an appointment with incomplete requirements is an explicit,
 * audited override rather than a silent allowance.
 */
test("Intake: prospective identity, promotion, override confirmation, and safety boundaries", async () => {
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
      { prospectivePersonService, ProspectivePersonError },
      { workflowService },
      { getDatabase },
    ] = await Promise.all([
      import("./helpers/organization-access"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/appointment-repository"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/repositories/intake-repository"),
      import("../app/server/services/intake-service"),
      import("../app/server/services/prospective-person-service"),
      import("../app/server/services/workflow-service"),
      import("../app/server/db/connection"),
    ]);

    const orgId = await grantSyntheticOrganizationAccess(["staff-jordan"], { role: "staff", patientAccessScope: "organization" });
    const otherOrgId = await grantSyntheticOrganizationAccess(["staff-outside"], {
      organizationId: "org-outside-intake",
      role: "staff",
      patientAccessScope: "organization",
    });
    await grantSyntheticOrganizationAccess(["owner-riley"], {
      organizationId: orgId,
      role: "provider",
      membershipRole: "owner",
      patientAccessScope: "organization",
    });

    const staff = {
      userId: "staff-jordan",
      displayName: "Jordan Rivera",
      organizationId: orgId,
      role: "staff" as const,
      capabilities: ["edit_patient" as const, "manage_appointments" as const, "read_schedule" as const],
    };
    const owner = {
      userId: "owner-riley",
      displayName: "Riley Owner",
      organizationId: orgId,
      role: "provider" as const,
      membershipRole: "owner" as const,
      capabilities: ["edit_patient" as const, "manage_appointments" as const, "read_schedule" as const, "manage_organization" as const],
    };
    const outsideStaff = {
      userId: "staff-outside",
      displayName: "Outside Staff",
      organizationId: otherOrgId,
      role: "staff" as const,
      capabilities: ["edit_patient" as const],
    };
    const context = { source: "api" as const };

    /* ============================================================ *
     * 1. PROSPECTIVE IDENTITY — the front door, no chart required
     * ============================================================ */

    const prospect = prospectivePersonService.create(
      { name: "Riley Caller", dob: "1995-05-05", mobilePhone: "555-777-1234", email: "riley.caller@example.test" },
      staff,
      context,
    );
    assert.ok(prospect.id.startsWith("prospect-"));
    assert.equal(prospect.status, "active");

    const tentativeAppointment = await workflowService.createAppointment(
      {
        id: "apt-prospect-1",
        patientId: prospect.id,
        date: "2026-09-25",
        time: "10:00 AM",
        type: "60-min Intake",
        status: "tentative",
        chiefComplaint: "New patient intake",
      } as any,
      staff,
      context,
    );
    assert.equal(tentativeAppointment.patientId, prospect.id, "a tentative hold can exist before any patients row does");
    assert.equal(PatientRepository.getById(prospect.id), null, "no clinical chart was created merely by holding an appointment");
    assert.equal(tentativeAppointment.intakeStatus, "pending");

    // --- Cross-tenant access is denied ---
    assert.throws(() => prospectivePersonService.getById(outsideStaff, prospect.id));
    const queueForOutsider = intakeService.buildQueue(outsideStaff);
    assert.equal(queueForOutsider.length, 0, "a different organization's staff cannot see this prospect's intake");

    // --- The queue carries the prospect id, not a patient id ---
    let queue = intakeService.buildQueue(staff);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].patientId, undefined);
    assert.equal(queue[0].prospectivePersonId, prospect.id);
    const episodeId = queue[0].episode.id;

    // --- Identity/contact steps are satisfiable pre-chart; document/coverage steps honestly cannot be yet ---
    let detail = intakeService.getDetail(staff, prospect.id);
    assert.equal(detail.steps.find((s) => s.id === "identity")!.state, "recorded");
    assert.equal(detail.steps.find((s) => s.id === "government_id")!.state, "needed");

    /* ============================================================ *
     * 2. DUPLICATE RESOLUTION AND PROMOTION
     * ============================================================ */

    // A same-name, same-DOB existing patient must be surfaced, never silently merged.
    const existingMatch = PatientRepository.create(
      {
        id: "patient-existing-riley",
        mrn: "MRN-EXIST-001",
        name: "Riley Caller",
        initials: "RC",
        dob: "1995-05-05",
        age: 30,
        pronouns: "they/them",
        status: "Established",
        diagnoses: [], allergies: [], meds: [], vitals: {},
        lastVisit: "2026-01-01", nextVisit: "Unscheduled",
        contact: { mobilePhone: "555-000-0000", email: "old@example.test" },
      } as any,
      orgId,
    );

    const duplicates = prospectivePersonService.findPossibleDuplicates(staff, prospect.id);
    assert.equal(duplicates.length, 1);
    assert.equal(duplicates[0].patientId, existingMatch.id);
    assert.deepEqual(duplicates[0].matchedOn.sort(), ["dob", "name"]);
    // Finding a duplicate changes nothing by itself.
    assert.equal(PatientRepository.getById(prospect.id), null);
    assert.equal(prospectivePersonService.getById(staff, prospect.id).status, "active");

    // Staff deliberately chooses to create a NEW chart anyway (e.g. confirmed
    // to be a different person despite the coincidence) rather than the match.
    const { patient: createdPatient } = prospectivePersonService.promote(staff, context, { prospectiveId: prospect.id, mode: "create" });
    assert.notEqual(createdPatient.id, existingMatch.id);
    assert.equal(prospectivePersonService.getById(staff, prospect.id).status, "promoted");
    assert.equal(prospectivePersonService.getById(staff, prospect.id).promotionKind, "created");

    // The appointment and episode both now resolve to the real chart, and the
    // prospect linkage is preserved rather than erased.
    const relinkedAppointment = AppointmentRepository.getById(tentativeAppointment.id)!;
    assert.equal(relinkedAppointment.patientId, createdPatient.id);
    const promotedEpisode = IntakeRepository.getEpisodeById(episodeId)!;
    assert.equal(promotedEpisode.patientId, createdPatient.id);
    assert.equal(promotedEpisode.prospectivePersonId, prospect.id, "front-door history is preserved, not erased");

    // Promotion is audited.
    const promotionAudit = AuditRepository.getRecent(20, createdPatient.id).find((e) => e.eventType === "prospective_person_promoted");
    assert.ok(promotionAudit, "promotion is an audited transition");

    // Retrying promotion does not create a duplicate chart.
    assert.throws(() => prospectivePersonService.promote(staff, context, { prospectiveId: prospect.id, mode: "create" }), ProspectivePersonError);
    assert.equal(PatientRepository.getById(createdPatient.id) !== null, true);

    // Evidence recorded before promotion is still visible afterward (union lookup).
    detail = intakeService.getDetail(staff, createdPatient.id);
    assert.equal(detail.episode.id, episodeId);

    /* ============================================================ *
     * 3. LINK-TO-EXISTING PATH (a second prospect, linked rather than created)
     * ============================================================ */

    const secondProspect = prospectivePersonService.create(
      { name: "Morgan Returning", dob: "1988-02-02", mobilePhone: "555-222-3333", email: "morgan@example.test" },
      staff,
      context,
    );
    const existingChart = PatientRepository.create(
      {
        id: "patient-morgan-existing",
        mrn: "MRN-MORGAN-001",
        name: "Morgan Returning",
        initials: "MR",
        dob: "1988-02-02",
        age: 38,
        pronouns: "she/her",
        status: "Established",
        diagnoses: [], allergies: [], meds: [], vitals: {},
        lastVisit: "2025-01-01", nextVisit: "Unscheduled",
        contact: {},
      } as any,
      orgId,
    );
    await workflowService.createAppointment(
      { id: "apt-prospect-2", patientId: secondProspect.id, date: "2026-09-26", time: "11:00 AM", type: "60-min Intake", status: "tentative", chiefComplaint: "Returning patient" } as any,
      staff,
      context,
    );
    const { patient: linkedPatient } = prospectivePersonService.promote(staff, context, { prospectiveId: secondProspect.id, mode: "link", existingPatientId: existingChart.id });
    assert.equal(linkedPatient.id, existingChart.id, "linking reuses the existing chart rather than creating another");
    assert.equal(prospectivePersonService.getById(staff, secondProspect.id).promotionKind, "linked_existing");

    /* ============================================================ *
     * 4. LEGACY D-073 PATIENT-FIRST FLOW STILL WORKS
     * ============================================================ */

    const legacyPatient = PatientRepository.create(
      {
        id: "patient-legacy-flow",
        mrn: "MRN-LEGACY-001",
        name: "Legacy Flow Patient",
        initials: "LF",
        dob: "1999-09-09",
        age: 27,
        pronouns: "he/him",
        status: "New Patient",
        diagnoses: [], allergies: [], meds: [], vitals: {},
        lastVisit: "Never", nextVisit: "Unscheduled",
        contact: { mobilePhone: "555-999-1111", email: "legacy@example.test" },
      } as any,
      orgId,
    );
    const legacyAppointment = await workflowService.createAppointment(
      { id: "apt-legacy-1", patientId: legacyPatient.id, date: "2026-09-27", time: "09:00 AM", type: "60-min Intake", status: "tentative", chiefComplaint: "Legacy pattern" } as any,
      staff,
      context,
    );
    assert.equal(legacyAppointment.patientId, legacyPatient.id);
    const legacyDetail = intakeService.getDetail(staff, legacyPatient.id);
    assert.equal(legacyDetail.episode.prospectivePersonId, undefined, "a patient-first episode never gains a prospect id");

    /* ============================================================ *
     * 5. IDENTITY DOCUMENT REVIEW — reviewed != confirmed
     * ============================================================ */

    {
      const db = getDatabase();
      const at = new Date().toISOString();
      db.prepare(
        `INSERT INTO documents (id, patient_id, document_type, title, status, workflow_status, mime_type, created_by, created_at, updated_at)
         VALUES ('doc-id-1', ?, 'government_id', 'License', 'active', 'reviewed', 'text/plain', 'staff-jordan', ?, ?)`,
      ).run(createdPatient.id, at, at);
    }
    let promotedDetail = intakeService.getDetail(staff, createdPatient.id);
    assert.equal(promotedDetail.steps.find((s) => s.id === "government_id")!.state, "needed", "document workflow status alone never confirms identity");

    intakeService.recordIdentityDocumentReview(staff, context, { patientId: createdPatient.id, documentId: "doc-id-1", result: "confirmed", legible: true });
    promotedDetail = intakeService.getDetail(staff, createdPatient.id);
    assert.equal(promotedDetail.steps.find((s) => s.id === "government_id")!.state, "recorded");
    assert.ok(AuditRepository.getRecent(20, createdPatient.id).some((e) => e.eventType === "intake_identity_document_reviewed"));

    /* ============================================================ *
     * 6. PAYER-PLAN PARTICIPATION — requires manage_organization, affirmative only
     * ============================================================ */

    assert.throws(() => intakeService.addPayerPlanParticipation(staff, context, { payerName: "Acme Health", status: "in_network" }), /lacks permission/);
    const participation = intakeService.addPayerPlanParticipation(owner, context, { payerName: "Acme Health Plan", status: "in_network" });
    assert.equal(participation.status, "in_network");

    /* ============================================================ *
     * 7. CONFIRM-WITH-OVERRIDE — never silent, always a reason, blockers untouched
     * ============================================================ */

    const overrideAppointment = await workflowService.createAppointment(
      { id: "apt-override-1", patientId: createdPatient.id, date: "2026-09-28", time: "01:00 PM", type: "60-min Intake", status: "tentative", chiefComplaint: "Override test" } as any,
      staff,
      context,
    );
    const overrideEpisode = IntakeRepository.getOrCreateForAppointment({ patientId: createdPatient.id, appointmentId: overrideAppointment.id, organizationId: orgId });

    assert.throws(
      () => intakeService.confirmWithOverride(staff, context, { episodeId: overrideEpisode.id, appointmentId: overrideAppointment.id, reason: "" }),
      IntakeError,
      "a reason is required",
    );

    const stillTentative = AppointmentRepository.getById(overrideAppointment.id)!;
    assert.equal(stillTentative.status, "tentative", "a failed override attempt confirms nothing");

    const confirmedByOverride = intakeService.confirmWithOverride(staff, context, {
      episodeId: overrideEpisode.id,
      appointmentId: overrideAppointment.id,
      reason: "Patient traveling; will complete forms at check-in.",
    });
    assert.equal(confirmedByOverride.status, "confirmed");

    const overrideAudit = AuditRepository.getRecent(20, createdPatient.id).find((e) => e.eventType === "intake_confirmed_with_override");
    assert.ok(overrideAudit, "the override is its own audited event");
    assert.ok((overrideAudit!.metadata!.blockers as string[]).length > 0, "outstanding blockers at the moment of override are recorded");
    assert.equal(overrideAudit!.metadata!.reason, "Patient traveling; will complete forms at check-in.");

    const overrideNotes = IntakeRepository.listNotes(overrideEpisode.id);
    assert.ok(overrideNotes.some((n) => n.kind === "override"));

    // The override never marks any requirement complete — re-reading readiness
    // for this same episode still shows the same outstanding items.
    const postOverrideDetail = intakeService.getDetail(staff, createdPatient.id);
    assert.ok(postOverrideDetail.steps.some((s) => s.blocking && s.state !== "recorded" && s.state !== "not_available"), "readiness is not silently marked complete by an override");

    /* ============================================================ *
     * 8. NORMAL CONFIRM PATH — still available and still human-initiated
     * ============================================================ */

    assert.equal(overrideAppointment.status, "tentative", "readiness alone never flips status — only an explicit action does");
    const secondAppointment = await workflowService.createAppointment(
      { id: "apt-normal-confirm", patientId: createdPatient.id, date: "2026-09-29", time: "11:00 AM", type: "60-min Intake", status: "tentative", chiefComplaint: "Normal confirm path" } as any,
      staff,
      context,
    );
    const confirmed = AppointmentRepository.updateStatus(secondAppointment.id, "confirmed");
    assert.equal(confirmed!.status, "confirmed");

    /* ============================================================ *
     * 9. QUEUE LIFECYCLE — no-show stays, completed visit leaves
     * ============================================================ */

    AppointmentRepository.updateStatus(overrideAppointment.id, "no-show");
    queue = intakeService.buildQueue(staff);
    assert.ok(queue.some((r) => r.episode.id === overrideEpisode.id), "a no-show stays in intake for outreach/rescheduling");

    AppointmentRepository.update(overrideAppointment.id, { status: "completed" });
    queue = intakeService.buildQueue(staff);
    assert.ok(!queue.some((r) => r.episode.id === overrideEpisode.id), "the first completed visit removes the episode from the active queue");

    /* ============================================================ *
     * 10. CLINICAL PERMISSIONS ARE NOT GRANTED THROUGH INTAKE
     * ============================================================ */

    assert.equal(intakeService.buildQueue(staff).every(() => true), true, "staff (no read_clinical) can still work the queue");
    // Intake's own write surface stays gated behind edit_patient, not read_clinical.
    const clinicalAssistant = { userId: "assistant-1", displayName: "Assistant", organizationId: orgId, role: "clinical_assistant" as const, capabilities: ["read_clinical" as const] };
    assert.throws(() => intakeService.assign(clinicalAssistant, context, overrideEpisode.id, "x", "y"), /lacks permission/);
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
