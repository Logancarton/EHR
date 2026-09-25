import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";
import {
  buildVisitReadiness,
  coverageReadiness,
  type ReadinessDraftFacts,
  type VisitReadinessServerView,
} from "../app/domain/visit-readiness";

/**
 * Visit readiness (D-100): prompts in the note, derived from sources that own the
 * facts. The properties that matter are the ones a checklist would get wrong —
 * items close when the source changes, a failed read never reads as "all clear",
 * and the route answers only for a chart the caller may open.
 */

const baseDraft: ReadinessDraftFacts = {
  sections: { chiefComplaint: "Follow-up", assessment: "", plan: "", followUp: "" },
  goals: [
    { id: "hpi", label: "Interval History Documented", detail: "", met: false, codeImpact: "Needed for 99214" },
    { id: "safety", label: "Safety Assessed", detail: "", met: true, codeImpact: "" },
    { id: "psychotherapy", label: "Psychotherapy ≥16 min", detail: "", met: false, codeImpact: "" },
  ],
  primaryCode: "99214",
  addonCodes: [],
  evidenceBasis: "inferred",
  noteTemplateId: "psychotherapy-add-90833",
  templateExpectsPsychotherapy: true,
  psychotherapyMinutes: 0,
};

function serverView(overrides: Partial<VisitReadinessServerView> = {}): VisitReadinessServerView {
  return {
    patientId: "maya-chen",
    encounterId: "enc-1",
    resolvedAt: "2026-09-24T12:00:00.000Z",
    care: { items: [] },
    monitoring: { items: [] },
    coverage: { findings: [] },
    diagnosis: { confirmedCoded: 0, proposedCoded: 0, chartCodedProblems: 1 },
    billing: { chargeTemplates: [], feeCodes: [], rendering: { hasNpi: true } },
    ...overrides,
  };
}

function item(result: ReturnType<typeof buildVisitReadiness>, id: string) {
  return result.groups.flatMap((group) => group.items).find((entry) => entry.id === id);
}

test("readiness items are derived from the draft and close when the draft changes", () => {
  const open = buildVisitReadiness({ draft: baseDraft, server: serverView(), serverError: null, referenceRefreshFailed: false });
  assert.equal(item(open, "goal:hpi")?.state, "open");
  assert.deepEqual(item(open, "goal:hpi")?.action, { kind: "focus-section", section: "intervalHistory", label: "Go to section" });
  assert.equal(item(open, "section:assessment")?.state, "open");
  assert.equal(item(open, "section:chiefComplaint")?.state, "complete");
  assert.equal(item(open, "billing:therapy-time")?.state, "open");
  assert.equal(item(open, "billing:therapy-time")?.action?.kind, "therapy-time");
  assert.equal(item(open, "billing:diagnosis")?.action?.kind, "focus-section", "a coded chart problem means the fix is in Assessment");
  assert.equal(item(open, "billing:charge-template")?.state, "open");
  assert.match(item(open, "billing:fees")?.label ?? "", /No practice fee for 99214/);

  const written = buildVisitReadiness({
    draft: {
      ...baseDraft,
      sections: { ...baseDraft.sections, assessment: "GAD improving", plan: "Continue", followUp: "4 weeks" },
      goals: baseDraft.goals.map((goal) => ({ ...goal, met: true })),
      psychotherapyMinutes: 30,
      addonCodes: ["+90833"],
    },
    server: serverView({
      diagnosis: { confirmedCoded: 1, proposedCoded: 0, chartCodedProblems: 1 },
      billing: {
        chargeTemplates: [{
          id: "t1", organizationId: "o", name: "Psychotherapy follow-up", noteTemplateId: "psychotherapy-add-90833",
          primaryCode: "99214", primaryDescription: "", addOnPolicy: "psychotherapy-time",
          placeOfServiceInPerson: "11", placeOfServiceTelehealth: "10", telehealthModifier: "95",
          active: true, version: 1, updatedBy: "u", updatedAt: "",
        }],
        feeCodes: [{ code: "99214", modifier: "" }, { code: "90833", modifier: "" }],
        rendering: { hasNpi: true },
      },
    }),
    serverError: null,
    referenceRefreshFailed: false,
  });
  assert.equal(written.groups.find((group) => group.id === "note")!.open, 0);
  assert.equal(item(written, "billing:therapy-time")?.state, "complete");
  assert.equal(item(written, "billing:fees")?.state, "complete", "add-on notation matches the fee schedule's bare code");
  assert.equal(item(written, "billing:charge-template")?.state, "complete");
  assert.equal(written.openCount, 0);
});

