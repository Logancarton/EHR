import type { MentalStatusExam, TranscriptUtterance } from "../../lib/encounter-engine";
import { defaultMse } from "../../lib/encounter-engine";
import { extractCandidateEntities, type ExtractedCandidateAction } from "../../lib/entity-extraction";
import { defaultOllamaClient, OllamaClient } from "./ollama-client";

export interface ScribeNoteInput {
  utterances: TranscriptUtterance[];
  /**
   * Authoritative chart context assembled server-side. It is reference context for
   * understanding names and medications, not permission to invent visit findings.
   */
  patientContext?: {
    patientId?: string;
    name?: string;
    activeMedications?: string[];
    activeDiagnoses?: string[];
  };
}

export interface ScribeNoteOutput {
  chiefComplaint: string;
  intervalHistory: string;
  treatmentResponse: string;
  sideEffects: string;
  mse: MentalStatusExam;
  assessment: string;
  plan: string;
  candidateActions: ExtractedCandidateAction[];
  model: string;
  provider: "ollama" | "ehr-local";
}

interface RawScribedNote {
  chiefComplaint?: string;
  intervalHistory?: string;
  treatmentResponse?: string;
  sideEffects?: string;
  mse?: Partial<MentalStatusExam>;
  assessment?: string;
  plan?: string;
}

export interface ScribingModel {
  readonly provider: string;
  readonly modelName: string;
  synthesizeNote(input: ScribeNoteInput): Promise<ScribeNoteOutput>;
}

function sanitizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function completeMse(partial?: Partial<MentalStatusExam>): MentalStatusExam {
  return {
    appearance: sanitizeText(partial?.appearance) || defaultMse.appearance,
    behavior: sanitizeText(partial?.behavior) || defaultMse.behavior,
    speech: sanitizeText(partial?.speech) || defaultMse.speech,
    moodAffect: sanitizeText(partial?.moodAffect) || defaultMse.moodAffect,
    thoughtProcess: sanitizeText(partial?.thoughtProcess) || defaultMse.thoughtProcess,
    thoughtContent: sanitizeText(partial?.thoughtContent) || defaultMse.thoughtContent,
    cognition: sanitizeText(partial?.cognition) || defaultMse.cognition,
    insightJudgment: sanitizeText(partial?.insightJudgment) || defaultMse.insightJudgment,
  };
}

function blankOutput(
  candidateActions: ExtractedCandidateAction[],
  model: string,
  provider: "ollama" | "ehr-local",
): ScribeNoteOutput {
  return {
    chiefComplaint: "",
    intervalHistory: "",
    treatmentResponse: "",
    sideEffects: "",
    mse: { ...defaultMse },
    assessment: "",
    plan: "",
    candidateActions,
    model,
    provider,
  };
}

export class OllamaScribingModel implements ScribingModel {
  readonly provider = "ollama";
  readonly modelName: string;

  constructor(
    private readonly client: OllamaClient = defaultOllamaClient,
    modelName?: string,
  ) {
    this.modelName = modelName || process.env.OLLAMA_MODEL || "llama3.2:1b";
  }

