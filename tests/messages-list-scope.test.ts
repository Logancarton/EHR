import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The practice-wide message list (`GET /api/messages` with no patient) returns
 * only conversations for charts the signed-in clinician may reach. It used to
 * return every thread in the database, to anyone signed in, and a clinician with
 * no access at all would have been handed everything rather than nothing.
 */
test("the practice-wide message list is scoped to the caller's accessible patients", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  process.chdir(mkdtempSync(join(tmpdir(), "ehr-messages-scope-")));
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-messages-scope-secret-0123456789abcdef";

  try {
    const [
      { grantSyntheticOrganizationAccess },
      { AuthRepository },
      { EHR_SESSION_COOKIE, createProviderSessionToken },
      { GET: messagesGet },
      { ClinicalActionGateway },
      { MessageRepository },
      { getDatabase },
    ] = await Promise.all([
      import("./helpers/organization-access"),
      import("../app/server/repositories/auth-repository"),
      import("../app/server/auth/provider-context"),
      import("../app/api/messages/route"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/message-repository"),
      import("../app/server/db/connection"),
    ]);

    function cookieFor(userId: string): string {
      const expiresAt = Date.now() + 60 * 60 * 1000;
      const sessionId = `messages-scope-${userId}`;
      AuthRepository.createSession({ id: sessionId, userId, expiresAt: new Date(expiresAt).toISOString() });
      return `${EHR_SESSION_COOKIE}=${createProviderSessionToken(sessionId, expiresAt)}`;
    }

    async function listThreads(userId: string) {
      const response = await messagesGet(new Request("http://ehr.local/api/messages", { headers: { cookie: cookieFor(userId) } }));
      assert.equal(response.status, 200);
      const body = (await response.json()) as { threads: Array<{ patientId: string; thread: { id: string } }> };
      return body.threads;
    }

    // The demo practice's own charts carry seeded conversations (Maya Chen's among them).
    const demoPatientIds = new Set(
      (getDatabase().prepare("SELECT DISTINCT patient_id FROM messages WHERE patient_id IS NOT NULL").all() as Array<{ patient_id: string }>)
        .map((row) => row.patient_id),
    );
    assert.ok(demoPatientIds.has("maya-chen"), "the fixture practice has conversations to leak");

    // A clinician in a second, separate practice with one chart and one thread of its own.
    const otherOrg = await grantSyntheticOrganizationAccess(["scope-outsider"], { organizationId: "org-scope-other" });
    const outsider = { userId: "scope-outsider", displayName: "Other Practice", credentials: "MD", role: "provider" as const, organizationId: otherOrg };
    await ClinicalActionGateway.execute({
      actor: outsider,
      context: { source: "api" },
      action: {
        type: "create_patient",
        payload: {
          id: "scope-other-patient", name: "Other Practice Patient", initials: "OP", dob: "01/01/1985", age: 41,
          pronouns: "they/them", mrn: "OTHER-001", status: "Established", allergies: [], diagnoses: [], meds: [],
          vitals: {}, lastVisit: "Initial", nextVisit: "Unscheduled",
        },
      },
    });
    const otherThread = (await ClinicalActionGateway.execute({
      actor: outsider,
      context: { source: "api" },
      expectedPatientId: "scope-other-patient",
      action: { type: "create_message_thread", payload: { patientId: "scope-other-patient", subject: "Other practice", content: "Private." } },
    })) as { id: string };

    // 1. A demo-practice clinician sees their practice's threads and not the other practice's.
    const demoThreads = await listThreads("team-taylor");
    assert.ok(demoThreads.some((row) => row.patientId === "maya-chen"));
    assert.ok(!demoThreads.some((row) => row.thread.id === otherThread.id), "another practice's thread never appears");

    // 2. The other practice's clinician sees only their own.
    const outsiderThreads = await listThreads("scope-outsider");
    assert.deepEqual(outsiderThreads.map((row) => row.thread.id), [otherThread.id]);

    // 3. A signed-in user with no practice membership sees nothing — not everything.
    getDatabase()
      .prepare(`INSERT INTO team_members (id, display_name, credentials, role, initials, presence, active, created_at, updated_at)
                VALUES ('scope-unaffiliated', 'Unaffiliated', NULL, 'provider', 'UN', 'offline', 1, ?, ?)`)
      .run(new Date().toISOString(), new Date().toISOString());
    assert.deepEqual(await listThreads("scope-unaffiliated"), []);

    // The repository itself treats an empty scope as no access.
    assert.deepEqual(MessageRepository.getAllThreads([]), []);
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
