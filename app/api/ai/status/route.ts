import { NextResponse } from "next/server";
import { defaultOllamaClient, ollamaModelMatches } from "../../../server/ai/ollama-client";
import { assertPermission, getAuthenticatedProviderContext } from "../../../server/auth/provider-context";
import { clinicalActionError } from "../../../server/http/clinical-http";

export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    assertPermission(actor, "read_clinical");

    const configuredModel = process.env.OLLAMA_MODEL || "llama3.2:1b";
    const forcedLocalFallback = process.env.AI_PROVIDER === "ehr-local";
    const start = Date.now();
    const serverReachable = await defaultOllamaClient.isServerAvailable(800);
    const latencyMs = Date.now() - start;

    let models: string[] = [];
    if (serverReachable) {
      try {
        const details = await defaultOllamaClient.listModels(1000);
        models = details.map((m) => m.name);
      } catch {
        models = [];
      }
    }

    const modelReady = serverReachable && models.some((model) =>
      ollamaModelMatches(configuredModel, model)
    );
    const provider = modelReady && !forcedLocalFallback ? "ollama" : "ehr-local";

    const readinessReason = forcedLocalFallback
      ? "forced-local-fallback"
      : !serverReachable
        ? "ollama-unreachable"
        : !modelReady
          ? "configured-model-not-installed"
          : "ready";

    return NextResponse.json({
      success: true,
      provider,
      // Backward-compatible UI signal: `connected` now means inference-ready, not
      // merely that the Ollama daemon answered /api/tags.
      connected: provider === "ollama",
      serverReachable,
      modelReady,
      configuredModel,
      activeModel: provider === "ollama" ? configuredModel : "rule-planner-v3",
      availableModels: models,
      readinessReason,
      latencyMs: serverReachable ? latencyMs : null,
      mode: process.env.NODE_ENV === "test" ? "test-mode" : "live",
    });
  } catch (error: unknown) {
    return clinicalActionError(error);
  }
}
