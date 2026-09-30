import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Team collaboration stays inside a practice, and messaging reads follow role:
 *
 * - The team directory, direct messages, task-sharing and presence reach only
 *   colleagues in the same practice. They used to reach every member of every
 *   practice.
 * - A patient linked to a team message is checked with the patient-access policy
 *   for both people, not the assignment table alone.
 * - Front desk (no `read_clinical`) may read an intake contact's conversation,
 *   which it may already write, but not a chart's conversation (D-051, D-112).
 */
test("team collaboration and message reads are scoped to practice and role", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  process.chdir(mkdtempSync(join(tmpdir(), "ehr-team-scope-")));
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-team-scope-secret-0123456789abcdef";

  try {
    const [
      { grantSyntheticOrganizationAccess },
      { AuthRepository },
      { EHR_SESSION_COOKIE, createProviderSessionToken },
      { GET: teamGet },
      { GET: teamMessagesGet, POST: teamMessagesPost },
      { GET: presenceGet, POST: presencePost },
      { GET: messagesGet },
      { prospectivePersonService },
      { ClinicalActionGateway },
      { OrganizationRepository },
    ] = await Promise.all([
      import("./helpers/organization-access"),
      import("../app/server/repositories/auth-repository"),
      import("../app/server/auth/provider-context"),
      import("../app/api/team/route"),
      import("../app/api/team/messages/route"),
      import("../app/api/team/presence/route"),
      import("../app/api/messages/route"),
      import("../app/server/services/prospective-person-service"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/organization-repository"),
    ]);

    const homeOrg = OrganizationRepository.defaultOrganizationId();
    await grantSyntheticOrganizationAccess(["scope-home-provider"], { organizationId: homeOrg });
    await grantSyntheticOrganizationAccess(["scope-home-frontdesk"], { organizationId: homeOrg, role: "staff" });
    await grantSyntheticOrganizationAccess(["scope-away-provider"], { organizationId: "org-scope-away" });

    function cookieFor(userId: string): string {
      const expiresAt = Date.now() + 60 * 60 * 1000;
      const sessionId = `team-scope-${userId}-${Math.random().toString(36).slice(2)}`;
      AuthRepository.createSession({ id: sessionId, userId, expiresAt: new Date(expiresAt).toISOString() });
      return `${EHR_SESSION_COOKIE}=${createProviderSessionToken(sessionId, expiresAt)}`;
    }
    const get = (handler: (req: Request) => Promise<Response>, url: string, userId: string, headers: Record<string, string> = {}) =>
      handler(new Request(`http://ehr.local${url}`, { headers: { cookie: cookieFor(userId), ...headers } }));
    const post = (handler: (req: Request) => Promise<Response>, url: string, userId: string, body: { patientId?: string } & Record<string, unknown>) =>
      handler(new Request(`http://ehr.local${url}`, {
        method: "POST",
        headers: {
          cookie: cookieFor(userId),
          "content-type": "application/json",
          // A patient-linked action names its active chart, as the client does.
          ...(body.patientId ? { "x-ehr-patient-id": body.patientId } : {}),
        },
        body: JSON.stringify(body),
      }));

    // 1. The directory lists colleagues only.
    const homeTeam = (await (await get(teamGet, "/api/team", "scope-home-provider")).json()) as {
      team: { partners: Array<{ member: { id: string } }> };
    };
    const homeIds = homeTeam.team.partners.map((partner) => partner.member.id);
    assert.ok(homeIds.includes("scope-home-frontdesk"), "a colleague is listed");
    assert.ok(!homeIds.includes("scope-away-provider"), "a member of another practice is not listed");

    // 2. Another practice's member can be neither read nor written to.
    assert.equal((await get(teamMessagesGet, "/api/team/messages?partnerId=scope-away-provider", "scope-home-provider")).status, 404);
    const crossSend = await post(teamMessagesPost, "/api/team/messages", "scope-home-provider", { partnerId: "scope-away-provider", content: "Hello?" });
    assert.equal(crossSend.status, 404, "reads as not found, so the other practice's member is not confirmed");
    const colleagueSend = await post(teamMessagesPost, "/api/team/messages", "scope-home-provider", { partnerId: "scope-home-frontdesk", content: "Room 2 is free." });
    assert.equal(colleagueSend.status, 201);

    // 3. A patient link follows the access policy: an organization-scope colleague
    //    may link a practice chart without being individually assigned to it...
    const linked = await post(teamMessagesPost, "/api/team/messages", "scope-home-provider", {
      partnerId: "scope-home-frontdesk", content: "About Maya.", patientId: "maya-chen",
    });
    assert.equal(linked.status, 201, `both colleagues reach this chart through their practice: ${await linked.clone().text()}`);
    // ...and the gateway itself refuses a chart the sender cannot reach.
    const outsiderLink = await post(teamMessagesPost, "/api/team/messages", "scope-away-provider", {
      partnerId: "scope-away-provider", content: "x", patientId: "maya-chen",
    });
    assert.equal(outsiderLink.status, 403);

    // 4. Presence shows colleagues only.
    await post(presencePost, "/api/team/presence", "scope-away-provider", {});
    await post(presencePost, "/api/team/presence", "scope-home-frontdesk", {});
    const presence = (await (await get(presenceGet, "/api/team/presence", "scope-home-provider")).json()) as {
      presence: Array<{ userId: string }>;
    };
    const presentIds = presence.presence.map((record) => record.userId);
    assert.ok(presentIds.includes("scope-home-frontdesk"));
    assert.ok(!presentIds.includes("scope-away-provider"));

    // 5. Front desk reads an intake contact's conversation, not a chart's.
    const staff = {
      userId: "scope-home-frontdesk", displayName: "Front Desk", organizationId: homeOrg, role: "staff" as const,
    };
    const prospect = prospectivePersonService.create(
      { name: "Scope Contact", dob: "1990-03-03", mobilePhone: "555-555-0133", email: "scope@example.test" },
      staff,
      { source: "api" },
    );
    await ClinicalActionGateway.execute({
      actor: staff,
      context: { source: "api" },
      expectedPatientId: prospect.id,
      action: { type: "create_message_thread", payload: { patientId: prospect.id, subject: "Welcome", content: "Your forms are ready." } },
    });
    const intakeRead = await get(messagesGet, `/api/messages?patientId=${prospect.id}`, "scope-home-frontdesk", { "x-ehr-patient-id": prospect.id });
    assert.equal(intakeRead.status, 200, "front desk reads the conversation it can write");
    const intakeBody = (await intakeRead.json()) as { threads: Array<{ subject: string }> };
    assert.deepEqual(intakeBody.threads.map((thread) => thread.subject), ["Welcome"]);

    const chartRead = await get(messagesGet, "/api/messages?patientId=maya-chen", "scope-home-frontdesk", { "x-ehr-patient-id": "maya-chen" });
    assert.equal(chartRead.status, 403, "a chart's conversation stays clinical");
    const practiceList = await get(messagesGet, "/api/messages", "scope-home-frontdesk");
    assert.equal(practiceList.status, 403, "the practice-wide chart list stays clinical");
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
