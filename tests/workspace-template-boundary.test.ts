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
 * Practice layout templates separate reading from writing.
 *
 * Every active member reads them, because they are the defaults a clinician
 * returns to. Only an owner or manager writes them, so one person tidying their
 * own screen can never rearrange everyone else's.
 *
 * This boundary deliberately does not use `manage_organization`: that
 * permission is held by every provider, so gating on it would have made every
 * clinician an editor of the whole practice's defaults.
 */
test("practice layout templates are readable by members and writable only by an owner or manager", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-workspace-templates-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-workspace-template-secret-0123456789";

  try {
    const [
      { POST: loginPost },
      { GET: templatesGet, PUT: templatesPut, DELETE: templatesDelete },
      { OrganizationRepository },
      { getDatabase },
    ] = await Promise.all([
      import("../app/api/auth/login/route"),
      import("../app/api/organization/workspace-templates/route"),
      import("../app/server/repositories/organization-repository"),
      import("../app/server/db/connection"),
    ]);

    const db = getDatabase();
    const homeOrganization = OrganizationRepository.defaultOrganizationId();

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
    setRole.run("owner", homeOrganization, "team-taylor");
    setRole.run("member", homeOrganization, "team-casey");

    const ownerCookie = await sessionFor("team-taylor");
    const memberCookie = await sessionFor("team-casey");

    const url = "http://ehr.local/api/organization/workspace-templates";

    // ---- Authentication ---------------------------------------------------
    assert.equal(
      (await templatesGet(new Request(url))).status,
      401,
      "practice templates require a server session",
    );

    // ---- An owner may define a default ------------------------------------
    const created = await templatesPut(
      new Request(url, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          name: "Front desk",
          description: "Arrivals and flow",
          config: {
            density: "compact",
            rails: { left: ["today", "schedule"], right: [], leftWidth: 76, rightWidth: 52 },
            // A personal list must never travel into a shared template.
            customPresets: { "custom-private": { density: "minimal" } },
          },
        }),
      }),
    );
    assert.equal(created.status, 200, "an owner may define a practice default");
    const createdBody = (await created.json()) as any;
    const templateId = createdBody.template.id as string;
    assert.equal(
      "customPresets" in createdBody.template.config,
      false,
      "a shared template must not carry one clinician's personal layouts",
    );

    // ---- A member may read but not write ----------------------------------
    const memberRead = await templatesGet(new Request(url, { headers: { cookie: memberCookie } }));
    assert.equal(memberRead.status, 200, "a member reads the practice's defaults");
    const memberBody = (await memberRead.json()) as any;
    assert.equal(memberBody.canEdit, false);
    assert.ok(
      memberBody.templates.some((entry: any) => entry.id === templateId),
      "the member sees the practice default the owner defined",
    );

    const memberWrite = await templatesPut(
      new Request(url, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: memberCookie },
        body: JSON.stringify({ name: "Member override", config: { density: "minimal" } }),
      }),
    );
    assert.equal(memberWrite.status, 403, "a member cannot define a practice default");

    const memberDelete = await templatesDelete(
      new Request(`${url}?id=${encodeURIComponent(templateId)}`, {
        method: "DELETE",
        headers: { cookie: memberCookie },
      }),
    );
    assert.equal(memberDelete.status, 403, "a member cannot delete a practice default");

    const afterAttempts = await templatesGet(new Request(url, { headers: { cookie: ownerCookie } }));
    const afterBody = (await afterAttempts.json()) as any;
    assert.equal(
      afterBody.templates.length,
      1,
      "the refused writes left the practice's defaults untouched",
    );

    // ---- The owner may remove what they defined ---------------------------
    const ownerDelete = await templatesDelete(
      new Request(`${url}?id=${encodeURIComponent(templateId)}`, {
        method: "DELETE",
        headers: { cookie: ownerCookie },
      }),
    );
    assert.equal(ownerDelete.status, 200, "an owner may remove a practice default");
  } finally {
    process.chdir(originalCwd);
    env.NODE_ENV = originalNodeEnv;
    env.EHR_SESSION_SECRET = originalSecret;
  }
});
