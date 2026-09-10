import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "login should set an EHR session cookie");
  return setCookie.split(";", 1)[0];
}

test("Phase 4B medication record is authenticated, patient-bound, lifecycle-safe, and vendor-neutral", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-medication-record-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-medication-record-secret-0123456789abcdef";

  try {
    const [
      { POST: loginPost },
      { GET: clinicalGet, POST: clinicalPost },
      { ClinicalActionGateway },
      { ClinicalRecordRepository },
      { ContextAssembler },
      { AuditRepository },
      { getDatabase },
      { mapExternalMedicationCandidate },
    ] = await Promise.all([
      import("../app/api/auth/login/route"),
      import("../app/api/clinical-records/route"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/context/context-assembler"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/db/connection"),
      import("../app/adapters/prescribing/medication-integration"),
    ]);

    // Patient access is an organization-membership decision. Synthetic actors must
    // declare their membership rather than being exempt from the boundary under test.
    await grantSyntheticOrganizationAccess(["synthetic-readonly", "team-casey", "team-taylor"]);
    type MedicationIntegrationProvider<T> = import("../app/adapters/prescribing/medication-integration").MedicationIntegrationProvider<T>;

    const db = getDatabase();
    const patientA = "maya-chen";
    const patientB = "jordan-reed";
    const medicationLabel = "Phase 4B synthetic vortioxetine 7.5 mg every morning";
    const secondMedicationLabel = "Phase 4B synthetic outside-medication fixture";

    const providerLogin = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "team-taylor" }),
    }));
    assert.equal(providerLogin.status, 200);
    const providerCookie = cookieFrom(providerLogin);

    const assistantLogin = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "team-casey" }),
    }));
    assert.equal(assistantLogin.status, 200);
    const assistantCookie = cookieFrom(assistantLogin);

    async function mutate(
      type: string,
      payload: Record<string, unknown>,
      expectedPatientId = patientA,
      cookie = providerCookie,
      extraHeaders: Record<string, string> = {},
    ) {
      return clinicalPost(new Request("http://ehr.local/api/clinical-records", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
          "x-ehr-patient-id": expectedPatientId,
          ...extraHeaders,
        },
        body: JSON.stringify({ type, payload }),
      }));
    }

    const addResponse = await mutate(
      "add_medication",
      {
        patientId: patientA,
        displayText: medicationLabel,
        medicationName: "Vortioxetine",
        genericName: "vortioxetine",
        strength: "5 mg",
        dose: "7.5 mg",
        route: "oral",
        frequency: "every morning",
        startDate: "2026-09-01",
        prescriber: "Outside synthetic prescriber",
      },
      patientA,
      providerCookie,
      { "x-ehr-user-id": "forged-user", "x-ehr-role": "staff" },
    );
    assert.equal(addResponse.status, 201, "authenticated clinician can add a medication");
    const medication = (await addResponse.json() as any).result;
    assert.equal(medication.patient_id, patientA);
    assert.equal(medication.status, "active");
    assert.equal(medication.recorded_by, "Taylor Brooks, PMHNP-BC", "actor must come from the authenticated server session");
    assert.equal(medication.start_date, "2026-09-01");
    assert.equal(medication.prescriber, "Outside synthetic prescriber");

    const normalized = db.prepare("SELECT * FROM patient_medications WHERE id = ?").get(medication.id) as any;
    assert.ok(normalized, "medication persists in the normalized medication table");
    assert.equal(normalized.display_text, medicationLabel);
    assert.equal(normalized.source_type, "clinician");
    assert.equal(normalized.source_system, "ehr-local");

    const snapshotResponse = await clinicalGet(new Request(
      `http://ehr.local/api/clinical-records?patientId=${patientA}`,
      { headers: { cookie: providerCookie, "x-ehr-patient-id": patientA } },
    ));
    assert.equal(snapshotResponse.status, 200);
    const snapshot = await snapshotResponse.json() as any;
    assert.ok(snapshot.record.medications.some((row: any) => row.id === medication.id), "authoritative snapshot exposes normalized medication records");

    let context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(context?.activeMedications.includes(medicationLabel), "active medication appears in ContextAssembler");

    const editResponse = await mutate("update_medication", {
      recordId: medication.id,
      patch: {
        displayText: "Phase 4B synthetic vortioxetine 10 mg every morning",
        strength: "10 mg",
        dose: "10 mg",
        frequency: "once every morning",
      },
    });
    assert.equal(editResponse.status, 201, "clinician can correct medication metadata");
    const edited = (await editResponse.json() as any).result;
    assert.equal(edited.strength, "10 mg");
    assert.equal(edited.dose, "10 mg");
    assert.equal(edited.frequency, "once every morning");
    const activeDisplay = edited.display_text as string;

    context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(context?.activeMedications.includes(activeDisplay));
    assert.ok(!context?.activeMedications.includes(medicationLabel), "ContextAssembler follows the corrected authoritative display text");

    const discontinueResponse = await mutate("update_medication", {
      recordId: medication.id,
      patch: { status: "discontinued" },
    });
    assert.equal(discontinueResponse.status, 201);
    const discontinued = (await discontinueResponse.json() as any).result;
    assert.equal(discontinued.status, "discontinued");
    assert.match(discontinued.end_date, /^\d{4}-\d{2}-\d{2}$/, "discontinuation supplies a lifecycle end date when omitted");
    context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(!context?.activeMedications.includes(activeDisplay), "discontinued medication does not appear as active");

    const firstHistoryResponse = await clinicalGet(new Request(
      `http://ehr.local/api/clinical-records?patientId=${patientA}&entityType=medication&entityId=${encodeURIComponent(medication.id)}`,
      { headers: { cookie: providerCookie, "x-ehr-patient-id": patientA } },
    ));
    assert.equal(firstHistoryResponse.status, 200);
    const firstHistory = await firstHistoryResponse.json() as any;
    assert.ok(firstHistory.versions.length >= 3, "create, correction, and discontinuation versions remain accessible");
    assert.ok(firstHistory.provenance.length >= 3, "provenance remains present through lifecycle changes");
    assert.equal(firstHistory.versions.at(-1).actor_id, "team-taylor", "version actor is server-derived");

    const reactivateResponse = await mutate("update_medication", {
      recordId: medication.id,
      patch: { status: "active" },
    });
    const reactivated = (await reactivateResponse.json() as any).result;
    assert.equal(reactivated.status, "active");
    assert.equal(reactivated.end_date, null, "reactivation clears obsolete end date");
    context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(context?.activeMedications.includes(activeDisplay), "reactivated medication returns to active context");

    const completeResponse = await mutate("update_medication", {
      recordId: medication.id,
      patch: { status: "completed" },
    });
    const completed = (await completeResponse.json() as any).result;
    assert.equal(completed.status, "completed");
    assert.match(completed.end_date, /^\d{4}-\d{2}-\d{2}$/, "completion retains an appropriate end date");
    context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(!context?.activeMedications.includes(activeDisplay), "completed medication does not appear as active");

    const reactivateCompleted = await mutate("update_medication", {
      recordId: medication.id,
      patch: { status: "active" },
    });
    const activeAgain = (await reactivateCompleted.json() as any).result;
    assert.equal(activeAgain.end_date, null);
    context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(context?.activeMedications.includes(activeDisplay));

    const enteredErrorResponse = await mutate("update_medication", {
      recordId: medication.id,
      patch: { status: "entered-in-error" },
    });
    assert.equal(enteredErrorResponse.status, 201);
    assert.equal((await enteredErrorResponse.json() as any).result.status, "entered-in-error");
    const retained = db.prepare("SELECT * FROM patient_medications WHERE id = ?").get(medication.id) as any;
    assert.ok(retained, "entered-in-error does not physically delete the medication record");
    assert.equal(retained.status, "entered-in-error");
    context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(!context?.activeMedications.includes(activeDisplay), "entered-in-error medication does not appear as active");
    assert.ok(ClinicalRecordRepository.versions("medication", medication.id).length >= 7, "full medication lifecycle remains versioned");
    assert.ok(ClinicalRecordRepository.provenance("medication", medication.id).length >= 7, "full medication lifecycle remains attributable");

    const invalidStatusResponse = await mutate("update_medication", {
      recordId: medication.id,
      patch: { status: "deleted" },
    });
    assert.equal(invalidStatusResponse.status, 400, "unsupported destructive-style statuses are rejected");

    const invalidDateResponse = await mutate("add_medication", {
      patientId: patientA,
      displayText: "Phase 4B invalid date fixture",
      startDate: "2026-02-31",
    });
    assert.equal(invalidDateResponse.status, 400, "invalid medication dates are rejected rather than normalized");

    const secondResponse = await mutate("add_medication", {
      patientId: patientA,
      displayText: secondMedicationLabel,
      medicationName: "Synthetic outside medication",
    });
    assert.equal(secondResponse.status, 201);
    const secondMedication = (await secondResponse.json() as any).result;

    const staleMutation = await mutate(
      "update_medication",
      { recordId: secondMedication.id, patch: { status: "discontinued" } },
      patientB,
    );
    assert.equal(staleMutation.status, 409, "wrong-patient/stale-chart medication mutation fails server-side");
    const stillActive = db.prepare("SELECT status FROM patient_medications WHERE id = ?").get(secondMedication.id) as any;
    assert.equal(stillActive.status, "active");

    const wrongPatientHistory = await clinicalGet(new Request(
      `http://ehr.local/api/clinical-records?patientId=${patientB}&entityType=medication&entityId=${encodeURIComponent(secondMedication.id)}`,
      { headers: { cookie: providerCookie, "x-ehr-patient-id": patientB } },
    ));
    assert.equal(wrongPatientHistory.status, 409, "medication history cannot cross active patient context");

    const assistantResponse = await mutate(
      "add_medication",
      { patientId: patientA, displayText: "Phase 4B assistant synthetic medication" },
      patientA,
      assistantCookie,
      { "x-ehr-user-id": "team-taylor", "x-ehr-role": "provider" },
    );
    assert.equal(assistantResponse.status, 201);
    const assistantMedication = (await assistantResponse.json() as any).result;
    assert.equal(assistantMedication.recorded_by, "Casey Nguyen", "forged provider headers cannot replace the authenticated clinical assistant");
    const assistantAudit = AuditRepository.getRecent(200, patientA).find((entry) => entry.metadata?.entityId === assistantMedication.id);
    assert.equal(assistantAudit?.userId, "team-casey");
    assert.equal(assistantAudit?.userRole, "clinical_assistant");

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor: { userId: "synthetic-readonly", displayName: "Synthetic Readonly", role: "readonly" as any },
        context: { source: "api", requestId: "medication-unauthorized-role" },
        expectedPatientId: patientA,
        action: { type: "add_medication", payload: { patientId: patientA, displayText: "Must not be stored" } },
      }),
      /lacks permission: manage_clinical_record/i,
      "unauthorized runtime roles fail closed using the existing permission architecture",
    );

    const auditEntries = AuditRepository.getRecent(300, patientA).filter((entry) => entry.metadata?.entityId === medication.id);
    assert.ok(auditEntries.some((entry) => entry.eventType === "clinical_fact_created"), "medication creation is audited");
    assert.ok(auditEntries.some((entry) => entry.eventType === "clinical_fact_updated"), "medication lifecycle updates are audited");

    const candidateCountBefore = ClinicalRecordRepository.medications(patientA).length;
    const syntheticProvider: MedicationIntegrationProvider<{ id: string; name: string }> = {
      id: "synthetic-external-provider",
      toMedicationCandidate(payload) {
        return {
          providerId: this.id,
          externalReferenceId: payload.id,
          evidenceType: "dispense",
          displayText: `${payload.name} 20 mg nightly`,
          medicationName: payload.name,
          strength: "20 mg",
          frequency: "nightly",
          observedAt: "2026-09-07T18:00:00Z",
        };
      },
    };
    const candidate = mapExternalMedicationCandidate(syntheticProvider, { id: "fill-001", name: "Atorvastatin" });
    assert.ok(candidate, "external adapter can normalize vendor data into a reconciliation candidate");
    assert.equal(candidate.providerId, "synthetic-external-provider");
    assert.equal(candidate.evidenceType, "dispense");
    assert.equal(
      ClinicalRecordRepository.medications(patientA).length,
      candidateCountBefore,
      "mapping external medication data cannot directly mutate authoritative clinical truth",
    );
    assert.ok(
      !ClinicalRecordRepository.medications(patientA).some((row) => row.source_ref === "fill-001"),
      "external candidate references are not silently persisted as medication records",
    );

    env.NODE_ENV = "production";
    const unauthenticatedResponse = await clinicalPost(new Request("http://ehr.local/api/clinical-records", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ehr-patient-id": patientA },
      body: JSON.stringify({ type: "add_medication", payload: { patientId: patientA, displayText: "Unauthenticated medication mutation" } }),
    }));
    assert.equal(unauthenticatedResponse.status, 401, "production medication mutations require an authenticated session");
    env.NODE_ENV = "test";

    const unauthenticatedStored = db.prepare("SELECT COUNT(*) AS n FROM patient_medications WHERE display_text = 'Unauthenticated medication mutation'").get() as { n: number };
    assert.equal(unauthenticatedStored.n, 0);
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
