import test from "node:test";
import assert from "node:assert/strict";

import { OllamaClient } from "../app/server/ai/ollama-client";
import { OllamaOmniboxPlanningModel } from "../app/server/ai/ollama-planning-model";
import { AdaptiveOmniboxPlanningModel } from "../app/server/ai/adaptive-planning-model";
import { RuleBasedOmniboxPlanningModel } from "../app/server/ai/omnibox-model-gateway";
import { validateOmniboxPlanningModelOutput } from "../app/domain/omnibox";
import { assignSyntheticPatients, grantSyntheticOrganizationAccess } from "./helpers/organization-access";

test("ollama client detects local instance and can execute structured chat", async () => {
  const client = new OllamaClient();
  const available = await client.isAvailable(800);

  if (!available) {
    // If Ollama is not running in the current test runner environment, verify timeout/error handling
    const unreachable = new OllamaClient({ baseUrl: "http://127.0.0.1:54321", defaultTimeoutMs: 300 });
    const isUp = await unreachable.isAvailable(200);
    assert.equal(isUp, false);
    return;
  }

  assert.equal(available, true);
  const models = await client.listModels();
  assert.ok(Array.isArray(models));
  assert.ok(models.some((m) => m.name.includes("llama3.2:1b")));

  // Structured json chat
  const jsonResponse = await client.chatJson<{ role: string; task: string }>([
    { role: "system", content: "You output JSON only: {\"role\": \"ai\", \"task\": \"intent\"}" },
    { role: "user", content: "ping" },
  ], {
    model: "llama3.2:1b",
    temperature: 0,
    timeoutMs: 12000,
  });

  assert.ok(typeof jsonResponse === "object" && jsonResponse !== null);
  assert.equal(jsonResponse.role, "ai");
});

test("adaptive planning model uses ollama when enabled and falls back to rule planner", async () => {
  const ruleModel = new RuleBasedOmniboxPlanningModel();
  const adaptive = new AdaptiveOmniboxPlanningModel(undefined, ruleModel);

  // Default test environment defaults to deterministic ruleModel
  const ruleResult = await adaptive.plan({ query: "order a CMP for Maya Chen" });
  const validatedRule = validateOmniboxPlanningModelOutput(ruleResult);
  assert.equal(validatedRule.intent.kind, "propose_clinical_actions");

  // Mock failing/timing out ollama model falls back seamlessly
  const brokenOllamaModel = {
    provider: "ollama",
    model: "broken",
    async plan() {
      throw new Error("Simulated Ollama crash/timeout");
    },
  };

  const resilientAdaptive = new AdaptiveOmniboxPlanningModel(brokenOllamaModel, ruleModel);
  const fallbackResult = await resilientAdaptive.plan({ query: "navigate to Maya Chen labs" });
  const validatedFallback = validateOmniboxPlanningModelOutput(fallbackResult);
  assert.equal(validatedFallback.intent.kind, "navigate_patient");
  assert.equal(resilientAdaptive.provider, "ehr-local");
});

