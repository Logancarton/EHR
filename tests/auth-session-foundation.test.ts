import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "response should set an EHR session cookie");
  const cookie = setCookie.split(";", 1)[0];
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  return cookie;
}

test("first-party user identity and revocable server sessions enforce authoritative roles", async () => {
  const originalCwd = process.cwd();
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-auth-session-"));

  process.chdir(isolatedRoot);
  process.env.NODE_ENV = "test";
  process.env.EHR_SESSION_SECRET = "synthetic-test-session-secret-0123456789abcdef";

  try {
    const [
      { AuthService },
      { AuthRepository },
      { AuditRepository },
      { getDatabase },
      {
        AuthenticationError,
        EHR_SESSION_COOKIE,
        createProviderSessionToken,
        getAuthenticatedProviderContext,
        getProviderContext,
      },
      { POST: loginPost },
      { POST: logoutPost },
      { GET: meGet },
    ] = await Promise.all([
      import("../app/server/auth/auth-service"),
      import("../app/server/repositories/auth-repository"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/db/connection"),
      import("../app/server/auth/provider-context"),
      import("../app/api/auth/login/route"),
      import("../app/api/auth/logout/route"),
      import("../app/api/auth/me/route"),
    ]);

    const db = getDatabase();
    const syntheticPassword = "Synthetic-Only-Authentication-Fixture";
    AuthService.configurePasswordCredential({
      userId: "team-taylor",
      username: "taylor",
      password: syntheticPassword,
    });

    const failedLogin = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "taylor", password: "incorrect-synthetic-fixture" }),
    }));
    assert.equal(failedLogin.status, 401);

    const loginResponse = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "Taylor", password: syntheticPassword }),
    }));
    assert.equal(loginResponse.status, 200);
    const providerCookie = cookieFrom(loginResponse);

    const meResponse = await meGet(new Request("http://ehr.local/api/auth/me", {
      headers: {
        cookie: providerCookie,
        "x-ehr-user-id": "forged-user",
        "x-ehr-role": "clinical_assistant",
      },
    }));
    assert.equal(meResponse.status, 200);
    const meBody = await meResponse.json() as any;
    assert.equal(meBody.user.userId, "team-taylor");
    assert.equal(meBody.user.role, "provider");

    // Role is recovered from the authoritative user record on every request,
    // rather than trusted from the signed token or client headers.
    db.prepare("UPDATE team_members SET role = 'staff', updated_at = ? WHERE id = 'team-taylor'")
      .run(new Date().toISOString());
    const changedRole = getAuthenticatedProviderContext(new Request("http://ehr.local", {
      headers: { cookie: providerCookie, "x-ehr-role": "provider" },
    }));
    assert.equal(changedRole.role, "staff");
    db.prepare("UPDATE team_members SET role = 'provider', updated_at = ? WHERE id = 'team-taylor'")
      .run(new Date().toISOString());

    // Development login may select an authoritative synthetic user without a
    // stored password, but the client still cannot elevate that server role.
    const assistantLogin = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "team-casey" }),
    }));
    assert.equal(assistantLogin.status, 200);
    const assistantCookie = cookieFrom(assistantLogin);
    const assistant = getAuthenticatedProviderContext(new Request("http://ehr.local", {
      headers: {
        cookie: assistantCookie,
        "x-ehr-user-id": "prototype-provider",
        "x-ehr-role": "provider",
      },
    }));
    assert.equal(assistant.userId, "team-casey");
    assert.equal(assistant.role, "clinical_assistant");

    const [cookieName, providerToken] = providerCookie.split("=");
    assert.equal(cookieName, EHR_SESSION_COOKIE);
    assert.ok(providerToken);
    const last = providerToken.slice(-1);
    const tamperedToken = `${providerToken.slice(0, -1)}${last === "A" ? "B" : "A"}`;
    assert.throws(
      () => getAuthenticatedProviderContext(new Request("http://ehr.local", {
        headers: { cookie: `${EHR_SESSION_COOKIE}=${tamperedToken}` },
      })),
      AuthenticationError,
    );

    const expiredAt = Date.now() - 1_000;
    AuthRepository.createSession({
      id: "expired-auth-session",
      userId: "team-taylor",
      expiresAt: new Date(expiredAt).toISOString(),
    });
    const expiredToken = createProviderSessionToken("expired-auth-session", expiredAt, expiredAt - 10_000);
    assert.throws(
      () => getAuthenticatedProviderContext(new Request("http://ehr.local", {
        headers: { cookie: `${EHR_SESSION_COOKIE}=${expiredToken}` },
      })),
      AuthenticationError,
    );

    const logoutResponse = await logoutPost(new Request("http://ehr.local/api/auth/logout", {
      method: "POST",
      headers: { cookie: providerCookie },
    }));
    assert.equal(logoutResponse.status, 200);
    assert.match(logoutResponse.headers.get("set-cookie") || "", /Max-Age=0/i);

    const afterLogout = await meGet(new Request("http://ehr.local/api/auth/me", {
      headers: { cookie: providerCookie },
    }));
    assert.equal(afterLogout.status, 401, "revoked sessions must not remain usable");

    process.env.NODE_ENV = "production";
    assert.throws(
      () => getProviderContext(new Request("http://ehr.local/api/patients")),
      AuthenticationError,
      "production requests without a valid server session must be rejected",
    );
    process.env.NODE_ENV = "test";

    const authEvents = AuditRepository.getRecent(50).filter((event) => event.eventType.startsWith("auth_"));
    assert.ok(authEvents.some((event) => event.eventType === "auth_login_failed"));
    assert.ok(authEvents.some((event) => event.eventType === "auth_login_succeeded"));
    assert.ok(authEvents.some((event) => event.eventType === "auth_logout"));
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete process.env.EHR_SESSION_SECRET;
    else process.env.EHR_SESSION_SECRET = originalSecret;
  }
});
