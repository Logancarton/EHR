import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "login should set an EHR session cookie");
  return setCookie.split(";", 1)[0];
}

test("Phase 4D medication reconciliation intelligence remains advisory and patient-bound", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-med-reconciliation-intelligence-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-med-reconciliation-intelligence-secret-0123456789abcdef";

  try {
    const [
      { POST: loginPost },
      { GET: reconciliationGet, POST: reconciliationPost },
      { POST: clinicalPost },
      { POST: contextPost },
      { ClinicalRecordRepository },
      { MedicationReconciliationRepository },
      { ContextAssembler },
      { AuditRepository },
      { getDatabase },
      { omniboxPlannerService },
    ] = await Promise.all([
      import("../app/api/auth/login/route"),
      import("../app/api/medication-reconciliation/route"),
      import("../app/api/clinical-records/route"),
      import("../app/api/context/route"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/repositories/medication-reconciliation-repository"),
      import("../app/server/context/context-assembler"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/db/connection"),
      import("../app/server/ai/omnibox-planner"),
    ]);

    const patientA = "maya-chen";
    const patientB = "jordan-reed";
    const db = getDatabase();

    const providerLogin = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "team-taylor" }),
    }));
    assert.equal(providerLogin.status, 200);
    const providerCookie = cookieFrom(providerLogin);

    async function clinicalMutation(type: string, payload: Record<string, unknown>, expectedPatientId = patientA) {
      return clinicalPost(new Request("http://ehr.local/api/clinical-records", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: providerCookie,
          "x-ehr-patient-id": expectedPatientId,
        },
        body: JSON.stringify({ type, payload }),
      }));
    }

    async function reconciliationMutation(
      type: string,
      payload: Record<string, unknown>,
      expectedPatientId = patientA,
      extraHeaders: Record<string, string> = {},
    ) {
      return reconciliationPost(new Request("http://ehr.local/api/medication-reconciliation", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: providerCookie,
          "x-ehr-patient-id": expectedPatientId,
          ...extraHeaders,
        },
        body: JSON.stringify({ type, payload }),
      }));
    }

    async function loadReview() {
      const response = await reconciliationGet(new Request(
        `http://ehr.local/api/medication-reconciliation?patientId=${patientA}`,
        { headers: { cookie: providerCookie, "x-ehr-patient-id": patientA } },
      ));
      assert.equal(response.status, 200);
      return response.json() as Promise<any>;
    }

    const medResponse = await clinicalMutation("add_medication", {
      patientId: patientA,
      displayText: "Sertraline 50 mg daily",
      medicationName: "Sertraline",
      genericName: "Sertraline",
      strength: "50 mg",
      dose: "50 mg",
      route: "oral",
      frequency: "daily",
    });
    assert.equal(medResponse.status, 201);
    const authoritative = (await medResponse.json() as any).result;

    const medCountBeforeEvidence = (db.prepare("SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?")
      .get(patientA) as { n: number }).n;

    const rawDoseEvidence = "Patient reports sertraline 100 mg nightly";
    const candidateResponse = await reconciliationMutation("record_medication_candidate", {
      patientId: patientA,
      sourceType: "patient-reported",
      sourceSystem: "patient-report",
      evidenceType: "patient-report",
      displayText: rawDoseEvidence,
      medicationName: "Sertraline",
      genericName: "Sertraline",
      strength: "100 mg",
      dose: "100 mg",
      route: "oral",
      frequency: "nightly",
      observedAt: "2026-09-07T19:30:00-07:00",
    }, patientA, { "x-ehr-user-id": "forged-user", "x-ehr-role": "staff" });
    assert.equal(candidateResponse.status, 201);
    const doseCandidate = (await candidateResponse.json() as any).result;
    assert.equal(doseCandidate.status, "pending");
    assert.equal(doseCandidate.raw_evidence_text, rawDoseEvidence);
    assert.equal(doseCandidate.created_by, "Taylor Brooks, PMHNP-BC", "candidate actor remains server-derived");

    const medCountAfterEvidence = (db.prepare("SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?")
      .get(patientA) as { n: number }).n;
    assert.equal(medCountAfterEvidence, medCountBeforeEvidence, "recording evidence remains non-authoritative");
    assert.equal(ClinicalRecordRepository.medications(patientA).find((med: any) => med.id === authoritative.id)?.dose, "50 mg");

    let reviewBody = await loadReview();
    const doseReview = reviewBody.reviews.find((review: any) => review.candidate.id === doseCandidate.id);
    assert.equal(doseReview.suggestion.confidence, "likely");
    assert.equal(doseReview.suggestion.medicationId, authoritative.id);
    assert.ok(doseReview.deltas.some((delta: any) => delta.kind === "dose-difference"));
    assert.match(doseReview.conflictSignal, /dose discrepancy/i);
    assert.equal(MedicationReconciliationRepository.getById(doseCandidate.id)?.status, "pending", "advisory matching does not reconcile");

    let context = ContextAssembler.assemble({
      patientId: patientA,
      surface: "medication-review",
      userRole: "provider",
      tokenBudget: 2500,
    });
    assert.ok(context);
    assert.ok(context.activeMedications.includes("Sertraline 50 mg daily"));
    assert.ok(!context.activeMedications.includes(rawDoseEvidence), "pending evidence never enters activeMedications");
    assert.equal(context.pendingMedicationCandidates?.length, 1);
    assert.equal(context.pendingMedicationCandidates?.[0].authority, "evidence");
    assert.equal(context.pendingMedicationCandidates?.[0].rawEvidenceText, rawDoseEvidence);
    assert.equal(context.pendingMedicationCandidates?.[0].advisory.authority, "advisory");
    assert.equal(context.pendingMedicationCandidates?.[0].advisory.suggestedMedicationId, authoritative.id);

    const otherPatientContext = ContextAssembler.assemble({
      patientId: patientB,
      surface: "medication-review",
      userRole: "provider",
    });
    assert.ok(!otherPatientContext?.pendingMedicationCandidates?.some((candidate) => candidate.candidateId === doseCandidate.id));

    const staffContext = ContextAssembler.assemble({
      patientId: patientA,
      surface: "medication-review",
      userRole: "staff",
    });
    assert.deepEqual(staffContext?.activeMedications, []);
    assert.equal(staffContext?.pendingMedicationCandidates, undefined, "medication evidence follows existing role filtering");

    const forgedContextResponse = await contextPost(new Request("http://ehr.local/api/context", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: providerCookie,
        "x-ehr-patient-id": patientA,
        "x-ehr-user-id": "forged-user",
        "x-ehr-role": "staff",
      },
      body: JSON.stringify({
        patientId: patientA,
        surface: "medication-review",
        userRole: "staff",
      }),
    }));
    assert.equal(forgedContextResponse.status, 200);
    const forgedContext = (await forgedContextResponse.json() as any).context;
    assert.equal(forgedContext.userRole, "provider", "context role is derived from the authenticated server session");
    assert.ok(forgedContext.pendingMedicationCandidates.some((candidate: any) => candidate.candidateId === doseCandidate.id));

    const wrongPatientContext = await contextPost(new Request("http://ehr.local/api/context", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: providerCookie,
        "x-ehr-patient-id": patientB,
      },
      body: JSON.stringify({ patientId: patientA, surface: "medication-review" }),
    }));
    assert.equal(wrongPatientContext.status, 409, "wrong-patient AI context fails closed");

    const editedLabel = "Sertraline 100 mg nightly";
    const editResponse = await reconciliationMutation("edit_medication_candidate", {
      candidateId: doseCandidate.id,
      patch: {
        displayText: editedLabel,
        medicationName: "Sertraline",
        genericName: "Sertraline",
        strength: "100 mg",
        dose: "100 mg",
        route: "oral",
        frequency: "nightly",
      },
    }, patientA, { "x-ehr-user-id": "forged-editor", "x-ehr-role": "staff" });
    assert.equal(editResponse.status, 201);
    const edited = (await editResponse.json() as any).result;
    assert.equal(edited.raw_evidence_text, rawDoseEvidence, "editing interpretation preserves original source evidence");
    assert.equal(edited.display_text, editedLabel);
    assert.equal(edited.dose, "100 mg");
    assert.equal(ClinicalRecordRepository.medications(patientA).find((med: any) => med.id === authoritative.id)?.dose, "50 mg", "candidate editing cannot mutate medication truth");

    const candidateVersions = ClinicalRecordRepository.versions("medication-candidate", doseCandidate.id);
    const candidateProvenance = ClinicalRecordRepository.provenance("medication-candidate", doseCandidate.id);
    assert.ok(candidateVersions.some((version: any) => version.operation === "edit-interpretation"));
    assert.ok(candidateProvenance.some((event: any) => event.activity === "edit-interpretation"));
    assert.ok(candidateVersions.every((version: any) => version.snapshot.raw_evidence_text === rawDoseEvidence));
    const editAudit = AuditRepository.getRecent(100, patientA)
      .find((entry) => entry.eventType === "medication_candidate_interpretation_edited");
    assert.ok(editAudit);
    assert.equal(editAudit?.userName, "Taylor Brooks, PMHNP-BC", "candidate edit attribution ignores forged actor headers");

    const wrongPatientEdit = await reconciliationMutation("edit_medication_candidate", {
      candidateId: doseCandidate.id,
      patch: { dose: "999 mg" },
    }, patientB);
    assert.equal(wrongPatientEdit.status, 409, "wrong active patient cannot edit another patient's evidence");
    assert.equal(MedicationReconciliationRepository.getById(doseCandidate.id)?.dose, "100 mg");

    const stoppedRaw = "Patient reports sertraline was stopped two weeks ago";
    const stoppedResponse = await reconciliationMutation("record_medication_candidate", {
      patientId: patientA,
      sourceType: "patient-reported",
      sourceSystem: "patient-report",
      evidenceType: "stopped-medication-report",
      displayText: stoppedRaw,
      medicationName: "Sertraline",
      genericName: "Sertraline",
    });
    assert.equal(stoppedResponse.status, 201);
    const stoppedCandidate = (await stoppedResponse.json() as any).result;
    reviewBody = await loadReview();
    const stoppedReview = reviewBody.reviews.find((review: any) => review.candidate.id === stoppedCandidate.id);
    assert.ok(stoppedReview.deltas.some((delta: any) => delta.kind === "active-vs-stopped-conflict"));
    assert.match(stoppedReview.conflictSignal, /chart still lists it active/i);
    assert.equal(MedicationReconciliationRepository.getById(stoppedCandidate.id)?.status, "pending");

    const medCountBeforeAi = (db.prepare("SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?")
      .get(patientA) as { n: number }).n;
    const aiPlan = await omniboxPlannerService.plan({
      query: "What medication evidence says the patient stopped a medication?",
      activePatientId: patientA,
      expectedPatientId: patientA,
    }, {
      userId: "team-taylor",
      displayName: "Taylor Brooks",
      credentials: "PMHNP-BC",
      role: "provider",
    });
    assert.match(aiPlan.answer || "", /pending non-authoritative evidence/i);
    assert.match(aiPlan.answer || "", /clinician reconciliation is required/i);
    assert.equal(aiPlan.safety.mutatesClinicalRecord, false);
    assert.equal(aiPlan.proposals.length, 0, "reconciliation reasoning does not become an executable medication proposal");
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?").get(patientA) as { n: number }).n,
      medCountBeforeAi,
      "AI reasoning cannot mutate authoritative medications",
    );
    assert.equal(MedicationReconciliationRepository.getById(stoppedCandidate.id)?.status, "pending");

    const duplicateMedicationResponse = await clinicalMutation("add_medication", {
      patientId: patientA,
      displayText: "Sertraline 25 mg each morning (synthetic duplicate-name record)",
      medicationName: "Sertraline",
      genericName: "Sertraline",
      dose: "25 mg",
      frequency: "each morning",
    });
    assert.equal(duplicateMedicationResponse.status, 201);

    const ambiguousResponse = await reconciliationMutation("record_medication_candidate", {
      patientId: patientA,
      sourceType: "imported-record",
      sourceSystem: "synthetic-import",
      evidenceType: "medication-history",
      displayText: "Imported sertraline evidence with ambiguous target",
      medicationName: "Sertraline",
      genericName: "Sertraline",
    });
    assert.equal(ambiguousResponse.status, 201);
    const ambiguousCandidate = (await ambiguousResponse.json() as any).result;
    reviewBody = await loadReview();
    const ambiguousReview = reviewBody.reviews.find((review: any) => review.candidate.id === ambiguousCandidate.id);
    assert.equal(ambiguousReview.suggestion.confidence, "possible");
    assert.equal(ambiguousReview.suggestion.medicationId, null, "ambiguous advisory matching never selects a target");
    assert.ok(ambiguousReview.suggestion.alternatives.length >= 2);
    assert.equal(MedicationReconciliationRepository.getById(ambiguousCandidate.id)?.status, "pending");

    const explicitUpdate = await reconciliationMutation("reconcile_medication_candidate", {
      candidateId: doseCandidate.id,
      decision: "update",
      medicationId: authoritative.id,
    });
    assert.equal(explicitUpdate.status, 201);
    const reconciled = (await explicitUpdate.json() as any).result;
    assert.equal(reconciled.candidate.status, "accepted");
    assert.equal(reconciled.candidate.decision, "update");
    assert.equal(reconciled.candidate.raw_evidence_text, rawDoseEvidence);
    assert.equal(reconciled.candidate.linked_medication_id, authoritative.id);
    assert.equal(reconciled.medication.display_text, editedLabel);
    assert.equal(reconciled.medication.dose, "100 mg");
    assert.ok(reconciled.candidate.resolved_by);
    assert.ok(reconciled.candidate.resolved_at);

    reviewBody = await loadReview();
    const resolvedHistory = reviewBody.candidates.find((candidate: any) => candidate.id === doseCandidate.id);
    assert.equal(resolvedHistory.status, "accepted");
    assert.equal(resolvedHistory.decision, "update");
    assert.equal(resolvedHistory.linked_medication_id, authoritative.id);
    assert.equal(resolvedHistory.raw_evidence_text, rawDoseEvidence);

    context = ContextAssembler.assemble({
      patientId: patientA,
      surface: "medication-review",
      userRole: "provider",
    });
    assert.ok(context?.activeMedications.includes(editedLabel), "only the explicit reconciliation result becomes authoritative context");
    assert.ok(!context?.pendingMedicationCandidates?.some((candidate) => candidate.candidateId === doseCandidate.id));
    assert.ok(context?.pendingMedicationCandidates?.some((candidate) => candidate.candidateId === stoppedCandidate.id));

    const previousNodeEnv = env.NODE_ENV;
    env.NODE_ENV = "production";
    const unauthenticatedContext = await contextPost(new Request("http://ehr.local/api/context", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ehr-patient-id": patientA,
      },
      body: JSON.stringify({ patientId: patientA, surface: "medication-review", userRole: "provider" }),
    }));
    assert.equal(unauthenticatedContext.status, 401, "production AI context requires an authenticated session");
    env.NODE_ENV = previousNodeEnv;
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
