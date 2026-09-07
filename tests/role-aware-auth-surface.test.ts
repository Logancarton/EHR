import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function sessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie");
  assert.ok(header);
  return header.split(";", 1)[0];
}

test("current-user API exposes server-derived permissions for subtle role-aware UI", async () => {
  const repoRoot = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-role-ui-"));
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-role-aware-session-secret-0123456789";

  try {
    const [{ POST: loginPost }, { GET: meGet }] = await Promise.all([
      import("../app/api/auth/login/route"),
      import("../app/api/auth/me/route"),
    ]);

    const assistantLogin = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "team-casey" }),
    }));
    assert.equal(assistantLogin.status, 200);
    const assistantMe = await meGet(new Request("http://ehr.local/api/auth/me", {
      headers: { cookie: sessionCookie(assistantLogin) },
    }));
    const assistantBody = await assistantMe.json() as any;
    assert.equal(assistantBody.user.role, "clinical_assistant");
    assert.ok(assistantBody.permissions.includes("read_clinical"));
    assert.ok(assistantBody.permissions.includes("edit_draft"));
    assert.ok(!assistantBody.permissions.includes("sign_encounter"));
    assert.ok(!assistantBody.permissions.includes("authorize_order"));
    assert.ok(!assistantBody.permissions.includes("transmit_order"));

    const providerLogin = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "team-taylor" }),
    }));
    assert.equal(providerLogin.status, 200);
    const providerMe = await meGet(new Request("http://ehr.local/api/auth/me", {
      headers: { cookie: sessionCookie(providerLogin) },
    }));
    const providerBody = await providerMe.json() as any;
    assert.equal(providerBody.user.role, "provider");
    assert.ok(providerBody.permissions.includes("sign_encounter"));
    assert.ok(providerBody.permissions.includes("authorize_order"));
    assert.ok(providerBody.permissions.includes("transmit_order"));

    // Smoke-check that the permission data is actually wired to a specific legal UI
    // affordance rather than merely returned unused by the API.
    const toolbar = readFileSync(join(repoRoot, "app/components/encounter/EncounterToolbar.tsx"), "utf8");
    const roleCss = readFileSync(join(repoRoot, "app/role-aware.css"), "utf8");
    assert.match(toolbar, /provider-only-sign-action/);
    assert.match(roleCss, /data-can-sign-encounter="false"/);
    assert.match(roleCss, /provider-only-sign-action/);
  } finally {
    process.chdir(repoRoot);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
