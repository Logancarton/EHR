import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Linking a second prospect to a chart that already has an intake started
 * without a visit used to hit the one-standalone-intake-per-subject index
 * midway through promotion: the prospect was already marked promoted when the
 * raw "UNIQUE constraint failed" text reached the clinician. The link is now
 * refused, in words, before anything is written.
 */
test("Intake: linking a prospect to a chart with its own intake is refused cleanly and changes nothing", async () => {
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-intake-link-competing-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-intake-link-competing-secret-0123456789";

  try {
    const [
      { grantSyntheticOrganizationAccess },
      { IntakeRepository },
      { intakeService },
      { prospectivePersonService, ProspectivePersonError },
      { ProspectivePersonRepository },
      { clinicalActionError },
    ] = await Promise.all([
      import("./helpers/organization-access"),
      import("../app/server/repositories/intake-repository"),
      import("../app/server/services/intake-service"),
      import("../app/server/services/prospective-person-service"),
      import("../app/server/repositories/prospective-person-repository"),
      import("../app/server/http/clinical-http"),
    ]);

    const orgId = await grantSyntheticOrganizationAccess(["staff-link"], { role: "staff", patientAccessScope: "organization" });
    const staff = {
      userId: "staff-link",
      displayName: "Link Tester",
      organizationId: orgId,
      role: "staff" as const,
      capabilities: ["edit_patient" as const, "manage_appointments" as const, "read_schedule" as const],
    };
    const context = { source: "api" as const };
    const identity = { name: "Testa Windowmann", dob: "1990-04-12", mobilePhone: "555-555-0142", email: "testa@example.test" };

    // The first contact starts intake with no visit and is promoted to a chart.
    const first = prospectivePersonService.create(identity, staff, context);
    const firstEpisode = intakeService.startStandalone(staff, context, { prospectivePersonId: first.id });
    const { patient } = prospectivePersonService.promote(staff, context, { prospectiveId: first.id, mode: "create" });
    assert.equal(IntakeRepository.getEpisodeById(firstEpisode.id)?.patientId, patient.id);

    // The same person calls again and a second intake is started for them.
    const second = prospectivePersonService.create(identity, staff, context);
    const secondEpisode = intakeService.startStandalone(staff, context, { prospectivePersonId: second.id });
    const matches = prospectivePersonService.findPossibleDuplicates(staff, second.id);
    assert.ok(matches.some((m) => m.patientId === patient.id), "the existing chart is surfaced as a possible match");

    const linkSecond = () =>
      prospectivePersonService.promote(staff, context, { prospectiveId: second.id, mode: "link", existingPatientId: patient.id });

    let refusal: unknown;
    assert.throws(linkSecond, (error: unknown) => {
      refusal = error;
      return (
        error instanceof ProspectivePersonError &&
        error.status === 409 &&
        error.message.includes("already has an intake in progress") &&
        !/constraint|sqlite|intake_episodes/i.test(error.message)
      );
    });

    // The route answers with the clinician-readable refusal.
    const response = clinicalActionError(refusal);
    const body = (await response.json()) as { error: string };
    assert.doesNotMatch(body.error, /constraint|intake_episodes/i);

    // Nothing was half-written: the prospect is not promoted and its intake is untouched.
    assert.notEqual(ProspectivePersonRepository.getById(second.id)?.status, "promoted");
    assert.equal(IntakeRepository.getEpisodeById(secondEpisode.id)?.patientId, undefined);

    // Recovery: the duplicate intake is closed; the chart keeps its own intake.
    intakeService.dispose(staff, context, secondEpisode.id, "duplicate");
    assert.equal(IntakeRepository.getEpisodeById(secondEpisode.id)?.dispositionStatus, "archived");
    assert.equal(IntakeRepository.getEpisodeById(firstEpisode.id)?.dispositionStatus, "active");

    // A closed earlier intake still blocks the link, with its own explanation.
    intakeService.dispose(staff, context, firstEpisode.id, "other");
    const third = prospectivePersonService.create(identity, staff, context);
    intakeService.startStandalone(staff, context, { prospectivePersonId: third.id });
    assert.throws(
      () => prospectivePersonService.promote(staff, context, { prospectiveId: third.id, mode: "link", existingPatientId: patient.id }),
      (error: unknown) => error instanceof ProspectivePersonError && error.status === 409 && error.message.includes("earlier intake that was closed"),
    );

    // A prospect with no intake of its own still links normally.
    const fourth = prospectivePersonService.create(identity, staff, context);
    const linked = prospectivePersonService.promote(staff, context, { prospectiveId: fourth.id, mode: "link", existingPatientId: patient.id });
    assert.equal(linked.patient.id, patient.id);
    assert.equal(linked.prospect.status, "promoted");

    // Any storage failure that still escapes is logged, not shown.
    const storageError = Object.assign(new Error("UNIQUE constraint failed: intake_episodes.patient_id"), { code: "ERR_SQLITE_ERROR" });
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const storageResponse = clinicalActionError(storageError);
      assert.equal(storageResponse.status, 500);
      assert.doesNotMatch(((await storageResponse.json()) as { error: string }).error, /constraint|intake_episodes/i);
    } finally {
      console.error = originalConsoleError;
    }
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
