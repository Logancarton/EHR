import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_PRIOR_QUESTIONS, resolveConversationFollowUp } from "../app/server/ai/conversation-follow-up";
import { assignSyntheticPatients, grantSyntheticOrganizationAccess } from "./helpers/organization-access";

/**
 * Conversation memory in the planner (D-132, CONV-1b).
 *
 * Earlier questions only help read a follow-up. They never decide the patient
 * (that still comes from the request's own words, through the full-name rule),
 * and they never supply a fact (every answer is re-read from records).
 */

const patientNames = new Set(["jordan", "reed", "jordan reed", "maya", "chen", "maya chen"]);
const isPatient = (text: string) => patientNames.has(text.toLowerCase().replace(/[?.!]/g, "").trim());

test("without earlier questions every request stands alone", () => {
  assert.deepEqual(resolveConversationFollowUp("and the one before that?", [], isPatient), { kind: "standalone" });
  assert.deepEqual(resolveConversationFollowUp("what about Jordan Reed?", [], isPatient), { kind: "standalone" });
});

test("'the one before that' continues the last question one result further back, and repeats walk further", () => {
  const first = resolveConversationFollowUp("And the one before that?", ["What was her last lithium level?"], isPatient);
  assert.deepEqual(first, {
    kind: "earlier_result",
    question: "What was her last lithium level?",
    basedOn: "What was her last lithium level?",
    resultOffset: 1,
  });

  const second = resolveConversationFollowUp(
    "before that?",
    ["What was her last lithium level?", "And the one before that?"],
    isPatient,
  );
  assert.equal(second.kind, "earlier_result");
  assert.equal(second.kind === "earlier_result" && second.resultOffset, 2);
  assert.equal(second.kind === "earlier_result" && second.question, "What was her last lithium level?");

  for (const phrasing of ["previous one?", "the prior result", "What was the one before that?", "earlier?"]) {
    assert.equal(resolveConversationFollowUp(phrasing, ["Last TSH?"], isPatient).kind, "earlier_result", phrasing);
  }
});

test("'what about <patient>' repeats the last question; anything with its own subject stands alone", () => {
  const another = resolveConversationFollowUp("What about Jordan Reed?", ["What medications is she taking?"], isPatient);
  assert.deepEqual(another, {
    kind: "another_patient",
    question: "What medications is she taking?",
    basedOn: "What medications is she taking?",
    resultOffset: 0,
  });
  assert.equal(resolveConversationFollowUp("and Jordan?", ["Check labs"], isPatient).kind, "another_patient");

  // A topic change, or a patient plus a topic, is a complete question already.
  assert.equal(resolveConversationFollowUp("what about TSH?", ["Last lithium level?"], isPatient).kind, "standalone");
  assert.equal(
    resolveConversationFollowUp("what about Jordan Reed's lithium?", ["Last TSH?"], isPatient).kind,
    "standalone",
  );
  // Words inside a sentence do not trigger a follow-up.
  assert.equal(
    resolveConversationFollowUp("Was there a lithium level before that visit?", ["Summarize chart"], isPatient).kind,
    "standalone",
  );
});

test("only the most recent earlier questions are read", () => {
  const priors = ["What was her last lithium level?", ...Array.from({ length: MAX_PRIOR_QUESTIONS }, () => "before that?")];
  // The original question has fallen out of the window, so there is nothing to step back from.
  const result = resolveConversationFollowUp("before that?", priors, isPatient);
  assert.equal(result.kind, "earlier_result");
  assert.equal(result.kind === "earlier_result" && result.question, "before that?");
});

