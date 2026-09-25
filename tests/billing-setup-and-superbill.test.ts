import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

/**
 * Practice billing setup, attested add-on codes, and the superbill (D-101).
 *
 * What is asserted is what would be wrong if it failed:
 *
 * - a charge carries the add-on code the clinician attested, not one rebuilt from
 *   minutes, and only on notes signed with it;
 * - the charge template contributes place of service and the telehealth modifier
 *   from the appointment's recorded modality, and nothing when modality is unknown;
 * - fees come only from the practice's schedule, and a code without one is null,
 *   never zero;
 * - a member without practice administration cannot change prices or identity,
 *   and a refused write changes nothing;
 * - a superbill is refused for an unreviewed charge and writes no audit, and a
 *   produced one lists every field the records do not hold.
 */
test("charge templates, fees and attested add-ons flow into charges and superbills without invention", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-billing-setup-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-billing-setup-secret-0123456789";

  try {
    const [
      { GET: setupGet, POST: setupPost },
      { GET: superbillGet },
      { POST: loginPost },
      { ClinicalRecordRepository },
      { NoteReferenceRepository },
      { ClinicalActionGateway },
      { ensureClinicalRecordFoundation },
      { getDatabase },
      { AuditRepository },
      { billingService },
      { isValidNpi, feeForLine, visitModalityFromAppointment, parseMoneyToCents },
      { chargeTotalCents },
    ] = await Promise.all([
      import("../app/api/billing/setup/route"),
      import("../app/api/billing/superbill/route"),
      import("../app/api/auth/login/route"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/repositories/note-reference-repository"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/db/clinical-record-foundation"),
      import("../app/server/db/connection"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/services/billing-service"),
      import("../app/domain/billing-setup"),
      import("../app/domain/billing"),
    ]);

    // ------------------------------------------------------------- pure rules
    assert.equal(isValidNpi("1234567893"), true, "the published NPI check-digit example is valid");
    assert.equal(isValidNpi("1234567890"), false, "a wrong check digit is refused");
    assert.equal(visitModalityFromAppointment("video"), "telehealth");
    assert.equal(visitModalityFromAppointment("in-person"), "in-person");
    assert.equal(visitModalityFromAppointment(null), "unknown", "no appointment is not an office visit");
    assert.equal(parseMoneyToCents("$1,250.5"), 125050);
    assert.equal(parseMoneyToCents("abc"), null);
    assert.equal(feeForLine([], "99214"), null, "an unpriced code is null, never zero");
    assert.equal(chargeTotalCents([{ code: "99214", codingSystem: "CPT", description: "", units: 1, feeCents: null }]), null);

    const db = getDatabase();
    ensureClinicalRecordFoundation(db);

    const homeOrganization = await grantSyntheticOrganizationAccess(["team-taylor"]);
    await grantSyntheticOrganizationAccess(["billing-member"], {
      organizationId: homeOrganization,
      membershipRole: "member",
    });
    // Financial access without practice administration: can read, cannot price.
    db.prepare("UPDATE team_members SET role = 'provider' WHERE id = 'billing-member'").run();

    const owner = { userId: "team-taylor", displayName: "Dr. Taylor", role: "provider" as const };
    const context = { source: "api" as const, requestId: "billing-setup-test" };
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
    const memberCookie = await signIn("billing-member");

    async function setup(cookie: string, body?: Record<string, unknown>) {
      const response = body
        ? await setupPost(new Request("http://ehr.local/api/billing/setup", {
            method: "POST",
            headers: { "content-type": "application/json", cookie },
            body: JSON.stringify(body),
          }))
        : await setupGet(new Request("http://ehr.local/api/billing/setup", { headers: { cookie } }));
      return { status: response.status, body: (await response.json()) as any };
    }

    // -------------------------------------------------- setup authority
    const memberRead = await setup(memberCookie);
    assert.equal(memberRead.status, 403, "a member without financial access cannot read the fee schedule");

    const initial = await setup(ownerCookie);
    assert.equal(initial.status, 200);
    assert.equal(initial.body.setup.canEdit, true);
    assert.deepEqual(initial.body.setup.feeSchedule, [], "no fee is seeded; a price nobody set would be invented");
    assert.deepEqual(initial.body.setup.chargeTemplates, [], "no charge template is seeded");

    const badFee = await setup(ownerCookie, { operation: "save-fee", code: "99214", amountCents: -1 });
    assert.equal(badFee.status, 400, "a negative fee is refused");
    const badNpi = await setup(ownerCookie, { operation: "save-provider", userId: "team-taylor", npi: "1234567890" });
    assert.equal(badNpi.status, 400, "an NPI with a bad check digit is refused");

    const starters = await setup(ownerCookie, { operation: "create-starter-templates" });
    assert.equal(starters.status, 200);
    const followUpTemplate = starters.body.setup.chargeTemplates.find(
      (template: any) => template.noteTemplateId === "psychotherapy-add-90833",
    );
    assert.ok(followUpTemplate, "a starter template is offered for each shipped note template");
    assert.equal(followUpTemplate.addOnPolicy, "psychotherapy-time");
    assert.equal(followUpTemplate.telehealthModifier, "95");

    const again = await setup(ownerCookie, { operation: "create-starter-templates" });
    assert.equal(
      again.body.setup.chargeTemplates.length,
      starters.body.setup.chargeTemplates.length,
      "starters never duplicate a template the practice already has",
    );

    const clash = await setup(ownerCookie, {
      operation: "save-charge-template",
      name: "Duplicate",
      noteTemplateId: "psychotherapy-add-90833",
      primaryCode: "99214",
      addOnPolicy: "none",
    });
    assert.equal(clash.status, 400, "a second active template for the same note template is refused by name");

    assert.equal((await setup(ownerCookie, { operation: "save-fee", code: "99214", amountCents: 21000 })).status, 200);
    assert.equal(
      (await setup(ownerCookie, { operation: "save-fee", code: "+90833", description: "Psychotherapy add-on", amountCents: 9500 })).status,
      200,
    );
    assert.equal(
      (await setup(ownerCookie, {
        operation: "save-profile",
        legalName: "Synthetic Psychiatry PLLC",
        addressLine1: "1 Test Way",
        city: "Springfield",
        state: "il",
        postalCode: "62701",
        phone: "555-0100",
        taxId: "12-3456789",
      })).status,
      200,
    );
    assert.equal(
      (await setup(ownerCookie, {
        operation: "save-provider",
        userId: "team-taylor",
        npi: "1234567893",
        licenseNumber: "SYN-LIC-1",
        licenseState: "IL",
      })).status,
      200,
    );

    const memberWrite = await setup(memberCookie, { operation: "save-fee", code: "99214", amountCents: 1 });
    assert.equal(memberWrite.status, 403);
    const afterRefusal = await setup(ownerCookie);
    assert.equal(
      afterRefusal.body.setup.feeSchedule.find((entry: any) => entry.code === "99214").amountCents,
      21000,
      "a refused write changes nothing",
    );
    assert.equal(afterRefusal.body.setup.profile.state, "IL");

    // ----------------------------------------- a telehealth psychotherapy visit
    const problem = ClinicalRecordRepository.addProblem({
      patientId,
      displayText: "Generalized Anxiety Disorder",
      code: "F41.1",
      codingSystem: "ICD-10-CM",
    }, owner);
    ClinicalRecordRepository.addInsurance({
      patientId,
      payerName: "Synthetic Commercial Plan",
      memberId: "SYN-42",
      coveragePriority: 1,
    }, owner);

    const now = new Date().toISOString();
    const appointmentId = "appt-billing-setup-video";
    db.prepare(`
      INSERT INTO appointments (
        id, date, patient_id, patient_name, dob, age, mrn, time, duration, type, status,
        chief_complaint, insurance, modality, version, created_at, updated_at
      ) VALUES (?, '2026-09-24', ?, 'Maya Chen', '1992-04-18', 34, 'P-10482', '09:00', '45 min',
        'Follow-up', 'in-visit', 'Follow-up', 'Synthetic', 'video', 1, ?, ?)
    `).run(appointmentId, patientId, now, now);

    const encounterId = "enc-billing-setup-telehealth";
    await ClinicalActionGateway.execute({
      actor: owner,
      context,
      expectedPatientId: patientId,
      action: {
        type: "save_encounter_draft",
        payload: {
          id: encounterId,
          patientId,
          appointmentId,
          assessment: "GAD, improving.",
          plan: "Continue sertraline; CBT focus on worry exposure.",
          cptCode: "99214",
          emLevel: "Moderate Complexity (99214)",
          workingState: {
            selectedTemplateId: "psychotherapy-add-90833",
            psychotherapyMinutes: 30,
            addonCodes: ["+90833", "not-a-code"],
            candidateActions: [],
            ambientTranscript: [],
          },
        },
      },
    });
    const reference = NoteReferenceRepository.upsert(
      encounterId,
      patientId,
      { section: "assessment", entityType: "problem", entityId: problem.id, source: "clinician-authored" },
      owner,
    );
    NoteReferenceRepository.confirm([reference.id], owner);
    await ClinicalActionGateway.execute({
      actor: owner,
      context,
      expectedPatientId: patientId,
      action: { type: "sign_encounter", payload: { encounterId } },
    });

    const snapshot = db
      .prepare("SELECT content_json FROM signed_encounter_snapshots WHERE encounter_id = ?")
      .get(encounterId) as { content_json: string };
    assert.deepEqual(
      JSON.parse(snapshot.content_json).coding.addonCodes,
      ["+90833"],
      "the attested add-on is sealed into the legal record, and a malformed code is dropped",
    );

    const charge = (await ClinicalActionGateway.execute({
      actor: owner,
      context,
      expectedPatientId: patientId,
      action: { type: "prepare_billing_charge", payload: { encounterId } },
    })) as any;

    assert.deepEqual(charge.procedureCodes.map((line: any) => line.code), ["99214", "90833"]);
    assert.deepEqual(charge.procedureCodes.map((line: any) => line.modifiers), [["95"], ["95"]]);
    assert.deepEqual(charge.procedureCodes.map((line: any) => line.feeCents), [21000, 9500]);
    assert.equal(charge.placeOfService, "10", "a video visit takes the template's telehealth place of service");
    assert.equal(charge.chargeTemplateId, followUpTemplate.id);

    // ------------------------------------------------ superbill gate
    async function superbill(chargeId: string, cookie = ownerCookie) {
      const response = await superbillGet(new Request(
        `http://ehr.local/api/billing/superbill?chargeId=${encodeURIComponent(chargeId)}`,
        { headers: { cookie } },
      ));
      return { status: response.status, body: (await response.json()) as any };
    }
    const auditBefore = AuditRepository.getRecent(500).filter((entry) => entry.eventType === "billing_superbill_generated").length;
    const refused = await superbill(charge.id);
    assert.equal(refused.status, 409, "an unreviewed charge cannot become a superbill");
    assert.match(refused.body.error, /reviewed charge/);
    assert.equal(
      AuditRepository.getRecent(500).filter((entry) => entry.eventType === "billing_superbill_generated").length,
      auditBefore,
      "a refusal writes no audit event claiming a document was produced",
    );

    await ClinicalActionGateway.execute({
      actor: owner,
      context,
      expectedPatientId: patientId,
      action: { type: "review_billing_charge", payload: { chargeId: charge.id, expectedVersion: charge.version } },
    });

    const produced = await superbill(charge.id);
    assert.equal(produced.status, 200);
    const document = produced.body.superbill;
    assert.equal(document.practice.legalName, "Synthetic Psychiatry PLLC");
    assert.equal(document.renderingProvider.npi, "1234567893", "the signer's recorded NPI is printed");
    assert.equal(document.totalCents, 30500);
    assert.deepEqual(document.diagnoses.map((entry: any) => `${entry.pointer}:${entry.code}`), ["A:F41.1"]);
    assert.deepEqual(document.lines[0].diagnosisPointers, ["A"]);
    assert.equal(document.coverage.memberId, "SYN-42");
    assert.ok(
      document.missing.includes("Patient address"),
      "a field the chart does not hold is named as missing rather than filled in",
    );
    assert.equal(
      (await superbill(charge.id, memberCookie)).status,
      403,
      "the superbill is financial access, not chart access",
    );
    const generated = AuditRepository.getRecent(500).find(
      (entry) => entry.eventType === "billing_superbill_generated" && entry.metadata?.chargeId === charge.id,
    );
    assert.ok(generated, "producing a superbill is audited");
    assert.equal(generated!.patientId, patientId);

    // ------------------------------------ unknown modality, unpriced code
    const plainEncounter = "enc-billing-setup-unlinked";
    await ClinicalActionGateway.execute({
      actor: owner,
      context,
      expectedPatientId: patientId,
      action: {
        type: "save_encounter_draft",
        payload: {
          id: plainEncounter,
          patientId,
          assessment: "GAD.",
          plan: "Continue.",
          cptCode: "99213",
          emLevel: "Low Complexity (99213)",
          workingState: {
            selectedTemplateId: "fast-med-check-99213",
            psychotherapyMinutes: 0,
            candidateActions: [],
            ambientTranscript: [],
          },
        },
      },
    });
    await ClinicalActionGateway.execute({
      actor: owner,
      context,
      expectedPatientId: patientId,
      action: { type: "sign_encounter", payload: { encounterId: plainEncounter } },
    });
    const plainSnapshot = JSON.parse(
      (db.prepare("SELECT content_json FROM signed_encounter_snapshots WHERE encounter_id = ?").get(plainEncounter) as any)
        .content_json,
    );
    assert.equal("addonCodes" in plainSnapshot.coding, false, "a note without add-ons seals the shape it always did");

    const plainCharge = billingService.prepareCharge(plainEncounter, owner, context);
    assert.deepEqual(plainCharge.procedureCodes.map((line) => line.code), ["99213"]);
    assert.equal(plainCharge.procedureCodes[0].feeCents, null, "no fee was set for 99213, so none is shown");
    assert.deepEqual(plainCharge.procedureCodes[0].modifiers, []);
    assert.equal(plainCharge.placeOfService, null, "an encounter with no appointment has no place of service");

    const summary = billingService.worklist(owner).summary;
    assert.equal(summary.billedAtFeeScheduleCents, 30500, "only scheduled fees are summed");
    assert.equal(summary.linesWithFee, 2);
    assert.equal(summary.linesWithoutFee, 1, "and the unpriced line is counted, not treated as zero");
    assert.equal(summary.monetaryTotals, null, "expected and collected amounts still do not exist");

    const setupAudit = AuditRepository.getRecent(500).filter((entry) => entry.eventType === "billing_setup_updated");
    assert.ok(setupAudit.some((entry) => entry.metadata?.section === "fee-schedule" && entry.metadata?.amountCents === 21000));
    assert.ok(setupAudit.some((entry) => entry.metadata?.section === "profile"));
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
