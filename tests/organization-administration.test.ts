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

test("organization administration is permission-gated, confined to the actor's own practice, and audited", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-organization-admin-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-organization-admin-secret-0123456789";

  try {
    const [
      { POST: loginPost },
      { GET: membersGet, POST: membersPost, PATCH: membersPatch },
      { GET: patientsGet },
      { OrganizationRepository },
      { AuditRepository },
      { getDatabase },
    ] = await Promise.all([
      import("../app/api/auth/login/route"),
      import("../app/api/organization/members/route"),
      import("../app/api/patients/route"),
      import("../app/server/repositories/organization-repository"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/db/connection"),
    ]);

    const db = getDatabase();
    const now = new Date().toISOString();
    const homeOrganization = OrganizationRepository.defaultOrganizationId();

    async function sessionFor(userId: string): Promise<string> {
      const response = await loginPost(new Request("http://ehr.local/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      }));
      assert.equal(response.status, 200, `login should succeed for ${userId}`);
      return cookieFrom(response);
    }

    // A separate practice with its own provider — same role, different membership.
    OrganizationRepository.createOrganization("org-other-practice", "Other Practice");
    db.prepare(`
      INSERT OR IGNORE INTO team_members (
        id, display_name, credentials, role, initials, presence, active, created_at, updated_at
      ) VALUES (?, ?, NULL, 'provider', 'OP', 'online', 1, ?, ?)
    `).run("other-provider", "Other Provider", now, now);
    OrganizationRepository.upsertMembership({ organizationId: "org-other-practice", userId: "other-provider" });

    const adminCookie = await sessionFor("team-taylor");
    const assistantCookie = await sessionFor("team-casey");
    const otherCookie = await sessionFor("other-provider");

    // ---- Authentication and permission ------------------------------------
    const anonymous = await membersGet(new Request("http://ehr.local/api/organization/members"));
    assert.equal(anonymous.status, 401, "administration requires a server session");

    const assistantRead = await membersGet(new Request("http://ehr.local/api/organization/members", {
      headers: { cookie: assistantCookie },
    }));
    assert.equal(
      assistantRead.status,
      403,
      "a clinical assistant cannot administer the organization's users",
    );

    const adminRead = await membersGet(new Request("http://ehr.local/api/organization/members", {
      headers: { cookie: adminCookie },
    }));
    assert.equal(adminRead.status, 200);
    const roster = (await adminRead.json()) as any;
    assert.equal(roster.organizationId, homeOrganization);
    assert.ok(
      roster.members.some((m: any) => m.userId === "team-taylor"),
      "the administrator sees their own organization's members",
    );
    assert.ok(
      !roster.members.some((m: any) => m.userId === "other-provider"),
      "another practice's members never appear",
    );

    // ---- Cross-organization administration is refused ----------------------
    const reachAcross = await membersGet(new Request(
      "http://ehr.local/api/organization/members?organizationId=org-other-practice",
      { headers: { cookie: adminCookie } },
    ));
    assert.equal(
      reachAcross.status,
      403,
      "naming another organization does not grant administration of it",
    );

    const provisionAcross = await membersPost(new Request("http://ehr.local/api/organization/members", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: otherCookie },
      body: JSON.stringify({
        displayName: "Injected Clinician",
        role: "provider",
        organizationId: homeOrganization,
        patientAccessScope: "organization",
      }),
    }));
    assert.equal(
      provisionAcross.status,
      403,
      "a provider cannot provision a user into a practice they do not belong to",
    );

    // ---- Provisioning ------------------------------------------------------
    const provisioned = await membersPost(new Request("http://ehr.local/api/organization/members", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({
        id: "new-coordinator",
        displayName: "New Coordinator",
        role: "clinical_assistant",
        patientAccessScope: "assigned",
      }),
    }));
    assert.equal(provisioned.status, 201);
    const provisionedBody = (await provisioned.json()) as any;
    assert.equal(provisionedBody.organizationId, homeOrganization);
    assert.equal(provisionedBody.patientAccessScope, "assigned");

    const memberships = OrganizationRepository.membershipsForUser("new-coordinator");
    assert.deepEqual(
      memberships.map((m) => [m.organizationId, m.status, m.patientAccessScope]),
      [[homeOrganization, "active", "assigned"]],
      "a provisioned user always lands in the administrator's organization",
    );

    // A newly provisioned assigned-scope coordinator reaches no patients yet.
    const coordinatorCookie = await sessionFor("new-coordinator");
    const coordinatorRoster = await patientsGet(new Request("http://ehr.local/api/patients", {
      headers: { cookie: coordinatorCookie },
    }));
    assert.equal(coordinatorRoster.status, 200);
    assert.deepEqual(
      ((await coordinatorRoster.json()) as any).patients,
      [],
      "assigned scope with no assignments reaches nothing",
    );

    const duplicate = await membersPost(new Request("http://ehr.local/api/organization/members", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ id: "new-coordinator", displayName: "Duplicate", role: "staff" }),
    }));
    assert.equal(duplicate.status, 400, "an existing user id is refused rather than silently reused");

    // ---- Revocation ends live sessions -------------------------------------
    const widened = await membersPatch(new Request("http://ehr.local/api/organization/members", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ userId: "new-coordinator", patientAccessScope: "organization" }),
    }));
    assert.equal(widened.status, 200);
    const widenedRoster = await patientsGet(new Request("http://ehr.local/api/patients", {
      headers: { cookie: coordinatorCookie },
    }));
    assert.ok(
      ((await widenedRoster.json()) as any).patients.length > 0,
      "widening scope takes effect on the existing session",
    );

    const revoked = await membersPatch(new Request("http://ehr.local/api/organization/members", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ userId: "new-coordinator", status: "revoked" }),
    }));
    assert.equal(revoked.status, 200);
    assert.ok(
      ((await revoked.json()) as any).revokedSessions >= 1,
      "revoking membership ends the user's live sessions",
    );

    const afterRevocation = await patientsGet(new Request("http://ehr.local/api/patients", {
      headers: { cookie: coordinatorCookie },
    }));
    assert.equal(
      afterRevocation.status,
      401,
      "the revoked user's session no longer authenticates at all",
    );

    // ---- Deactivation ------------------------------------------------------
    const reinstated = await membersPatch(new Request("http://ehr.local/api/organization/members", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ userId: "new-coordinator", status: "active" }),
    }));
    assert.equal(reinstated.status, 200);
    const secondCoordinatorCookie = await sessionFor("new-coordinator");

    const deactivated = await membersPatch(new Request("http://ehr.local/api/organization/members", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ userId: "new-coordinator", active: false }),
    }));
    assert.equal(deactivated.status, 200);
    const afterDeactivation = await patientsGet(new Request("http://ehr.local/api/patients", {
      headers: { cookie: secondCoordinatorCookie },
    }));
    assert.equal(afterDeactivation.status, 401, "a deactivated user cannot authenticate");

    // ---- An administrator cannot strand the organization -------------------
    const selfRevoke = await membersPatch(new Request("http://ehr.local/api/organization/members", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ userId: "team-taylor", status: "revoked" }),
    }));
    assert.equal(selfRevoke.status, 400, "an administrator cannot revoke their own membership");

    const selfDeactivate = await membersPatch(new Request("http://ehr.local/api/organization/members", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ userId: "team-taylor", active: false }),
    }));
    assert.equal(selfDeactivate.status, 400, "an administrator cannot deactivate their own account");

    const stillAdministering = await membersGet(new Request("http://ehr.local/api/organization/members", {
      headers: { cookie: adminCookie },
    }));
    assert.equal(stillAdministering.status, 200);

    // ---- Every access decision is audited to the acting administrator ------
    const events = AuditRepository.getRecent(200);
    for (const eventType of [
      "organization_user_provisioned",
      "organization_membership_updated",
      "organization_user_deactivated",
    ]) {
      const entry = events.find((candidate) => candidate.eventType === eventType);
      assert.ok(entry, `${eventType} should be audited`);
      assert.equal(entry.userId, "team-taylor", `${eventType} is attributed to the acting administrator`);
    }
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV; else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET; else env.EHR_SESSION_SECRET = originalSecret;
  }
});
