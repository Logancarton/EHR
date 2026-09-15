import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess, assignSyntheticPatients } from "./helpers/organization-access";

/**
 * Authoritative billing (roadmap P9-0, P9-B).
 *
 * This is the half of P9-0 that replaces what was removed. The prototype could not
 * fail: its claims lived in React state, its Transmit button called `setState`, and
 * every action reported success. So the properties worth asserting here are the
 * ones it could not have had —
 *
 * - a charge exists only because a note was signed, and carries that note's hash;
 * - preparing the same encounter twice is refused by the database, not by luck;
 * - two people reviewing the same charge cannot both be told it worked;
 * - rows *and* totals are refused together when financial access is not granted;
 * - another organization's actor sees nothing and can change nothing;
 * - submission refuses, names the real reason, and writes nothing at all.
 */
test("a billing charge is derived from a signed encounter, authorized, versioned, and never transmitted", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-billing-lifecycle-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-billing-lifecycle-secret-0123456789";

  try {
    const [
      { GET: billingGet, POST: billingPost },
      { POST: loginPost },
      { ClinicalRecordRepository },
      { NoteReferenceRepository },
      { ClinicalActionGateway },
      { ensureClinicalRecordFoundation },
      { getDatabase },
      { AuditRepository },
      { BillingRepository },
      { billingService },
      { PatientRepository },
      { OrganizationRepository },
      { billingChargeBlockers, MONETARY_TOTALS_UNAVAILABLE_REASON },
    ] = await Promise.all([
      import("../app/api/billing/route"),
      import("../app/api/auth/login/route"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/repositories/note-reference-repository"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/db/clinical-record-foundation"),
      import("../app/server/db/connection"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/repositories/billing-repository"),
      import("../app/server/services/billing-service"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/organization-repository"),
      import("../app/domain/billing"),
    ]);

    const db = getDatabase();
    ensureClinicalRecordFoundation(db);

    // An owner has financial access; a plain member of the same practice does not.
    // Both reach the same charts, which is what makes the refusal meaningful.
    const homeOrganization = await grantSyntheticOrganizationAccess(["team-taylor"]);
    await grantSyntheticOrganizationAccess(["billing-member"], {
      organizationId: homeOrganization,
      membershipRole: "member",
    });

    const owner = { userId: "team-taylor", displayName: "Dr. Taylor", role: "provider" as const };
    const context = { source: "api" as const, requestId: "billing-lifecycle-test" };
    const patientId = "maya-chen";

    async function signIn(userId: string) {
      const response = await loginPost(new Request("http://ehr.local/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      }));
      assert.equal(response.status, 200, `${userId} should be able to sign in`);
      return response.headers.get("set-cookie")!.split(";", 1)[0];
    }

    const ownerCookie = await signIn("team-taylor");

    // ---------------------------------------------------------------- clinical setup
    const depression = ClinicalRecordRepository.addProblem({
      patientId,
      displayText: "Major Depressive Disorder, Recurrent, Moderate",
      code: "F33.1",
      codingSystem: "ICD-10-CM",
    }, owner);
    const anxiety = ClinicalRecordRepository.addProblem({
      patientId,
      displayText: "Generalized Anxiety Disorder",
      code: "F41.1",
      codingSystem: "ICD-10-CM",
    }, owner);

    ClinicalRecordRepository.addInsurance({
      patientId,
      payerName: "Synthetic Commercial Plan",
      memberId: "SYN-1",
      coveragePriority: 1,
    }, owner);

    const encounterId = "enc-billing-lifecycle-1";
    await ClinicalActionGateway.execute({
      actor: owner,
      context,
      expectedPatientId: patientId,
      action: {
        type: "save_encounter_draft",
        payload: {
          id: encounterId,
          patientId,
          assessment: "MDD and GAD under active pharmacotherapy.",
          plan: "Continue sertraline.",
          cptCode: "99214",
          emLevel: "Moderate Complexity (99214)",
        },
      },
    });

    // ------------------------------------------- an unsigned note is not billing evidence
    await assert.rejects(
      () => ClinicalActionGateway.execute({
        actor: owner,
        context,
        expectedPatientId: patientId,
        action: { type: "prepare_billing_charge", payload: { encounterId } },
      }),
      /has no signed legal record/,
      "a draft note cannot produce a charge",
    );

    // Confirmed references are what reach a claim; a proposal is not evidence.
    for (const problem of [depression, anxiety]) {
      const reference = NoteReferenceRepository.upsert(
        encounterId,
        patientId,
        { section: "assessment", entityType: "problem", entityId: problem.id, source: "clinician-authored" },
        owner,
      );
      NoteReferenceRepository.confirm([reference.id], owner);
    }

    await ClinicalActionGateway.execute({
      actor: owner,
      context,
      expectedPatientId: patientId,
      action: { type: "sign_encounter", payload: { encounterId } },
    });

    // ------------------------------------------------------------ charge preparation
    const charge = (await ClinicalActionGateway.execute({
      actor: owner,
      context,
      expectedPatientId: patientId,
      action: { type: "prepare_billing_charge", payload: { encounterId } },
    })) as any;

    const snapshot = db
      .prepare("SELECT content_sha256 FROM signed_encounter_snapshots WHERE encounter_id = ?")
      .get(encounterId) as { content_sha256: string };

    assert.equal(charge.status, "prepared");
    assert.equal(charge.patientId, patientId);
    assert.equal(
      charge.encounterSnapshotSha256,
      snapshot.content_sha256,
      "the charge must name the exact legal record its codes came from",
    );
    assert.deepEqual(
      charge.procedureCodes.map((entry: any) => entry.code),
      ["99214"],
      "the procedure code is the one frozen at signature, not a recomputed suggestion",
    );
    assert.deepEqual(
      charge.diagnosisCodes.map((entry: any) => entry.code).sort(),
      ["F33.1", "F41.1"],
      "only attested, coded diagnoses reach the charge",
    );
    assert.equal(charge.coverageBasis, "policy-on-file");
    assert.equal(charge.coveragePayerName, "Synthetic Commercial Plan");
    assert.ok(
      !("billedAmount" in charge) && !("expectedAmount" in charge),
      "no monetary figure exists, so none is stored",
    );

    // -------------------------------------------------------- duplicate preparation
    await assert.rejects(
      () => ClinicalActionGateway.execute({
        actor: owner,
        context,
        expectedPatientId: patientId,
        action: { type: "prepare_billing_charge", payload: { encounterId } },
      }),
      /already exists for encounter/,
      "one signed encounter yields one charge",
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM billing_charges WHERE encounter_id = ?").get(encounterId) as any).n,
      1,
      "a refused duplicate leaves exactly one row",
    );

    // --------------------------------------------------- it persists, and it is read back
    const reload = await billingGet(new Request("http://ehr.local/api/billing", { headers: { cookie: ownerCookie } }));
    assert.equal(reload.status, 200);
    const reloaded = await reload.json();
    assert.equal(reloaded.success, true);
    assert.equal(reloaded.charges.length, 1, "the charge survives outside the screen that created it");
    assert.equal(reloaded.charges[0].id, charge.id);
    assert.equal(
      reloaded.summary.monetaryTotals,
      null,
      "an amount that cannot be computed is null, never zero",
    );
    assert.equal(reloaded.summary.monetaryTotalsUnavailableReason, MONETARY_TOTALS_UNAVAILABLE_REASON);
    assert.ok(reloaded.summary.periodStart && reloaded.summary.periodEnd, "a count states its window");
    assert.ok(
      reloaded.summary.signedEncounters >= 1,
      "the period denominator for charge activity is reported",
    );
    // The backlog is not window-scoped, so an old unbilled encounter cannot be
    // hidden by the reporting period. The seeded demonstration encounters carry
    // display-formatted `signed_at` values that sort outside any ISO window, and
    // they are exactly the rows a windowed backlog would lose.
    assert.ok(
      reloaded.awaitingCharge.length > 0,
      "unbilled signed encounters remain visible regardless of when they were signed",
    );
    assert.ok(
      reloaded.summary.encountersAwaitingCharge >= reloaded.awaitingCharge.length,
      "the backlog count and the backlog list are taken over the same scope",
    );
    assert.equal(reloaded.transport.configured, false);
    assert.ok(
      reloaded.transport.unavailableReason.includes("clearinghouse"),
      "the surface is told why nothing can be submitted",
    );

    // ------------------------------------------------- financial access gates rows and totals
    const memberCookie = await signIn("billing-member");
    const denied = await billingGet(new Request("http://ehr.local/api/billing", { headers: { cookie: memberCookie } }));
    assert.equal(denied.status, 403, "financial access is separate from clinical access");
    const deniedBody = await denied.json();
    assert.equal(deniedBody.success, false);
    assert.ok(
      !("charges" in deniedBody) && !("summary" in deniedBody),
      "a refusal must not leak the totals while withholding the rows",
    );

    // ------------------------------------------------------- another organization sees nothing
    const otherOrganization = await grantSyntheticOrganizationAccess(["billing-outsider"], {
      organizationId: "org-billing-outsider",
      membershipRole: "owner",
    });
    PatientRepository.create({
      id: "outsider-patient", name: "Outsider Patient", initials: "OP", dob: "01/01/1990", age: 36,
      pronouns: "they/them", mrn: "OUT-1", status: "Established", allergies: [], diagnoses: [], meds: [],
      vitals: {}, lastVisit: "Initial", nextVisit: "Unscheduled",
    });
    await assignSyntheticPatients(["outsider-patient"], otherOrganization);

    const outsider = { userId: "billing-outsider", displayName: "Outside Owner", role: "provider" as const };
    const outsiderView = billingService.worklist(outsider);
    assert.equal(outsiderView.charges.length, 0, "a charge belongs to the organization that owns the patient");
    assert.equal(
      outsiderView.summary.signedEncounters,
      0,
      "the denominator is scoped too; a count over someone else's practice is a leak",
    );

    await assert.rejects(
      () => ClinicalActionGateway.execute({
        actor: outsider,
        context,
        expectedPatientId: patientId,
        action: { type: "review_billing_charge", payload: { chargeId: charge.id } },
      }),
      /access denied|Patient access/i,
      "an outside actor cannot advance another practice's charge",
    );

    // ------------------------------------------------------------ concurrent review
    const beforeReview = BillingRepository.getById(charge.id)!;
    await ClinicalActionGateway.execute({
      actor: owner,
      context,
      expectedPatientId: patientId,
      action: {
        type: "review_billing_charge",
        payload: { chargeId: charge.id, note: "Codes match the signed note.", expectedVersion: beforeReview.version },
      },
    });

    await assert.rejects(
      () => ClinicalActionGateway.execute({
        actor: owner,
        context,
        expectedPatientId: patientId,
        action: {
          type: "review_billing_charge",
          // The same version a second person was still holding.
          payload: { chargeId: charge.id, expectedVersion: beforeReview.version },
        },
      }),
      /version conflict|already been reviewed/i,
      "a second writer holding a stale version is refused rather than told it worked",
    );

    const reviewed = BillingRepository.getById(charge.id)!;
    assert.equal(reviewed.status, "reviewed");
    assert.equal(reviewed.reviewedBy, "team-taylor");
    assert.equal(reviewed.version, beforeReview.version + 1);

    // ---------------------------------------- a charge with no coded diagnosis cannot be reviewed
    const uncodedEncounterId = "enc-billing-lifecycle-2";
    await ClinicalActionGateway.execute({
      actor: owner,
      context,
      expectedPatientId: patientId,
      action: {
        type: "save_encounter_draft",
        payload: { id: uncodedEncounterId, patientId, assessment: "Brief check-in.", plan: "Return in 4 weeks." },
      },
    });
    await ClinicalActionGateway.execute({
      actor: owner,
      context,
      expectedPatientId: patientId,
      action: { type: "sign_encounter", payload: { encounterId: uncodedEncounterId } },
    });
    const uncoded = (await ClinicalActionGateway.execute({
      actor: owner,
      context,
      expectedPatientId: patientId,
      action: { type: "prepare_billing_charge", payload: { encounterId: uncodedEncounterId } },
    })) as any;

    assert.equal(uncoded.diagnosisCodes.length, 0);
    assert.ok(
      billingChargeBlockers(uncoded).some((blocker) => blocker.code === "no-coded-diagnosis"),
      "the blocker names what is missing rather than failing silently",
    );
    await assert.rejects(
      () => ClinicalActionGateway.execute({
        actor: owner,
        context,
        expectedPatientId: patientId,
        action: { type: "review_billing_charge", payload: { chargeId: uncoded.id } },
      }),
      /cannot be reviewed/,
      "a charge that cannot support a claim must not pass the human gate",
    );

    // ------------------------------------------------------------------------- void
    await assert.rejects(
      () => ClinicalActionGateway.execute({
        actor: owner,
        context,
        expectedPatientId: patientId,
        action: { type: "void_billing_charge", payload: { chargeId: uncoded.id, reason: "   " } },
      }),
      /void reason is required/,
      "a voided financial record has to explain itself",
    );

    await ClinicalActionGateway.execute({
      actor: owner,
      context,
      expectedPatientId: patientId,
      action: { type: "void_billing_charge", payload: { chargeId: uncoded.id, reason: "Duplicate of a corrected note." } },
    });
    assert.equal(BillingRepository.getById(uncoded.id)!.status, "void");

    // ---------------------------------------------------------- submission is refused
    const auditBefore = AuditRepository.getRecent(500).length;
    const chargeBefore = BillingRepository.getById(charge.id)!;

    const submit = await billingPost(new Request("http://ehr.local/api/billing", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ operation: "submit", chargeId: charge.id }),
    }));
    assert.equal(submit.status, 503, "an absent vendor capability is not a bad request");
    const submitBody = await submit.json();
    assert.equal(submitBody.success, false);
    assert.ok(
      /clearinghouse/i.test(submitBody.error),
      `the refusal names the real reason, got: ${submitBody.error}`,
    );
    assert.ok(
      !/\b(was|were|has been|have been)\s+(transmitted|submitted|accepted|adjudicated|paid)\b|successfully/i.test(
        submitBody.error,
      ),
      `a refusal must not assert an outcome, got: ${submitBody.error}`,
    );

    assert.deepEqual(
      BillingRepository.getById(charge.id),
      chargeBefore,
      "a refused submission changes nothing about the charge",
    );
    assert.equal(
      AuditRepository.getRecent(500).length,
      auditBefore,
      "a refused submission writes no audit entry claiming an outcome",
    );

    // ---------------------------------------------------------------------- audit trail
    const events = AuditRepository.getRecent(500).map((entry) => entry.eventType);
    for (const expected of ["billing_charge_prepared", "billing_charge_reviewed", "billing_charge_voided"]) {
      assert.ok(events.includes(expected as any), `${expected} must be auditable`);
    }
    // By charge id, not by recency: two charges were prepared in this test and the
    // most recent one is the uncoded second encounter.
    const prepared = AuditRepository.getRecent(500).find(
      (entry) => entry.eventType === "billing_charge_prepared" && entry.metadata?.chargeId === charge.id,
    )!;
    assert.equal(prepared.patientId, patientId);
    assert.equal(prepared.metadata?.encounterSnapshotSha256, snapshot.content_sha256);

    // The charge is attributed to the organization that owns the patient, not to
    // whichever organization the actor happened to list first.
    assert.equal(charge.organizationId, OrganizationRepository.organizationForPatient(patientId));
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
