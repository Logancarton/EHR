import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { OmniboxPlan } from "../app/domain/omnibox";
import type { ProviderContext } from "../app/server/auth/provider-context";
import type { OmniboxPlanningModel } from "../app/server/ai/omnibox-model-gateway";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

type PlanResponse = { success: boolean; plan?: OmniboxPlan; error?: string };

test("omnibox planning is authenticated, patient-bound, permission-aware, validated, and mutation-free", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-omnibox-plan-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-omnibox-test-secret-0123456789abcdef";

  try {
    const [
      { getDatabase },
      { AuthRepository },
      { EHR_SESSION_COOKIE, createProviderSessionToken },
      { POST: omniboxPost },
      { GET: searchGet },
      { POST: extractPost },
      { OmniboxPlannerService },
      { ContextAssembler },
    ] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/repositories/auth-repository"),
      import("../app/server/auth/provider-context"),
      import("../app/api/ai/omnibox/plan/route"),
      import("../app/api/ai/search/route"),
      import("../app/api/ai/extract/route"),
      import("../app/server/ai/omnibox-planner"),
      import("../app/server/context/context-assembler"),
    ]);

    // Patient access is an organization-membership decision. Synthetic actors must
    // declare their membership rather than being exempt from the boundary under test.
    await grantSyntheticOrganizationAccess(["team-taylor", "test-provider"]);

    const db = getDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO team_members (
        id, display_name, credentials, role, initials, presence, active, created_at, updated_at
      ) VALUES ('team-staff-test', 'Synthetic Staff', NULL, 'staff', 'SS', 'online', 1, ?, ?)
    `).run(now, now);

    // The synthetic staff member is a separate user record and therefore needs its
    // own membership; role and patient reach are independent authorities.
    await grantSyntheticOrganizationAccess(["team-staff-test", "team-casey"], { role: "staff" });

    function cookieFor(userId: string, sessionId: string): string {
      const expiresAt = Date.now() + 60 * 60 * 1000;
      AuthRepository.createSession({ id: sessionId, userId, expiresAt: new Date(expiresAt).toISOString() });
      const token = createProviderSessionToken(sessionId, expiresAt);
      return `${EHR_SESSION_COOKIE}=${token}`;
    }

    const providerCookie = cookieFor("team-taylor", "omnibox-provider-session");
    const assistantCookie = cookieFor("team-casey", "omnibox-assistant-session");
    const staffCookie = cookieFor("team-staff-test", "omnibox-staff-session");

    async function planRequest(
      cookie: string | undefined,
      query: string,
      activePatientId?: string,
      extraHeaders: Record<string, string> = {},
      extraBody: Record<string, unknown> = {},
      headerPatientId: string | undefined = activePatientId,
    ): Promise<{ response: Response; body: PlanResponse }> {
      const headers: Record<string, string> = { "content-type": "application/json", ...extraHeaders };
      if (cookie) headers.cookie = cookie;
      if (headerPatientId) headers["x-ehr-patient-id"] = headerPatientId;
      const response = await omniboxPost(new Request("http://ehr.local/api/ai/omnibox/plan", {
        method: "POST",
        headers,
        body: JSON.stringify({ query, activePatientId, activeSurface: "general", ...extraBody }),
      }));
      const body = await response.json() as PlanResponse;
      return { response, body };
    }

    function clinicalCounts() {
      const count = (table: string) => Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
      return {
        patients: count("patients"),
        orders: count("orders"),
        encounters: count("encounters"),
        tasks: count("tasks"),
        messages: count("messages"),
        diagnoses: count("patient_problems"),
        medications: count("patient_medications"),
      };
    }

    const beforePlanning = clinicalCounts();

    const unauthenticatedSearch = await searchGet(new Request("http://ehr.local/api/ai/search?q=stable"));
    assert.equal(unauthenticatedSearch.status, 401, "AI search must never use the development prototype identity fallback");

    const unauthenticatedPlan = await planRequest(undefined, "Open Maya", "maya-chen");
    assert.equal(unauthenticatedPlan.response.status, 401, "omnibox planning requires a real authenticated session");

    const unauthenticatedExtract = await extractPost(new Request("http://ehr.local/api/ai/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ utterances: [], activeMedications: [] }),
    }));
    assert.equal(unauthenticatedExtract.status, 401, "clinical extraction requests require authentication");

    const permittedSearch = await searchGet(new Request("http://ehr.local/api/ai/search?q=stable&patientId=maya-chen", {
      headers: { cookie: providerCookie, "x-ehr-patient-id": "maya-chen" },
    }));
    assert.equal(permittedSearch.status, 200, "authenticated users with read_clinical may use clinical search");

    const mismatchedSearch = await searchGet(new Request("http://ehr.local/api/ai/search?q=stable&patientId=jordan-reed", {
      headers: { cookie: providerCookie, "x-ehr-patient-id": "maya-chen" },
    }));
    assert.equal(mismatchedSearch.status, 409, "AI search must not silently cross an active-patient binding");

    const providerOrder = await planRequest(providerCookie, "Order a lithium level", "maya-chen");
    assert.equal(providerOrder.response.status, 200);
    assert.equal(providerOrder.body.plan?.intent.kind, "propose_clinical_actions");
    assert.equal(providerOrder.body.plan?.proposals.length, 1);
    assert.equal(providerOrder.body.plan?.proposals[0].permission, "allowed");
    assert.equal(providerOrder.body.plan?.proposals[0].execution, "not_executed");
    assert.equal(providerOrder.body.plan?.safety.mutatesClinicalRecord, false);
    assert.equal(providerOrder.body.plan?.context?.surface, "order-cart");
    assert.deepEqual(clinicalCounts(), beforePlanning, "planning an order must not create an order or change clinical state");

    const crossPatient = await planRequest(providerCookie, "Order a lithium level for Jordan", "maya-chen");
    assert.equal(crossPatient.response.status, 200);
    assert.equal(crossPatient.body.plan?.patient.active?.id, "maya-chen");
    assert.equal(crossPatient.body.plan?.patient.resolved?.id, "jordan-reed");
    assert.equal(crossPatient.body.plan?.patient.switchRequired, true);
    assert.equal(crossPatient.body.plan?.proposals[0].resolvedPatientId, "jordan-reed");
    assert.equal(crossPatient.body.plan?.proposals[0].activePatientId, "maya-chen");
    assert.equal(crossPatient.body.plan?.proposals[0].blockedReason, "active_patient_mismatch");
    assert.equal(crossPatient.body.plan?.proposals[0].requiresActivePatientConfirmation, true);

    const unknownPatient = await planRequest(providerCookie, "Refill Nobody's sertraline", "maya-chen");
    assert.equal(unknownPatient.response.status, 200);
    assert.equal(unknownPatient.body.plan?.patient.resolution, "not_found");
    assert.equal(unknownPatient.body.plan?.patient.resolved, undefined, "unknown explicit patient must not fall back to the active patient");
    assert.equal(unknownPatient.body.plan?.proposals.length, 0);
    assert.equal(unknownPatient.body.plan?.clarification?.reason, "patient_not_found");

    const ambiguousMedication = await planRequest(providerCookie, "Refill her medication", "maya-chen");
    assert.equal(ambiguousMedication.body.plan?.intent.kind, "clarification_required");
    assert.equal(ambiguousMedication.body.plan?.clarification?.reason, "medication_required");
    assert.equal(ambiguousMedication.body.plan?.proposals.length, 0);

    const patientBodyMismatch = await planRequest(
      providerCookie,
      "Order a CBC",
      "jordan-reed",
      {},
      {},
      "maya-chen",
    );
    assert.equal(patientBodyMismatch.response.status, 409, "body patient identity cannot override the active patient header");

    const attemptedExecute = await planRequest(providerCookie, "Order a CBC", "maya-chen", {}, { execute: true });
    assert.equal(attemptedExecute.response.status, 400, "planning endpoint rejects execution-like extra fields instead of becoming an action gateway");

    const providerMessage = await planRequest(providerCookie, "Draft a response to this message", "maya-chen");
    assert.equal(providerMessage.body.plan?.proposals[0].type, "draft_patient_message");
    assert.equal(providerMessage.body.plan?.proposals[0].permission, "allowed");
    assert.equal(providerMessage.body.plan?.context?.surface, "patient-message");

    const assistantMessage = await planRequest(
      assistantCookie,
      "Draft a response to this message",
      "maya-chen",
      { "x-ehr-role": "provider", "x-ehr-user-id": "team-taylor" },
    );
    assert.equal(assistantMessage.response.status, 200);
    assert.equal(assistantMessage.body.plan?.proposals[0].requiredPermission, "send_message");
    assert.equal(assistantMessage.body.plan?.proposals[0].permission, "denied", "forged provider headers cannot elevate a clinical assistant");
    assert.equal(assistantMessage.body.plan?.proposals[0].blockedReason, "permission_denied");

    const staffMessage = await planRequest(staffCookie, "Draft a response to this message", "maya-chen");
    assert.equal(staffMessage.body.plan?.proposals[0].permission, "allowed", "staff behavior follows the server role permission map");

    const fakeRoleInBody = await planRequest(
      assistantCookie,
      "Draft a response to this message",
      "maya-chen",
      {},
      { role: "provider", userId: "team-taylor" },
    );
    assert.equal(fakeRoleInBody.response.status, 400, "actor identity and role are not accepted from request JSON");

    for (const [query, expectedAction] of [
      ["Sign this encounter", "sign_encounter"],
      ["Authorize this order", "authorize_order"],
      ["Transmit this prescription", "send_prescription"],
    ] as const) {
      const result = await planRequest(providerCookie, query, "maya-chen");
      assert.equal(result.response.status, 200);
      assert.equal(result.body.plan?.intent.kind, "restricted_legal_action");
      assert.equal(result.body.plan?.restrictedAction?.requestedAction, expectedAction);
      assert.equal(result.body.plan?.restrictedAction?.execution, "not_executed");
      assert.equal(result.body.plan?.restrictedAction?.humanReviewRequired, true);
      assert.equal(result.body.plan?.safety.requiresHumanReview, true);
    }

    const noteQuestion = await planRequest(providerCookie, "Show me the last note mentioning stable", "maya-chen");
    assert.equal(noteQuestion.response.status, 200);
    assert.equal(noteQuestion.body.plan?.intent.kind, "clinical_question");
    assert.equal(noteQuestion.body.plan?.context?.surface, "longitudinal-query");
    assert.ok((noteQuestion.body.plan?.context?.provenanceCount || 0) > 0);
    assert.ok((noteQuestion.body.plan?.evidence.length || 0) > 0, "record-derived answer should retain evidence references when search finds a match");

    const providerContext = ContextAssembler.assemble({
      patientId: "maya-chen",
      surface: "longitudinal-query",
      userRole: "provider",
      tokenBudget: 650,
      searchQuery: "stable",
    });
    const providerContextAgain = ContextAssembler.assemble({
      patientId: "maya-chen",
      surface: "longitudinal-query",
      userRole: "provider",
      tokenBudget: 650,
      searchQuery: "stable",
    });
    const staffContext = ContextAssembler.assemble({
      patientId: "maya-chen",
      surface: "longitudinal-query",
      userRole: "staff",
      tokenBudget: 650,
      searchQuery: "stable",
    });
    assert.ok(providerContext && providerContextAgain && staffContext);
    assert.ok(providerContext.recentEncounters.length > 0);
    assert.equal(staffContext.recentEncounters.length, 0, "staff context remains filtered from encounter narrative");
    assert.equal(staffContext.activeMedications.length, 0, "staff context remains filtered from medication details");
    assert.equal(staffContext.searchMatches, undefined, "staff context cannot gain encounter-search text through the new searchMatches field");
    assert.ok(providerContext.searchMatches?.length, "provider longitudinal context may include bounded FTS evidence");
    assert.ok(Object.keys(providerContext.provenanceMap).some(key => key.startsWith("search-enc-")));
    assert.equal(providerContext.estimatedTokens, providerContextAgain.estimatedTokens, "token budgeting is deterministic for equivalent inputs");
    assert.equal(providerContext.isTruncated, providerContextAgain.isTruncated);
    assert.equal(providerContext.recentEncounters.length, providerContextAgain.recentEncounters.length);
    assert.equal(providerContext.searchMatches?.length, providerContextAgain.searchMatches?.length);

    const providerActor: ProviderContext = {
      userId: "test-provider",
      displayName: "Test Provider",
      credentials: "PMHNP-BC",
      role: "provider",
    };

    function modelReturning(raw: unknown): OmniboxPlanningModel {
      return {
        provider: "test",
        model: "untrusted-output",
        async plan() { return raw; },
      };
    }

    async function rejectsModel(raw: unknown, pattern: RegExp) {
      const service = new OmniboxPlannerService(modelReturning(raw));
      await assert.rejects(
        service.plan({ query: "test", activePatientId: "maya-chen" }, providerActor),
        pattern,
      );
    }

    await rejectsModel({ confidence: 0.5 }, /invalid typed plan/i);
    await rejectsModel({ confidence: 1.2, intent: { kind: "unrecognized", reason: "test" } }, /confidence/i);
    await rejectsModel({ confidence: 0.8, intent: { kind: "navigate_patient", patientRef: 42, section: "general" } }, /patient reference/i);
    await rejectsModel({
      confidence: 0.8,
      intent: { kind: "propose_clinical_actions", actions: [{ type: "delete_patient", name: "Maya" }] },
    }, /unsupported|malformed/i);
    await rejectsModel({
      confidence: 0.8,
      intent: { kind: "propose_clinical_actions", actions: Array.from({ length: 9 }, () => ({ type: "stage_lab_order", name: "CBC" })) },
    }, /number of proposed actions/i);
    await rejectsModel({
      confidence: 0.8,
      intent: { kind: "propose_clinical_actions", actions: [{ type: "stage_lab_order", name: "CBC", method: "OrderRepository.stageOrder" }] },
    }, /unexpected field/i);
    await rejectsModel({
      confidence: 0.8,
      intent: { kind: "unrecognized", reason: "x".repeat(25_000) },
    }, /payload size/i);

    assert.deepEqual(
      clinicalCounts(),
      beforePlanning,
      "omnibox planning, restricted-action recognition, context assembly, and invalid model output must not mutate authoritative clinical state",
    );
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
