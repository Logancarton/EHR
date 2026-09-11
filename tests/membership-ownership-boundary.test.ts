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

/**
 * Ownership of a practice.
 *
 * Two rules make this safe, and neither is expressible with the clinical
 * permission set: `manage_organization` is held by every provider, so gating on
 * it alone would let any clinician promote themselves and take over the
 * practice's shared settings.
 *
 * 1. Only a sitting owner moves the membership role.
 * 2. An organization always keeps one active owner, because ownership gates the
 *    shared layouts and nothing outside the database could restore it.
 */
test("practice ownership cannot be self-granted and cannot be abandoned", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-ownership-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-ownership-boundary-secret-0123456789";

  try {
    const [
      { POST: loginPost },
      { GET: membersGet, PATCH: membersPatch },
      { OrganizationRepository },
      { getDatabase },
    ] = await Promise.all([
      import("../app/api/auth/login/route"),
      import("../app/api/organization/members/route"),
      import("../app/server/repositories/organization-repository"),
      import("../app/server/db/connection"),
    ]);

    const db = getDatabase();
    const organizationId = OrganizationRepository.defaultOrganizationId();

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

    const setRole = db.prepare(
      `UPDATE organization_memberships SET membership_role = ?
       WHERE organization_id = ? AND user_id = ?`,
    );
    setRole.run("owner", organizationId, "team-taylor");
    setRole.run("member", organizationId, "prototype-provider");

    const ownerCookie = await sessionFor("team-taylor");
    // A provider, so this session holds `manage_organization` — but is not an owner.
    const providerCookie = await sessionFor("prototype-provider");

    const url = "http://ehr.local/api/organization/members";

    async function patch(cookie: string, body: Record<string, unknown>) {
      return membersPatch(
        new Request(url, {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify(body),
        }),
      );
    }

    async function roleOf(userId: string): Promise<string> {
      const response = await membersGet(new Request(url, { headers: { cookie: ownerCookie } }));
      const body = (await response.json()) as any;
      return body.members.find((member: any) => member.userId === userId)?.membershipRole;
    }

    // ---- Ownership cannot be self-granted ---------------------------------
    const selfPromote = await patch(providerCookie, {
      userId: "prototype-provider",
      membershipRole: "owner",
    });
    assert.equal(selfPromote.status, 400, "a non-owner provider cannot promote themselves");
    assert.equal(await roleOf("prototype-provider"), "member", "the refused write changed nothing");

    const demoteTheOwner = await patch(providerCookie, {
      userId: "team-taylor",
      membershipRole: "member",
    });
    assert.equal(demoteTheOwner.status, 400, "a non-owner cannot unseat the owner");
    assert.equal(await roleOf("team-taylor"), "owner");

    // A non-owner may still perform the ordinary membership administration their
    // clinical permission allows; only the ownership field is withheld.
    const ordinaryEdit = await patch(providerCookie, {
      userId: "team-casey",
      patientAccessScope: "assigned",
    });
    assert.equal(ordinaryEdit.status, 200, "ordinary membership administration still works");

    // ---- An organization cannot be left without an owner ------------------
    const abandon = await patch(ownerCookie, { userId: "team-taylor", membershipRole: "member" });
    assert.equal(abandon.status, 400, "the only owner cannot step down");
    const abandonBody = (await abandon.json()) as any;
    assert.match(String(abandonBody.error), /no owner/i);
    assert.equal(await roleOf("team-taylor"), "owner");

    const suspendLastOwner = await patch(ownerCookie, {
      userId: "team-taylor",
      status: "suspended",
    });
    assert.equal(
      suspendLastOwner.status,
      400,
      "the only owner cannot be deactivated either — the same lockout by another route",
    );

    // ---- Handing ownership over is permitted ------------------------------
    const promoteSuccessor = await patch(ownerCookie, {
      userId: "prototype-provider",
      membershipRole: "owner",
    });
    assert.equal(promoteSuccessor.status, 200, "an owner may appoint another owner");

    const stepDown = await patch(ownerCookie, { userId: "team-taylor", membershipRole: "member" });
    assert.equal(stepDown.status, 200, "with a successor in place the owner may step down");
    assert.equal(await roleOf("prototype-provider"), "owner");
  } finally {
    process.chdir(originalCwd);
    env.NODE_ENV = originalNodeEnv;
    env.EHR_SESSION_SECRET = originalSecret;
  }
});
