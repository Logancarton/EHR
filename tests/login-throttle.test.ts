import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ATTEMPT_WINDOW_MS,
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  attemptsRemaining,
  lockState,
  recordFailure,
} from "../app/lib/login-throttle-policy";

const PASSWORD = "correct-horse-battery-staple-1";

test("the throttle policy counts within a window, locks at the limit, and expires the lock", () => {
  const start = 1_000_000;

  let record = recordFailure(null, start);
  assert.equal(record.failedAttempts, 1);
  assert.equal(record.lockedUntil, undefined);
  assert.equal(attemptsRemaining(record, start), MAX_FAILED_ATTEMPTS - 1);

  for (let attempt = 2; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
    record = recordFailure(record, start + attempt);
    assert.equal(record.lockedUntil, undefined, `attempt ${attempt} should not lock yet`);
  }

  record = recordFailure(record, start + MAX_FAILED_ATTEMPTS);
  assert.equal(record.failedAttempts, MAX_FAILED_ATTEMPTS);
  assert.ok(record.lockedUntil, "the limiting attempt locks the account");
  assert.equal(attemptsRemaining(record, start + MAX_FAILED_ATTEMPTS), 0);

  const lockedAt = start + MAX_FAILED_ATTEMPTS;
  assert.equal(lockState(record, lockedAt).locked, true);
  assert.equal(lockState(record, lockedAt + LOCKOUT_MS - 1).locked, true);
  assert.equal(
    lockState(record, lockedAt + LOCKOUT_MS + 1).locked,
    false,
    "the lock expires on its own",
  );

  // A run of failures older than the window is stale and starts over, so an
  // occasional typo months apart never accumulates into a lockout.
  const stale = recordFailure(record, lockedAt + ATTEMPT_WINDOW_MS + 1);
  assert.equal(stale.failedAttempts, 1);
  assert.equal(stale.lockedUntil, undefined);

  assert.equal(lockState(null, start).locked, false);
  assert.equal(attemptsRemaining(null, start), MAX_FAILED_ATTEMPTS);
});

test("repeated password guessing locks the account, and an administrator can clear it", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-login-throttle-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-login-throttle-secret-0123456789";

  try {
    const [
      { POST: loginPost },
      { POST: activatePost },
      { POST: membersPost, PATCH: membersPatch },
      { AuditRepository },
      { AuthRepository },
    ] = await Promise.all([
      import("../app/api/auth/login/route"),
      import("../app/api/auth/activate/route"),
      import("../app/api/organization/members/route"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/repositories/auth-repository"),
    ]);

    async function attempt(username: string, password: string) {
      return loginPost(new Request("http://ehr.local/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      }));
    }

    const adminLogin = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "team-taylor" }),
    }));
    const adminCookie = adminLogin.headers.get("set-cookie")!.split(";", 1)[0];

    await membersPost(new Request("http://ehr.local/api/organization/members", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ id: "throttled-user", displayName: "Throttled User", role: "provider" }),
    }));
    const issued = await membersPatch(new Request("http://ehr.local/api/organization/members", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ userId: "throttled-user", issueActivationToken: true }),
    }));
    const token = ((await issued.json()) as any).token;
    await activatePost(new Request("http://ehr.local/api/auth/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, username: "throttled.user", password: PASSWORD }),
    }));

    // The right password works before any failures.
    assert.equal((await attempt("throttled.user", PASSWORD)).status, 200);

    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      const response = await attempt("throttled.user", `wrong-guess-${i}`);
      assert.equal(response.status, 401, `guess ${i} should be refused`);
    }

    // Locked: even the correct password is now refused, so the lockout cannot be
    // worn down by continuing to guess.
    const correctWhileLocked = await attempt("throttled.user", PASSWORD);
    assert.equal(correctWhileLocked.status, 401, "a locked account refuses the right password too");

    // The message must not distinguish a locked account from a wrong password, or
    // the endpoint becomes a way to discover which usernames exist.
    const lockedMessage = ((await correctWhileLocked.json()) as any).error;
    const wrongWhileLocked = await attempt("throttled.user", "another-wrong-one");
    assert.equal(
      ((await wrongWhileLocked.json()) as any).error,
      lockedMessage,
      "a lockout is indistinguishable from a bad password",
    );
    const unknownUser = await attempt("no.such.person", "whatever-they-typed");
    assert.equal(unknownUser.status, 401);
    assert.equal(
      ((await unknownUser.json()) as any).error,
      lockedMessage,
      "an unknown username is indistinguishable too",
    );

    const lockAudit = AuditRepository.getRecent(200)
      .find((entry) => entry.eventType === "auth_login_locked");
    assert.ok(lockAudit, "a lockout is audited");
    assert.ok(
      !JSON.stringify(lockAudit).includes(PASSWORD),
      "no attempted password reaches the audit trail",
    );

    // Guessing an unknown username is counted on the same budget, so username
    // discovery is limited rather than free.
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      await attempt("guessed.name", `probe-${i}`);
    }
    assert.ok(
      AuthRepository.getLoginAttempts("guessed.name")?.lockedUntil,
      "attempts against a non-existent username are counted too",
    );

    // ---- An administrator restores access ----------------------------------
    const cleared = await membersPatch(new Request("http://ehr.local/api/organization/members", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ userId: "throttled-user", clearLoginLockout: true }),
    }));
    assert.equal(cleared.status, 200);

    const afterClear = await attempt("throttled.user", PASSWORD);
    assert.equal(afterClear.status, 200, "the clinician can sign in again immediately");

    const unlockAudit = AuditRepository.getRecent(200)
      .find((entry) => entry.eventType === "auth_login_unlocked");
    assert.equal(unlockAudit?.userId, "team-taylor", "clearing a lockout is attributed to the administrator");

    // A successful sign-in resets the counter, so earlier typos do not accumulate.
    await attempt("throttled.user", "one-typo");
    assert.equal((await attempt("throttled.user", PASSWORD)).status, 200);
    assert.equal(
      AuthRepository.getLoginAttempts("throttled.user"),
      null,
      "signing in clears the failure counter",
    );

    // Clearing is confined like every other administration action.
    const foreign = await membersPatch(new Request("http://ehr.local/api/organization/members", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({
        userId: "throttled-user",
        organizationId: "org-not-mine",
        clearLoginLockout: true,
      }),
    }));
    assert.equal(foreign.status, 403, "clearing a lockout cannot reach another practice");
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV; else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET; else env.EHR_SESSION_SECRET = originalSecret;
  }
});
