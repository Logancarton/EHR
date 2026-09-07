import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("AI encounter search requires patient context and preserves ContextAssembler role filtering", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-ai-search-context-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-ai-search-test-secret-0123456789abcdef";

  try {
    const [
      { AuthRepository },
      { EHR_SESSION_COOKIE, createProviderSessionToken },
      { GET: searchGet },
    ] = await Promise.all([
      import("../app/server/repositories/auth-repository"),
      import("../app/server/auth/provider-context"),
      import("../app/api/ai/search/route"),
    ]);

    function cookieFor(userId: string, sessionId: string): string {
      const expiresAt = Date.now() + 60 * 60 * 1000;
      AuthRepository.createSession({ id: sessionId, userId, expiresAt: new Date(expiresAt).toISOString() });
      return `${EHR_SESSION_COOKIE}=${createProviderSessionToken(sessionId, expiresAt)}`;
    }

    const providerCookie = cookieFor("team-taylor", "ai-search-provider-session");
    const assistantCookie = cookieFor("team-casey", "ai-search-assistant-session");

    const noPatientContext = await searchGet(new Request("http://ehr.local/api/ai/search?q=stable", {
      headers: { cookie: providerCookie },
    }));
    assert.equal(noPatientContext.status, 400, "clinical AI search must not become an unscoped chart-wide read surface");

    const providerSearch = await searchGet(new Request("http://ehr.local/api/ai/search?q=stable&patientId=maya-chen", {
      headers: { cookie: providerCookie, "x-ehr-patient-id": "maya-chen" },
    }));
    assert.equal(providerSearch.status, 200);
    const providerBody = await providerSearch.json() as { results: Array<{ provenanceRef?: string }> };
    assert.ok(providerBody.results.length > 0, "provider longitudinal search should expose bounded matching encounter evidence");
    assert.ok(providerBody.results.every(result => result.provenanceRef?.startsWith("encounters/")));

    const assistantSearch = await searchGet(new Request("http://ehr.local/api/ai/search?q=stable&patientId=maya-chen", {
      headers: {
        cookie: assistantCookie,
        "x-ehr-patient-id": "maya-chen",
        "x-ehr-role": "provider",
        "x-ehr-user-id": "team-taylor",
      },
    }));
    assert.equal(assistantSearch.status, 200);
    const assistantBody = await assistantSearch.json() as { results: unknown[] };
    assert.deepEqual(
      assistantBody.results,
      [],
      "AI search must preserve ContextAssembler role filtering even when the client forges provider identity headers",
    );
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
