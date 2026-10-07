import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";
import { normalizeRequestedForms, phq9Item9Endorsed } from "../app/domain/patient-form-requests";

test("a requested-forms list is validated, de-duplicated and refuses clinician-only scales", () => {
  assert.deepEqual(normalizeRequestedForms([]), { error: "Choose at least one form to send." });
  assert.match(
    (normalizeRequestedForms([{ kind: "assessment", instrument: "cssrs" }]) as { error: string }).error,
    /cannot be sent/,
    "C-SSRS stays in the visit",
  );
  assert.deepEqual(
    normalizeRequestedForms([
      { kind: "assessment", instrument: "phq-9" },
      { kind: "assessment", instrument: "phq-9" },
      { kind: "consent", templateId: "t-1" },
    ]),
    { items: [{ kind: "assessment", instrument: "phq-9" }, { kind: "consent", templateId: "t-1" }] },
  );
  assert.equal(phq9Item9Endorsed("phq-9", { 9: 1 }), true);
  assert.equal(phq9Item9Endorsed("phq-9", { 9: 0 }), false);
  assert.equal(phq9Item9Endorsed("gad-7", { 9: 3 }), false);
});

test("forms requested from a chart: recorded in a thread, limited to what was asked, results come back to it", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-form-requests-"));
  process.chdir(isolatedRoot);

  try {
    const [{ ClinicalActionGateway }, { intakeService }, { IntakeRepository }, { MessageRepository }, { MeasurementRepository }] =
      await Promise.all([
        import("../app/server/actions/clinical-action-gateway"),
        import("../app/server/services/intake-service"),
        import("../app/server/repositories/intake-repository"),
        import("../app/server/repositories/message-repository"),
        import("../app/server/repositories/measurement-repository"),
      ]);
    await grantSyntheticOrganizationAccess(["form-provider"]);
    const actor = { userId: "form-provider", displayName: "Form Provider", credentials: "PMHNP-BC", role: "provider" as const };
    const context = { source: "api" as const, requestId: "test-form-requests" };
    await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "create_patient",
        payload: {
          id: "form-a", name: "Forms Alpha", initials: "FA", dob: "03/04/1988", age: 38, pronouns: "they/them", mrn: "FRM-A-1",
          status: "Established", allergies: [], diagnoses: [], meds: [], vitals: {}, lastVisit: "Initial", nextVisit: "Unscheduled",
        } as never,
      },
    });

    const [requestedTemplate, otherTemplate] = IntakeRepository.listActiveConsentTemplates();
    assert.ok(requestedTemplate && otherTemplate, "seeded consent templates exist");

    assert.throws(
      () => intakeService.requestPatientForms(actor as never, context, { patientId: "form-a", items: [{ kind: "consent", templateId: "no-such-template" }] }),
      /not an active template/,
    );

    const result = intakeService.requestPatientForms(actor as never, context, {
      patientId: "form-a",
      items: [
        { kind: "assessment", instrument: "phq-9" },
        { kind: "consent", templateId: requestedTemplate.id },
      ],
      note: "Please complete before Thursday.",
    });
    const token = new URL(result.linkUrl, "http://localhost").searchParams.get("token")!;
    assert.ok(token);
    assert.equal(result.invitation.episodeId, undefined, "a chart request belongs to no intake episode");

    const thread = MessageRepository.getThreadsByPatient("form-a").find((t) => t.id === result.threadId)!;
    const requestText = thread.messages[0].content;
    assert.match(requestText, /Forms requested: PHQ-9 \(depression\)/);
    assert.match(requestText, /Not delivered by Clinical Bond/);
    assert.ok(!requestText.includes(token), "the token never appears in the thread");

    // Earlier chart history does not make today's request look complete.
    MeasurementRepository.recordAssessment(
      { patientId: "form-a", instrument: "phq-9", responses: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, 0])), administeredAt: "2026-01-01T00:00:00.000Z", source: "clinician" } as never,
      { userId: "form-provider", displayName: "Form Provider" } as never,
      { type: "clinician" } as never,
    );

    assert.throws(() => intakeService.getSelfServicePackage(token, "1990-01-01"), /does not match/);
    const pkg = intakeService.getSelfServicePackage(token, "1988-03-04");
    assert.equal(pkg.purpose, "chart-request");
    assert.deepEqual(pkg.assessmentInstruments.map((a) => [a.type, a.completed]), [["phq-9", false]]);
    assert.deepEqual(pkg.consentTemplates.map((c) => c.id), [requestedTemplate.id], "only the requested consent is shown");

    const phqAnswers = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, 1]));
    intakeService.submitSelfServicePackage({
      token,
      dobVerification: "1988-03-04",
      contact: { mobilePhone: "555-000-9999" },
      consents: [
        { templateId: requestedTemplate.id, templateVersion: requestedTemplate.version, signerName: "Forms Alpha", method: "typed_attestation" },
        { templateId: otherTemplate.id, templateVersion: otherTemplate.version, signerName: "Forms Alpha", method: "typed_attestation" },
      ],
      assessments: [
        { instrument: "phq-9", responses: phqAnswers },
        { instrument: "gad-7", responses: { 1: 3, 2: 3 } },
      ],
    } as never);

    const signed = IntakeRepository.listSignedConsents({ patientId: "form-a" }).map((s) => s.templateId);
    assert.deepEqual(signed, [requestedTemplate.id], "a consent that was not requested cannot be signed through the link");
    const instruments = MeasurementRepository.listAssessmentsBySubject({ patientId: "form-a" }).map((a) => a.instrument);
    assert.ok(!instruments.includes("gad-7"), "an unrequested scale is not recorded");

    const after = MessageRepository.getThreadsByPatient("form-a").find((t) => t.id === result.threadId)!;
    const reply = after.messages.at(-1)!;
    assert.equal(reply.senderRole, "patient");
    assert.match(reply.content, /^SAFETY: PHQ-9 item 9 was endorsed/);
    assert.match(reply.content, /PHQ-9 \(depression\): 9\/27/);
    assert.equal(after.urgency, "urgent", "a positive item 9 makes the thread urgent");

    assert.throws(() => intakeService.submitSelfServicePackage({ token, dobVerification: "1988-03-04" } as never), /already been completed/);

    // A blank safety plan: the patient's own draft is filed in Documents and attached to the reply.
    const plan = intakeService.requestPatientForms(actor as never, context, { patientId: "form-a", items: [{ kind: "safety-plan" }] });
    const planToken = new URL(plan.linkUrl, "http://localhost").searchParams.get("token")!;
    const planPkg = intakeService.getSelfServicePackage(planToken, "1988-03-04");
    assert.equal(planPkg.safetyPlanRequested, true);
    assert.equal(planPkg.overallProgress.isFullyComplete, false, "an empty request is not complete before the plan is written");
    intakeService.submitSelfServicePackage({
      token: planToken,
      dobVerification: "1988-03-04",
      safetyPlan: { warningSigns: "Not sleeping, pulling away from friends", helpContacts: "Sam 555-0100", unknownSection: "dropped" },
    } as never);
    const planThread = MessageRepository.getThreadsByPatient("form-a").find((t) => t.id === plan.threadId)!;
    const planReply = planThread.messages.at(-1)!;
    assert.match(planReply.content, /Safety plan filled out by the patient and filed in Documents/);
    assert.equal(planThread.urgency, "routine", "a safety plan alone does not invent an urgent signal");
    const attached = (planReply as { attachments?: Array<{ kind: string; title: string }> }).attachments ?? [];
    assert.equal(attached.length, 1);
    assert.match(attached[0].title, /^Safety plan — patient draft, not yet reviewed/);

    // Sent requests are listed with their state, and an open link can be revoked.
    const open = intakeService.requestPatientForms(actor as never, context, { patientId: "form-a", items: [{ kind: "assessment", instrument: "gad-7" }] });
    const listed = intakeService.listPatientFormRequests(actor as never, "form-a");
    assert.deepEqual(listed.map((r) => [r.titles.join(","), r.status]).slice(0, 3), [
      ["GAD-7 (anxiety)", "pending"],
      ["Safety plan", "completed"],
      [`PHQ-9 (depression),${requestedTemplate.title}`, "completed"],
    ]);
    const revoked = intakeService.revokePatientFormRequest(actor as never, context, { patientId: "form-a", invitationId: open.invitation.id });
    assert.equal(revoked.status, "revoked");
    const openToken = new URL(open.linkUrl, "http://localhost").searchParams.get("token")!;
    assert.throws(() => intakeService.getSelfServicePackage(openToken, "1988-03-04"), /no longer active/);
    assert.throws(
      () => intakeService.revokePatientFormRequest(actor as never, context, { patientId: "form-a", invitationId: open.invitation.id }),
      /already revoked/,
    );
    const revokedThread = MessageRepository.getThreadsByPatient("form-a").find((t) => t.id === open.threadId)!;
    assert.match(revokedThread.messages.at(-1)!.content, /Form link revoked by/);
  } finally {
    process.chdir(originalCwd);
  }
});
