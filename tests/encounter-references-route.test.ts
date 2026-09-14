import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

/**
 * What a 404 from the note-reference route means.
 *
 * A runtime 404 on `GET /api/encounters/{id}/references` was reported against the
 * checkpoint at `8cfda44` and carried into the roadmap as an open question. Three
 * things could produce it, and they need different answers: a resource that does
 * not exist, a chart the caller may not reach, or the route itself failing.
 *
 * It is the first. The encounter workspace reads references for `draft.encounterId`
 * as soon as a chart opens, and a draft that has only ever existed in the browser
 * has no server row yet — `createInitialEncounter` mints the id locally and the
 * first autosave is what creates the record. The client already treats that as "no
 * references yet" rather than an error, and the route's own comment says so.
 *
 * Asserted here so the next reader does not have to re-derive it from a commit
 * message, and so the three cases stay distinguishable.
 */
test("the references route separates a missing encounter from a refused one", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-references-route-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-references-route-secret-0123456789";

  try {
    const [{ GET }, { POST: loginPost }, { ClinicalActionGateway }, { OrganizationRepository }] =
      await Promise.all([
        import("../app/api/encounters/[id]/references/route"),
        import("../app/api/auth/login/route"),
        import("../app/server/actions/clinical-action-gateway"),
        import("../app/server/repositories/organization-repository"),
      ]);

    await grantSyntheticOrganizationAccess(["team-taylor"]);

    const sessionFor = async (userId: string) => {
      const response = await loginPost(new Request("http://ehr.local/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      }));
      assert.equal(response.status, 200, `login should succeed for ${userId}`);
      return response.headers.get("set-cookie")!.split(";", 1)[0];
    };
    const cookie = await sessionFor("team-taylor");

    const actor = { userId: "team-taylor", displayName: "Taylor", role: "provider" as const };
    const context = { source: "api" as const, requestId: "references-route-semantics" };

    const draft = await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: "maya-chen",
      action: {
        type: "save_encounter_draft",
        payload: { id: "enc-refs-route", patientId: "maya-chen", assessment: "Stable." },
      },
    }) as { id: string };

    const read = async (id: string, headers: Record<string, string> = {}) =>
      GET(new Request(`http://ehr.local/api/encounters/${id}/references`, { headers }), {
        params: Promise.resolve({ id }),
      });

    // 1. A saved encounter, read by an authorized clinician: the route works.
    const found = await read(draft.id, { cookie });
    assert.equal(found.status, 200, "the route itself is healthy on a real encounter");
    const payload = (await found.json()) as { success: boolean; references: unknown[] };
    assert.equal(payload.success, true);
    assert.ok(Array.isArray(payload.references));

    // 2. A draft that exists only in the browser. This is the reported 404, and it
    //    is a missing resource rather than a failure: the encounter id is minted
    //    client-side and the first autosave is what creates the row.
    const notYetSaved = await read("enc-maya-chen-000000", { cookie });
    assert.equal(notYetSaved.status, 404);
    assert.deepEqual(await notYetSaved.json(), { success: false, error: "Encounter not found" });

    // 3. An unauthenticated read of a real encounter is 401, not 404 — the two are
    //    not interchangeable, and a chart's existence is not leaked by the status.
    const anonymous = await read(draft.id);
    assert.equal(anonymous.status, 401, "no session is an authentication failure");

    // 4. A clinician in another organization is refused, and told nothing else.
    const now = new Date().toISOString();
    const { getDatabase } = await import("../app/server/db/connection");
    OrganizationRepository.createOrganization("org-references-rival", "Rival Practice");
    getDatabase().prepare(`
      INSERT OR IGNORE INTO team_members (
        id, display_name, credentials, role, initials, presence, active, created_at, updated_at
      ) VALUES (?, ?, NULL, 'provider', 'RP', 'online', 1, ?, ?)
    `).run("references-rival", "Rival Provider", now, now);
    OrganizationRepository.upsertMembership({
      organizationId: "org-references-rival",
      userId: "references-rival",
    });

    const rival = await read(draft.id, { cookie: await sessionFor("references-rival") });
    assert.equal(rival.status, 403, "another organization is a patient-access denial");
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV; else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET; else env.EHR_SESSION_SECRET = originalSecret;
  }
});
