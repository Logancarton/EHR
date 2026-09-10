import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decidePatientAccess,
  resolveAccessSelection,
  type OrganizationMembership,
} from "../app/lib/patient-access-policy";

function membership(
  organizationId: string,
  overrides: Partial<OrganizationMembership> = {},
): OrganizationMembership {
  return {
    organizationId,
    userId: "user-1",
    status: "active",
    patientAccessScope: "organization",
    ...overrides,
  };
}

test("patient-access policy fails closed and separates organization scope from assignment scope", () => {
  const unassignedPatient = decidePatientAccess({
    patientId: "p1",
    patientOrganizationId: null,
    memberships: [membership("org-a")],
    assignedPatientIds: new Set(),
  });
  assert.equal(unassignedPatient.allowed, false);
  assert.equal(unassignedPatient.allowed === false && unassignedPatient.reason, "patient-unassigned");

  const crossOrganization = decidePatientAccess({
    patientId: "p1",
    patientOrganizationId: "org-b",
    memberships: [membership("org-a")],
    assignedPatientIds: new Set(["p1"]),
  });
  assert.equal(crossOrganization.allowed, false);
  assert.equal(
    crossOrganization.allowed === false && crossOrganization.reason,
    "no-active-membership",
    "a care-team assignment cannot reach across organizations",
  );

  for (const status of ["suspended", "revoked"] as const) {
    const inactive = decidePatientAccess({
      patientId: "p1",
      patientOrganizationId: "org-a",
      memberships: [membership("org-a", { status })],
      assignedPatientIds: new Set(["p1"]),
    });
    assert.equal(inactive.allowed, false, `${status} membership must grant nothing`);
  }

  const organizationScope = decidePatientAccess({
    patientId: "p1",
    patientOrganizationId: "org-a",
    memberships: [membership("org-a")],
    assignedPatientIds: new Set(),
  });
  assert.deepEqual(organizationScope, { allowed: true, organizationId: "org-a", via: "organization" });

  const assignedScopeWithout = decidePatientAccess({
    patientId: "p1",
    patientOrganizationId: "org-a",
    memberships: [membership("org-a", { patientAccessScope: "assigned" })],
    assignedPatientIds: new Set(["p2"]),
  });
  assert.equal(assignedScopeWithout.allowed, false);
  assert.equal(assignedScopeWithout.allowed === false && assignedScopeWithout.reason, "assignment-required");

  const assignedScopeWith = decidePatientAccess({
    patientId: "p1",
    patientOrganizationId: "org-a",
    memberships: [membership("org-a", { patientAccessScope: "assigned" })],
    assignedPatientIds: new Set(["p1"]),
  });
  assert.deepEqual(assignedScopeWith, { allowed: true, organizationId: "org-a", via: "assignment" });

  const selection = resolveAccessSelection([
    membership("org-a"),
    membership("org-b", { patientAccessScope: "assigned" }),
    membership("org-c", { status: "revoked" }),
  ]);
  assert.deepEqual(selection.organizationIds, ["org-a"]);
  assert.deepEqual(selection.assignedScopeOrganizationIds, ["org-b"]);
});

