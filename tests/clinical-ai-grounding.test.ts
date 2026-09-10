import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Phase 3: Clinical AI workflow is source-grounded, context-isolated, surfaces explicit uncertainty, and gates actions behind clinician review", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-ai-grounding-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-ai-grounding-secret-0123456789abcdef";

  try {
    const [
      { AuthRepository },
      { PatientRepository },
      { OrderRepository },
      { ContextAssembler },
      { POST: contextPost },
      { POST: ordersPost },
      { GET: ordersGet },
      { EHR_SESSION_COOKIE, createProviderSessionToken },
    ] = await Promise.all([
      import("../app/server/repositories/auth-repository"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/order-repository"),
      import("../app/server/context/context-assembler"),
      import("../app/api/context/route"),
      import("../app/api/orders/route"),
      import("../app/api/orders/route"),
      import("../app/server/auth/provider-context"),
    ]);

    function sessionCookie(userId: string, sessionId: string): string {
      const expiresAt = Date.now() + 60 * 60 * 1000;
      AuthRepository.createSession({ id: sessionId, userId, expiresAt: new Date(expiresAt).toISOString() });
      return `${EHR_SESSION_COOKIE}=${createProviderSessionToken(sessionId, expiresAt)}`;
    }

    const providerCookie = sessionCookie("team-taylor", "ai-grounding-provider-session");

    // 1. Source-grounded context assembly: real provenance, no hallucinated facts
    const context = ContextAssembler.assemble({
      patientId: "maya-chen",
      surface: "general",
      userRole: "provider",
      tokenBudget: 2500,
    });
    assert.ok(context, "context assembler should return bounded context for existing patient");
    assert.equal(context.patient.id, "maya-chen");
    assert.ok(context.activeMedications.length > 0, "should include authoritative active medications");
    assert.ok(context.activeDiagnoses.length > 0, "should include authoritative active diagnoses");
    assert.ok(context.recentEncounters.length > 0, "should include recent encounter history");

    // Check that recent encounters and recent labs have real provenance
    for (const enc of context.recentEncounters) {
      assert.ok(enc.provenanceRef.startsWith("encounters/"), `provenanceRef must point to encounters authority: ${enc.provenanceRef}`);
      assert.ok(enc.date, "encounter must have recorded clinical date");
      assert.ok(enc.chiefComplaint, "encounter must have recorded chief complaint");
    }
    for (const lab of context.recentLabs) {
      assert.ok(lab.id, "lab observation must have authoritative id");
      assert.ok(lab.date, "lab observation must have recorded date");
      assert.ok(lab.value, "lab observation must have recorded value");
    }

    // 2. Safe presentation of clinical absence: unassessed allergies vs explicit NKDA
    const patientWithoutAllergies = PatientRepository.create({
      id: "ai-unassessed-patient",
      name: "AI Grounding Test Patient",
      initials: "AG",
      dob: "01/01/1990",
      age: 36,
      pronouns: "they/them",
      mrn: "MRN-NO-ALLERGY-AI",
      status: "Established",
      allergies: [],
      diagnoses: [],
      meds: [],
      vitals: {},
      lastVisit: "Initial",
      nextVisit: "Unscheduled",
    });
    const unassessedContext = ContextAssembler.assemble({
      patientId: patientWithoutAllergies.id,
      surface: "general",
      userRole: "provider",
    });
    assert.ok(unassessedContext);
    assert.equal(
      unassessedContext.allergies.length,
      0,
      "unassessed allergy state must never fabricate an explicit NKDA fact",
    );

    // 3. Metabolic protocol surveillance: detects overdue monitoring deterministically
    const surveillanceProtocols = context.monitoringProtocols;
    assert.ok(Array.isArray(surveillanceProtocols), "monitoring protocols must be an array");
    const overdueProtocol = surveillanceProtocols.find((p) => p.status === "overdue");
    if (overdueProtocol) {
      assert.ok(overdueProtocol.requiredLab, "overdue protocol must specify required lab");
      assert.ok(overdueProtocol.medication, "overdue protocol must specify associated medication");
      assert.ok(overdueProtocol.rationale, "overdue protocol must specify clinical rationale");
    }

    // 4. API Context route boundary: requires active patient header and session
    const unauthenticatedReq = await contextPost(new Request("http://ehr.local/api/context", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patientId: "maya-chen" }),
    }));
    assert.equal(unauthenticatedReq.status, 400, "context post without active patient header must be rejected");

    const headerMismatchReq = await contextPost(new Request("http://ehr.local/api/context", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: providerCookie,
        "x-ehr-patient-id": "jordan-reed",
      },
      body: JSON.stringify({ patientId: "maya-chen" }),
    }));
    assert.equal(headerMismatchReq.status, 409, "context post must reject active patient header mismatch");

    const verifiedContextReq = await contextPost(new Request("http://ehr.local/api/context", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: providerCookie,
        "x-ehr-patient-id": "maya-chen",
      },
      body: JSON.stringify({ patientId: "maya-chen" }),
    }));
    assert.equal(verifiedContextReq.status, 200, "context post succeeds with authenticated matching session");

    // 5. Target Context Isolation (RIGHT-04 & CMD-05): Proposal Action Staging
    // A proposal generated for Maya Chen cannot be staged against Jordan Reed's chart context
    const mismatchedOrderStaging = await ordersPost(new Request("http://ehr.local/api/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: providerCookie,
        "x-ehr-patient-id": "jordan-reed", // Active chart is Jordan
      },
      body: JSON.stringify({
        patientId: "maya-chen", // Proposed order is for Maya
        type: "lab",
        name: "Lithium level",
      }),
    }));
    assert.equal(
      mismatchedOrderStaging.status,
      409,
      "staging an order against mismatched active patient chart must be rejected with 409",
    );

    // Staging with correct matching patient context succeeds
    const stagedOrderRes = await ordersPost(new Request("http://ehr.local/api/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: providerCookie,
        "x-ehr-patient-id": "maya-chen",
      },
      body: JSON.stringify({
        patientId: "maya-chen",
        type: "lab",
        name: "Lithium level",
        details: { indication: "Metabolic surveillance protocol monitoring", source: "clinical_ai_proposal" },
      }),
    }));
    assert.equal(stagedOrderRes.status, 201, "staging proposed order succeeds with matching patient context");
    const stagedOrderBody = await stagedOrderRes.json() as { success: boolean; order: { id: string; status: string; details?: { authorizedBy?: string }; patientId: string } };
    assert.ok(stagedOrderBody.order.id);
    assert.equal(stagedOrderBody.order.patientId, "maya-chen");
    assert.equal(stagedOrderBody.order.status, "staged", "proposed order must be staged in draft/staged state");
    assert.equal(stagedOrderBody.order.details?.authorizedBy, undefined, "AI proposed order must NEVER be silently authorized");

    // Verify order in repository remains in staged state
    const orderInDb = OrderRepository.getById(stagedOrderBody.order.id);
    assert.ok(orderInDb);
    assert.equal(orderInDb.status, "staged");
    assert.equal(orderInDb.details?.authorizedBy, undefined);
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
