import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Intake truth-continuity (D-077): a prospective person can now complete
 * government-ID, insurance-card, and coverage evidence before a clinical
 * chart exists, and that evidence becomes the SAME durable
 * document/insurance_policies row after promotion — never copied, never a
 * parallel prospect-only store. See docs/DECISIONS.md D-077.
 */
test("Intake: prospect-stage documents and coverage carry through promotion as the same rows", async () => {
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-intake-continuity-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-intake-continuity-secret-0123456789";

  try {
    const [
      { grantSyntheticOrganizationAccess },
      { PatientRepository },
      { AuditRepository },
      { ClinicalRecordRepository },
      { intakeService, IntakeError },
      { prospectivePersonService },
      { workflowService },
      { getDatabase },
    ] = await Promise.all([
      import("./helpers/organization-access"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/services/intake-service"),
      import("../app/server/services/prospective-person-service"),
      import("../app/server/services/workflow-service"),
      import("../app/server/db/connection"),
    ]);

    const orgId = await grantSyntheticOrganizationAccess(["staff-jordan"], { role: "staff", patientAccessScope: "organization" });
    const otherOrgId = await grantSyntheticOrganizationAccess(["staff-outside"], {
      organizationId: "org-outside-continuity",
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

    /* ============================================================ *
     * SETUP — a prospect with a tentative hold, no chart
     * ============================================================ */

    const prospect = prospectivePersonService.create(
      { name: "Casey Prospect", dob: "1997-06-15", mobilePhone: "555-444-2222", email: "casey.prospect@example.test" },
      staff,
      context,
    );
    workflowService.createAppointment(
      { id: "apt-continuity-1", patientId: prospect.id, date: "2026-09-30", time: "09:00 AM", type: "60-min Intake", status: "tentative", chiefComplaint: "New patient intake" } as any,
      staff,
      context,
    );
    const subject = { prospectivePersonId: prospect.id };

    /* ============================================================ *
     * DOCUMENTS
     * ============================================================ */

    let detail = intakeService.getDetail(staff, prospect.id);
    assert.equal(detail.steps.find((s) => s.id === "government_id")!.state, "needed", "no ID on file yet");

    const idDoc = intakeService.uploadDocument(staff, context, {
      ...subject,
      documentType: "government_id_front",
      title: "Government ID — front",
      contentText: "Synthetic driver's license image placeholder",
    });
    assert.equal(idDoc.patient_id, null, "a prospect document has no patient_id yet");
    assert.equal(idDoc.prospective_person_id, prospect.id, "the document is bound to the prospect");
    assert.equal(idDoc.current_version, 1);

    // Cross-tenant access is denied even though the document is administrative, not clinical.
    assert.throws(() => intakeService.uploadDocument(outsideStaff, context, { ...subject, documentType: "government_id_front", title: "x" }));

    // Document workflow events work pre-chart: received -> needs_review -> reviewed.
    intakeService.transitionDocument(staff, context, { documentId: idDoc.id, toStatus: "needs_review" });
    const reviewedResult = intakeService.transitionDocument(staff, context, { documentId: idDoc.id, toStatus: "reviewed" });
    assert.equal(reviewedResult.document.workflow_status, "reviewed");
    assert.equal((reviewedResult.event as any)?.prospective_person_id, prospect.id, "the workflow event itself is subject-bound");

    // Document review != identity confirmation, still — even pre-chart.
    detail = intakeService.getDetail(staff, prospect.id);
    assert.equal(detail.steps.find((s) => s.id === "government_id")!.state, "needed", "reviewed is not the same as identity confirmed");

    /* ============================================================ *
     * IDENTITY
     * ============================================================ */

    const conflictReview = intakeService.recordIdentityDocumentReview(staff, context, {
      ...subject,
      documentId: idDoc.id,
      result: "conflict",
      legible: true,
      conflictNote: "Name on ID does not match name given at intake.",
    });
    assert.equal(conflictReview.result, "conflict");
    detail = intakeService.getDetail(staff, prospect.id);
    assert.equal(detail.steps.find((s) => s.id === "government_id")!.state, "review", "a conflict stays unresolved, not silently accepted");

    const confirmedReview = intakeService.recordIdentityDocumentReview(staff, context, {
      ...subject,
      documentId: idDoc.id,
      result: "confirmed",
      legible: true,
    });
    assert.equal(confirmedReview.result, "confirmed");
    detail = intakeService.getDetail(staff, prospect.id);
    assert.equal(detail.steps.find((s) => s.id === "government_id")!.state, "recorded", "explicit prospect identity confirmation works before a chart exists");

    // A superseding upload reopens the requirement — the old review no longer names the current document.
    const replacementDoc = intakeService.uploadDocument(staff, context, { ...subject, documentType: "government_id_front", title: "Government ID — front (retake)", contentText: "Clearer synthetic image" });
    intakeService.transitionDocument(staff, context, { documentId: idDoc.id, toStatus: "filed" });
    intakeService.transitionDocument(staff, context, {
      documentId: idDoc.id,
      toStatus: "superseded",
      supersededByDocumentId: replacementDoc.id,
    });
    detail = intakeService.getDetail(staff, prospect.id);
    assert.equal(detail.steps.find((s) => s.id === "government_id")!.state, "needed", "a superseded ID reopens identity confirmation");

    // Re-review the current document so identity is confirmed again before promotion.
    intakeService.recordIdentityDocumentReview(staff, context, { ...subject, documentId: replacementDoc.id, result: "confirmed", legible: true });
    detail = intakeService.getDetail(staff, prospect.id);
    assert.equal(detail.steps.find((s) => s.id === "government_id")!.state, "recorded");

    /* ============================================================ *
     * COVERAGE
     * ============================================================ */

    assert.equal(detail.steps.find((s) => s.id === "insurance_details")!.state, "needed");

    const primaryPolicy = intakeService.addCoverage(staff, context, {
      ...subject,
      payerName: "Acme Health Plan",
      memberId: "MEM-001",
      groupNumber: "GRP-9",
      coveragePriority: 1,
    });
    assert.equal(primaryPolicy.prospective_person_id, prospect.id);
    assert.equal(primaryPolicy.patient_id, null);

    const secondaryPolicy = intakeService.addCoverage(staff, context, { ...subject, payerName: "Secondary Payer Co", coveragePriority: 2 });
    assert.equal(secondaryPolicy.coverage_priority, 2, "primary/secondary ordering works pre-chart");

    detail = intakeService.getDetail(staff, prospect.id);
    assert.equal(detail.administrative.coverage.length, 2);
    assert.equal(detail.steps.find((s) => s.id === "insurance_details")!.state, "recorded", "coverage on file, distinct from card evidence");
    assert.equal(detail.steps.find((s) => s.id === "insurance_card")!.state, "needed", "insurance policy != card evidence — the card is still outstanding");

    // Self-pay is rejected without a payer name unless explicitly marked self-pay.
    assert.throws(() => intakeService.addCoverage(staff, context, { ...subject, payerName: "" }), IntakeError);
    // Cross-tenant coverage access denied.
    assert.throws(() => intakeService.addCoverage(outsideStaff, context, { ...subject, payerName: "Should Fail" }));

    // Upload and review the insurance card image; the step becomes recorded.
    const cardDoc = intakeService.uploadDocument(staff, context, { ...subject, documentType: "insurance_card_primary", title: "Insurance card — primary", contentText: "Synthetic card image" });
    intakeService.transitionDocument(staff, context, { documentId: cardDoc.id, toStatus: "needs_review" });
    intakeService.transitionDocument(staff, context, { documentId: cardDoc.id, toStatus: "reviewed" });
    const secondaryCardDoc = intakeService.uploadDocument(staff, context, { ...subject, documentType: "insurance_card_secondary", title: "Insurance card — secondary", contentText: "Synthetic card image" });
    intakeService.transitionDocument(staff, context, { documentId: secondaryCardDoc.id, toStatus: "needs_review" });
    intakeService.transitionDocument(staff, context, { documentId: secondaryCardDoc.id, toStatus: "reviewed" });
    detail = intakeService.getDetail(staff, prospect.id);
    assert.equal(detail.steps.find((s) => s.id === "insurance_card")!.state, "recorded", "prospect can satisfy insurance-card evidence before chart");

    /* ============================================================ *
     * PROMOTION — same rows, not copies; conflicts surfaced, not overwritten
     * ============================================================ */

    // An existing chart already has its own active primary coverage — linking
    // must not silently overwrite or merge it away.
    const existingChart = PatientRepository.create(
      {
        id: "patient-existing-casey", mrn: "MRN-EXIST-CASEY", name: "Existing Casey", initials: "EC",
        dob: "1997-06-15", age: 29, pronouns: "", status: "Established",
        diagnoses: [], allergies: [], meds: [], vitals: {}, lastVisit: "2026-01-01", nextVisit: "Unscheduled",
        contact: { mobilePhone: "555-000-1111", email: "existing.casey@example.test" },
      } as any,
      orgId,
    );
    ClinicalRecordRepository.addInsurance(
      { patientId: existingChart.id, payerName: "Existing Chart Payer", coveragePriority: 1 },
      { userId: staff.userId, displayName: staff.displayName },
    );

    const { patient } = prospectivePersonService.promote(staff, context, { prospectiveId: prospect.id, mode: "link", existingPatientId: existingChart.id });
    assert.equal(patient.id, existingChart.id);

    // The SAME document rows now carry patient_id, keeping prospective_person_id for provenance.
    const promotedIdDoc = ClinicalRecordRepository.getDocumentById(replacementDoc.id);
    assert.equal(promotedIdDoc.patient_id, patient.id, "the same document becomes accessible from the patient chart");
    assert.equal(promotedIdDoc.prospective_person_id, prospect.id, "prospective-person provenance is preserved, not cleared");
    assert.equal(promotedIdDoc.id, replacementDoc.id, "no new document row was created — the same id carries through");

    // No document/version duplication happened.
    const patientDocsAfter = ClinicalRecordRepository.documents(patient.id);
    const docIds = patientDocsAfter.map((d: any) => d.id);
    assert.equal(new Set(docIds).size, docIds.length, "no duplicate document rows after promotion");
    const versions = ClinicalRecordRepository.documentVersions(replacementDoc.id);
    assert.equal(versions.length, 1, "no duplicate document version was created by promotion");

    // The superseded original document is also now reachable from the chart (history preserved).
    const promotedSupersededDoc = ClinicalRecordRepository.getDocumentById(idDoc.id);
    assert.equal(promotedSupersededDoc.patient_id, patient.id);
    assert.equal(promotedSupersededDoc.workflow_status, "superseded");

    // Coverage: the same policy rows carry through, and the pre-existing
    // chart's own primary policy is untouched — both are visible, nothing
    // was silently overwritten.
    const patientCoverage = ClinicalRecordRepository.insurance(patient.id);
    const payerNames = patientCoverage.map((c: any) => c.payer_name).sort();
    assert.deepEqual(payerNames, ["Acme Health Plan", "Existing Chart Payer", "Secondary Payer Co"].sort(), "prospect coverage is added, not merged into or replacing the existing chart's policy");
    const acmeRow = patientCoverage.find((c: any) => c.payer_name === "Acme Health Plan");
    assert.equal(acmeRow.id, primaryPolicy.id, "the same coverage row carries through promotion");
    assert.equal(acmeRow.prospective_person_id, prospect.id, "coverage provenance is preserved");

    // Promotion itself did not satisfy any missing evidence — payment, consents, forms remain outstanding.
    const postPromotionDetail = intakeService.getDetail(staff, patient.id);
    assert.equal(postPromotionDetail.steps.find((s) => s.id === "payment")!.state, "needed");

    // Promotion audit records the relink counts.
    const promotionAudit = AuditRepository.getRecent(20, patient.id).find((e) => e.eventType === "prospective_person_promoted");
    assert.ok(promotionAudit);
    assert.ok((promotionAudit!.metadata as any).relinkedDocuments >= 2);
    assert.ok((promotionAudit!.metadata as any).relinkedCoverage >= 2);

    /* ============================================================ *
     * PROMOTION IS IDEMPOTENT — retry does not duplicate anything
     * ============================================================ */

    const beforeRetryDocCount = ClinicalRecordRepository.documents(patient.id).length;
    const beforeRetryCoverageCount = ClinicalRecordRepository.insurance(patient.id).length;
    // Direct idempotency check on the relink primitives themselves (promote()
    // itself already fails closed on an already-promoted prospect, exercised
    // in tests/intake-workflow.test.ts — this confirms the underlying relink
    // operations are also safe to call again without side effects).
    const secondRelinkDocs = ClinicalRecordRepository.linkDocumentsToPatient(prospect.id, patient.id);
    const secondRelinkCoverage = ClinicalRecordRepository.linkInsuranceToPatient(prospect.id, patient.id);
    assert.equal(secondRelinkDocs, 0, "retrying the document relink touches nothing already linked");
    assert.equal(secondRelinkCoverage, 0, "retrying the coverage relink touches nothing already linked");
    assert.equal(ClinicalRecordRepository.documents(patient.id).length, beforeRetryDocCount);
    assert.equal(ClinicalRecordRepository.insurance(patient.id).length, beforeRetryCoverageCount);

    /* ============================================================ *
     * LEGACY PATIENT-BOUND DOCUMENT/COVERAGE BEHAVIOR IS UNCHANGED
     * ============================================================ */

    const legacyDoc = ClinicalRecordRepository.createDocument(
      { patientId: existingChart.id, documentType: "eval_report", title: "Legacy-path document", contentText: "unchanged behavior" },
      { userId: staff.userId, displayName: staff.displayName },
    );
    assert.equal(legacyDoc.patient_id, existingChart.id);
    assert.equal(ClinicalRecordRepository.documents(existingChart.id).some((d: any) => d.id === legacyDoc.id), true);

    /* ============================================================ *
     * ORPHAN / INTEGRITY CHECK
     * ============================================================ */

    const db = getDatabase();
    const orphanDocs = db.prepare(`SELECT COUNT(*) AS n FROM documents WHERE patient_id IS NULL AND prospective_person_id IS NULL`).get() as { n: number };
    assert.equal(orphanDocs.n, 0, "no document exists without a subject");
    const orphanPolicies = db.prepare(`SELECT COUNT(*) AS n FROM insurance_policies WHERE patient_id IS NULL AND prospective_person_id IS NULL`).get() as { n: number };
    assert.equal(orphanPolicies.n, 0, "no coverage policy exists without a subject");
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
