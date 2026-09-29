import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PHQ9_INSTRUMENT,
  GAD7_INSTRUMENT,
  ASRS_INSTRUMENT,
  CSSRS_INSTRUMENT,
  currentSafetyFlags,
  type AssessmentRecord,
} from "../app/domain/clinical-measurements";
import {
  computeIntakeChecklist,
  type IntakeReadinessInput,
} from "../app/domain/intake";
import type { PatientAdministrativeRecord } from "../app/domain/patient-administration";

function baseAdmin(overrides: Partial<PatientAdministrativeRecord> = {}): PatientAdministrativeRecord {
  return {
    patientId: "patient-synthetic",
    identity: { legalName: "Jordan Synthetic", dob: "1992-04-12", pronouns: "they/them", mrn: "SYN-P7", recordStatus: "active" },
    contact: { mobilePhone: "555-010-9999", email: "jordan@example.test", allowVoicemail: true, allowSms: true, allowEmail: true },
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
    now: new Date("2026-09-27T12:00:00.000Z"),
    ...overrides,
  };
}

test("P7 Rating Scales: pure instrument scoring and critical safety flags", () => {
  // 1. PHQ-9 standard vs item 9 endorsement
  const phqMild = PHQ9_INSTRUMENT.interpret(6, { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 0, 8: 0, 9: 0 });
  assert.equal(phqMild.severity, "Mild Depression");
  assert.equal(phqMild.flags.length, 0);

  const phqFlagged = PHQ9_INSTRUMENT.interpret(14, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 1, 7: 1, 8: 0, 9: 2 });
  assert.equal(phqFlagged.severity, "Moderate Depression");
  assert.equal(phqFlagged.flags.length, 1);
  assert.match(phqFlagged.flags[0], /POSITIVE ITEM 9/);

  // 2. GAD-7 scoring
  const gadSevere = GAD7_INSTRUMENT.interpret(17, {});
  assert.equal(gadSevere.severity, "Severe Anxiety");

  // 3. ASRS v1.1 Part A threshold logic
  // Q1-3 threshold is >=2, Q4-6 threshold is >=3. 4 threshold items = positive screen.
  const asrsPositive = ASRS_INSTRUMENT.interpret(35, { 1: 3, 2: 2, 3: 2, 4: 3, 5: 1, 6: 1 });
  assert.equal(asrsPositive.severity, "Positive ADHD Screen");

  const asrsNegative = ASRS_INSTRUMENT.interpret(15, { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 });
  assert.equal(asrsNegative.severity, "Negative ADHD Screen");

  // 4. C-SSRS suicide risk grading
  const cssrsHighRisk = CSSRS_INSTRUMENT.interpret(5, { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 0 });
  assert.match(cssrsHighRisk.severity, /High Risk/);
  assert.ok(cssrsHighRisk.flags.some((f) => f.includes("CRITICAL")));

  // 5. currentSafetyFlags helper
  const dummyAssessment: AssessmentRecord = {
    id: "asmt-1",
    patientId: "patient-synthetic",
    instrument: "phq-9",
    instrumentVersion: "1.0",
    title: "PHQ-9",
    totalScore: 14,
    maxScore: 27,
    severity: "Moderate Depression",
    responses: { 9: 2 },
    flags: ["POSITIVE ITEM 9 (Score 2): Suicidal or self-injurious thoughts endorsed."],
    source: "clinician",
    administeredBy: "Dr. Taylor",
    administeredAt: "2026-09-27T10:00:00Z",
    reviewStatus: "pending-review",
    createdAt: "2026-09-27T10:00:00Z",
    updatedAt: "2026-09-27T10:00:00Z",
  };
  const safety = currentSafetyFlags([dummyAssessment]);
  assert.equal(safety.length, 1);
  assert.match(safety[0].flag, /POSITIVE ITEM 9/);
});

