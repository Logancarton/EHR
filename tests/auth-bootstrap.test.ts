import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STRONG_PASSWORD = "correct-horse-battery-staple-1";

test("first-run bootstrap mints one activation, then refuses once anyone has a credential", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-bootstrap-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-bootstrap-session-secret-0123456789";

  try {
    const [
      { bootstrapFirstAccount },
      { POST: activatePost },
      { POST: loginPost },
      { GET: membersGet },
      { OrganizationRepository },
    ] = await Promise.all([
      import("../scripts/bootstrap-account"),
      import("../app/api/auth/activate/route"),
      import("../app/api/auth/login/route"),
      import("../app/api/organization/members/route"),
      import("../app/server/repositories/organization-repository"),
    ]);

    // A production build has no development sign-in and a provisioned user has no
    // password, so a brand-new installation has nobody who can sign in at all.
    const issued = bootstrapFirstAccount({ baseUrl: "http://localhost:3000" });
    assert.equal(issued.status, "issued");
    if (issued.status !== "issued") throw new Error("unreachable");

    // The first account administers the practice, so it holds organization scope.
    const memberships = OrganizationRepository.membershipsForUser(issued.userId);
    assert.deepEqual(
      memberships.map((m) => [m.status, m.patientAccessScope]),
      [["active", "organization"]],
      "the bootstrap account can administer and reach the practice",
    );

    const token = new URL(issued.url).searchParams.get("activate");
    assert.ok(token, "the activation link carries a token");

    // Before activation, re-running reissues — the "I lost the link" path.
    const reissued = bootstrapFirstAccount({ baseUrl: "http://localhost:3000" });
    assert.equal(reissued.status, "issued");
    if (reissued.status !== "issued") throw new Error("unreachable");
    const secondToken = new URL(reissued.url).searchParams.get("activate");
    assert.notEqual(secondToken, token, "reissuing produces a new token");

    const supersededReplay = await activatePost(new Request("http://ehr.local/api/auth/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, username: "logan", password: STRONG_PASSWORD }),
    }));
    assert.equal(supersededReplay.status, 401, "reissuing supersedes the earlier token");

    const activated = await activatePost(new Request("http://ehr.local/api/auth/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: secondToken, username: "logan", password: STRONG_PASSWORD }),
    }));
    assert.equal(activated.status, 200);

    // Once anyone holds a credential this is closed for good: it must not become a
    // back door that mints tokens for existing users around the administration
    // boundary.
    assert.equal(
      bootstrapFirstAccount({ baseUrl: "http://localhost:3000" }).status,
      "skipped",
      "bootstrap refuses once an account has a credential",
    );

    // The bootstrapped account can sign in and administer the practice.
    const signedIn = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "logan", password: STRONG_PASSWORD }),
    }));
    assert.equal(signedIn.status, 200);
    const cookie = signedIn.headers.get("set-cookie")!.split(";", 1)[0];

    const administering = await membersGet(new Request("http://ehr.local/api/organization/members", {
      headers: { cookie },
    }));
    assert.equal(administering.status, 200, "the first account can provision the rest of the practice");
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV; else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET; else env.EHR_SESSION_SECRET = originalSecret;
  }
});