test("GET /api/ai/status reports local AI connectivity and model availability", async () => {
  const { GET: statusGet } = await import("../app/api/ai/status/route");
  const { AuthRepository } = await import("../app/server/repositories/auth-repository");
  const { EHR_SESSION_COOKIE, createProviderSessionToken } = await import("../app/server/auth/provider-context");

  await grantSyntheticOrganizationAccess(["team-taylor", "test-provider"]);
  const sessionId = `status-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const expiresAt = Date.now() + 60 * 60 * 1000;
  AuthRepository.createSession({ id: sessionId, userId: "team-taylor", expiresAt: new Date(expiresAt).toISOString() });
  const token = createProviderSessionToken(sessionId, expiresAt);

  const req = new Request("http://ehr.local/api/ai/status", {
    headers: {
      cookie: `${EHR_SESSION_COOKIE}=${token}`,
    },
  });

  const res = await statusGet(req);
  assert.equal(res.status, 200);
  const body = await res.json() as {
    success: boolean;
    provider: string;
    connected: boolean;
    activeModel: string;
    availableModels: string[];
  };

  assert.equal(body.success, true);
  assert.ok(typeof body.connected === "boolean");
  assert.ok(typeof body.provider === "string");
  assert.ok(Array.isArray(body.availableModels));
});

test("adaptive note reference extractor matches candidates and falls back deterministically", async () => {
  const { AdaptiveNoteReferenceExtractor, DeterministicNoteReferenceExtractor, extractWithModel } = await import(
    "../app/server/ai/note-reference-extractor"
  );

  const request = {
    section: "assessment",
    text: "Patient reports stable mood on Sertraline and denies manic symptoms.",
    candidates: [
      {
        entityType: "medication" as const,
        entityId: "med-sertraline-1",
        display: "Sertraline 100 mg daily",
        aliases: ["Zoloft", "Sertraline"],
      },
      {
        entityType: "problem" as const,
        entityId: "prob-mdd-1",
        display: "Major Depressive Disorder",
        aliases: ["MDD", "Depression"],
      },
    ],
  };

  const adaptive = new AdaptiveNoteReferenceExtractor();
  const result = await extractWithModel(adaptive, request);

  assert.ok(result.selections.length >= 1);
  assert.equal(result.selections[0].entityId, "med-sertraline-1");
  assert.ok(result.selections[0].spanStart !== null);
  assert.ok(result.selections[0].spanEnd !== null);
});

test("adaptive scribe model synthesizes transcript-grounded draft and extracts candidate actions", async () => {
  const { AdaptiveScribingModel } = await import(
    "../app/server/ai/ollama-scribe"
  );

  const utterances = [
    {
      id: "u-1",
      speaker: "clinician" as const,
      speakerName: "Dr. Taylor",
      text: "How have you been sleeping since we started sertraline 50mg?",
      timestamp: "10:00 AM",
    },
    {
      id: "u-2",
      speaker: "patient" as const,
      speakerName: "Maya",
      text: "Much better. Let's titrate sertraline to 75mg daily. Also need to check lithium level.",
      timestamp: "10:01 AM",
    },
  ];

  const scribe = new AdaptiveScribingModel();
  const output = await scribe.synthesizeNote({
    utterances,
    patientContext: {
      name: "Maya Chen",
      activeMedications: ["Sertraline 50mg", "Lithium 300mg"],
    },
  });

  assert.ok(output.chiefComplaint.length > 0);
  assert.ok(output.intervalHistory.length > 0);
  assert.ok(typeof output.mse === "object");
  assert.ok(Array.isArray(output.candidateActions));
  assert.equal(output.plan, "", "deterministic fallback must not promote the patient's titration request into the plan");
  assert.equal(output.sideEffects, "", "silence about side effects must remain undocumented");
  assert.equal(output.mse.thoughtContent, "", "MSE safety findings must not be inferred from ordinary transcript text");
  // Candidate actions are proposals and may detect the medication/lab request for clinician review.
  assert.ok(output.candidateActions.length >= 1);
  assert.ok(output.candidateActions.some(ca => ca.title.toLowerCase().includes("sertraline") || ca.type === "medication-titration"));
});

test("POST /api/ai/synthesize-note uses authorized chart context and ignores prewritten scenario note content", async () => {
  const { POST: synthesizePost } = await import("../app/api/ai/synthesize-note/route");
  const { AuthRepository } = await import("../app/server/repositories/auth-repository");
  const { EHR_SESSION_COOKIE, createProviderSessionToken } = await import("../app/server/auth/provider-context");

  const organizationId = await grantSyntheticOrganizationAccess(["team-taylor", "test-provider"]);
  await assignSyntheticPatients(["maya-chen"], organizationId);
  const sessionId = `scribe-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const expiresAt = Date.now() + 60 * 60 * 1000;
  AuthRepository.createSession({ id: sessionId, userId: "team-taylor", expiresAt: new Date(expiresAt).toISOString() });
  const token = createProviderSessionToken(sessionId, expiresAt);

  const utterances = [
    {
      id: "u-10",
      speaker: "patient",
      speakerName: "Maya",
      text: "Sleep has been a little better this week.",
      timestamp: "09:00 AM",
    },
  ];
  const fabricatedMarker = "FABRICATED-SCENARIO-CONTENT-MUST-NEVER-ENTER-THE-NOTE";

  const req = new Request("http://ehr.local/api/ai/synthesize-note", {
    method: "POST",
    headers: {
      cookie: `${EHR_SESSION_COOKIE}=${token}`,
      "content-type": "application/json",
      "x-ehr-patient-id": "maya-chen",
    },
    body: JSON.stringify({
      utterances,
      patientContext: {
        patientId: "maya-chen",
        // These client-supplied clinical facts are intentionally false. The route
        // accepts only patientId and rebuilds everything else from the chart.
        name: fabricatedMarker,
        activeMedications: [fabricatedMarker],
        activeDiagnoses: [fabricatedMarker],
      },
      scenarioSynthesizedNote: {
        chiefComplaint: fabricatedMarker,
        intervalHistory: fabricatedMarker,
        treatmentResponse: fabricatedMarker,
        sideEffects: fabricatedMarker,
        mse: { thoughtContent: fabricatedMarker },
        assessment: fabricatedMarker,
        plan: fabricatedMarker,
        candidateActions: [],
      },
    }),
  });

  const res = await synthesizePost(req);
  assert.equal(res.status, 200);
  const data = await res.json() as {
    success: boolean;
    chiefComplaint: string;
    intervalHistory: string;
    treatmentResponse: string;
    sideEffects: string;
    mse: Record<string, string>;
    assessment: string;
    plan: string;
    candidateActions: unknown[];
    provider: string;
  };

  assert.equal(data.success, true);
  assert.ok(typeof data.chiefComplaint === "string");
  assert.ok(typeof data.mse === "object");
  assert.ok(Array.isArray(data.candidateActions));
  assert.equal(JSON.stringify(data).includes(fabricatedMarker), false);
  assert.equal(data.plan, "");
  assert.equal(data.sideEffects, "");
});