  async synthesizeNote(input: ScribeNoteInput): Promise<ScribeNoteOutput> {
    const utterances = input.utterances || [];
    const activeMedications = input.patientContext?.activeMedications || [];

    // Candidate actions are extracted from the transcript itself. They remain
    // proposals with transcript provenance and never become medication/order truth
    // until the clinician explicitly accepts or stages them.
    const candidateActions = extractCandidateEntities(utterances, activeMedications);

    if (utterances.length === 0) {
      return blankOutput(candidateActions, this.modelName, "ollama");
    }

    const transcriptLines = utterances.map((u) => {
      const speaker = u.speakerName || (u.speaker === "clinician" ? "Clinician" : "Patient");
      return `${speaker}: ${u.text}`;
    }).join("\n");

    const patientContextLine = input.patientContext?.name
      ? [
          "AUTHORITATIVE CHART REFERENCE (background only; do not claim it was discussed today unless the transcript says so):",
          `Patient: ${input.patientContext.name}`,
          `Active medications: ${activeMedications.join(", ") || "None documented"}`,
          `Active diagnoses: ${(input.patientContext.activeDiagnoses || []).join(", ") || "None documented"}`,
          "",
        ].join("\n")
      : "";

    const systemPrompt = `You are the local psychiatric ambient-scribe drafting layer for Clinical Bond EHR.
Your output is a clinician-review draft, never an authoritative medical record.
Synthesize only facts supported by the supplied conversation transcript. Chart reference data is background context only.

Return one valid JSON object containing exactly these keys:
{
  "chiefComplaint": "",
  "intervalHistory": "",
  "treatmentResponse": "",
  "sideEffects": "",
  "mse": {
    "appearance": "",
    "behavior": "",
    "speech": "",
    "moodAffect": "",
    "thoughtProcess": "",
    "thoughtContent": "",
    "cognition": "",
    "insightJudgment": ""
  },
  "assessment": "",
  "plan": ""
}

Grounding rules:
- If a fact, denial, observation, conclusion, or decision is not supported by the transcript, leave that field or MSE dimension empty.
- Never infer normal findings from silence. Do not invent denials of suicidal ideation, homicidal ideation, psychosis, side effects, nonadherence, or other symptoms.
- The transcript is text, not a physical examination. Leave MSE dimensions empty unless the clinician explicitly documents that observation in the transcript.
- Do not convert a patient request, suggestion, or question into the treatment plan. Put an action in plan only when the clinician explicitly states or agrees to it.
- Do not invent diagnoses or diagnostic certainty. Assessment may summarize clinical reasoning only when it is actually expressed in the transcript.
- Do not repeat active medications or diagnoses from chart reference as if they were discussed today.
- Preserve clinically meaningful uncertainty and attribution (for example, "patient reports...").
- Be concise and objective.`;

    const userPrompt = `${patientContextLine}CONVERSATION TRANSCRIPT:\n${transcriptLines}\n\nTRANSCRIPT-GROUNDED NOTE JSON:`;

    const raw = await this.client.chatJson<RawScribedNote>([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], {
      model: this.modelName,
      temperature: 0,
      timeoutMs: 6000,
    });

    return {
      chiefComplaint: sanitizeText(raw.chiefComplaint),
      intervalHistory: sanitizeText(raw.intervalHistory),
      treatmentResponse: sanitizeText(raw.treatmentResponse),
      sideEffects: sanitizeText(raw.sideEffects),
      mse: completeMse(raw.mse),
      assessment: sanitizeText(raw.assessment),
      plan: sanitizeText(raw.plan),
      candidateActions,
      model: this.modelName,
      provider: "ollama",
    };
  }
}

export class RuleBasedScribingModel implements ScribingModel {
  readonly provider = "ehr-local";
  readonly modelName = "rule-scribe-v2-transcript-only";

  async synthesizeNote(input: ScribeNoteInput): Promise<ScribeNoteOutput> {
    const utterances = input.utterances || [];
    const activeMedications = input.patientContext?.activeMedications || [];
    const candidateActions = extractCandidateEntities(utterances, activeMedications);

    if (utterances.length === 0) {
      return blankOutput(candidateActions, this.modelName, "ehr-local");
    }

    // The deterministic degradation path is intentionally conservative. It carries
    // transcript text forward without pretending it performed clinical reasoning.
    // Empty clinical sections stay empty for clinician review.
    const firstPatientStatement = utterances.find((utterance) => utterance.speaker === "patient")?.text ?? "";
    const transcriptSummary = utterances
      .map((utterance) => `${utterance.speaker === "clinician" ? "Clinician" : "Patient"}: ${utterance.text}`)
      .join(" ")
      .slice(0, 1000);

    return {
      chiefComplaint: firstPatientStatement.slice(0, 160),
      intervalHistory: transcriptSummary,
      treatmentResponse: "",
      sideEffects: "",
      mse: { ...defaultMse },
      assessment: "",
      plan: "",
      candidateActions,
      model: this.modelName,
      provider: "ehr-local",
    };
  }
}

function isTestEnvironment(): boolean {
  if (process.env.FORCE_OLLAMA === "true") return false;
  if (process.env.NODE_ENV === "test") return true;
  if (process.env.npm_lifecycle_event === "test" || process.env.npm_lifecycle_event === "check") return true;
  if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    if (process.argv.some(arg => typeof arg === "string" && (arg.includes("test") || arg.endsWith(".test.ts")))) {
      return true;
    }
  }
  return false;
}

export class AdaptiveScribingModel implements ScribingModel {
  readonly provider: string;
  readonly modelName: string;

  constructor(
    private readonly ollamaModel: ScribingModel = new OllamaScribingModel(),
    private readonly ruleModel: ScribingModel = new RuleBasedScribingModel(),
    private readonly client: OllamaClient = defaultOllamaClient,
  ) {
    this.provider = "adaptive";
    this.modelName = "adaptive-scribe";
  }

  async synthesizeNote(input: ScribeNoteInput): Promise<ScribeNoteOutput> {
    if (isTestEnvironment()) {
      return this.ruleModel.synthesizeNote(input);
    }

    try {
      const isUp = await this.client.isAvailable(600);
      if (isUp) {
        return await this.ollamaModel.synthesizeNote(input);
      }
    } catch {
      // Local model failure must degrade to a visibly different, conservative
      // transcript-only path rather than substituting prewritten clinical content.
    }

    return this.ruleModel.synthesizeNote(input);
  }
}

export const defaultAdaptiveScribingModel = new AdaptiveScribingModel();