test("a signed note's documentation gaps are history, not open work", () => {
  const signed = buildVisitReadiness({ draft: baseDraft, server: serverView(), serverError: null, referenceRefreshFailed: false, isSigned: true });
  assert.equal(signed.groups.find((group) => group.id === "note")!.open, 0);
  assert.equal(item(signed, "goal:hpi")?.state, "info");
  assert.equal(item(signed, "goal:hpi")?.action, undefined, "an immutable note offers no editing action");
  assert.equal(item(signed, "billing:charge-template")?.state, "open", "practice setup is still work after signing");
});

test("a failed read is reported per group and never as nothing to do", () => {
  const failed = buildVisitReadiness({ draft: baseDraft, server: null, serverError: "HTTP 500", referenceRefreshFailed: true });
  for (const id of ["labs", "meds", "follow-up"]) {
    const group = failed.groups.find((entry) => entry.id === id)!;
    assert.equal(group.error, "HTTP 500", `${id} states its source failed`);
    assert.equal(group.loading, false);
  }
  assert.equal(item(failed, "note:evidence-refresh")?.action?.kind, "retry", "the evidence failure is an actionable item, not loose text");

  const loading = buildVisitReadiness({ draft: baseDraft, server: null, serverError: null, referenceRefreshFailed: false });
  assert.equal(loading.groups.find((group) => group.id === "labs")!.loading, true);

  const partial = buildVisitReadiness({
    draft: baseDraft,
    server: serverView({ care: { error: "care unavailable" }, coverage: { error: "coverage unavailable" } }),
    serverError: null,
    referenceRefreshFailed: false,
  });
  assert.equal(partial.groups.find((group) => group.id === "labs")!.error, "care unavailable");
  assert.equal(item(partial, "billing:coverage-error")?.state, "unavailable");
});

test("a server view missing a part degrades to a stated gap instead of breaking the note", () => {
  const partial = { ...serverView() } as Partial<VisitReadinessServerView>;
  delete partial.monitoring;
  const result = buildVisitReadiness({
    draft: baseDraft,
    server: partial as VisitReadinessServerView,
    serverError: null,
    referenceRefreshFailed: false,
  });
  assert.match(result.groups.find((group) => group.id === "labs")!.error ?? "", /not provided/);
});

test("care-completion items land in their group with their own evidence and action", () => {
  const result = buildVisitReadiness({
    draft: baseDraft,
    server: serverView({
      care: {
        items: [
          {
            itemKey: "monitoring-labs:lithium", ruleId: "monitoring-labs", scopeId: "lithium",
            label: "Review monitoring labs — Lithium", detail: "Consider lithium level", authority: "observed",
            state: "open", classification: "actionable", explanation: "", evidence: [],
            action: { label: "Open results", targetSection: "Labs" }, deferrable: true,
          },
          {
            itemKey: "encounter-signed:enc-1", ruleId: "encounter-signed", label: "Sign encounter",
            authority: "observed", state: "open", classification: "actionable", explanation: "", evidence: [], deferrable: true,
          },
          {
            itemKey: "follow-up-appointment:enc-1", ruleId: "follow-up-appointment", label: "Book follow-up",
            authority: "observed", state: "open", classification: "actionable", explanation: "", evidence: [],
            action: { label: "Open schedule", targetSection: "Schedule" }, deferrable: true,
          },
        ],
      },
    }),
    serverError: null,
    referenceRefreshFailed: false,
  });
  assert.equal(
    item(result, "care:monitoring-labs:lithium"),
    undefined,
    "medication surveillance is D-099's; care completion's older catalogue must not give a second answer",
  );
  assert.equal(item(result, "care:follow-up-appointment:enc-1")?.action?.kind, "open-schedule");
  assert.equal(item(result, "care:encounter-signed:enc-1"), undefined, "the note being written is not a prompt inside itself");
});