test("POST /api/ai/synthesize-note refuses to synthesize without transcript evidence", async () => {
  const { POST: synthesizePost } = await import("../app/api/ai/synthesize-note/route");
  const { AuthRepository } = await import("../app/server/repositories/auth-repository");
  const { EHR_SESSION_COOKIE, createProviderSessionToken } = await import("../app/server/auth/provider-context");

  const organizationId = await grantSyntheticOrganizationAccess(["team-taylor"]);
  await assignSyntheticPatients(["maya-chen"], organizationId);
  const sessionId = `scribe-empty-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const expiresAt = Date.now() + 60 * 60 * 1000;
  AuthRepository.createSession({ id: sessionId, userId: "team-taylor", expiresAt: new Date(expiresAt).toISOString() });
  const token = createProviderSessionToken(sessionId, expiresAt);

  const req = new Request("http://ehr.local/api/ai/synthesize-note", {
    method: "POST",
    headers: {
      cookie: `${EHR_SESSION_COOKIE}=${token}`,
      "content-type": "application/json",
      "x-ehr-patient-id": "maya-chen",
    },
    body: JSON.stringify({
      utterances: [],
      patientContext: { patientId: "maya-chen" },
    }),
  });

  const res = await synthesizePost(req);
  assert.equal(res.status, 400);
  const data = await res.json() as { success: boolean; error: string };
  assert.equal(data.success, false);
  assert.match(data.error, /transcript utterance/i);
});

test("Ollama clinical synthesis cites the exact medication source and never treats missing allergies as NKDA", async () => {
  const { OllamaSynthesizer } = await import("../app/server/ai/ollama-synthesizer");
  let prompt = "";
  const fakeClient = {
    async isAvailable() { return true; },
    async chatJson(messages: Array<{ role: string; content: string }>) {
      prompt = messages.map((message) => message.content).join("\n");
      return {
        answer: "Guanfacine ER 2 mg nightly is listed as an active medication.",
        sourceKeys: ["medication:1"],
      };
    },
  };

  const context = {
    patient: { id: "p-1", name: "Maya Chen", mrn: "MRN-1", dob: "2000-01-01", age: 26, pronouns: "she/her" },
    surface: "general",
    userRole: "provider",
    allergies: [],
    activeDiagnoses: [],
    activeMedications: ["Sertraline 100 mg daily", "Guanfacine ER 2 mg nightly"],
    vitals: {},
    recentLabs: [],
    monitoringProtocols: [],
    recentEncounters: [],
    provenanceMap: {
      patient: "patients/p-1",
      "medication-med-1": "medications/med-1",
      "medication-med-2": "medications/med-2",
    },
    estimatedTokens: 50,
    isTruncated: false,
    assembledAt: new Date().toISOString(),
  } as any;

  const synthesizer = new OllamaSynthesizer(fakeClient as unknown as OllamaClient);
  const result = await synthesizer.answerQuestion("What is she taking at night?", context);

  assert.ok(result);
  assert.equal(result!.evidence.length, 1);
  assert.equal(result!.evidence[0].sourceRef, "medications/med-2");
  assert.match(prompt, /No active allergy entries are present/i);
  assert.match(prompt, /Do NOT interpret this as NKDA/i);
  assert.doesNotMatch(prompt, /Allergies\s*:\s*NKDA/i);
});

test("Ollama clinical synthesis rejects a factual answer whose source key is not in the server catalog", async () => {
  const { OllamaSynthesizer } = await import("../app/server/ai/ollama-synthesizer");
  const fakeClient = {
    async isAvailable() { return true; },
    async chatJson() {
      return {
        answer: "The patient is taking lithium 900 mg daily.",
        sourceKeys: ["medication:99"],
      };
    },
  };

  const context = {
    patient: { id: "p-2", name: "Jordan Reed", mrn: "MRN-2", dob: "1990-01-01", age: 36, pronouns: "they/them" },
    surface: "general",
    userRole: "provider",
    allergies: [],
    activeDiagnoses: [],
    activeMedications: ["Lithium 600 mg nightly"],
    vitals: {},
    recentLabs: [],
    monitoringProtocols: [],
    recentEncounters: [],
    provenanceMap: {
      patient: "patients/p-2",
      "medication-med-3": "medications/med-3",
    },
    estimatedTokens: 40,
    isTruncated: false,
    assembledAt: new Date().toISOString(),
  } as any;

  const synthesizer = new OllamaSynthesizer(fakeClient as unknown as OllamaClient);
  const result = await synthesizer.answerQuestion("What dose of lithium is the patient taking?", context);

  assert.equal(result, null);
});
