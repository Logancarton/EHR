import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * D-086: who may write HR material, and what a write must survive.
 *
 * The read boundary is covered by `tests/hr-access-boundary.test.ts`. These are the
 * assertions about the other half — assignment — and two of them are load-bearing:
 *
 * - a designated HR administrator assigns but may **not** designate anyone else, so
 *   HR access cannot reproduce itself without an owner or manager; and
 * - the development seed no longer overwrites assigned work on the next boot, so an
 *   assignment is not silently reverted by a fixture.
 */
test("D-086: assignment and designation are separate authorities, and assignments persist", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-hr-assign-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-hr-assignment-session-secret-0123456789";

  try {
    const [
      { HRService, HRAccessError },
      { HRRepository },
      { OrganizationRepository },
      { getDatabase },
      { ensureHrSeed },
    ] = await Promise.all([
      import("../app/server/services/hr-service"),
      import("../app/server/repositories/hr-repository"),
      import("../app/server/repositories/organization-repository"),
      import("../app/server/db/connection"),
      import("../app/server/db/hr-seed"),
    ]);

    const db = getDatabase();
    const organizationId = OrganizationRepository.defaultOrganizationId();

    const owner = { userId: "prototype-provider", displayName: "Prototype Provider", role: "provider" } as const;
    const manager = { userId: "team-morgan", displayName: "Morgan Reed", role: "staff" } as const;
    const provider = { userId: "team-pmhnp", displayName: "Alex Rivera", role: "provider" } as const;
    const designated = { userId: "team-casey", displayName: "Casey Nguyen", role: "clinical_assistant" } as const;
    // An owner the HR seed does not cover, so "set up a record that does not exist yet"
    // is a real case rather than an update wearing a create's label.
    const unrecorded = "team-taylor";

    // ── Who may assign, and who may designate ──────────────────────────────────
    for (const actor of [owner, manager, designated]) {
      assert.equal(HRService.canAssign(actor), true, `${actor.userId} may assign HR material`);
    }
    assert.equal(
      HRService.canAssign(provider),
      false,
      "clinical role must not grant the ability to author HR material",
    );

    assert.equal(HRService.canDesignate(owner), true);
    assert.equal(HRService.canDesignate(manager), true);
    assert.equal(
      HRService.canDesignate(designated),
      false,
      "a designated HR administrator must not be able to designate anyone else",
    );

    // ── A member without the grant cannot author, not even their own record ─────
    assert.throws(
      () => HRService.assignRecord(provider, { userId: provider.userId, employmentType: "1.0 FTE" }),
      HRAccessError,
      "an employee does not author their own HR record",
    );
    assert.throws(
      () =>
        HRService.assignItem(provider, {
          userId: provider.userId,
          category: "goal",
          title: "Self-assigned goal",
        }),
      HRAccessError,
    );

    // ── Setting up a record that does not exist yet ─────────────────────────────
    assert.equal(
      HRRepository.recordFor(organizationId, unrecorded),
      null,
      "the fixture leaves this member without a record, which is the case under test",
    );
    assert.throws(
      () => HRService.assignItem(owner, { userId: unrecorded, category: "license", title: "Too early" }),
      /no HR record yet/,
      "an item must not conjure a personnel record as a side effect",
    );

    const created = HRService.assignRecord(owner, {
      userId: unrecorded,
      employmentType: "0.6 FTE — Psychiatric nurse practitioner",
      startedOn: "2024-03-04",
    });
    assert.equal(created.record.employmentType, "0.6 FTE — Psychiatric nurse practitioner");
    assert.equal(created.record.startedOn, "2024-03-04");
    assert.equal(created.record.items.length, 0, "a new record starts empty");

    // ── Assigning items, and what the record then holds ─────────────────────────
    const assigned = HRService.assignItem(owner, {
      userId: unrecorded,
      category: "license",
      title: "Nurse practitioner license renewal",
      detail: "Renewal packet not yet submitted.",
      status: "attention",
      dueOn: "2027-01-15",
    });
    assert.equal(assigned.item.title, "Nurse practitioner license renewal");
    assert.equal(assigned.item.status, "attention");
    assert.equal(assigned.item.dueOn, "2027-01-15");
    assert.equal(assigned.item.assignedBy, owner.userId, "the record says who assigned it");
    assert.equal(assigned.item.source, "assigned", "a person wrote this, not the fixture");
    assert.equal(assigned.record.items.length, 1, "the returned record is re-read, not patched");

    // A designated HR administrator does the same work.
    const byDesignated = HRService.assignItem(designated, {
      userId: unrecorded,
      category: "coaching",
      title: "Onboarding coaching — documentation",
    });
    assert.equal(byDesignated.item.assignedBy, designated.userId);
    assert.equal(byDesignated.record.items.length, 2);

    // ── Validation refuses rather than storing something meaningless ────────────
    assert.throws(
      () => HRService.assignItem(owner, { userId: unrecorded, category: "license", title: "   " }),
      /title is required/,
    );
    assert.throws(
      () =>
        HRService.assignItem(owner, {
          userId: unrecorded,
          category: "license",
          title: "Bad date",
          dueOn: "2027-02-31",
        }),
      /not a real date/,
    );
    assert.throws(
      () =>
        HRService.assignItem(owner, {
          userId: unrecorded,
          category: "salary" as never,
          title: "Unknown category",
        }),
      /category must be one of/,
    );
    assert.throws(
      () => HRService.assignRecord(owner, { userId: "not-a-member", employmentType: "1.0 FTE" }),
      HRAccessError,
      "a target outside the organization is refused, not created",
    );

    // ── Designation: granting it actually grants the access ────────────────────
    assert.equal(HRService.canReadOthers(provider), false);
    assert.throws(
      () => HRService.setDesignation(designated, { userId: provider.userId, designated: true }),
      HRAccessError,
      "assigning material and granting access are different authorities",
    );

    HRService.setDesignation(owner, { userId: provider.userId, designated: true });
    assert.equal(
      HRService.canReadOthers(provider),
      true,
      "the grant must take effect, not merely be recorded",
    );
    assert.ok(HRService.directory(provider).entries.length >= 4);

    // Owners and managers already hold it; a toggle that pretended otherwise would be
    // lying about who can see personnel data.
    assert.throws(
      () => HRService.setDesignation(owner, { userId: manager.userId, designated: true }),
      /already has HR access/,
    );
    assert.throws(
      () => HRService.setDesignation(owner, { userId: unrecorded, designated: false }),
      /already has HR access/,
      "the same refusal applies to revoking from an owner",
    );

    HRService.setDesignation(manager, { userId: provider.userId, designated: false });
    assert.equal(HRService.canReadOthers(provider), false, "revoking takes the access back");
    assert.ok(
      HRService.ownRecord(provider).record,
      "revoking HR access must not cost someone their own record",
    );

    // ── A boot-time fixture must not overwrite real work ────────────────────────
    HRService.setDesignation(owner, { userId: provider.userId, designated: true });
    const beforeReseed = HRRepository.recordFor(organizationId, unrecorded)!;
    const seededBefore = HRRepository.recordFor(organizationId, provider.userId)!.items.length;

    ensureHrSeed(db);

    const afterReseed = HRRepository.recordFor(organizationId, unrecorded)!;
    assert.equal(
      afterReseed.items.length,
      beforeReseed.items.length,
      "re-running the seed must not delete assigned items",
    );
    assert.equal(
      afterReseed.employmentType,
      beforeReseed.employmentType,
      "re-running the seed must not revert assigned employment details",
    );
    assert.equal(
      HRService.canReadOthers(provider),
      true,
      "re-running the seed must not revoke a designation an owner granted",
    );
    assert.equal(
      HRRepository.recordFor(organizationId, provider.userId)!.items.length,
      seededBefore,
      "the seed still refreshes its own items exactly once rather than duplicating them",
    );

    // Leave the practice as the fixture describes it.
    HRService.setDesignation(owner, { userId: provider.userId, designated: false });

    // ── The writes are auditable ───────────────────────────────────────────────
    const events = db
      .prepare(
        `SELECT event_type FROM audit_logs
         WHERE event_type IN ('hr_record_assigned', 'hr_access_designation_changed')`,
      )
      .all() as Array<{ event_type: string }>;
    assert.ok(
      events.some((row) => row.event_type === "hr_record_assigned"),
      "assigning HR material is audited",
    );
    assert.ok(
      events.some((row) => row.event_type === "hr_access_designation_changed"),
      "changing who can read personnel data is audited",
    );
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
