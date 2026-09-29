import { NextResponse } from "next/server";
import { defaultOllamaClient } from "../../../server/ai/ollama-client";
import { assertPermission, getAuthenticatedProviderContext } from "../../../server/auth/provider-context";
import { clinicalActionError } from "../../../server/http/clinical-http";

export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    assertPermission(actor, "read_clinical");

    const start = Date.now();
    const isAvailable = await defaultOllamaClient.isAvailable(800);
    const latencyMs = Date.now() - start;

    let models: string[] = [];
    if (isAvailable) {
      try {
        const details = await defaultOllamaClient.listModels(1000);
        models = details.map((m) => m.name);
      } catch {
        models = [];
      }
    }

    const activeModel = process.env.OLLAMA_MODEL || "llama3.2:1b";
    const provider = isAvailable && process.env.AI_PROVIDER !== "ehr-local" ? "ollama" : "ehr-local";

    return NextResponse.json({
      success: true,
      provider,
      connected: isAvailable,
      activeModel: provider === "ollama" ? activeModel : "rule-planner-v3",
      availableModels: models,
      latencyMs: isAvailable ? latencyMs : null,
      mode: process.env.NODE_ENV === "test" ? "test-mode" : "live",
    });
  } catch (error: unknown) {
    return clinicalActionError(error);
  }
}