test("P7 Readiness: assessments readiness step detects needed, recorded, and review states", () => {
  // No assessments recorded -> needed
  const stepsEmpty = computeIntakeChecklist(baseInput({ assessments: [] }));
  const stepEmpty = stepsEmpty.find((s) => s.id === "assessments");
  assert.ok(stepEmpty);
  assert.equal(stepEmpty.state, "needed");
  assert.match(stepEmpty.detail, /Baseline clinical assessments/);

  // Normal completed assessment -> recorded
  const stepsRecorded = computeIntakeChecklist(
    baseInput({
      assessments: [
        {
          id: "asmt-clean",
          patientId: "patient-synthetic",
          instrument: "gad-7",
          instrumentVersion: "1.0",
          title: "GAD-7 (Generalized Anxiety Disorder)",
          totalScore: 6,
          maxScore: 21,
          severity: "Mild Anxiety",
          responses: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 0 },
          flags: [],
          source: "clinician",
          administeredBy: "Dr. Taylor",
          administeredAt: "2026-09-27T10:00:00Z",
          reviewStatus: "reviewed",
          createdAt: "2026-09-27T10:00:00Z",
          updatedAt: "2026-09-27T10:00:00Z",
        },
      ],
    }),
  );
  const stepRecorded = stepsRecorded.find((s) => s.id === "assessments");
  assert.ok(stepRecorded);
  assert.equal(stepRecorded.state, "recorded");
  assert.match(stepRecorded.detail, /GAD-7/);
  assert.match(stepRecorded.detail, /Mild Anxiety/);

  // Assessment with critical safety flag -> review state with warning
  const stepsReview = computeIntakeChecklist(
    baseInput({
      assessments: [
        {
          id: "asmt-flagged",
          patientId: "patient-synthetic",
          instrument: "phq-9",
          instrumentVersion: "1.0",
          title: "PHQ-9",
          totalScore: 16,
          maxScore: 27,
          severity: "Moderately Severe Depression",
          responses: { 9: 2 },
          flags: ["POSITIVE ITEM 9 (Score 2): Suicidal or self-injurious thoughts endorsed."],
          source: "clinician",
          administeredBy: "Dr. Taylor",
          administeredAt: "2026-09-27T10:00:00Z",
          reviewStatus: "pending-review",
          createdAt: "2026-09-27T10:00:00Z",
          updatedAt: "2026-09-27T10:00:00Z",
        },
      ],
    }),
  );
  const stepReview = stepsReview.find((s) => s.id === "assessments");
  assert.ok(stepReview);
  assert.equal(stepReview.state, "review");
  assert.match(stepReview.detail, /safety alert/i);
});

