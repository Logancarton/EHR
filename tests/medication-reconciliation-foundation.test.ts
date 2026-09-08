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

test("Phase 4C medication reconciliation keeps evidence separate until explicit clinician action", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-med-reconciliation-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-med-reconciliation-secret-0123456789abcdef";

  try {
    const [
      { POST: loginPost },
      { GET: reconciliationGet, POST: reconciliationPost },
      { POST: clinicalPost },
      { ClinicalActionGateway },
      { ClinicalRecordRepository },
      { MedicationReconciliationRepository },
      { ContextAssembler },
      { AuditRepository },
      { getDatabase },
      { mapExternalMedicationCandidate },
    ] = await Promise.all([
      import("../app/api/auth/login/route"),
      import("../app/api/medication-reconciliation/route"),
      import("../app/api/clinical-records/route"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/repositories/medication-reconciliation-repository"),
      import("../app/server/context/context-assembler"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/db/connection"),
      import("../app/adapters/prescribing/medication-integration"),
    ]);
    type MedicationIntegrationProvider<T> = import("../app/adapters/prescribing/medication-integration").MedicationIntegrationProvider<T>;

    const db = getDatabase();
    const patientA = "maya-chen";
    const patientB = "jordan-reed";
    const addLabel = "Phase 4C synthetic vilazodone 15 mg each morning";
    const updateBaseLabel = "Phase 4C synthetic buspirone 5 mg twice daily";
    const updateCandidateLabel = "Phase 4C synthetic buspirone 10 mg twice daily";
    const discontinueReport = "Patient reports Phase 4C synthetic buspirone was stopped";
    const ignoreLabel = "Phase 4C synthetic duplicate evidence to ignore";

    const providerLogin = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "team-taylor" }),
    }));
    assert.equal(providerLogin.status, 200);
    const providerCookie = cookieFrom(providerLogin);

    async function reconcileMutation(
      type: string,
      payload: Record<string, unknown>,
      expectedPatientId = patientA,
      cookie = providerCookie,
      extraHeaders: Record<string, string> = {},
    ) {
      return reconciliationPost(new Request("http://ehr.local/api/medication-reconciliation", {
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

    async function clinicalMutation(
      type: string,
      payload: Record<string, unknown>,
      expectedPatientId = patientA,
    ) {
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

    const medsBeforeCandidate = (db.prepare("SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?")
      .get(patientA) as { n: number }).n;

    const candidateResponse = await reconcileMutation(
      "record_medication_candidate",
      {
        patientId: patientA,
        sourceType: "patient-reported",
        sourceSystem: "patient-report",
        evidenceType: "patient-report",
        displayText: addLabel,
        medicationName: "Vilazodone",
        strength: "15 mg",
        dose: "15 mg",
        route: "oral",
        frequency: "each morning",
        observedAt: "2026-09-07T18:00:00-07:00",
      },
      patientA,
      providerCookie,
      { "x-ehr-user-id": "forged-user", "x-ehr-role": "staff" },
    );
    assert.equal(candidateResponse.status, 201, "authenticated clinician can record patient-reported evidence");
    const candidate = (await candidateResponse.json() as any).result;
    assert.equal(candidate.patient_id, patientA);
    assert.equal(candidate.status, "pending");
    assert.equal(candidate.source_type, "patient-reported");
    assert.equal(candidate.created_by, "Taylor Brooks, PMHNP-BC", "candidate actor is server-derived");

    const medsAfterCandidate = (db.prepare("SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?")
      .get(patientA) as { n: number }).n;
    assert.equal(medsAfterCandidate, medsBeforeCandidate, "candidate persistence does not create authoritative medication truth");
    assert.ok(MedicationReconciliationRepository.getById(candidate.id), "candidate persists independently");

    let context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(!context?.activeMedications.includes(addLabel), "pending evidence does not contaminate activeMedications");

    const readResponse = await reconciliationGet(new Request(
      `http://ehr.local/api/medication-reconciliation?patientId=${patientA}`,
      { headers: { cookie: providerCookie, "x-ehr-patient-id": patientA } },
    ));
    assert.equal(readResponse.status, 200);
    assert.ok((await readResponse.json() as any).candidates.some((row: any) => row.id === candidate.id));

    const wrongPatientRead = await reconciliationGet(new Request(
      `http://ehr.local/api/medication-reconciliation?patientId=${patientA}`,
      { headers: { cookie: providerCookie, "x-ehr-patient-id": patientB } },
    ));
    assert.equal(wrongPatientRead.status, 409, "wrong active patient cannot read another patient's candidates");

    const addAcceptedResponse = await reconcileMutation("reconcile_medication_candidate", {
      candidateId: candidate.id,
      decision: "add",
    });
    assert.equal(addAcceptedResponse.status, 201);
    const acceptedAdd = (await addAcceptedResponse.json() as any).result;
    assert.equal(acceptedAdd.candidate.status, "accepted");
    assert.equal(acceptedAdd.candidate.decision, "add");
    assert.ok(acceptedAdd.medication?.id, "accepted candidate creates authoritative medication");
    assert.equal(acceptedAdd.medication.source_type, "reconciliation");
    assert.equal(acceptedAdd.medication.source_ref, `medication-candidate/${candidate.id}`);
    assert.equal(acceptedAdd.candidate.linked_medication_id, acceptedAdd.medication.id);

    const acceptedVersions = ClinicalRecordRepository.versions("medication", acceptedAdd.medication.id);
    const acceptedProvenance = ClinicalRecordRepository.provenance("medication", acceptedAdd.medication.id);
    assert.equal(acceptedVersions.at(0)?.source_ref, `medication-candidate/${candidate.id}`);
    assert.equal(acceptedProvenance.at(-1)?.source_ref, `medication-candidate/${candidate.id}`);
    context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(context?.activeMedications.includes(addLabel), "accepted add enters authoritative ContextAssembler state");

    const updateBaseResponse = await clinicalMutation("add_medication", {
      patientId: patientA,
      displayText: updateBaseLabel,
      medicationName: "Buspirone",
      strength: "5 mg",
      dose: "5 mg",
      route: "oral",
      frequency: "twice daily",
    });
    assert.equal(updateBaseResponse.status, 201);
    const updateBase = (await updateBaseResponse.json() as any).result;
    const versionsBeforeUpdate = ClinicalRecordRepository.versions("medication", updateBase.id).length;

    const updateCandidateResponse = await reconcileMutation("record_medication_candidate", {
      patientId: patientA,
      sourceType: "clinician-entered",
      sourceSystem: "ehr-local",
      evidenceType: "medication-review",
      displayText: updateCandidateLabel,
      medicationName: "Buspirone",
      strength: "10 mg",
      dose: "10 mg",
      route: "oral",
      frequency: "twice daily",
      linkedMedicationId: updateBase.id,
    });
    assert.equal(updateCandidateResponse.status, 201);
    const updateCandidate = (await updateCandidateResponse.json() as any).result;

    const updateResponse = await reconcileMutation("reconcile_medication_candidate", {
      candidateId: updateCandidate.id,
      decision: "update",
      medicationId: updateBase.id,
    });
    assert.equal(updateResponse.status, 201);
    const reconciledUpdate = (await updateResponse.json() as any).result;
    assert.equal(reconciledUpdate.medication.display_text, updateCandidateLabel);
    assert.equal(reconciledUpdate.medication.dose, "10 mg");
    assert.equal(reconciledUpdate.candidate.status, "accepted");
    assert.equal(reconciledUpdate.candidate.linked_medication_id, updateBase.id);
    assert.equal(
      ClinicalRecordRepository.versions("medication", updateBase.id).length,
      versionsBeforeUpdate + 1,
      "reconciliation update preserves and extends medication version history",
    );

    const discontinueCandidateResponse = await reconcileMutation("record_medication_candidate", {
      patientId: patientA,
      sourceType: "patient-reported",
      sourceSystem: "patient-report",
      evidenceType: "stopped-medication-report",
      displayText: discontinueReport,
      medicationName: "Buspirone",
      linkedMedicationId: updateBase.id,
    });
    const discontinueCandidate = (await discontinueCandidateResponse.json() as any).result;
    const discontinueResponse = await reconcileMutation("reconcile_medication_candidate", {
      candidateId: discontinueCandidate.id,
      decision: "discontinue",
      medicationId: updateBase.id,
    });
    assert.equal(discontinueResponse.status, 201);
    const discontinued = (await discontinueResponse.json() as any).result.medication;
    assert.equal(discontinued.status, "discontinued");
    assert.match(discontinued.end_date, /^\d{4}-\d{2}-\d{2}$/, "existing medication lifecycle supplies end date");
    assert.ok(db.prepare("SELECT id FROM patient_medications WHERE id = ?").get(updateBase.id), "discontinuation never physically deletes medication");
    context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(!context?.activeMedications.includes(updateCandidateLabel), "reconciled discontinuation leaves active ContextAssembler state");

    const ignoreCandidateResponse = await reconcileMutation("record_medication_candidate", {
      patientId: patientA,
      sourceType: "imported-record",
      sourceSystem: "synthetic-import",
      evidenceType: "historical-record",
      displayText: ignoreLabel,
      medicationName: "Synthetic ignored medication",
    });
    const ignoreCandidate = (await ignoreCandidateResponse.json() as any).result;
    const medCountBeforeIgnore = (db.prepare("SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?")
      .get(patientA) as { n: number }).n;
    const ignoreResponse = await reconcileMutation("reconcile_medication_candidate", {
      candidateId: ignoreCandidate.id,
      decision: "ignore",
    });
    assert.equal(ignoreResponse.status, 201);
    const ignored = (await ignoreResponse.json() as any).result;
    assert.equal(ignored.candidate.status, "ignored");
    assert.equal(ignored.medication, null);
    const medCountAfterIgnore = (db.prepare("SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?")
      .get(patientA) as { n: number }).n;
    assert.equal(medCountAfterIgnore, medCountBeforeIgnore, "ignore does not modify authoritative medication list");
    assert.ok(ClinicalRecordRepository.versions("medication-candidate", ignoreCandidate.id).length >= 2);
    assert.ok(ClinicalRecordRepository.provenance("medication-candidate", ignoreCandidate.id).length >= 2, "ignored evidence remains traceable");

    const patientBMedicationResponse = await clinicalMutation("add_medication", {
      patientId: patientB,
      displayText: "Phase 4C patient B synthetic medication",
      medicationName: "Patient B medication",
    }, patientB);
    assert.equal(patientBMedicationResponse.status, 201);
    const patientBMedication = (await patientBMedicationResponse.json() as any).result;

    const crossPatientLinkedCandidate = await reconcileMutation("record_medication_candidate", {
      patientId: patientA,
      sourceType: "patient-reported",
      displayText: "Phase 4C cross-patient link fixture",
      medicationName: "Cross-patient fixture",
      linkedMedicationId: patientBMedication.id,
    });
    assert.equal(crossPatientLinkedCandidate.status, 409, "candidate cannot link to another patient's medication");

    const staleCandidateResponse = await reconcileMutation("record_medication_candidate", {
      patientId: patientA,
      sourceType: "patient-reported",
      displayText: "Phase 4C stale chart fixture",
      medicationName: "Stale chart fixture",
    });
    const staleCandidate = (await staleCandidateResponse.json() as any).result;
    const staleReconciliation = await reconcileMutation("reconcile_medication_candidate", {
      candidateId: staleCandidate.id,
      decision: "ignore",
    }, patientB);
    assert.equal(staleReconciliation.status, 409, "stale/wrong active patient cannot reconcile candidate");
    assert.equal(MedicationReconciliationRepository.getById(staleCandidate.id)?.status, "pending");

    const crossPatientReconciliation = await reconcileMutation("reconcile_medication_candidate", {
      candidateId: staleCandidate.id,
      decision: "update",
      medicationId: patientBMedication.id,
    });
    assert.equal(crossPatientReconciliation.status, 409, "candidate cannot mutate another patient's medication");
    assert.equal(MedicationReconciliationRepository.getById(staleCandidate.id)?.status, "pending");

    const unsupportedActor = {
      userId: "synthetic-unsupported-role",
      displayName: "Unsupported Runtime Role",
      role: "unsupported" as any,
    };
    await assert.rejects(
      () => ClinicalActionGateway.execute({
        action: {
          type: "record_medication_candidate",
          payload: {
            patientId: patientA,
            sourceType: "patient-reported",
            displayText: "Phase 4C unauthorized role fixture",
          },
        },
        actor: unsupportedActor,
        context: { source: "api" },
        expectedPatientId: patientA,
      }),
      /lacks permission/,
      "unknown runtime role fails closed under existing permissions",
    );

    const previousNodeEnv = env.NODE_ENV;
    env.NODE_ENV = "production";
    const unauthenticated = await reconciliationPost(new Request("http://ehr.local/api/medication-reconciliation", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ehr-patient-id": patientA },
      body: JSON.stringify({
        type: "record_medication_candidate",
        payload: {
          patientId: patientA,
          sourceType: "patient-reported",
          displayText: "Phase 4C unauthenticated fixture",
        },
      }),
    }));
    env.NODE_ENV = previousNodeEnv;
    assert.equal(unauthenticated.status, 401, "unauthenticated reconciliation mutation fails");

    const syntheticProvider: MedicationIntegrationProvider<{ ref: string; name: string }> = {
      id: "phase-4c-synthetic-provider",
      toMedicationCandidate(payload) {
        return {
          providerId: this.id,
          externalReferenceId: payload.ref,
          evidenceType: "medication-history",
          displayText: payload.name,
          medicationName: payload.name,
          observedAt: "2026-09-07T19:00:00Z",
        };
      },
    };
    const externalLabel = "Phase 4C external synthetic escitalopram evidence";
    const medCountBeforeExternal = (db.prepare("SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?")
      .get(patientA) as { n: number }).n;
    const externalCandidate = mapExternalMedicationCandidate(syntheticProvider, {
      ref: "synthetic-history-4c-1",
      name: externalLabel,
    });
    assert.ok(externalCandidate, "vendor-neutral adapter maps external evidence to a candidate shape");
    const medCountAfterMapping = (db.prepare("SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?")
      .get(patientA) as { n: number }).n;
    assert.equal(medCountAfterMapping, medCountBeforeExternal, "adapter mapping cannot mutate clinical truth");

    const externalPersistResponse = await reconcileMutation("record_medication_candidate", {
      patientId: patientA,
      sourceType: "external-vendor",
      sourceSystem: externalCandidate!.providerId,
      sourceRef: externalCandidate!.externalReferenceId,
      evidenceType: externalCandidate!.evidenceType,
      displayText: externalCandidate!.displayText,
      medicationName: externalCandidate!.medicationName,
      observedAt: externalCandidate!.observedAt,
    });
    assert.equal(externalPersistResponse.status, 201);
    const persistedExternal = (await externalPersistResponse.json() as any).result;
    assert.equal(persistedExternal.status, "pending");
    assert.equal(persistedExternal.source_type, "external-vendor");
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?").get(patientA) as { n: number }).n,
      medCountBeforeExternal,
      "persisted external candidate remains non-authoritative",
    );
    context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(!context?.activeMedications.includes(externalLabel));

    const atomicMedicationResponse = await clinicalMutation("add_medication", {
      patientId: patientA,
      displayText: "Phase 4C atomic original dose",
      medicationName: "Atomic synthetic medication",
      dose: "1 mg",
    });
    const atomicMedication = (await atomicMedicationResponse.json() as any).result;
    const atomicCandidateResponse = await reconcileMutation("record_medication_candidate", {
      patientId: patientA,
      sourceType: "clinician-entered",
      displayText: "Phase 4C atomic changed dose",
      medicationName: "Atomic synthetic medication",
      dose: "2 mg",
    });
    const atomicCandidate = (await atomicCandidateResponse.json() as any).result;
    const atomicVersionsBefore = ClinicalRecordRepository.versions("medication", atomicMedication.id).length;
    const originalResolve = MedicationReconciliationRepository.resolve;
    (MedicationReconciliationRepository as any).resolve = () => {
      throw new Error("synthetic candidate-resolution failure");
    };
    const atomicFailure = await reconcileMutation("reconcile_medication_candidate", {
      candidateId: atomicCandidate.id,
      decision: "update",
      medicationId: atomicMedication.id,
    });
    (MedicationReconciliationRepository as any).resolve = originalResolve;
    assert.equal(atomicFailure.status, 400);
    const atomicAfter = db.prepare("SELECT * FROM patient_medications WHERE id = ?").get(atomicMedication.id) as any;
    assert.equal(atomicAfter.display_text, "Phase 4C atomic original dose", "failed candidate resolution rolls back medication mutation");
    assert.equal(atomicAfter.dose, "1 mg");
    assert.equal(MedicationReconciliationRepository.getById(atomicCandidate.id)?.status, "pending");
    assert.equal(
      ClinicalRecordRepository.versions("medication", atomicMedication.id).length,
      atomicVersionsBefore,
      "rolled-back medication change leaves no phantom version",
    );

    const candidateAudit = AuditRepository.getRecent(500, patientA).find((entry) =>
      entry.eventType === "medication_candidate_recorded" && entry.metadata?.candidateId === candidate.id,
    );
    assert.ok(candidateAudit, "candidate recording is audited");
    assert.equal(candidateAudit.userId, "team-taylor", "audit actor is server-derived");
    const reconciliationAudit = AuditRepository.getRecent(500, patientA).find((entry) =>
      entry.eventType === "medication_reconciled" && entry.metadata?.candidateId === candidate.id,
    );
    assert.ok(reconciliationAudit, "accepted reconciliation is audited");
    assert.equal(reconciliationAudit.metadata?.resultingMedicationId, acceptedAdd.medication.id);

    assert.ok(
      ClinicalRecordRepository.versions("medication-candidate", candidate.id).length >= 2,
      "candidate decision remains versioned",
    );
    assert.ok(
      ClinicalRecordRepository.provenance("medication-candidate", candidate.id).length >= 2,
      "candidate provenance remains traceable after reconciliation",
    );
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV; else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET; else env.EHR_SESSION_SECRET = originalSecret;
  }
});