test("organization membership isolates charts, rosters, queues, and writes across the API surface", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-organization-access-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-organization-access-secret-0123456789";

  try {
    const [
      { POST: loginPost },
      { GET: patientsGet, POST: patientsPost },
      { GET: patientByIdGet },
      { GET: clinicalRecordsGet },
      { GET: encountersGet },
      { GET: practiceQueuesGet },
      { GET: auditGet },
      { GET: aiSearchGet },
      { ClinicalActionGateway },
      { OrganizationRepository },
      { PatientRepository },
      { ClinicalRecordRepository },
      { getDatabase },
    ] = await Promise.all([
      import("../app/api/auth/login/route"),
      import("../app/api/patients/route"),
      import("../app/api/patients/[id]/route"),
      import("../app/api/clinical-records/route"),
      import("../app/api/encounters/route"),
      import("../app/api/practice-queues/route"),
      import("../app/api/audit/route"),
      import("../app/api/ai/search/route"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/organization-repository"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/db/connection"),
    ]);

    const db = getDatabase();
    const now = new Date().toISOString();
    const homeOrganization = OrganizationRepository.defaultOrganizationId();

    // A second practice with its own clinician and its own patient. Nothing about
    // authentication or role differs between the two providers; only membership does.
    OrganizationRepository.createOrganization("org-rival-practice", "Rival Practice");
    db.prepare(`
      INSERT OR IGNORE INTO team_members (
        id, display_name, credentials, role, initials, presence, active, created_at, updated_at
      ) VALUES (?, ?, NULL, 'provider', 'RP', 'online', 1, ?, ?)
    `).run("rival-provider", "Rival Provider", now, now);
    OrganizationRepository.upsertMembership({ organizationId: "org-rival-practice", userId: "rival-provider" });

    PatientRepository.create({
      id: "rival-patient", name: "Rival Practice Patient", initials: "RP", dob: "01/01/1990", age: 36,
      pronouns: "they/them", mrn: "RIVAL-001", status: "Established",
      allergies: [], diagnoses: [], meds: [], vitals: {}, lastVisit: "Initial", nextVisit: "Unscheduled",
    }, "org-rival-practice");

    // A coordinator inside the home organization limited to assigned patients only.
    db.prepare(`
      INSERT OR IGNORE INTO team_members (
        id, display_name, credentials, role, initials, presence, active, created_at, updated_at
      ) VALUES (?, ?, NULL, 'clinical_assistant', 'SC', 'online', 1, ?, ?)
    `).run("scoped-coordinator", "Scoped Coordinator", now, now);
    OrganizationRepository.upsertMembership({
      organizationId: homeOrganization,
      userId: "scoped-coordinator",
      patientAccessScope: "assigned",
    });
    db.prepare(`
      INSERT OR IGNORE INTO team_member_patients (user_id, patient_id, relationship, created_at)
      VALUES (?, ?, 'care-team', ?)
    `).run("scoped-coordinator", "maya-chen", now);

    async function sessionFor(userId: string): Promise<string> {
      const response = await loginPost(new Request("http://ehr.local/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      }));
      assert.equal(response.status, 200, `login should succeed for ${userId}`);
      const setCookie = response.headers.get("set-cookie");
      assert.ok(setCookie);
      return setCookie.split(";", 1)[0];
    }

    const homeCookie = await sessionFor("team-taylor");
    const rivalCookie = await sessionFor("rival-provider");
    const coordinatorCookie = await sessionFor("scoped-coordinator");

    // ---- Roster scoping ----------------------------------------------------
    const homeRoster = await patientsGet(new Request("http://ehr.local/api/patients", {
      headers: { cookie: homeCookie },
    }));
    assert.equal(homeRoster.status, 200);
    const homeIds = ((await homeRoster.json()) as any).patients.map((p: any) => p.id);
    assert.ok(homeIds.includes("maya-chen"), "home clinician sees their own organization patients");
    assert.ok(!homeIds.includes("rival-patient"), "another organization patient never appears on the roster");

    const rivalRoster = await patientsGet(new Request("http://ehr.local/api/patients", {
      headers: { cookie: rivalCookie },
    }));
    const rivalIds = ((await rivalRoster.json()) as any).patients.map((p: any) => p.id);
    assert.deepEqual(rivalIds, ["rival-patient"], "the rival clinician sees only their own organization");

    const coordinatorRoster = await patientsGet(new Request("http://ehr.local/api/patients", {
      headers: { cookie: coordinatorCookie },
    }));
    const coordinatorIds = ((await coordinatorRoster.json()) as any).patients.map((p: any) => p.id);
    assert.deepEqual(
      coordinatorIds,
      ["maya-chen"],
      "assigned-scope membership narrows to explicitly assigned patients inside the organization",
    );

    // ---- Identifier reads --------------------------------------------------
    const crossOrganizationChart = await patientByIdGet(
      new Request("http://ehr.local/api/patients/maya-chen", { headers: { cookie: rivalCookie } }),
      { params: Promise.resolve({ id: "maya-chen" }) },
    );
    assert.equal(crossOrganizationChart.status, 403, "a chart in another organization is not readable");

    const crossOrganizationRecords = await clinicalRecordsGet(new Request(
      "http://ehr.local/api/clinical-records?patientId=maya-chen",
      { headers: { cookie: rivalCookie, "x-ehr-patient-id": "maya-chen" } },
    ));
    assert.equal(crossOrganizationRecords.status, 403);

    const crossOrganizationEncounters = await encountersGet(new Request(
      "http://ehr.local/api/encounters?patientId=maya-chen",
      { headers: { cookie: rivalCookie, "x-ehr-patient-id": "maya-chen" } },
    ));
    assert.equal(crossOrganizationEncounters.status, 403);

    const unassignedForCoordinator = await patientByIdGet(
      new Request("http://ehr.local/api/patients/jordan-reed", { headers: { cookie: coordinatorCookie } }),
      { params: Promise.resolve({ id: "jordan-reed" }) },
    );
    assert.equal(
      unassignedForCoordinator.status,
      403,
      "an in-organization patient outside the assigned scope is still refused",
    );

    const assignedForCoordinator = await patientByIdGet(
      new Request("http://ehr.local/api/patients/maya-chen", { headers: { cookie: coordinatorCookie } }),
      { params: Promise.resolve({ id: "maya-chen" }) },
    );
    assert.equal(assignedForCoordinator.status, 200, "the assigned patient remains reachable");

    // ---- Cross-patient surfaces -------------------------------------------
    ClinicalRecordRepository.addObservation({
      patientId: "rival-patient",
      category: "laboratory",
      testName: "Lithium level",
      valueText: "0.8 mmol/L",
    }, { userId: "rival-provider", displayName: "Rival Provider" }, { system: "ehr-test", ref: "org-isolation" });

    const homeLabQueue = await practiceQueuesGet(new Request(
      "http://ehr.local/api/practice-queues?queue=labs",
      { headers: { cookie: homeCookie } },
    ));
    assert.equal(homeLabQueue.status, 200);
    const homeLabRows = ((await homeLabQueue.json()) as any).rows as Array<{ patientId: string }>;
    assert.ok(
      homeLabRows.every((row) => row.patientId !== "rival-patient"),
      "the practice lab queue never surfaces another organization result",
    );

    const rivalLabQueue = await practiceQueuesGet(new Request(
      "http://ehr.local/api/practice-queues?queue=labs",
      { headers: { cookie: rivalCookie } },
    ));
    const rivalLabRows = ((await rivalLabQueue.json()) as any).rows as Array<{ patientId: string }>;
    assert.ok(rivalLabRows.length > 0, "the owning organization still sees its own result");
    assert.ok(rivalLabRows.every((row) => row.patientId === "rival-patient"));

    const crossOrganizationAudit = await auditGet(new Request(
      "http://ehr.local/api/audit?patientId=maya-chen",
      { headers: { cookie: rivalCookie } },
    ));
    assert.equal(crossOrganizationAudit.status, 403, "patient-filtered audit history respects patient access");

    const crossOrganizationSearch = await aiSearchGet(new Request(
      "http://ehr.local/api/ai/search?q=stable&patientId=maya-chen",
      { headers: { cookie: rivalCookie, "x-ehr-patient-id": "maya-chen" } },
    ));
    assert.equal(crossOrganizationSearch.status, 403, "cross-chart AI search cannot reach another organization");

    // ---- Writes ------------------------------------------------------------
    const rivalActor = { userId: "rival-provider", displayName: "Rival Provider", role: "provider" as const };
    await assert.rejects(
      () => ClinicalActionGateway.execute({
        action: { type: "add_problem", payload: { patientId: "maya-chen", displayText: "Injected problem" } },
        actor: rivalActor,
        context: { source: "api", requestId: "organization-isolation" },
        expectedPatientId: "maya-chen",
      }),
      /Patient access denied/,
      "a clinician cannot write into another organization chart even with a matching binding",
    );
    assert.ok(
      !ClinicalRecordRepository.problems("maya-chen").some((p: any) => p.display_text === "Injected problem"),
      "the refused write left no record behind",
    );

    // ---- Patient creation is owned, never orphaned --------------------------
    const created = await patientsPost(new Request("http://ehr.local/api/patients", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: rivalCookie },
      body: JSON.stringify({
        name: "Rival New Patient", dob: "02/02/1992", age: 34, mrn: "RIVAL-002",
        id: "rival-new-patient", pronouns: "they/them",
      }),
    }));
    assert.equal(created.status, 201);
    assert.equal(
      OrganizationRepository.organizationForPatient("rival-new-patient"),
      "org-rival-practice",
      "a new patient is owned by the creating clinician organization",
    );
    const homeRosterAfterCreate = await patientsGet(new Request("http://ehr.local/api/patients", {
      headers: { cookie: homeCookie },
    }));
    const homeIdsAfter = ((await homeRosterAfterCreate.json()) as any).patients.map((p: any) => p.id);
    assert.ok(!homeIdsAfter.includes("rival-new-patient"));

    // ---- Revocation takes effect without re-authentication ------------------
    OrganizationRepository.upsertMembership({
      organizationId: "org-rival-practice",
      userId: "rival-provider",
      status: "revoked",
    });
    const afterRevocation = await patientByIdGet(
      new Request("http://ehr.local/api/patients/rival-patient", { headers: { cookie: rivalCookie } }),
      { params: Promise.resolve({ id: "rival-patient" }) },
    );
    assert.equal(
      afterRevocation.status,
      403,
      "revoking membership removes patient reach on the existing session without changing the user role",
    );
    const afterRevocationRoster = await patientsGet(new Request("http://ehr.local/api/patients", {
      headers: { cookie: rivalCookie },
    }));
    assert.deepEqual(((await afterRevocationRoster.json()) as any).patients, []);
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV; else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET; else env.EHR_SESSION_SECRET = originalSecret;
  }
});