test("P7 Service & Repository: assessment continuity, consent signatures, and form review lifecycle", async () => {
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-intake-p7-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-intake-p7-secret-0123456789";

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

    const orgId = await grantSyntheticOrganizationAccess(["staff-alex"], {
      role: "staff",
      patientAccessScope: "organization",
    });

    const staffActor = {
      userId: "staff-alex",
      organizationId: orgId,
      email: "alex@example.test",
      role: "staff" as const,
      membershipRole: "member" as const,
      patientAccessScope: "organization" as const,
      displayName: "Alex Rivera",
      capabilities: ["edit_patient" as const, "read_clinical" as const, "manage_clinical_record" as const],
    };
    const context = { source: "ui" as const, requestId: "req-p7-test" };

    // 1. Create a prospective person for pre-chart intake
    const prospect = prospectivePersonService.create(
      {
        name: "Morgan Prechart",
        dob: "1994-06-18",
        email: "morgan@example.test",
        mobilePhone: "555-010-4444",
      },
      staffActor,
      context,
    );
    assert.ok(prospect.id);

    // 2. Record pre-chart assessment (PHQ-9 with item 9 endorsement)
    const asmt = intakeService.recordAssessment(staffActor, context, {
      prospectivePersonId: prospect.id,
      instrument: "phq-9",
      responses: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 1, 6: 1, 7: 1, 8: 1, 9: 2 },
      notes: "Pre-intake evaluation; patient endorses passive thoughts of self-harm.",
    });
    assert.equal(asmt.totalScore, 14);
    assert.equal(asmt.severity, "Moderate Depression");
    assert.equal(asmt.flags.length, 1);
    assert.match(asmt.flags[0], /POSITIVE ITEM 9/);
    assert.equal(asmt.reviewStatus, "reviewed"); // Recorded by clinician is verified

    // Verify assessment can be retrieved by subject
    const subjectAsmts = MeasurementRepository.listAssessmentsBySubject({ prospectivePersonId: prospect.id });
    assert.equal(subjectAsmts.length, 1);
    assert.equal(subjectAsmts[0].id, asmt.id);

    // 2b. Sign consent as a prospective person before chart promotion
    const consentTemplates = IntakeRepository.listActiveConsentTemplates();
    assert.ok(consentTemplates.length >= 2);
    const hipaaTemplate = consentTemplates.find((t) => t.id === "hipaa-notice") || consentTemplates[0];
    const teleTemplate = consentTemplates.find((t) => t.id === "telehealth-informed-consent") || consentTemplates[1];

    // Method A: Drawn canvas signature on prospective person
    const sampleCanvasPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const drawnSig = intakeService.recordConsentSignature(staffActor, context, {
      prospectivePersonId: prospect.id,
      templateId: hipaaTemplate.id,
      signerName: "Morgan Prechart",
      signerRelationship: "self",
      method: "drawn_canvas",
      signatureData: sampleCanvasPng,
    });
    assert.equal(drawnSig.method, "drawn_canvas");
    assert.equal(drawnSig.signatureData, sampleCanvasPng);

    // 3. Promote prospective person to patient chart and verify continuity
    const promoteResult = prospectivePersonService.promote(staffActor, context, {
      prospectiveId: prospect.id,
      mode: "create",
    });
    assert.ok(promoteResult.patient.id);

    // After promotion, assessment must be linked to the new patient chart
    const patientAsmts = MeasurementRepository.listAssessmentsBySubject({ patientId: promoteResult.patient.id });
    assert.equal(patientAsmts.length, 1);
    assert.equal(patientAsmts[0].id, asmt.id);
    assert.equal(patientAsmts[0].patientId, promoteResult.patient.id);

    // 4. Record consent signatures with multiple methods on promoted patient chart

    // Method B: Typed legal attestation signature
    const typedStatement = "Digitally acknowledged and certified by Morgan Prechart on 2026-09-27T14:00:00Z";
    const typedSig = intakeService.recordConsentSignature(staffActor, context, {
      patientId: promoteResult.patient.id,
      templateId: teleTemplate.id,
      signerName: "Morgan Prechart",
      signerRelationship: "self",
      method: "typed_attestation",
      attestationStatement: typedStatement,
    });
    assert.equal(typedSig.method, "typed_attestation");
    assert.equal(typedSig.attestationStatement, typedStatement);

    // Verify signatures are projected on subject (both pre-chart and post-promotion)
    const subjectSigs = IntakeRepository.listSignedConsents({ patientId: promoteResult.patient.id });
    assert.equal(subjectSigs.length, 2);
    const prechartFound = subjectSigs.find((s) => s.id === drawnSig.id);
    assert.ok(prechartFound, "Pre-chart consent signature must resolve via promoted patient ID");
    assert.equal(prechartFound.prospectivePersonId, prospect.id);

    // 5. Custom Form Template creation and version update
    const createdTemplate = intakeService.createFormTemplate(staffActor, context, {
      title: "Psychiatric Symptom Screening & Background",
      category: "psychiatric_history",
      active: true,
      sections: [
        {
          id: "symptom_triggers",
          title: "Symptom Triggers & Environment",
          fields: [
            { id: "primary_stressors", label: "What are your primary daily stressors?", type: "textarea", required: true },
            { id: "sleep_hours", label: "Average hours of sleep per night", type: "text", required: false },
          ],
        },
      ],
    });
    assert.ok(createdTemplate.id);
    assert.equal(createdTemplate.version, 1);

    // Update template (schema change increments version)
    const updatedTemplate = intakeService.updateFormTemplate(staffActor, context, createdTemplate.id, {
      title: "Comprehensive Psychiatric Symptom & Background Form",
      sections: [
        ...createdTemplate.sections,
        {
          id: "family_support",
          title: "Social & Family Support",
          fields: [{ id: "emergency_contact_rel", label: "Support Network Relationship", type: "text" }],
        },
      ],
    });
    assert.equal(updatedTemplate.version, 2);
    assert.equal(updatedTemplate.sections.length, 2);

    // 6. Form submission and clinical review sign-off
    const submission = intakeService.saveFormSubmission(staffActor, context, {
      patientId: promoteResult.patient.id,
      templateId: updatedTemplate.id,
      answers: {
        primary_stressors: "Work deadline pressure and sleep schedule disruption.",
        sleep_hours: "5.5",
        emergency_contact_rel: "Spouse",
      },
      status: "submitted",
    });
    assert.equal(submission.status, "submitted");

    // Review form submission
    const reviewed = intakeService.reviewFormSubmission(
      staffActor,
      context,
      submission.id,
      "Reviewed prior to initial consultation; sleep deprivation correlates with anxiety symptoms.",
    );
    assert.equal(reviewed.status, "reviewed");
    assert.equal(reviewed.reviewedByName, "Alex Rivera");
    assert.ok(reviewed.reviewedAt);
    assert.match(reviewed.reviewNotes || "", /sleep deprivation/);

    // 7. Verify Audit Log Trail
    const recentAudit = AuditRepository.getRecent(100);
    const eventTypes = recentAudit.map((e) => e.eventType);
    assert.ok(eventTypes.includes("clinical_assessment_recorded"));
    assert.ok(eventTypes.includes("intake_consent_signed"));
    assert.ok(eventTypes.includes("intake_form_submission_saved"));
    assert.ok(eventTypes.includes("intake_form_submission_reviewed"));
  } finally {
    process.chdir(originalCwd);
    env.NODE_ENV = originalNodeEnv;
    env.EHR_SESSION_SECRET = originalSecret;
  }
});
