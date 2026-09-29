import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { computeIntakeChecklist, type IntakeReadinessInput } from "../app/domain/intake";
import type { PatientAdministrativeRecord } from "../app/domain/patient-administration";

function baseAdmin(overrides: Partial<PatientAdministrativeRecord> = {}): PatientAdministrativeRecord {
  return {
    patientId: "patient-synthetic-p7f",
    identity: { legalName: "Taylor Prospect", dob: "1995-08-20", pronouns: "they/them", mrn: "SYN-P7F", recordStatus: "active" },
    contact: { mobilePhone: "555-010-8888", email: "taylor@example.test", allowVoicemail: true, allowSms: true, allowEmail: true },
    relatedPeople: [],
    careNetwork: [],
    coverage: [],
    pharmacies: [],
    ...overrides,
  };
}

function baseInput(overrides: Partial<IntakeReadinessInput> = {}): IntakeReadinessInput {
  return {
    administrative: baseAdmin(),
    appointment: { status: "tentative", intakeStatus: "pending" },
    episode: { guardianSituation: "not_applicable", staffReviewResolvedAt: undefined },
    governmentIdDocuments: [],
    insuranceCardDocuments: [],
    planAcceptance: { result: "needs_review" },
    requiredConsents: [],
    signedConsents: [],
    formSubmissions: [],
    requiredFormTemplateIds: [],
    assessments: [],
    now: new Date("2026-09-29T12:00:00.000Z"),
    ...overrides,
  };
}

test("P7-F Patient Self-Service: pure checklist projection across portal invitation lifecycle", () => {
  // 1. Initial state with no invitation issued -> account step is needed
  const inputNoInvite = baseInput({ portalInvitation: null });
  const checklistNoInvite = computeIntakeChecklist(inputNoInvite);
  const accountNoInvite = checklistNoInvite.find((s) => s.id === "account")!;
  assert.equal(accountNoInvite.state, "needed");
  assert.match(accountNoInvite.detail, /portal invitation not yet sent/i);

  // 2. Active invitation issued -> account step is review
  const inputPending = baseInput({
    portalInvitation: {
      id: "invite-1",
      episodeId: "ep-1",
      patientId: "patient-synthetic-p7f",
      dobVerificationRequired: true,
      status: "pending",
      createdAt: "2026-09-29T10:00:00Z",
      expiresAt: "2026-10-06T10:00:00Z",
      createdById: "staff-1",
      createdByName: "Staff Member",
    },
  });
  const checklistPending = computeIntakeChecklist(inputPending);
  const accountPending = checklistPending.find((s) => s.id === "account")!;
  assert.equal(accountPending.state, "review");
  assert.match(accountPending.detail, /Portal invite active/i);

  // 3. Accessed invitation -> account step is review (in progress)
  const inputAccessed = baseInput({
    portalInvitation: {
      id: "invite-1",
      episodeId: "ep-1",
      patientId: "patient-synthetic-p7f",
      dobVerificationRequired: true,
      status: "accessed",
      createdAt: "2026-09-29T10:00:00Z",
      expiresAt: "2026-10-06T10:00:00Z",
      lastAccessedAt: "2026-09-29T11:00:00Z",
      createdById: "staff-1",
      createdByName: "Staff Member",
    },
  });
  const checklistAccessed = computeIntakeChecklist(inputAccessed);
  const accountAccessed = checklistAccessed.find((s) => s.id === "account")!;
  assert.equal(accountAccessed.state, "review");
  assert.match(accountAccessed.detail, /submission in progress/i);

  // 4. Completed invitation -> account step is recorded
  const inputCompleted = baseInput({
    portalInvitation: {
      id: "invite-1",
      episodeId: "ep-1",
      patientId: "patient-synthetic-p7f",
      dobVerificationRequired: true,
      status: "completed",
      createdAt: "2026-09-29T10:00:00Z",
      expiresAt: "2026-10-06T10:00:00Z",
      completedAt: "2026-09-29T11:30:00Z",
      createdById: "staff-1",
      createdByName: "Staff Member",
    },
  });
  const checklistCompleted = computeIntakeChecklist(inputCompleted);
  const accountCompleted = checklistCompleted.find((s) => s.id === "account")!;
  assert.equal(accountCompleted.state, "recorded");
  assert.match(accountCompleted.detail, /Patient completed self-service intake/i);

  // 5. Expired or revoked invitation -> account step is needed
  const inputExpired = baseInput({
    portalInvitation: {
      id: "invite-1",
      episodeId: "ep-1",
      patientId: "patient-synthetic-p7f",
      dobVerificationRequired: true,
      status: "expired",
      createdAt: "2026-09-20T10:00:00Z",
      expiresAt: "2026-09-27T10:00:00Z",
      createdById: "staff-1",
      createdByName: "Staff Member",
    },
  });
  const checklistExpired = computeIntakeChecklist(inputExpired);
  const accountExpired = checklistExpired.find((s) => s.id === "account")!;
  assert.equal(accountExpired.state, "needed");
  assert.match(accountExpired.detail, /expired/i);
});