test("medication monitoring comes from the D-099 policy evaluation, and a policy failure is not all clear", () => {
  const monitoring = buildVisitReadiness({
    draft: baseDraft,
    server: serverView({
      monitoring: {
        items: [
          {
            ruleId: "quetiapine-metabolic", medication: "Quetiapine 100 mg nightly", canonicalMedication: "quetiapine",
            measureKind: "lab", requiredMeasure: "Fasting lipid panel", requiredLab: "Fasting lipid panel",
            intervalDays: 365, intervalLabel: "Every 12 months", lastDoneDate: "2025-06-01", dueDate: "2026-06-01",
            daysElapsed: 480, daysRemaining: -115, status: "overdue", rationale: "", policySource: "system",
          },
          {
            ruleId: "lamotrigine-rash", medication: "Lamotrigine", canonicalMedication: "lamotrigine",
            measureKind: "lab", requiredMeasure: "CBC", requiredLab: "CBC", intervalDays: 365,
            intervalLabel: "Every 12 months", lastDoneDate: "2026-08-01", dueDate: "2027-08-01",
            daysElapsed: 54, daysRemaining: 311, status: "current", rationale: "", policySource: "practice",
          },
        ],
      },
    }),
    serverError: null,
    referenceRefreshFailed: false,
  });
  const overdue = item(monitoring, "monitoring:quetiapine-metabolic:quetiapine");
  assert.equal(overdue?.state, "open");
  assert.equal(overdue?.group, "labs");
  assert.deepEqual(overdue?.action, { kind: "open-chart", section: "Labs", label: "Open labs" });
  assert.equal(item(monitoring, "monitoring:lamotrigine-rash:lamotrigine")?.state, "complete");

  const failed = buildVisitReadiness({
    draft: baseDraft,
    server: serverView({ monitoring: { error: "policy store offline" } }),
    serverError: null,
    referenceRefreshFailed: false,
  });
  assert.match(failed.groups.find((group) => group.id === "labs")!.error ?? "", /policy store offline/);
});

test("coverage completeness says recorded, never eligible", () => {
  assert.equal(coverageReadiness([], "2026-09-24")[0].id, "coverage-none");
  const dependent = coverageReadiness(
    [{
      id: "c1", patientId: "p", payerName: "Synthetic Plan", coverageType: "commercial", isSelfPay: false,
      priority: 1, status: "active", relationship: "child", terminationDate: "2026-01-01",
    }],
    "2026-09-24",
  );
  assert.deepEqual(
    dependent.map((finding) => finding.id).sort(),
    ["coverage-member-id", "coverage-subscriber-dob", "coverage-subscriber-name", "coverage-terminated"],
  );
  const complete = coverageReadiness(
    [{ id: "c2", patientId: "p", payerName: "Synthetic Plan", memberId: "M1", coverageType: "commercial", isSelfPay: false, priority: 1, status: "active" }],
    "2026-09-24",
  );
  assert.equal(complete[0].state, "complete");
  assert.match(complete[0].detail ?? "", /has not been verified/);
});

test("the readiness route answers only for a reachable chart and a matching encounter", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  process.chdir(mkdtempSync(join(tmpdir(), "ehr-visit-readiness-")));
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-visit-readiness-secret-0123456789";

  try {
    const [{ GET }, { POST: loginPost }, { ClinicalActionGateway }, { getDatabase }] = await Promise.all([
      import("../app/api/visit-readiness/route"),
      import("../app/api/auth/login/route"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/db/connection"),
    ]);
    getDatabase();
    const home = await grantSyntheticOrganizationAccess(["team-taylor"]);
    await grantSyntheticOrganizationAccess(["outsider"], { organizationId: "org-elsewhere" });
    void home;

    async function signIn(userId: string) {
      const response = await loginPost(new Request("http://ehr.local/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      }));
      return response.headers.get("set-cookie")!.split(";", 1)[0];
    }
    const cookie = await signIn("team-taylor");
    const outsiderCookie = await signIn("outsider");

    const owner = { userId: "team-taylor", displayName: "Dr. Taylor", role: "provider" as const };
    await ClinicalActionGateway.execute({
      actor: owner,
      context: { source: "api", requestId: "readiness" },
      expectedPatientId: "jordan-reed",
      action: { type: "save_encounter_draft", payload: { id: "enc-readiness-jordan", patientId: "jordan-reed", plan: "" } },
    });

    async function get(query: string, as = cookie) {
      const response = await GET(new Request(`http://ehr.local/api/visit-readiness?${query}`, { headers: { cookie: as } }));
      return { status: response.status, body: (await response.json()) as any };
    }

    const ok = await get("patientId=maya-chen");
    assert.equal(ok.status, 200);
    assert.ok("items" in ok.body.readiness.care);
    assert.ok("items" in ok.body.readiness.monitoring, "monitoring is evaluated from the effective D-099 policy");
    assert.ok("findings" in ok.body.readiness.coverage);
    assert.equal(ok.body.readiness.diagnosis, null, "no encounter id means diagnosis links are unknown, not zero");

    const mismatch = await get("patientId=maya-chen&encounterId=enc-readiness-jordan");
    assert.equal(mismatch.status, 409, "another patient's encounter is refused, never merged into this chart's panel");

    const refused = await get("patientId=maya-chen", outsiderCookie);
    assert.equal(refused.status, 403, "a chart outside the caller's organization is refused before anything is read");
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
