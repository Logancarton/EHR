import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assignSyntheticPatients,
  grantSyntheticOrganizationAccess,
} from "./helpers/organization-access";

/**
 * DB-10 — the spoken deferral path.
 *
 * "Defer Smith's PCP notification until we get the ROI, the current one is
 * expired" has to reach a recorded reason without ever letting speech mutate
 * work state on its own. The path under test is:
 *
 *   transcript → typed intent → patient resolved → work item resolved
 *              → proposal (not executed) → explicit confirmation → mutation
 *
 * The failure modes that matter are identity failures, and both are asserted:
 * an ambiguous patient refuses, and an ambiguous or unmatched work item refuses.
 * Neither produces something the clinician could confirm by reflex.
 */

function isolate(prefix: string) {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const root = mkdtempSync(join(tmpdir(), prefix));
  process.chdir(root);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = `synthetic-${prefix}-secret-0123456789abcdef`;
  return () => {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  };
}

const CONTEXT = { source: "ai" as const, requestId: "voice-test" };

test("DB-10: a spoken deferral becomes a proposal, never a mutation", async () => {
  const restore = isolate("ehr-care-completion-voice-");
  try {
    const [
      { getDatabase },
      { PatientRepository },
      { AppointmentRepository },
      { OmniboxPlannerService },
      { RuleBasedOmniboxPlanningModel },
      { careCompletionService },
      { CareCompletionRepository },
      domain,
    ] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/appointment-repository"),
      import("../app/server/ai/omnibox-planner"),
      import("../app/server/ai/omnibox-model-gateway"),
      import("../app/server/services/care-completion-service"),
      import("../app/server/repositories/care-completion-repository"),
      import("../app/domain/care-completion"),
    ]);

    const db = getDatabase();
    const nowIso = new Date().toISOString();
    const organizationId = await grantSyntheticOrganizationAccess(["cc-voice"], {
      organizationId: "org-cc-voice",
    });

    // Two Smiths would be ambiguous; one Smith plus an unrelated patient in a
    // different organization exercises both identity rules.
    const smithId = "p-cc-smith";
    PatientRepository.create({
      id: smithId,
      name: "Jane Smith",
      initials: "JS",
      mrn: "MRN-CC-V1",
      dob: "1980-06-06",
      status: "active",
      pronouns: "she/her",
    } as never);
    await assignSyntheticPatients([smithId], organizationId);

    const hiddenOrg = await grantSyntheticOrganizationAccess(["cc-voice-outsider"], {
      organizationId: "org-cc-voice-hidden",
    });
    PatientRepository.create({
      id: "p-cc-hidden",
      name: "Hidden Smith",
      initials: "HS",
      mrn: "MRN-CC-V9",
      dob: "1975-01-01",
      status: "active",
      pronouns: "he/him",
    } as never);
    await assignSyntheticPatients(["p-cc-hidden"], hiddenOrg);

    // A signed visit with a medication order and an active PCP → the PCP
    // notification boundary plus a follow-up plan with nothing linked.
    const originAptId = "apt-cc-voice";
    AppointmentRepository.create({
      id: originAptId,
      patientId: smithId,
      patientName: "Jane Smith",
      dob: "1980-06-06",
      age: 46,
      mrn: "MRN-CC-V1",
      date: "2026-09-14",
      time: "09:00 AM",
      duration: "30 min",
      type: "Follow-up",
      status: "completed",
      chiefComplaint: "Medication review",
      insurance: "Synthetic Plan",
      modality: "in-person",
      intakeStatus: "completed",
    } as never);

    db.prepare(`
      INSERT INTO encounters (id, patient_id, appointment_id, type, date, status, chief_complaint, follow_up, signed_by, signed_at, created_at, updated_at)
      VALUES ('enc-cc-voice', ?, ?, 'Follow-up', '2026-09-14', 'signed', 'Medication review', '4 weeks', 'cc-voice', ?, ?, ?)
    `).run(smithId, originAptId, nowIso, nowIso, nowIso);
    db.prepare(`
      INSERT INTO orders (id, patient_id, encounter_id, type, name, status, details_json, ordered_by, created_at, updated_at)
      VALUES ('ord-cc-voice', ?, 'enc-cc-voice', 'medication', 'Sertraline 100 mg', 'staged', '{}', 'cc-voice', ?, ?)
    `).run(smithId, nowIso, nowIso);
    db.prepare(`
      INSERT INTO patient_care_network (id, patient_id, role, name, organization, status, created_at, updated_at)
      VALUES ('cn-cc-voice', ?, 'pcp', 'Dr. Ada Primary', 'Northside Family Medicine', 'active', ?, ?)
    `).run(smithId, nowIso, nowIso);

    const actor = { userId: "cc-voice", displayName: "Dr. Voice", role: "provider" as const };
    careCompletionService.pinPatient(actor, smithId, CONTEXT);

    const planner = new OmniboxPlannerService(new RuleBasedOmniboxPlanningModel());

    // ---------------------------------------------------------------------
    // 1. A spoken deferral produces a confirmable proposal and nothing else
    // ---------------------------------------------------------------------
    const plan = await planner.plan(
      {
        query: "Defer Jane Smith's follow-up appointment until the patient checks their work schedule",
      },
      actor,
    );

    assert.equal(plan.safety.mutatesClinicalRecord, false);
    assert.equal(plan.patient.resolved?.id, smithId, "the patient was explicitly resolved");
    assert.equal(plan.proposals.length, 1, "exactly one proposal was produced");

    const proposal = plan.proposals[0];
    assert.equal(proposal.type, "defer_care_completion_item");
    assert.equal(proposal.execution, "not_executed", "speech proposes; it does not act");
    assert.equal(proposal.humanReviewRequired, true);
    assert.equal(proposal.permission, "allowed");

    if (proposal.type !== "defer_care_completion_item") throw new Error("unreachable");
    assert.equal(
      proposal.parameters.itemKey,
      domain.careCompletionItemKey("follow-up-appointment", "enc-cc-voice"),
      "the item key came from the patient's live board, not from the transcript",
    );
    assert.match(proposal.parameters.itemLabel, /follow-up/i);
    assert.equal(proposal.parameters.reasonCode, "patient-checking-schedule");
    assert.match(proposal.parameters.reasonText ?? "", /work schedule/i);

    // Nothing was written by planning.
    assert.equal(
      CareCompletionRepository.getDeferral("cc-voice", smithId, proposal.parameters.itemKey),
      null,
      "planning a deferral records nothing",
    );
    assert.equal(
      careCompletionService
        .buildBoard(actor)
        .cards[0].items.find((item) => item.itemKey === proposal.parameters.itemKey)!.state,
      "open",
      "the board is unchanged until the clinician confirms",
    );

    // ---------------------------------------------------------------------
    // 2. Confirmation is what writes, through the ordinary authorized path
    // ---------------------------------------------------------------------
    careCompletionService.deferItem(
      actor,
      {
        patientId: smithId,
        itemKey: proposal.parameters.itemKey,
        reasonCode: proposal.parameters.reasonCode,
        reasonText: proposal.parameters.reasonText,
      },
      CONTEXT,
    );
    const confirmed = careCompletionService
      .buildBoard(actor)
      .cards[0].items.find((item) => item.itemKey === proposal.parameters.itemKey)!;
    assert.equal(confirmed.state, "deferred");
    assert.equal(confirmed.deferral?.reasonCode, "patient-checking-schedule");
    assert.notEqual(confirmed.state, "complete", "a confirmed deferral is still not a completion");

    // ---------------------------------------------------------------------
    // 3. An unmatched work item refuses and explains
    // ---------------------------------------------------------------------
    const noMatch = await planner.plan(
      { query: "Defer Jane Smith's dental referral until next year" },
      actor,
    );
    assert.equal(noMatch.proposals.length, 0, "nothing confirmable is offered");
    assert.equal(noMatch.clarification?.field, "work_item");
    assert.equal(noMatch.clarification?.reason, "work_item_not_found");
    assert.ok(
      noMatch.safety.blockedReasons.includes("work_item_resolution_required"),
      "the refusal is reported in the plan's safety block",
    );

    // ---------------------------------------------------------------------
    // 4. An ambiguous work item refuses rather than picking one
    // ---------------------------------------------------------------------
    db.prepare(`
      INSERT INTO observations (id, patient_id, category, test_name, effective_at, value_text, status, source_system, created_at, updated_at)
      VALUES ('obs-cc-voice-1', ?, 'lab', 'Lithium level', ?, '0.7', 'final', 'labcorp', ?, ?)
    `).run(smithId, nowIso, nowIso, nowIso);
    db.prepare(`
      INSERT INTO observations (id, patient_id, category, test_name, effective_at, value_text, status, source_system, created_at, updated_at)
      VALUES ('obs-cc-voice-2', ?, 'lab', 'Lithium level', ?, '0.8', 'final', 'labcorp', ?, ?)
    `).run(smithId, nowIso, nowIso, nowIso);

    const ambiguous = await planner.plan({ query: "Defer Jane Smith's lithium level review" }, actor);
    assert.equal(ambiguous.proposals.length, 0, "an ambiguous target produces nothing to confirm");
    assert.equal(ambiguous.clarification?.field, "work_item");
    assert.equal(ambiguous.clarification?.reason, "work_item_ambiguous");
    assert.ok(
      (ambiguous.clarification?.workItemCandidates?.length ?? 0) > 1,
      "the clinician is shown the items it could have meant",
    );

    // ---------------------------------------------------------------------
    // 5. An inaccessible patient is neither discovered nor mutated
    // ---------------------------------------------------------------------
    const hidden = await planner.plan(
      { query: "Defer Hidden Smith's follow-up appointment until next month" },
      actor,
    );
    assert.equal(hidden.proposals.length, 0, "no proposal is built for an unreachable patient");
    const hiddenSerialized = JSON.stringify(hidden);
    assert.ok(
      !hiddenSerialized.includes("p-cc-hidden"),
      "an inaccessible patient's identity is not returned",
    );
    assert.ok(!hiddenSerialized.includes("MRN-CC-V9"));
    assert.equal(
      CareCompletionRepository.listDeferrals("cc-voice", ["p-cc-hidden"]).length,
      0,
      "nothing was written against the unreachable patient",
    );

    // ---------------------------------------------------------------------
    // 6. An ambiguous patient reference refuses to mutate anything
    // ---------------------------------------------------------------------
    PatientRepository.create({
      id: "p-cc-smith-2",
      name: "Jordan Smith",
      initials: "JS",
      mrn: "MRN-CC-V2",
      dob: "1992-02-02",
      status: "active",
      pronouns: "they/them",
    } as never);
    await assignSyntheticPatients(["p-cc-smith-2"], organizationId);

    const ambiguousPatient = await planner.plan(
      { query: "Defer Smith's follow-up appointment until next week" },
      actor,
    );
    assert.equal(ambiguousPatient.proposals.length, 0, "an ambiguous name produces no proposal");
    assert.equal(ambiguousPatient.patient.resolution, "ambiguous");
    assert.equal(ambiguousPatient.clarification?.field, "patient");
    assert.ok(
      (ambiguousPatient.clarification?.candidates?.length ?? 0) > 1,
      "the clinician is asked which patient was meant",
    );

    // ---------------------------------------------------------------------
    // 7. An unavailable item is not offered for deferral by voice either
    // ---------------------------------------------------------------------
    const pcp = await planner.plan(
      { query: "Defer Jane Smith's PCP notification until we get the ROI because the current one is expired" },
      actor,
    );
    assert.equal(pcp.proposals.length, 0, "the PCP workflow does not exist here, so nothing is proposed");
    assert.equal(pcp.clarification?.reason, "work_item_not_deferrable");
    assert.match(pcp.clarification?.message ?? "", /cannot be done in this build/i);
    assert.equal(
      domain.inferDeferralReasonCode("until we get the ROI because the current one is expired"),
      "waiting-for-roi",
      "the spoken reason still maps onto the recorded vocabulary",
    );
  } finally {
    restore();
  }
});
