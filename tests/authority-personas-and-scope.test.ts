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

test("DB-2: authority and persona boundaries enforce role, governance, scope, and field stripping", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-authority-scope-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-authority-and-persona-secret-0123456789";

  try {
    const [
      { POST: loginPost },
      { GET: membersGet, PATCH: membersPatch },
      { GET: appointmentsGet, POST: appointmentsPost },
      { GET: practiceQueuesGet },
      { GET: templatesGet, PUT: templatesPut },
      { ClinicalActionGateway },
      { OrganizationRepository },
      { UserRepository },
      { AuthRepository },
      { AppointmentRepository },
      { PatientRepository },
      { OrderRepository },
      { getDatabase },
      { createProviderSessionToken, EHR_SESSION_COOKIE },
    ] = await Promise.all([
      import("../app/api/auth/login/route"),
      import("../app/api/organization/members/route"),
      import("../app/api/appointments/route"),
      import("../app/api/practice-queues/route"),
      import("../app/api/organization/workspace-templates/route"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/organization-repository"),
      import("../app/server/repositories/user-repository"),
      import("../app/server/repositories/auth-repository"),
      import("../app/server/repositories/appointment-repository"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/order-repository"),
      import("../app/server/db/connection"),
      import("../app/server/auth/provider-context"),
    ]);

    const db = getDatabase();
    const now = new Date().toISOString();
    const orgMain = OrganizationRepository.defaultOrganizationId();
    const orgOther = "org-unrelated-practice";
    OrganizationRepository.createOrganization(orgOther, "Unrelated Practice");

    // Helper: issue a session cookie for any userId
    async function sessionFor(userId: string): Promise<string> {
      const response = await loginPost(
        new Request("http://ehr.local/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId }),
        }),
      );
      assert.equal(response.status, 200, `login should succeed for ${userId}`);
      return cookieFrom(response);
    }

    // Provision test patients
    function createTestPatient(id: string, name: string, organizationId: string) {
      db.prepare(`
        INSERT INTO patients (
          id, name, dob, mrn, status, pronouns, initials, alert,
          allergies_json, diagnoses_json, meds_json, vitals_json,
          last_visit, next_visit, created_at, updated_at
        ) VALUES (?, ?, '01/01/1990', ?, 'Established', 'they/them', 'TP', NULL, '[]', '[]', '[]', '{}', 'Initial', '4 weeks', ?, ?)
      `).run(id, name, `MRN-${id}`, now, now);
      db.prepare(`
        INSERT INTO patient_organizations (patient_id, organization_id, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT (patient_id) DO UPDATE SET organization_id = excluded.organization_id
      `).run(id, organizationId, now);
    }

    createTestPatient("patient-assigned", "Assigned Patient", orgMain);
    createTestPatient("patient-unassigned", "Unassigned Practice Patient", orgMain);
    createTestPatient("patient-other-org", "Other Org Patient", orgOther);

    // Create an appointment for patient-assigned with clinical narrative
    const testAppointment = AppointmentRepository.create({
      id: "apt-scope-001",
      patientId: "patient-assigned",
      patientName: "Assigned Patient",
      date: "2026-09-14",
      time: "10:00 AM",
      duration: "30 min",
      type: "30-min Med Check",
      status: "scheduled",
      chiefComplaint: "Severe clinical anxiety with medication titration questions",
      insurance: "Blue Cross",
      dob: "01/01/1990",
      age: 36,
      mrn: "MRN-patient-assigned",
    });
    assert.ok(testAppointment);

    OrderRepository.stageOrder({
      id: "ord-test-authority-001",
      patientId: "patient-assigned",
      type: "medication",
      name: "Sertraline 50mg",
      details: { medication: "Sertraline 50mg" },
      orderedBy: "Dr. Provider Only",
    });

    // Setup actors:
    // 1. provider-only: role="provider", membershipRole="member" in orgMain
    UserRepository.create({ id: "user-provider-only", displayName: "Dr. Provider Only", credentials: "MD", role: "provider" });
    OrganizationRepository.upsertMembership({
      organizationId: orgMain,
      userId: "user-provider-only",
      patientAccessScope: "organization",
      membershipRole: "member",
    });

    // 2. provider+owner: role="provider", membershipRole="owner" in orgMain
    UserRepository.create({ id: "user-provider-owner", displayName: "Dr. Provider Owner", credentials: "MD", role: "provider" });
    OrganizationRepository.upsertMembership({
      organizationId: orgMain,
      userId: "user-provider-owner",
      patientAccessScope: "organization",
      membershipRole: "owner",
    });

    // 3. manager without clinical authority: role="staff", membershipRole="manager" in orgMain
    UserRepository.create({ id: "user-manager-nonclinical", displayName: "Morgan Manager", credentials: "MBA", role: "staff" });
    OrganizationRepository.upsertMembership({
      organizationId: orgMain,
      userId: "user-manager-nonclinical",
      patientAccessScope: "organization",
      membershipRole: "manager",
    });

    // 4. billing scope: role="staff", membershipRole="member" in orgMain (non-clinical)
    UserRepository.create({ id: "user-billing-staff", displayName: "Bob Biller", credentials: "CPC", role: "staff" });
    OrganizationRepository.upsertMembership({
      organizationId: orgMain,
      userId: "user-billing-staff",
      patientAccessScope: "organization",
      membershipRole: "member",
    });

    // 5. assigned-only member: role="provider", patientAccessScope="assigned", linked only to patient-assigned
    UserRepository.create({ id: "user-assigned-only", displayName: "Dr. Assigned Only", credentials: "MD", role: "provider" });
    OrganizationRepository.upsertMembership({
      organizationId: orgMain,
      userId: "user-assigned-only",
      patientAccessScope: "assigned",
      membershipRole: "member",
    });
    db.prepare("INSERT INTO team_member_patients (user_id, patient_id, relationship, created_at) VALUES (?, ?, 'care-team', ?)")
      .run("user-assigned-only", "patient-assigned", now);

    // 6. unrelated organization member: active only in orgOther
    UserRepository.create({ id: "user-unrelated-org", displayName: "Dr. External", credentials: "MD", role: "provider" });
    OrganizationRepository.upsertMembership({
      organizationId: orgOther,
      userId: "user-unrelated-org",
      patientAccessScope: "organization",
      membershipRole: "owner",
    });

    // Obtain sessions
    const providerOnlyCookie = await sessionFor("user-provider-only");
    const providerOwnerCookie = await sessionFor("user-provider-owner");
    const managerCookie = await sessionFor("user-manager-nonclinical");
    const billingCookie = await sessionFor("user-billing-staff");
    const assignedOnlyCookie = await sessionFor("user-assigned-only");
    const unrelatedOrgCookie = await sessionFor("user-unrelated-org");

    // =========================================================================
    // SCENARIO 1: provider-only
    // Can sign notes/prescribe; CANNOT administer organization or templates
    // =========================================================================
    const providerOnlyActor = { userId: "user-provider-only", displayName: "Dr. Provider Only", role: "provider" as const };
    
    // Can draft encounter
    const encounter = await ClinicalActionGateway.execute({
      actor: providerOnlyActor,
      context: { source: "api", requestId: "provider-only-test" },
      expectedPatientId: "patient-assigned",
      action: {
        type: "save_encounter_draft",
        payload: {
          id: "enc-provider-only-001",
          patientId: "patient-assigned",
          chiefComplaint: "Synthetic evaluation",
          assessment: "Stable",
          plan: "Follow up",
        },
      },
    });
    assert.ok(encounter);

    // Can sign encounter
    const signed = await ClinicalActionGateway.execute({
      actor: providerOnlyActor,
      context: { source: "api", requestId: "provider-only-sign" },
      expectedPatientId: "patient-assigned",
      action: { type: "sign_encounter", payload: { encounterId: "enc-provider-only-001" } },
    });
    assert.ok(signed);

    // CANNOT administer organization members (403)
    const providerOnlyAdmin = await membersGet(new Request("http://ehr.local/api/organization/members", {
      headers: { cookie: providerOnlyCookie },
    }));
    assert.equal(providerOnlyAdmin.status, 403, "provider-only lacks administrative authority to manage organization");

    // CANNOT edit workspace templates (403)
    const providerOnlyTpl = await templatesPut(new Request("http://ehr.local/api/organization/workspace-templates", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: providerOnlyCookie },
      body: JSON.stringify({ name: "Provider Template", config: { density: "compact" } }),
    }));
    assert.equal(providerOnlyTpl.status, 403, "provider-only lacks permission to edit practice templates");

    // =========================================================================
    // SCENARIO 2: provider+owner
    // Has full clinical authority AND full administrative authority
    // =========================================================================
    const providerOwnerAdmin = await membersGet(new Request("http://ehr.local/api/organization/members", {
      headers: { cookie: providerOwnerCookie },
    }));
    assert.equal(providerOwnerAdmin.status, 200, "provider+owner can list organization members");

    const providerOwnerTpl = await templatesPut(new Request("http://ehr.local/api/organization/workspace-templates", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: providerOwnerCookie },
      body: JSON.stringify({ name: "Owner Practice Template", config: { density: "comfortable" } }),
    }));
    assert.equal(providerOwnerTpl.status, 200, "provider+owner can save practice templates");

    // =========================================================================
    // SCENARIO 3: manager without clinical authority
    // Can administer organization and templates; CANNOT sign notes or authorize orders
    // =========================================================================
    const managerActor = { userId: "user-manager-nonclinical", displayName: "Morgan Manager", role: "staff" as const };
    
    // Can administer members
    const managerAdmin = await membersGet(new Request("http://ehr.local/api/organization/members", {
      headers: { cookie: managerCookie },
    }));
    assert.equal(managerAdmin.status, 200, "manager can administer organization members");

    // Can edit templates
    const managerTpl = await templatesPut(new Request("http://ehr.local/api/organization/workspace-templates", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: managerCookie },
      body: JSON.stringify({ name: "Manager Operations Layout", config: { density: "compact" } }),
    }));
    assert.equal(managerTpl.status, 200, "manager can save practice templates");

    // CANNOT sign encounter
    await assert.rejects(
      ClinicalActionGateway.execute({
        actor: managerActor,
        context: { source: "api", requestId: "manager-sign-attempt" },
        expectedPatientId: "patient-assigned",
        action: { type: "sign_encounter", payload: { encounterId: "enc-provider-only-001" } },
      }),
      /lacks permission: sign_encounter/i,
      "manager without clinical authority cannot sign notes",
    );

    // CANNOT authorize orders
    await assert.rejects(
      ClinicalActionGateway.execute({
        actor: managerActor,
        context: { source: "api", requestId: "manager-auth-attempt" },
        expectedPatientId: "patient-assigned",
        action: { type: "authorize_order", payload: { orderId: "ord-test-authority-001" } },
      }),
      /lacks permission: authorize_order/i,
      "manager without clinical authority cannot authorize prescriptions",
    );

    // CANNOT access clinical queues (403)
    const managerQueues = await practiceQueuesGet(new Request("http://ehr.local/api/practice-queues?queue=unsigned", {
      headers: { cookie: managerCookie },
    }));
    assert.equal(managerQueues.status, 403, "non-clinical manager cannot read unsigned clinical encounters queue");

    // =========================================================================
    // SCENARIO 4: billing scope
    // Can read schedule and view financials; CANNOT read clinical queues;
    // Server-side field stripping: chiefComplaint is redacted from appointments
    // =========================================================================
    // Billing caller with read_schedule but without read_clinical
    const billingActor = {
      userId: "user-billing-staff",
      displayName: "Bob Biller",
      role: "staff" as const,
      capabilities: ["read_schedule" as const, "view_financial" as const, "collaborate_team" as const],
    };

    // Authenticated request via cookie (server derives actor)
    const billingApptsResponse = await appointmentsGet(new Request("http://ehr.local/api/appointments", {
      headers: { cookie: billingCookie },
    }));
    assert.equal(billingApptsResponse.status, 200, "billing caller can read schedule");
    const billingApptsBody = await billingApptsResponse.json();
    assert.ok(billingApptsBody.appointments.length > 0);
    const billingApt = billingApptsBody.appointments.find((a: any) => a.id === "apt-scope-001");
    assert.ok(billingApt, "appointment is present");
    assert.equal(billingApt.patientName, "Assigned Patient");
    assert.equal(billingApt.insurance, "Blue Cross");
    // CRITICAL: chiefComplaint MUST NOT reach the client
    assert.equal(
      billingApt.chiefComplaint,
      undefined,
      "role-inappropriate clinical narrative (chiefComplaint) must be stripped server-side",
    );

    // Contrast with clinical provider: chiefComplaint MUST be present
    const providerApptsResponse = await appointmentsGet(new Request("http://ehr.local/api/appointments", {
      headers: { cookie: providerOwnerCookie },
    }));
    assert.equal(providerApptsResponse.status, 200);
    const providerApptsBody = await providerApptsResponse.json();
    const providerApt = providerApptsBody.appointments.find((a: any) => a.id === "apt-scope-001");
    assert.ok(providerApt);
    assert.match(providerApt.chiefComplaint, /anxiety/i, "clinical provider receives chiefComplaint");

    // Billing caller CANNOT access clinical queues (403)
    const billingQueues = await practiceQueuesGet(new Request("http://ehr.local/api/practice-queues?queue=labs", {
      headers: { cookie: billingCookie },
    }));
    assert.equal(billingQueues.status, 403, "billing caller without read_clinical cannot access labs queue");

    // =========================================================================
    // SCENARIO 5: assigned-only member
    // Can access assigned patients; CANNOT access unassigned practice patient
    // =========================================================================
    const assignedReadAllowed = await appointmentsGet(new Request("http://ehr.local/api/appointments?patientId=patient-assigned", {
      headers: { cookie: assignedOnlyCookie },
    }));
    assert.equal(assignedReadAllowed.status, 200, "assigned-only member can read assigned patient appointments");

    const assignedReadDenied = await appointmentsGet(new Request("http://ehr.local/api/appointments?patientId=patient-unassigned", {
      headers: { cookie: assignedOnlyCookie },
    }));
    assert.equal(assignedReadDenied.status, 403, "assigned-only member cannot reach unassigned practice patient");

    // =========================================================================
    // SCENARIO 6: revoked member
    // Membership status set to 'revoked' -> requests fail 401/403
    // =========================================================================
    UserRepository.create({ id: "user-to-revoke", displayName: "To Revoke", role: "provider" });
    OrganizationRepository.upsertMembership({
      organizationId: orgMain,
      userId: "user-to-revoke",
      status: "active",
      patientAccessScope: "organization",
      membershipRole: "member",
    });
    const revokedCookie = await sessionFor("user-to-revoke");

    // Revoke membership via admin service
    const revokeResult = await membersPatch(new Request("http://ehr.local/api/organization/members", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: providerOwnerCookie },
      body: JSON.stringify({ userId: "user-to-revoke", status: "revoked" }),
    }));
    assert.equal(revokeResult.status, 200);

    // Request from revoked member using existing session is rejected with 401 (session revoked)
    const revokedAttempt = await appointmentsGet(new Request("http://ehr.local/api/appointments", {
      headers: { cookie: revokedCookie },
    }));
    assert.equal(revokedAttempt.status, 401, "revoked member's session is invalidated immediately");

    // =========================================================================
    // SCENARIO 7: unrelated organization
    // User in Org B cannot access Org A patient or members
    // =========================================================================
    const crossOrgPatient = await appointmentsGet(new Request("http://ehr.local/api/appointments?patientId=patient-assigned", {
      headers: { cookie: unrelatedOrgCookie },
    }));
    assert.equal(crossOrgPatient.status, 403, "user from unrelated organization cannot reach patient in Org A");

    const crossOrgAdmin = await membersGet(new Request(`http://ehr.local/api/organization/members?organizationId=${orgMain}`, {
      headers: { cookie: unrelatedOrgCookie },
    }));
    assert.equal(crossOrgAdmin.status, 403, "user from unrelated organization cannot administer Org A members");

    // =========================================================================
    // SCENARIO 8: forged persona
    // Client sends persona: "owner" or "pmhnp" in body/headers -> server ignores it
    // =========================================================================
    const forgedAdmin = await membersPatch(new Request("http://ehr.local/api/organization/members", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: billingCookie,
        "x-ehr-persona": "owner",
      },
      body: JSON.stringify({
        userId: "user-billing-staff",
        membershipRole: "owner",
        persona: "owner",
      }),
    }));
    assert.equal(forgedAdmin.status, 403, "forged client persona does not escalate administrative authority");

    // =========================================================================
    // SCENARIO 9: forged template permission
    // Non-editor calls PUT /api/organization/workspace-templates -> 403
    // =========================================================================
    const forgedTpl = await templatesPut(new Request("http://ehr.local/api/organization/workspace-templates", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie: billingCookie,
        "x-ehr-persona": "manager",
      },
      body: JSON.stringify({
        name: "Forged Layout",
        config: { density: "compact" },
        persona: "manager",
      }),
    }));
    assert.equal(forgedTpl.status, 403, "non-editor cannot create practice templates regardless of persona");

    // =========================================================================
    // SCENARIO 10: stale open tab after revocation
    // Valid session -> admin revokes user -> next request fails
    // =========================================================================
    UserRepository.create({ id: "user-stale-tab", displayName: "Stale Tab User", role: "provider" });
    OrganizationRepository.upsertMembership({
      organizationId: orgMain,
      userId: "user-stale-tab",
      status: "active",
      patientAccessScope: "organization",
      membershipRole: "member",
    });
    const staleCookie = await sessionFor("user-stale-tab");

    // Prior to revocation: request succeeds
    const priorRead = await appointmentsGet(new Request("http://ehr.local/api/appointments", {
      headers: { cookie: staleCookie },
    }));
    assert.equal(priorRead.status, 200, "session is valid initially");

    // Admin deactivates user
    const deactivateResult = await membersPatch(new Request("http://ehr.local/api/organization/members", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: providerOwnerCookie },
      body: JSON.stringify({ userId: "user-stale-tab", active: false }),
    }));
    assert.equal(deactivateResult.status, 200);

    // Stale tab makes another request
    const postRevocationRead = await appointmentsGet(new Request("http://ehr.local/api/appointments", {
      headers: { cookie: staleCookie },
    }));
    assert.equal(
      postRevocationRead.status,
      401,
      "stale open tab request fails immediately after revocation/deactivation",
    );
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV; else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET; else env.EHR_SESSION_SECRET = originalSecret;
  }
});
