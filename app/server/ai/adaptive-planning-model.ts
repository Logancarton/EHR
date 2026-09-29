import type {
  OmniboxModelRequest,
  OmniboxPlanningModel,
} from "./omnibox-model-gateway";
import { RuleBasedOmniboxPlanningModel } from "./omnibox-model-gateway";
import { OllamaOmniboxPlanningModel } from "./ollama-planning-model";
import { defaultOllamaClient, OllamaClient } from "./ollama-client";
import { validateOmniboxPlanningModelOutput } from "../../domain/omnibox";

/**
 * Adaptive planning model that combines local Ollama inference with deterministic rule fallback.
 * - In test environments, deterministic rules run unless explicitly overridden by AI_PROVIDER=ollama.
 * - In local dev / production, Ollama (e.g. llama3.2:1b) is preferred if available.
 * - If Ollama is offline or times out, seamlessly falls back to RuleBasedOmniboxPlanningModel.
 */
export class AdaptiveOmniboxPlanningModel implements OmniboxPlanningModel {
  provider: string;
  model: string;
  private readonly ollamaModel: OmniboxPlanningModel;
  private readonly ruleModel: OmniboxPlanningModel;
  private readonly client: OllamaClient;

  constructor(
    ollamaModel?: OmniboxPlanningModel,
    ruleModel?: OmniboxPlanningModel,
    client: OllamaClient = defaultOllamaClient,
  ) {
    this.ollamaModel = ollamaModel || new OllamaOmniboxPlanningModel(undefined, client);
    this.ruleModel = ruleModel || new RuleBasedOmniboxPlanningModel();
    this.client = client;
    this.provider = this.ruleModel.provider;
    this.model = this.ruleModel.model;
  }

  async plan(request: OmniboxModelRequest): Promise<unknown> {
    const isTestMode =
      (process.env.NODE_ENV === "test" ||
        process.env.npm_lifecycle_event === "test" ||
        process.argv.some((arg) => arg.includes("--test") || arg.includes("test.ts"))) &&
      process.env.AI_PROVIDER !== "ollama";

    const isExplicitRule = process.env.AI_PROVIDER === "ehr-local";

    if (isExplicitRule || isTestMode) {
      this.provider = this.ruleModel.provider;
      this.model = this.ruleModel.model;
      return this.ruleModel.plan(request);
    }

    try {
      const isOllamaUp = await this.client.isAvailable(600);
      if (!isOllamaUp) {
        this.provider = this.ruleModel.provider;
        this.model = this.ruleModel.model;
        return this.ruleModel.plan(request);
      }

      const raw = await this.ollamaModel.plan(request);
      const validated = validateOmniboxPlanningModelOutput(raw);

      // If recognized with decent confidence, return Ollama result
      if (validated.intent.kind !== "unrecognized" && validated.confidence >= 0.5) {
        this.provider = this.ollamaModel.provider;
        this.model = this.ollamaModel.model;
        return validated;
      }

      // If Ollama didn't recognize it, fall back to rule-based pattern matching
      this.provider = this.ruleModel.provider;
      this.model = this.ruleModel.model;
      return this.ruleModel.plan(request);
    } catch {
      // Graceful fallback on any network error, timeout, or schema failure
      this.provider = this.ruleModel.provider;
      this.model = this.ruleModel.model;
      return this.ruleModel.plan(request);
    }
  }
}
