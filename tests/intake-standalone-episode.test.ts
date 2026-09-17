import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * An intake episode can now start before any visit is scheduled — a caller
 * or walk-in prospect can begin identity/coverage/document/consent work with
 * no tentative hold booked yet. Scheduling later attaches an appointment to
 * the SAME episode row rather than creating a second one. See D-078 (or its
 * successor entry) in docs/DECISIONS.md.
 */
test("Intake: a standalone episode (no visit yet) works, is idempotent, and converts in place when scheduled", async () => {
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-intake-standalone-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-intake-standalone-secret-0123456789";

  try {
    const [
      { grantSyntheticOrganizationAccess },
      { AuditRepository },
      { IntakeRepository },
      { intakeService, IntakeError },
      { prospectivePersonService },
      { getDatabase },
    ] = await Promise.all([
      import("./helpers/organization-access"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/repositories/intake-repository"),
      import("../app/server/services/intake-service"),
      import("../app/server/services/prospective-person-service"),
      import("../app/server/db/connection"),
    ]);

    const orgId = await grantSyntheticOrganizationAccess(["staff-jordan"], { role: "staff", patientAccessScope: "organization" });
    const otherOrgId = await grantSyntheticOrganizationAccess(["staff-outside"], {
      organizationId: "org-outside-standalone",
      role: "staff",
      patientAccessScope: "organization",
    });

    const staff = {
      userId: "staff-jordan",
      displayName: "Jordan Rivera",
      organizationId: orgId,
      role: "staff" as const,
      capabilities: ["edit_patient" as const, "manage_appointments" as const, "read_schedule" as const],
    };
    const outsideStaff = {
      userId: "staff-outside",
      displayName: "Outside Staff",
      organizationId: otherOrgId,
      role: "staff" as const,
      capabilities: ["edit_patient" as const],
    };
    const context = { source: "api" as const };

    /* ============================================================ *
     * A prospect starts intake with no visit at all
     * ============================================================ */

    const prospect = prospectivePersonService.create(
      { name: "Standalone Caller", dob: "1994-04-04", mobilePhone: "555-222-8888", email: "standalone.caller@example.test" },
      staff,
      context,
    );
    const subject = { prospectivePersonId: prospect.id };

    const episode = intakeService.startStandalone(staff, context, subject);
    assert.equal(episode.appointmentId, undefined, "a standalone episode has no appointment");
    assert.equal(episode.prospectivePersonId, prospect.id);

    // Idempotent: starting again for the same subject returns the same row,
    // never a second one — enforced by the partial unique index.
    const again = intakeService.startStandalone(staff, context, subject);
    assert.equal(again.id, episode.id);
    const db = getDatabase();
    const rowCount = (db.prepare(`SELECT COUNT(*) AS n FROM intake_episodes WHERE prospective_person_id = ?`).get(prospect.id) as { n: number }).n;
    assert.equal(rowCount, 1, "no duplicate standalone episode was created");

    // Cross-tenant access is denied even for an administrative, no-appointment record.
    assert.throws(() => intakeService.startStandalone(outsideStaff, context, subject));

    /* ============================================================ *
     * The queue and detail view both surface it correctly
     * ============================================================ */

    const queue = intakeService.buildQueue(staff);
    const row = queue.find((r) => r.prospectivePersonId === prospect.id);
    assert.ok(row, "the standalone episode appears in the queue");
    assert.equal(row!.stage, "awaiting_first_visit");
    assert.equal(row!.appointmentId, undefined);
    assert.equal(row!.appointmentDate, undefined);

    let detail = intakeService.getDetail(staff, prospect.id);
    assert.equal(detail.appointment, undefined);
    assert.equal(detail.stage, "awaiting_first_visit");
    // Readiness still computes normally with no appointment at all — a
    // prospect can complete identity/coverage/etc. before a visit exists.
    assert.equal(detail.steps.find((s) => s.id === "identity")!.state, "recorded");
    assert.equal(detail.episode.id, episode.id, "getDetail reused the same standalone episode rather than creating another");

    /* ============================================================ *
     * Scheduling converts the SAME episode, not a new one
     * ============================================================ */

    assert.throws(() => intakeService.scheduleVisit(staff, context, { episodeId: episode.id, date: "", time: "" }), IntakeError);

    const { episode: scheduled, appointment } = intakeService.scheduleVisit(staff, context, {
      episodeId: episode.id,
      date: "2026-10-05",
      time: "10:00 AM",
    });
    assert.equal(scheduled.id, episode.id, "scheduling reused the same episode row");
    assert.equal(scheduled.appointmentId, appointment.id);
    assert.equal(appointment.patientId, prospect.id);
    assert.equal(appointment.status, "tentative");

    // No duplicate episode exists after scheduling.
    const rowCountAfter = (db.prepare(`SELECT COUNT(*) AS n FROM intake_episodes WHERE prospective_person_id = ?`).get(prospect.id) as { n: number }).n;
    assert.equal(rowCountAfter, 1);

    // Scheduling again is refused — this episode already has a visit.
    assert.throws(() => intakeService.scheduleVisit(staff, context, { episodeId: episode.id, date: "2026-10-06", time: "11:00 AM" }), IntakeError);

    detail = intakeService.getDetail(staff, prospect.id);
    assert.equal(detail.appointment?.id, appointment.id);
    assert.notEqual(detail.stage, "awaiting_first_visit", "the stage reflects the now-scheduled visit");

    const scheduleAudit = AuditRepository.getRecent(20).find((e) => e.eventType === "intake_episode_updated" && (e.metadata as any)?.appointmentId === appointment.id);
    assert.ok(scheduleAudit, "scheduling a visit is audited");

    /* ============================================================ *
     * Migration-adjacent integrity: no orphaned episodes
     * ============================================================ */
    const orphanEpisodes = (db.prepare(
      `SELECT COUNT(*) AS n FROM intake_episodes WHERE patient_id IS NULL AND prospective_person_id IS NULL`,
    ).get() as { n: number }).n;
    assert.equal(orphanEpisodes, 0, "every episode has a subject");
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