test("P7-F Patient Self-Service: end-to-end integration across repository, service, and authority boundaries", async () => {
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-intake-self-service-test-"));
  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-intake-self-service-secret-0123456789";

  try {
    const [
      { grantSyntheticOrganizationAccess },
      { AuditRepository },
      { IntakeRepository },
      { MeasurementRepository },
      { intakeService },
      { prospectivePersonService },
    ] = await Promise.all([
      import("./helpers/organization-access"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/repositories/intake-repository"),
      import("../app/server/repositories/measurement-repository"),
      import("../app/server/services/intake-service"),
      import("../app/server/services/prospective-person-service"),
    ]);

    const orgId = await grantSyntheticOrganizationAccess(["staff-jordan"], {
      role: "staff",
      patientAccessScope: "organization",
    });

    const staffActor = {
      userId: "staff-jordan",
      organizationId: orgId,
      email: "jordan@example.test",
      role: "staff" as const,
      membershipRole: "member" as const,
      patientAccessScope: "organization" as const,
      displayName: "Jordan Rivera",
      capabilities: ["edit_patient" as const, "read_clinical" as const, "manage_clinical_record" as const],
    };
    const context = { source: "ui" as const, requestId: "req-p7f-test" };

    // 1. Create a prospective person
    const prospect = prospectivePersonService.create(
      {
        name: "Robin Sterling",
        dob: "1993-11-14",
        email: "robin@example.test",
        mobilePhone: "555-010-3333",
      },
      staffActor,
      context,
    );
    assert.ok(prospect.id);

    // 2. Start standalone intake episode
    const episode = intakeService.startStandalone(staffActor, context, { prospectivePersonId: prospect.id });
    assert.ok(episode.id);

    // 3. Issue portal invitation with DOB identity verification enabled
    const inviteResult = intakeService.issuePortalInvitation(staffActor, context, {
      episodeId: episode.id,
      ttlDays: 7,
      targetEmail: "robin@example.test",
      targetPhone: "555-010-3333",
      requireDobVerification: true,
    });
    assert.ok(inviteResult.invitation.id);
    assert.ok(inviteResult.token);
    assert.match(inviteResult.linkUrl, new RegExp(`/intake/self-service\\?token=${inviteResult.token}`));
    assert.equal(inviteResult.invitation.status, "pending");
    assert.equal(inviteResult.invitation.dobVerificationRequired, true);

    // Verify token hash in database
    const expectedHash = createHash("sha256").update(inviteResult.token).digest("hex");
    const foundByHash = IntakeRepository.getPortalInvitationByTokenHash(expectedHash);
    assert.ok(foundByHash);
    assert.equal(foundByHash.id, inviteResult.invitation.id);

    // 4. Patient opens portal: DOB Identity Gate verification
    // A: Without DOB -> dobVerified is false, sensitive details and screeners are gated
    const initialPkg = intakeService.getSelfServicePackage(inviteResult.token);
    assert.equal(initialPkg.status, "accessed");
    assert.equal(initialPkg.subject.dobVerificationRequired, true);
    assert.equal(initialPkg.subject.dobVerified, false);
    assert.equal(initialPkg.consentTemplates.length, 0); // locked behind DOB
    assert.equal(initialPkg.assessmentInstruments.length, 0); // locked behind DOB

    // B: With incorrect DOB -> throws 403 authorization error
    assert.throws(
      () => intakeService.getSelfServicePackage(inviteResult.token, "1980-01-01"),
      /date of birth does not match/i,
    );

    // C: With correct DOB -> unlocks full package
    const unlockedPkg = intakeService.getSelfServicePackage(inviteResult.token, "1993-11-14");
    assert.equal(unlockedPkg.subject.dobVerified, true);
    assert.equal(unlockedPkg.subject.displayName, "Robin Sterling");
    assert.equal(unlockedPkg.subject.email, "robin@example.test");
    assert.ok(unlockedPkg.consentTemplates.length >= 2);
    assert.ok(unlockedPkg.assessmentInstruments.length >= 2);

    const phq9Instrument = unlockedPkg.assessmentInstruments.find((i) => i.type === "phq-9")!;
    assert.ok(phq9Instrument);
    assert.equal(phq9Instrument.questions.length, 9);

    const gad7Instrument = unlockedPkg.assessmentInstruments.find((i) => i.type === "gad-7")!;
    assert.ok(gad7Instrument);
    assert.equal(gad7Instrument.questions.length, 7);

    // 5. Patient submits self-service packet:
    // - Confirms & updates contact + adds emergency contact
    // - Signs consents (drawn canvas + typed attestation)
    // - Completes PHQ-9 (with Item 9 suicidal ideation = 1) and GAD-7
    const sampleCanvasPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const submitResult = intakeService.submitSelfServicePackage({
      token: inviteResult.token,
      dobVerification: "1993-11-14",
      contact: {
        mobilePhone: "555-010-7777", // updated phone
        email: "robin.sterling@example.test",
        emergencyContactName: "Sam Sterling",
        emergencyContactPhone: "555-010-9999",
        emergencyContactRelationship: "Spouse",
      },
      consents: unlockedPkg.consentTemplates.map((template, idx) => ({
        templateId: template.id,
        templateVersion: template.version,
        signerName: "Robin Sterling",
        signerRelationship: "self" as const,
        method: idx % 2 === 0 ? ("drawn_canvas" as const) : ("typed_attestation" as const),
        signatureData: idx % 2 === 0 ? sampleCanvasPng : undefined,
        attestationStatement: idx % 2 === 1 ? "I, Robin Sterling, certify this electronic signature is legally binding." : undefined,
      })),
      assessments: [
        {
          instrument: "phq-9",
          responses: { 1: 2, 2: 2, 3: 1, 4: 1, 5: 1, 6: 0, 7: 1, 8: 0, 9: 1 }, // Total 9, Item 9 endorsed!
        },
        {
          instrument: "gad-7",
          responses: { 1: 1, 2: 1, 3: 2, 4: 1, 5: 0, 6: 1, 7: 1 }, // Total 7
        },
      ],
    });

    assert.ok(submitResult.confirmationCode.startsWith("CB-IN-"));
    assert.equal(submitResult.signedConsentsCount, unlockedPkg.consentTemplates.length);
    assert.equal(submitResult.completedAssessmentsCount, 2);

    // 6. Verify evidence in authoritative repositories
    // A: Consents are recorded
    const signedConsents = IntakeRepository.listSignedConsents({ prospectivePersonId: prospect.id });
    assert.equal(signedConsents.length, unlockedPkg.consentTemplates.length);
    assert.ok(signedConsents.some((s) => s.method === "drawn_canvas" && s.signatureData === sampleCanvasPng));
    assert.ok(signedConsents.some((s) => s.method === "typed_attestation"));

    // B: Clinical assessments are recorded with automated scoring and safety flag detection
    const savedAssessments = MeasurementRepository.listAssessmentsBySubject({ prospectivePersonId: prospect.id });
    assert.equal(savedAssessments.length, 2);

    const savedPhq9 = savedAssessments.find((a) => a.instrument === "phq-9")!;
    assert.ok(savedPhq9);
    assert.equal(savedPhq9.totalScore, 9);
    assert.equal(savedPhq9.severity, "Mild Depression");
    assert.equal(savedPhq9.flags.length, 1);
    assert.match(savedPhq9.flags[0], /POSITIVE ITEM 9/); // Suicide risk flag!

    const savedGad7 = savedAssessments.find((a) => a.instrument === "gad-7")!;
    assert.ok(savedGad7);
    assert.equal(savedGad7.totalScore, 7);
    assert.equal(savedGad7.severity, "Mild Anxiety");

    // C: Prospective person contact info was updated
    const updatedProspect = prospectivePersonService.getById(staffActor, prospect.id);
    assert.ok(updatedProspect);
    assert.equal(updatedProspect.mobilePhone, "555-010-7777");
    assert.equal(updatedProspect.email, "robin.sterling@example.test");

    // D: Invitation status is completed
    const completedInvitation = IntakeRepository.getPortalInvitationById(inviteResult.invitation.id);
    assert.ok(completedInvitation);
    assert.equal(completedInvitation.status, "completed");
    assert.ok(completedInvitation.completedAt);

    // E: Audit trail and episode outreach notes were generated
    const notes = IntakeRepository.listNotes(episode.id);
    assert.ok(notes.some((n) => n.kind === "outreach" && n.body.includes(submitResult.confirmationCode)));

    // 7. Verify IntakeDetail reflects updated state
    const detail = intakeService.getDetail(staffActor, prospect.id);
    assert.ok(detail.portalInvitation);
    assert.equal(detail.portalInvitation.status, "completed");

    const accountStep = detail.steps.find((s) => s.id === "account")!;
    assert.equal(accountStep.state, "recorded");

    const contactStep = detail.steps.find((s) => s.id === "contact")!;
    assert.equal(contactStep.state, "recorded");

    const consentsStep = detail.steps.find((s) => s.id === "consents")!;
    assert.equal(consentsStep.state, "recorded");

    const assessmentsStep = detail.steps.find((s) => s.id === "assessments")!;
    assert.equal(assessmentsStep.state, "review"); // Flagged due to Item 9 suicide risk alert!
    assert.match(assessmentsStep.detail, /Clinical safety alert/);

    // 8. Re-accessing completed token returns completed package
    const completedPkg = intakeService.getSelfServicePackage(inviteResult.token, "1993-11-14");
    assert.equal(completedPkg.status, "completed");

    // 9. Revocation test: Issue a second invitation and revoke it
    const secondInvite = intakeService.issuePortalInvitation(staffActor, context, {
      episodeId: episode.id,
      ttlDays: 3,
    });
    assert.equal(secondInvite.invitation.status, "pending");

    const revoked = intakeService.revokePortalInvitation(staffActor, context, secondInvite.invitation.id);
    assert.equal(revoked.status, "revoked");

    // Revoked token cannot be accessed
    assert.throws(
      () => intakeService.getSelfServicePackage(secondInvite.token),
      /invitation link is no longer active/i,
    );
  } finally {
    process.chdir(originalCwd);
    env.NODE_ENV = originalNodeEnv;
    env.EHR_SESSION_SECRET = originalSecret;
  }
});
