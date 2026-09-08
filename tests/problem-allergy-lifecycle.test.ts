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

test("problem and allergy clinical facts use authenticated patient-bound lifecycle records", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-problem-allergy-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-clinical-facts-secret-0123456789abcdef";

  try {
    const [
      { POST: loginPost },
      { GET: clinicalGet, POST: clinicalPost },
      { ClinicalActionGateway },
      { ClinicalRecordRepository },
      { ContextAssembler },
      { AuditRepository },
      { getDatabase },
    ] = await Promise.all([
      import("../app/api/auth/login/route"),
      import("../app/api/clinical-records/route"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/context/context-assembler"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/db/connection"),
    ]);

    const db = getDatabase();
    const patientA = "maya-chen";
    const patientB = "jordan-reed";

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

    const addProblemResponse = await mutate(
      "add_problem",
      {
        patientId: patientA,
        displayText: "Generalized anxiety disorder",
        code: "F41.1",
        codingSystem: "ICD-10-CM",
        onsetDate: "2026-01-15",
      },
      patientA,
      providerCookie,
      { "x-ehr-user-id": "forged-user", "x-ehr-role": "staff" },
    );
    assert.equal(addProblemResponse.status, 201);
    const problem = (await addProblemResponse.json() as any).result;
    assert.equal(problem.patient_id, patientA);
    assert.equal(problem.status, "active");
    assert.equal(problem.recorded_by, "Taylor Brooks, PMHNP-BC", "client identity headers must not replace the authenticated actor");
    assert.equal(problem.onset_date, "2026-01-15");

    const secondProblemResponse = await mutate("add_problem", {
      patientId: patientA,
      displayText: "Major depressive disorder",
    });
    const secondProblem = (await secondProblemResponse.json() as any).result;
    assert.equal(secondProblemResponse.status, 201);

    let context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(context?.activeDiagnoses.includes("Generalized anxiety disorder"));
    assert.ok(context?.activeDiagnoses.includes("Major depressive disorder"));

    const resolveResponse = await mutate("update_problem", {
      recordId: problem.id,
      patch: { status: "resolved" },
    });
    assert.equal(resolveResponse.status, 201);
    const resolvedProblem = (await resolveResponse.json() as any).result;
    assert.equal(resolvedProblem.status, "resolved");
    assert.match(resolvedProblem.resolved_date, /^\d{4}-\d{2}-\d{2}$/);

    context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(!context?.activeDiagnoses.includes("Generalized anxiety disorder"), "resolved problem must not project as active");
    assert.ok(context?.activeDiagnoses.includes("Major depressive disorder"));

    const historyResponse = await clinicalGet(new Request(
      `http://ehr.local/api/clinical-records?patientId=${patientA}&entityType=problem&entityId=${encodeURIComponent(problem.id)}`,
      { headers: { cookie: providerCookie, "x-ehr-patient-id": patientA } },
    ));
    assert.equal(historyResponse.status, 200);
    const history = await historyResponse.json() as any;
    assert.equal(history.versions.length, 2);
    assert.ok(history.provenance.length >= 2);
    assert.equal(history.versions[1].snapshot.status, "active", "the prior problem state must remain available");

    const reactivateResponse = await mutate("update_problem", {
      recordId: problem.id,
      patch: { status: "active" },
    });
    const reactivatedProblem = (await reactivateResponse.json() as any).result;
    assert.equal(reactivatedProblem.status, "active");
    assert.equal(reactivatedProblem.resolved_date, null, "reactivation must clear the stale resolution date");

    const inactivateResponse = await mutate("update_problem", {
      recordId: problem.id,
      patch: { status: "inactive" },
    });
    assert.equal((await inactivateResponse.json() as any).result.status, "inactive");
    context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(!context?.activeDiagnoses.includes("Generalized anxiety disorder"), "inactive problem must not project as active");

    const reactivateAgain = await mutate("update_problem", {
      recordId: problem.id,
      patch: { status: "active" },
    });
    assert.equal((await reactivateAgain.json() as any).result.status, "active");

    const errorResponse = await mutate("update_problem", {
      recordId: problem.id,
      patch: { status: "entered-in-error" },
    });
    assert.equal(errorResponse.status, 201);
    assert.equal((await errorResponse.json() as any).result.status, "entered-in-error");
    const retainedProblem = db.prepare("SELECT * FROM patient_problems WHERE id = ?").get(problem.id) as any;
    assert.ok(retainedProblem, "entered-in-error must not physically delete the clinical fact");
    assert.equal(retainedProblem.status, "entered-in-error");
    assert.ok(ClinicalRecordRepository.versions("problem", problem.id).length >= 6, "problem lifecycle must retain version history");
    context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(!context?.activeDiagnoses.includes("Generalized anxiety disorder"), "entered-in-error problem must not project as active");

    const staleProblemResponse = await mutate("update_problem", {
      recordId: secondProblem.id,
      patch: { status: "resolved" },
    }, patientB);
    assert.equal(staleProblemResponse.status, 409, "wrong-patient/stale-chart problem mutation must be rejected server-side");
    const secondProblemStored = db.prepare("SELECT status FROM patient_problems WHERE id = ?").get(secondProblem.id) as any;
    assert.equal(secondProblemStored.status, "active");

    const wrongPatientHistory = await clinicalGet(new Request(
      `http://ehr.local/api/clinical-records?patientId=${patientB}&entityType=problem&entityId=${encodeURIComponent(secondProblem.id)}`,
      { headers: { cookie: providerCookie, "x-ehr-patient-id": patientB } },
    ));
    assert.equal(wrongPatientHistory.status, 409, "clinical fact history must not cross patient context");

    const addAllergyResponse = await mutate("add_allergy", {
      patientId: patientA,
      substance: "Penicillin",
      reaction: "Hives",
      severity: "severe",
    });
    assert.equal(addAllergyResponse.status, 201);
    const allergy = (await addAllergyResponse.json() as any).result;
    assert.equal(allergy.reaction, "Hives");
    assert.equal(allergy.severity, "severe");
    assert.equal(allergy.status, "active");

    context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(context?.allergies.includes("Penicillin"), "active allergy must flow into ContextAssembler");

    const inactiveAllergyResponse = await mutate("update_allergy", {
      recordId: allergy.id,
      patch: { status: "inactive", reaction: "Hives and swelling", severity: "severe" },
    });
    const inactiveAllergy = (await inactiveAllergyResponse.json() as any).result;
    assert.equal(inactiveAllergy.status, "inactive");
    assert.equal(inactiveAllergy.reaction, "Hives and swelling");
    assert.equal(inactiveAllergy.severity, "severe");
    context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(!context?.allergies.includes("Penicillin"), "inactive allergy must not project as active");

    const reactivateAllergyResponse = await mutate("update_allergy", {
      recordId: allergy.id,
      patch: { status: "active" },
    });
    assert.equal((await reactivateAllergyResponse.json() as any).result.status, "active");
    context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(context?.allergies.includes("Penicillin"));

    const allergyErrorResponse = await mutate("update_allergy", {
      recordId: allergy.id,
      patch: { status: "entered-in-error" },
    });
    assert.equal((await allergyErrorResponse.json() as any).result.status, "entered-in-error");
    assert.ok(db.prepare("SELECT 1 FROM patient_allergies WHERE id = ?").get(allergy.id));
    assert.ok(ClinicalRecordRepository.versions("allergy", allergy.id).length >= 4);
    assert.ok(ClinicalRecordRepository.provenance("allergy", allergy.id).length >= 4);
    context = ContextAssembler.assemble({ patientId: patientA, userRole: "provider" });
    assert.ok(!context?.allergies.includes("Penicillin"), "entered-in-error allergy must not project as active");

    const invalidSeverityResponse = await mutate("add_allergy", {
      patientId: patientA,
      substance: "Synthetic invalid severity fixture",
      severity: "catastrophic",
    });
    assert.equal(invalidSeverityResponse.status, 400, "severity must be constrained to the structured vocabulary");

    const assistantProblemResponse = await mutate(
      "add_problem",
      { patientId: patientA, displayText: "Assistant-entered synthetic problem" },
      patientA,
      assistantCookie,
      { "x-ehr-user-id": "team-taylor", "x-ehr-role": "provider" },
    );
    assert.equal(assistantProblemResponse.status, 201);
    const assistantProblem = (await assistantProblemResponse.json() as any).result;
    assert.equal(assistantProblem.recorded_by, "Casey Nguyen", "forged provider headers must not elevate the authenticated clinical assistant");
    const assistantAudit = AuditRepository.getRecent(100, patientA).find((entry) => entry.metadata?.entityId === assistantProblem.id);
    assert.equal(assistantAudit?.userId, "team-casey");
    assert.equal(assistantAudit?.userRole, "clinical_assistant");

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor: { userId: "synthetic-readonly", displayName: "Synthetic Readonly", role: "readonly" as any },
        context: { source: "api", requestId: "unauthorized-role" },
        expectedPatientId: patientA,
        action: { type: "add_problem", payload: { patientId: patientA, displayText: "Must not be stored" } },
      }),
      /lacks permission: manage_clinical_record/i,
      "a role outside the existing permission map must fail closed",
    );

    const clinicalAudit = AuditRepository.getRecent(200, patientA).filter((entry) =>
      entry.metadata?.entityId === problem.id || entry.metadata?.entityId === allergy.id,
    );
    assert.ok(clinicalAudit.some((entry) => entry.eventType === "clinical_fact_created"));
    assert.ok(clinicalAudit.some((entry) => entry.eventType === "clinical_fact_updated"));

    env.NODE_ENV = "production";
    const unauthenticatedResponse = await clinicalPost(new Request("http://ehr.local/api/clinical-records", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ehr-patient-id": patientA },
      body: JSON.stringify({ type: "add_problem", payload: { patientId: patientA, displayText: "Unauthenticated mutation" } }),
    }));
    assert.equal(unauthenticatedResponse.status, 401, "production clinical mutations require an authenticated session");
    env.NODE_ENV = "test";

    const unauthenticatedStored = db.prepare("SELECT COUNT(*) AS n FROM patient_problems WHERE display_text = 'Unauthenticated mutation'").get() as { n: number };
    assert.equal(unauthenticatedStored.n, 0);
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