test("the planner reads follow-ups against earlier questions and re-answers from records", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  process.chdir(mkdtempSync(join(tmpdir(), "ehr-conversation-follow-up-")));
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-conversation-follow-up-secret-0123456789";

  try {
    const [{ getDatabase }, { PatientRepository }, { OmniboxPlannerService }, { RuleBasedOmniboxPlanningModel }] =
      await Promise.all([
        import("../app/server/db/connection"),
        import("../app/server/repositories/patient-repository"),
        import("../app/server/ai/omnibox-planner"),
        import("../app/server/ai/omnibox-model-gateway"),
      ]);

    const db = getDatabase();
    const organizationId = await grantSyntheticOrganizationAccess(["conv-provider"], { organizationId: "org-conv" });
    const nowIso = new Date().toISOString();
    for (const [id, name, mrn, dob] of [
      ["p-conv-ana", "Ana Lithwell", "MRN-CONV-1", "1984-03-03"],
      ["p-conv-ben", "Ben Okafor", "MRN-CONV-2", "1991-07-07"],
      // Stored in the other date form the synthetic data uses.
      ["p-conv-cara", "Cara Okafor", "MRN-CONV-3", "02/14/1990"],
    ]) {
      PatientRepository.create({ id, name, initials: "XX", mrn, dob, status: "active", pronouns: "they/them" } as never);
    }
    await assignSyntheticPatients(["p-conv-ana", "p-conv-ben", "p-conv-cara"], organizationId);

    const insertLab = db.prepare(`
      INSERT INTO observations (id, patient_id, category, code, test_name, value_text, unit, effective_at, status, source_system, created_at, updated_at)
      VALUES (?, ?, 'laboratory', 'lithium-level', 'Lithium level', ?, 'mEq/L', ?, 'final', 'ehr-local', ?, ?)
    `);
    insertLab.run("obs-conv-1", "p-conv-ana", "0.6", "2026-05-01", nowIso, nowIso);
    insertLab.run("obs-conv-2", "p-conv-ana", "0.8", "2026-07-01", nowIso, nowIso);
    insertLab.run("obs-conv-3", "p-conv-ana", "0.9", "2026-09-01", nowIso, nowIso);
    insertLab.run("obs-conv-4", "p-conv-ben", "1.1", "2026-08-15", nowIso, nowIso);

    const actor = { userId: "conv-provider", displayName: "Dr. Conversation", role: "provider" as const };
    const planner = new OmniboxPlannerService(new RuleBasedOmniboxPlanningModel());
    const ask = (query: string, priorQuestions: string[] = []) =>
      planner.plan({ query, activePatientId: "p-conv-ana", priorQuestions }, actor);

    const latest = await ask("What was her last lithium level?");
    assert.match(latest.answer ?? "", /2026-09-01 at 0\.9 mEq\/L/);
    assert.equal(latest.followUp, undefined);

    const before = await ask("And the one before that?", ["What was her last lithium level?"]);
    assert.equal(before.followUp?.kind, "earlier_result");
    assert.equal(before.patient.resolved?.id, "p-conv-ana", "an unqualified follow-up stays with the active patient");
    assert.match(before.answer ?? "", /2026-07-01 at 0\.8 mEq\/L/);
    assert.deepEqual(before.evidence.map((item) => item.sourceRef), ["observations/obs-conv-2"]);

    const further = await ask("before that?", ["What was her last lithium level?", "And the one before that?"]);
    assert.match(further.answer ?? "", /2026-05-01 at 0\.6 mEq\/L/);

    const none = await ask("before that?", ["What was her last lithium level?", "And the one before that?", "before that?"]);
    assert.match(none.answer ?? "", /No earlier lithium result/);
    assert.deepEqual(none.evidence, [], "running out of results invents nothing");

    // The same question about another patient, named in full: answered from that patient's records, visibly switched.
    const ben = await ask("What about Ben Okafor?", ["What was her last lithium level?"]);
    assert.equal(ben.followUp?.kind, "another_patient");
    assert.equal(ben.patient.resolved?.id, "p-conv-ben");
    assert.equal(ben.patient.switchRequired, true);
    assert.match(ben.answer ?? "", /2026-08-15 at 1\.1 mEq\/L/);

    // By first name only: nothing switches, nothing is answered.
    const benFirst = await ask("What about Ben?", ["What was her last lithium level?"]);
    assert.equal(benFirst.patient.resolved, undefined);
    assert.equal(benFirst.clarification?.reason, "patient_full_name_required");
    assert.equal(benFirst.answer, undefined);
    assert.match(benFirst.clarification?.message ?? "", /Ben Okafor \(DOB 1991-07-07\)/);

    // The clarification quotes the words actually typed.
    assert.match(benFirst.clarification?.message ?? "", /^“Ben” is only part of a name/);

    // A shared surname asks which patient, with each date of birth.
    const surname = await ask("What is Okafor taking?");
    assert.equal(surname.patient.resolution, "ambiguous");
    assert.deepEqual(
      surname.clarification?.candidates?.map((candidate) => candidate.dob).sort(),
      ["02/14/1990", "1991-07-07"],
    );
    // A date of birth picks the one it belongs to, whichever form either side is written in.
    for (const dob of ["1990-02-14", "2/14/1990"]) {
      const cara = await ask(`What is Okafor taking, DOB ${dob}?`);
      assert.equal(cara.patient.resolved?.id, "p-conv-cara", `DOB ${dob} identifies Cara Okafor`);
      assert.equal(cara.patient.switchRequired, true, "the switch is still shown");
    }
    // A date of birth that matches nobody identifies nobody.
    const wrongDob = await ask("What is Okafor taking, DOB 1970-01-01?");
    assert.equal(wrongDob.patient.resolved, undefined);

    // Earlier results are offered for lab questions only.
    const notLab = await ask("the one before that?", ["What medications is she taking?"]);
    assert.match(notLab.answer ?? "", /lab questions only/);
    assert.deepEqual(notLab.evidence, []);
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
