import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "login response should set an EHR session cookie");
  return setCookie.split(";", 1)[0];
}

test("API reads, audit writes, preferences, identifier reads, and allergy absence use authoritative identity", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-api-authority-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-api-authority-session-secret-0123456789";

  try {
    const [
      { POST: loginPost },
      { POST: logoutPost },
      { GET: patientsGet, POST: patientsPost },
      { GET: auditGet, POST: auditPost },
      { GET: preferencesGet, PUT: preferencesPut },
      { GET: healthGet },
      { GET: appointmentsGet },
      { GET: messagesGet },
      { GET: ordersGet },
      { GET: tasksGet },
      { GET: clinicalRecordsGet },
      { GET: encounterByIdGet },
      { GET: patientByIdGet },
      { PreferenceRepository },
      { AuditRepository },
      { ClinicalRecordRepository },
      { EncounterRepository },
      { AuthRepository },
      { defaultPreferences },
      { EHR_SESSION_COOKIE, createProviderSessionToken },
    ] = await Promise.all([
      import("../app/api/auth/login/route"),
      import("../app/api/auth/logout/route"),
      import("../app/api/patients/route"),
      import("../app/api/audit/route"),
      import("../app/api/preferences/route"),
      import("../app/api/health/route"),
      import("../app/api/appointments/route"),
      import("../app/api/messages/route"),
      import("../app/api/orders/route"),
      import("../app/api/tasks/route"),
      import("../app/api/clinical-records/route"),
      import("../app/api/encounters/[id]/route"),
      import("../app/api/patients/[id]/route"),
      import("../app/server/repositories/preference-repository"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/repositories/encounter-repository"),
      import("../app/server/repositories/auth-repository"),
      import("../app/lib/preference-engine"),
      import("../app/server/auth/provider-context"),
    ]);

    const unauthenticatedReads: Array<[string, Promise<Response>]> = [
      ["patients", patientsGet(new Request("http://ehr.local/api/patients"))],
      ["audit", auditGet(new Request("http://ehr.local/api/audit"))],
      ["preferences", preferencesGet(new Request("http://ehr.local/api/preferences"))],
      ["health", healthGet(new Request("http://ehr.local/api/health"))],
      ["appointments", appointmentsGet(new Request("http://ehr.local/api/appointments"))],
      ["messages", messagesGet(new Request("http://ehr.local/api/messages?patientId=synthetic"))],
      ["orders", ordersGet(new Request("http://ehr.local/api/orders?patientId=synthetic"))],
      ["tasks", tasksGet(new Request("http://ehr.local/api/tasks?type=task"))],
      ["clinical-records", clinicalRecordsGet(new Request("http://ehr.local/api/clinical-records?patientId=synthetic"))],
    ];
    for (const [name, responsePromise] of unauthenticatedReads) {
      const response = await responsePromise;
      assert.equal(response.status, 401, `${name} must reject a request without a server session`);
    }

    const loginResponse = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "team-taylor" }),
    }));
    assert.equal(loginResponse.status, 200);
    const providerCookie = cookieFrom(loginResponse);

    const forgedHeadersRead = await patientsGet(new Request("http://ehr.local/api/patients", {
      headers: {
        "x-ehr-user-id": "team-casey",
        "x-ehr-role": "clinical_assistant",
      },
    }));
    assert.equal(forgedHeadersRead.status, 401, "identity headers cannot replace a server session");

    PreferenceRepository.savePreferences(
      { ...defaultPreferences, density: "minimal" },
      "team-casey",
    );
    const forgedPreferenceRead = await preferencesGet(new Request(
      "http://ehr.local/api/preferences?providerId=team-casey",
      { headers: { cookie: providerCookie } },
    ));
    assert.equal(forgedPreferenceRead.status, 200);
    const forgedPreferenceBody = await forgedPreferenceRead.json() as any;
    assert.equal(
      forgedPreferenceBody.preferences.density,
      "comfortable",
      "preference reads must resolve to the authenticated actor, not providerId",
    );

    const preferenceUpdate = { ...defaultPreferences, density: "compact" as const };
    const forgedPreferenceWrite = await preferencesPut(new Request("http://ehr.local/api/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: providerCookie },
      body: JSON.stringify({ providerId: "team-casey", preferences: preferenceUpdate }),
    }));
    assert.equal(forgedPreferenceWrite.status, 200);
    assert.equal(PreferenceRepository.getPreferences("team-taylor").density, "compact");
    assert.equal(
      PreferenceRepository.getPreferences("team-casey").density,
      "minimal",
      "a client-supplied providerId must not overwrite another clinician's preferences",
    );
    const preferenceAudit = AuditRepository.getRecent(50)
      .find((entry) => entry.eventType === "preference_updated");
    assert.equal(preferenceAudit?.userId, "team-taylor");
    assert.notEqual(preferenceAudit?.userId, "team-casey");

    const auditCountBefore = AuditRepository.getRecent(500).length;
    const forgedAuditWrite = await auditPost(new Request("http://ehr.local/api/audit", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: providerCookie },
      body: JSON.stringify({
        eventType: "note_signed",
        description: "Client claims a synthetic note was signed",
        userId: "forged-user",
        userName: "Forged User",
        userRole: "provider",
      }),
    }));
    assert.equal(forgedAuditWrite.status, 405);
    assert.equal(
      AuditRepository.getRecent(500).length,
      auditCountBefore,
      "generic audit POST must not append a client-asserted authoritative event",
    );
    const auditRead = await auditGet(new Request("http://ehr.local/api/audit?limit=20", {
      headers: { cookie: providerCookie },
    }));
    assert.equal(auditRead.status, 200);

    const unknownAllergyCreate = await patientsPost(new Request("http://ehr.local/api/patients", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: providerCookie },
      body: JSON.stringify({
        id: "synthetic-unknown-allergies",
        name: "Synthetic Unknown Allergies",
        dob: "2000-01-01",
        age: 26,
        pronouns: "they/them",
        mrn: "SYN-UNK-001",
        status: "New Patient",
        lastVisit: "Initial Intake",
        nextVisit: "Unscheduled",
      }),
    }));
    assert.equal(unknownAllergyCreate.status, 201);
    const unknownBody = await unknownAllergyCreate.json() as any;
    assert.deepEqual(unknownBody.patient.allergies, []);
    assert.deepEqual(ClinicalRecordRepository.allergies("synthetic-unknown-allergies"), []);

    const explicitNkdaCreate = await patientsPost(new Request("http://ehr.local/api/patients", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: providerCookie },
      body: JSON.stringify({
        id: "synthetic-explicit-nkda",
        name: "Synthetic Explicit NKDA",
        dob: "2001-02-03",
        age: 25,
        pronouns: "they/them",
        mrn: "SYN-NKDA-001",
        status: "New Patient",
        allergies: ["NKDA"],
        lastVisit: "Initial Intake",
        nextVisit: "Unscheduled",
      }),
    }));
    assert.equal(explicitNkdaCreate.status, 201);
    assert.equal(ClinicalRecordRepository.allergies("synthetic-explicit-nkda")[0]?.substance, "NKDA");

    const recordActor = { userId: "team-taylor", displayName: "Synthetic Taylor" };
    const document = ClinicalRecordRepository.createDocument({
      patientId: "synthetic-unknown-allergies",
      documentType: "synthetic-test",
      title: "Synthetic authority document",
      contentText: "synthetic content only",
    }, recordActor);
    const encounter = EncounterRepository.saveDraft({
      id: "synthetic-authority-encounter",
      patientId: "synthetic-unknown-allergies",
      chiefComplaint: "Synthetic authority check",
    });

    const correctDocumentRead = await clinicalRecordsGet(new Request(
      `http://ehr.local/api/clinical-records?patientId=synthetic-unknown-allergies&documentId=${encodeURIComponent(document.id)}`,
      {
        headers: {
          cookie: providerCookie,
          "x-ehr-patient-id": "synthetic-unknown-allergies",
        },
      },
    ));
    assert.equal(correctDocumentRead.status, 200);

    const wrongDocumentRead = await clinicalRecordsGet(new Request(
      `http://ehr.local/api/clinical-records?patientId=synthetic-explicit-nkda&documentId=${encodeURIComponent(document.id)}`,
      {
        headers: {
          cookie: providerCookie,
          "x-ehr-patient-id": "synthetic-explicit-nkda",
        },
      },
    ));
    assert.equal(wrongDocumentRead.status, 409, "document versions must stay bound to their patient");

    const wrongEncounterRead = await clinicalRecordsGet(new Request(
      `http://ehr.local/api/clinical-records?patientId=synthetic-explicit-nkda&encounterId=${encodeURIComponent(encounter.id)}`,
      {
        headers: {
          cookie: providerCookie,
          "x-ehr-patient-id": "synthetic-explicit-nkda",
        },
      },
    ));
    assert.equal(wrongEncounterRead.status, 409, "encounter addenda must stay bound to their patient");

    const headerMismatch = await clinicalRecordsGet(new Request(
      `http://ehr.local/api/clinical-records?patientId=synthetic-unknown-allergies&documentId=${encodeURIComponent(document.id)}`,
      {
        headers: {
          cookie: providerCookie,
          "x-ehr-patient-id": "synthetic-explicit-nkda",
        },
      },
    ));
    assert.equal(headerMismatch.status, 409, "active chart and requested patient must agree");

    const unauthenticatedEncounterRead = await encounterByIdGet(
      new Request(`http://ehr.local/api/encounters/${encodeURIComponent(encounter.id)}`),
      { params: Promise.resolve({ id: encounter.id }) },
    );
    assert.equal(unauthenticatedEncounterRead.status, 401, "encounter by id must require authenticated session");

    const unauthenticatedPatientRead = await patientByIdGet(
      new Request("http://ehr.local/api/patients/synthetic-unknown-allergies"),
      { params: Promise.resolve({ id: "synthetic-unknown-allergies" }) },
    );
    assert.equal(unauthenticatedPatientRead.status, 401, "patient by id must require authenticated session");

    const wrongPatientEncounterById = await encounterByIdGet(
      new Request(`http://ehr.local/api/encounters/${encodeURIComponent(encounter.id)}`, {
        headers: {
          cookie: providerCookie,
          "x-ehr-patient-id": "synthetic-explicit-nkda",
        },
      }),
      { params: Promise.resolve({ id: encounter.id }) },
    );
    assert.equal(wrongPatientEncounterById.status, 409, "encounter by id must reject mismatched active patient");

    const wrongPatientPatientById = await patientByIdGet(
      new Request("http://ehr.local/api/patients/synthetic-unknown-allergies", {
        headers: {
          cookie: providerCookie,
          "x-ehr-patient-id": "synthetic-explicit-nkda",
        },
      }),
      { params: Promise.resolve({ id: "synthetic-unknown-allergies" }) },
    );
    assert.equal(wrongPatientPatientById.status, 409, "patient by id must reject mismatched active patient");

    const correctEncounterById = await encounterByIdGet(
      new Request(`http://ehr.local/api/encounters/${encodeURIComponent(encounter.id)}`, {
        headers: {
          cookie: providerCookie,
          "x-ehr-patient-id": "synthetic-unknown-allergies",
        },
      }),
      { params: Promise.resolve({ id: encounter.id }) },
    );
    assert.equal(correctEncounterById.status, 200, "encounter by id succeeds with authenticated patient binding");

    const correctPatientById = await patientByIdGet(
      new Request("http://ehr.local/api/patients/synthetic-unknown-allergies", {
        headers: {
          cookie: providerCookie,
          "x-ehr-patient-id": "synthetic-unknown-allergies",
        },
      }),
      { params: Promise.resolve({ id: "synthetic-unknown-allergies" }) },
    );
    assert.equal(correctPatientById.status, 200, "patient by id succeeds with authenticated patient binding");

    AuthRepository.createSession({
      id: "expired-api-authority-session",
      userId: "team-taylor",
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    const expiredToken = createProviderSessionToken(
      "expired-api-authority-session",
      Date.now() - 1_000,
      Date.now() - 10_000,
    );
    const expiredRead = await patientsGet(new Request("http://ehr.local/api/patients", {
      headers: { cookie: `${EHR_SESSION_COOKIE}=${expiredToken}` },
    }));
    assert.equal(expiredRead.status, 401);

    const logoutResponse = await logoutPost(new Request("http://ehr.local/api/auth/logout", {
      method: "POST",
      headers: { cookie: providerCookie },
    }));
    assert.equal(logoutResponse.status, 200);
    const revokedRead = await patientsGet(new Request("http://ehr.local/api/patients", {
      headers: { cookie: providerCookie },
    }));
    assert.equal(revokedRead.status, 401, "revoked sessions must fail at a protected read handler");
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
