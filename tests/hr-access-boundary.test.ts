import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * D-086: the HR authorization boundary.
 *
 * The surface this replaced showed every employee's credentials to anyone who opened
 * the module, so these are the assertions that make the replacement worth having. The
 * load-bearing one is `team-pmhnp`: a *provider*, the highest clinical role in the
 * system, who must still be refused. If clinical role ever starts granting HR access,
 * that case fails before anyone notices in a browser.
 */
test("D-086: HR separates a member's own record from everyone else's", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-hr-boundary-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-hr-boundary-session-secret-0123456789";

  try {
    const [
      { HRService, HRAccessError },
      { HRRepository },
      { hasPermission, permissionsForActor },
      { OrganizationRepository },
      { getDatabase },
    ] = await Promise.all([
      import("../app/server/services/hr-service"),
      import("../app/server/repositories/hr-repository"),
      import("../app/server/auth/provider-context"),
      import("../app/server/repositories/organization-repository"),
      import("../app/server/db/connection"),
    ]);

    getDatabase();
    const organizationId = OrganizationRepository.defaultOrganizationId();

    // The seeded practice: two owners, one manager, one plain provider, and one
    // clinical assistant carrying the HR designation.
    const owner = { userId: "prototype-provider", displayName: "Prototype Provider", role: "provider" } as const;
    const manager = { userId: "team-morgan", displayName: "Morgan Reed", role: "staff" } as const;
    const provider = { userId: "team-pmhnp", displayName: "Alex Rivera", role: "provider" } as const;
    const designated = { userId: "team-casey", displayName: "Casey Nguyen", role: "clinical_assistant" } as const;

    // ── Everyone reaches their own record, with no permission involved ──────────
    for (const actor of [owner, manager, provider, designated]) {
      const own = HRService.ownRecord(actor);
      assert.equal(own.userId, actor.userId, `${actor.userId} must get their own record`);
      assert.ok(own.record, `${actor.userId} should have a seeded HR record`);
      assert.ok(
        own.record!.items.length > 0,
        `${actor.userId}'s record should hold assigned material`,
      );
    }

    // The owner described insurance, licensing deadlines, coachings and goals. The
    // provider's record carries all four, so the categories are not theoretical.
    const providerOwn = HRService.ownRecord(provider).record!;
    const categories = new Set(providerOwn.items.map((item) => item.category));
    for (const category of ["insurance", "license", "coaching", "goal"]) {
      assert.ok(categories.has(category as never), `an HR record should carry ${category} items`);
    }

    // ── Other people's records: owner, manager, and the designated member ───────
    for (const actor of [owner, manager, designated]) {
      assert.equal(HRService.canReadOthers(actor), true, `${actor.userId} may read other records`);
      const directory = HRService.directory(actor);
      assert.ok(
        directory.entries.length >= 4,
        `${actor.userId} should see the practice's members`,
      );
    }

    // ── A provider with no designation is refused, clinical role notwithstanding ─
    assert.equal(
      HRService.canReadOthers(provider),
      false,
      "clinical role must not grant HR access: a physician is not an HR administrator",
    );
    assert.throws(
      () => HRService.directory(provider),
      HRAccessError,
      "the directory must refuse a member without HR access",
    );
    assert.throws(
      () => HRService.recordForMember(provider, owner.userId),
      HRAccessError,
      "reading a named colleague's record must refuse too, not just the directory",
    );

    // Refusing is not the same as returning nothing: a caller must be able to tell
    // "not yours to see" from "there is nothing here".
    try {
      HRService.directory(provider);
      assert.fail("expected a refusal");
    } catch (error) {
      assert.match(
        (error as Error).message,
        /owner, manager, or designated HR administrator/,
        "the refusal should say who does have access",
      );
    }

    // Their own record still resolves through the same call that refuses others.
    assert.equal(
      HRService.recordForMember(provider, provider.userId).record?.userId,
      provider.userId,
      "the self case must not be caught by the others check",
    );

    // ── The designation grants HR and nothing else ──────────────────────────────
    assert.equal(hasPermission(designated, "manage_hr"), true);
    assert.equal(
      hasPermission(designated, "manage_organization"),
      false,
      "an HR designation must not hand out organization administration",
    );
    assert.equal(
      hasPermission(designated, "view_financial"),
      false,
      "an HR designation must not widen into unrelated governance permissions",
    );
    const designatedPermissions = permissionsForActor(designated);
    assert.ok(designatedPermissions.includes("manage_hr"));
    assert.ok(!designatedPermissions.includes("manage_organization"));

    // ── Revoking the designation revokes the access ─────────────────────────────
    getDatabase()
      .prepare(
        "UPDATE organization_memberships SET hr_access = 'none' WHERE organization_id = ? AND user_id = ?",
      )
      .run(organizationId, designated.userId);

    assert.equal(
      HRService.canReadOthers(designated),
      false,
      "revoking the designation must take the access with it",
    );
    assert.throws(() => HRService.directory(designated), HRAccessError);
    assert.ok(
      HRService.ownRecord(designated).record,
      "revoking HR access must not cost someone their own record",
    );

    // ── Storage holds what the surface reads ───────────────────────────────────
    const stored = HRRepository.recordFor(organizationId, provider.userId);
    assert.ok(stored, "the provider's record should be stored, not synthesized per request");
    assert.equal(stored!.userId, provider.userId);
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
