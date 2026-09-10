import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STRONG_PASSWORD = "correct-horse-battery-staple-1";
const ROTATED_PASSWORD = "another-long-passphrase-2026";

test("a provisioned account is activated by its own holder, and only they can change the password", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-credential-lifecycle-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-credential-lifecycle-secret-0123456789";

  try {
    const [
      { POST: loginPost },
      { POST: activatePost },
      { POST: passwordPost },
      { POST: membersPost, PATCH: membersPatch },
      { GET: patientsGet },
      { AuthRepository },
      { AuditRepository },
    ] = await Promise.all([
      import("../app/api/auth/login/route"),
      import("../app/api/auth/activate/route"),
      import("../app/api/auth/password/route"),
      import("../app/api/organization/members/route"),
      import("../app/api/patients/route"),
      import("../app/server/repositories/auth-repository"),
      import("../app/server/repositories/audit-repository"),
    ]);

    async function devSession(userId: string): Promise<string> {
      const response = await loginPost(new Request("http://ehr.local/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      }));
      assert.equal(response.status, 200);
      return response.headers.get("set-cookie")!.split(";", 1)[0];
    }

    const adminCookie = await devSession("team-taylor");

    // ---- Provision, then hand over an activation token ---------------------
    const provisioned = await membersPost(new Request("http://ehr.local/api/organization/members", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({
        id: "new-prescriber",
        displayName: "New Prescriber",
        role: "provider",
        patientAccessScope: "organization",
      }),
    }));
    assert.equal(provisioned.status, 201);

    // A provisioned account has no credential yet, so password login cannot work.
    const beforeActivation = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "new.prescriber", password: STRONG_PASSWORD }),
    }));
    assert.equal(beforeActivation.status, 401, "an unactivated account cannot sign in");

    const issued = await membersPatch(new Request("http://ehr.local/api/organization/members", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ userId: "new-prescriber", issueActivationToken: true }),
    }));
    assert.equal(issued.status, 200);
    const issuedBody = (await issued.json()) as any;
    assert.ok(issuedBody.token, "the token is returned once to be handed over");

    // The administrator never learns a password, and the token is not recoverable
    // from the audit trail.
    const issueAudit = AuditRepository.getRecent(100)
      .find((entry) => String(entry.description).includes("activation token"));
    assert.ok(issueAudit, "issuing a token is audited");
    assert.ok(
      !JSON.stringify(issueAudit).includes(issuedBody.token),
      "the token itself is never written to the audit trail",
    );

    // ---- The holder activates and chooses their own password ---------------
    const weak = await activatePost(new Request("http://ehr.local/api/auth/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: issuedBody.token, username: "new.prescriber", password: "short" }),
    }));
    assert.equal(weak.status, 400, "a weak password is refused");

    const activated = await activatePost(new Request("http://ehr.local/api/auth/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: issuedBody.token,
        username: "new.prescriber",
        password: STRONG_PASSWORD,
      }),
    }));
    assert.equal(activated.status, 200);
    const activatedBody = (await activated.json()) as any;
    assert.equal(activatedBody.user.userId, "new-prescriber");
    assert.equal(
      activatedBody.user.password ?? activatedBody.token,
      undefined,
      "activation returns no credential material",
    );

    // Activation establishes no session; the user signs in normally.
    const signedIn = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "new.prescriber", password: STRONG_PASSWORD }),
    }));
    assert.equal(signedIn.status, 200, "the activated account signs in with its own password");
    const userCookie = signedIn.headers.get("set-cookie")!.split(";", 1)[0];

    // ---- The token is single-use -------------------------------------------
    const replay = await activatePost(new Request("http://ehr.local/api/auth/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: issuedBody.token,
        username: "new.prescriber",
        password: "a-completely-different-one",
      }),
    }));
    assert.equal(replay.status, 401, "an activation token cannot be redeemed twice");
    const stillOriginal = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "new.prescriber", password: STRONG_PASSWORD }),
    }));
    assert.equal(stillOriginal.status, 200, "the replay did not overwrite the password");

    const unknownToken = await activatePost(new Request("http://ehr.local/api/auth/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "not-a-real-token", username: "x.y", password: STRONG_PASSWORD }),
    }));
    assert.equal(unknownToken.status, 401);
    assert.equal(
      ((await unknownToken.json()) as any).error,
      ((await replay.json()) as any).error,
      "an unknown token is indistinguishable from a spent one",
    );

    // ---- Changing your own password ----------------------------------------
    const anonymousChange = await passwordPost(new Request("http://ehr.local/api/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: STRONG_PASSWORD, newPassword: ROTATED_PASSWORD }),
    }));
    assert.equal(anonymousChange.status, 401, "changing a password requires a session");

    const wrongCurrent = await passwordPost(new Request("http://ehr.local/api/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: userCookie },
      body: JSON.stringify({ currentPassword: "not-the-password", newPassword: ROTATED_PASSWORD }),
    }));
    assert.equal(
      wrongCurrent.status,
      401,
      "a live session alone is not enough; the current password is required",
    );

    // A second session for the same user, to prove the others are ended.
    const secondSignIn = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "new.prescriber", password: STRONG_PASSWORD }),
    }));
    assert.equal(secondSignIn.status, 200);
    const otherDeviceCookie = secondSignIn.headers.get("set-cookie")!.split(";", 1)[0];

    const changed = await passwordPost(new Request("http://ehr.local/api/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: userCookie },
      body: JSON.stringify({ currentPassword: STRONG_PASSWORD, newPassword: ROTATED_PASSWORD }),
    }));
    assert.equal(changed.status, 200);
    assert.ok(
      ((await changed.json()) as any).revokedSessions >= 1,
      "changing the password ends the account's other sessions",
    );

    const otherDeviceAfter = await patientsGet(new Request("http://ehr.local/api/patients", {
      headers: { cookie: otherDeviceCookie },
    }));
    assert.equal(otherDeviceAfter.status, 401, "the other device is signed out");

    const changingSessionAfter = await patientsGet(new Request("http://ehr.local/api/patients", {
      headers: { cookie: userCookie },
    }));
    assert.equal(
      changingSessionAfter.status,
      200,
      "the session that made the change stays signed in",
    );

    const oldPassword = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "new.prescriber", password: STRONG_PASSWORD }),
    }));
    assert.equal(oldPassword.status, 401, "the old password no longer works");

    const newPassword = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "new.prescriber", password: ROTATED_PASSWORD }),
    }));
    assert.equal(newPassword.status, 200, "the new password works");

    // ---- Nothing reusable is left in storage -------------------------------
    const identity = AuthRepository.getIdentityByUserId("new-prescriber");
    assert.ok(identity);
    assert.ok(
      !identity.passwordHash.includes(ROTATED_PASSWORD),
      "the password itself is never stored",
    );
    assert.ok(identity.passwordHash.startsWith("scrypt-v1$"));
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV; else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET; else env.EHR_SESSION_SECRET = originalSecret;
  }
});
