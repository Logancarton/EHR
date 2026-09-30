import type { MentalStatusExam, TranscriptUtterance, CandidateAction } from "../../lib/encounter-engine";
import { defaultMse } from "../../lib/encounter-engine";
import { extractCandidateEntities, type ExtractedCandidateAction } from "../../lib/entity-extraction";
import { defaultOllamaClient, OllamaClient } from "./ollama-client";

export interface ScribeNoteInput {
  utterances: TranscriptUtterance[];
  patientContext?: {
    patientId?: string;
    name?: string;
    activeMedications?: string[];
    activeDiagnoses?: string[];
  };
  scenarioSynthesizedNote?: {
    chiefComplaint: string;
    intervalHistory: string;
    treatmentResponse: string;
    sideEffects: string;
    mse?: Partial<MentalStatusExam>;
    assessment: string;
    plan: string;
    candidateActions?: CandidateAction[];
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

    // Extract deterministic candidate actions grounded in psychiatric vocabulary
    const candidateActions = extractCandidateEntities(utterances, activeMedications);

    // Merge in scenario candidate actions if present
    if (input.scenarioSynthesizedNote?.candidateActions) {
      for (const scAction of input.scenarioSynthesizedNote.candidateActions) {
        if (!candidateActions.some(ca => ca.title === scAction.title || ca.type === scAction.type)) {
          candidateActions.push(scAction);
        }
      }
    }

    if (utterances.length === 0) {
      if (input.scenarioSynthesizedNote) {
        return {
          chiefComplaint: input.scenarioSynthesizedNote.chiefComplaint,
          intervalHistory: input.scenarioSynthesizedNote.intervalHistory,
          treatmentResponse: input.scenarioSynthesizedNote.treatmentResponse,
          sideEffects: input.scenarioSynthesizedNote.sideEffects,
          mse: completeMse(input.scenarioSynthesizedNote.mse),
          assessment: input.scenarioSynthesizedNote.assessment,
          plan: input.scenarioSynthesizedNote.plan,
          candidateActions,
          model: this.modelName,
          provider: "ollama",
        };
      }
      return {
        chiefComplaint: "",
        intervalHistory: "",
        treatmentResponse: "",
        sideEffects: "",
        mse: { ...defaultMse },
        assessment: "",
        plan: "",
        candidateActions,
        model: this.modelName,
        provider: "ollama",
      };
    }

    const transcriptLines = utterances.map((u) => {
      const speaker = u.speakerName || (u.speaker === "clinician" ? "Clinician" : "Patient");
      return `${speaker}: ${u.text}`;
    }).join("\n");

    const patientContextLine = input.patientContext?.name
      ? `Patient: ${input.patientContext.name}. Active meds: ${activeMedications.join(", ") || "None documented"}. Diagnoses: ${(input.patientContext.activeDiagnoses || []).join(", ") || "None documented"}.\n\n`
      : "";

    const systemPrompt = `You are a psychiatric clinical ambient scribe for Clinical Bond EHR.
Synthesize the conversation transcript into a structured clinical progress note.
Respond with a valid JSON object containing exactly these keys:
{
  "chiefComplaint": "primary reason for visit or presenting symptom",
  "intervalHistory": "course of symptoms and changes since previous visit",
  "treatmentResponse": "efficacy of current psychiatric medications and psychotherapy",
  "sideEffects": "reported adverse drug effects or statement denying side effects",
  "mse": {
    "appearance": "observed grooming and dress",
    "behavior": "motor activity and cooperativeness",
    "speech": "rate, rhythm, volume",
    "moodAffect": "stated mood and observed affect congruence",
    "thoughtProcess": "goal-directed or loose/tangential",
    "thoughtContent": "suicidal/homicidal ideation or psychosis",
    "cognition": "alertness and orientation",
    "insightJudgment": "insight into illness and judgment"
  },
  "assessment": "clinical formulation and diagnostic trajectory",
  "plan": "pharmacotherapy plan, lab orders, psychotherapy, follow-up timeline"
}
Rules:
- Be concise, objective, and medically accurate.
- Base statements strictly on what was stated or observed in the dialogue.`;

    const userPrompt = `${patientContextLine}CONVERSATION TRANSCRIPT:\n${transcriptLines}\n\nSYNTHESIZED NOTE JSON:`;

    const raw = await this.client.chatJson<RawScribedNote>([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], {
      model: this.modelName,
      temperature: 0.1,
      timeoutMs: 6000,
    });

    return {
      chiefComplaint: sanitizeText(raw.chiefComplaint) || (input.scenarioSynthesizedNote?.chiefComplaint ?? ""),
      intervalHistory: sanitizeText(raw.intervalHistory) || (input.scenarioSynthesizedNote?.intervalHistory ?? ""),
      treatmentResponse: sanitizeText(raw.treatmentResponse) || (input.scenarioSynthesizedNote?.treatmentResponse ?? ""),
      sideEffects: sanitizeText(raw.sideEffects) || (input.scenarioSynthesizedNote?.sideEffects ?? ""),
      mse: completeMse({ ...(input.scenarioSynthesizedNote?.mse ?? {}), ...(raw.mse ?? {}) }),
      assessment: sanitizeText(raw.assessment) || (input.scenarioSynthesizedNote?.assessment ?? ""),
      plan: sanitizeText(raw.plan) || (input.scenarioSynthesizedNote?.plan ?? ""),
      candidateActions,
      model: this.modelName,
      provider: "ollama",
    };
  }
}

export class RuleBasedScribingModel implements ScribingModel {
  readonly provider = "ehr-local";
  readonly modelName = "rule-scribe-v1";

  async synthesizeNote(input: ScribeNoteInput): Promise<ScribeNoteOutput> {
    const utterances = input.utterances || [];
    const activeMedications = input.patientContext?.activeMedications || [];
    const candidateActions = extractCandidateEntities(utterances, activeMedications);

    if (input.scenarioSynthesizedNote?.candidateActions) {
      for (const scAction of input.scenarioSynthesizedNote.candidateActions) {
        if (!candidateActions.some(ca => ca.title === scAction.title || ca.type === scAction.type)) {
          candidateActions.push(scAction);
        }
      }
    }

    if (input.scenarioSynthesizedNote) {
      return {
        chiefComplaint: input.scenarioSynthesizedNote.chiefComplaint,
        intervalHistory: input.scenarioSynthesizedNote.intervalHistory,
        treatmentResponse: input.scenarioSynthesizedNote.treatmentResponse,
        sideEffects: input.scenarioSynthesizedNote.sideEffects,
        mse: completeMse(input.scenarioSynthesizedNote.mse),
        assessment: input.scenarioSynthesizedNote.assessment,
        plan: input.scenarioSynthesizedNote.plan,
        candidateActions,
        model: this.modelName,
        provider: "ehr-local",
      };
    }

    // Basic rule-based extraction from dialogue. It carries over only what was
    // said; sections the dialogue does not speak to stay empty for the clinician,
    // rather than being filled with statements ("denies adverse effects") that
    // nobody made.
    const allText = utterances.map(u => u.text).join(" ");
    return {
      chiefComplaint: utterances.length > 0 ? utterances[0].text.slice(0, 100) : "",
      intervalHistory: allText.slice(0, 250),
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
      // Degrade cleanly to rule model
    }

    return this.ruleModel.synthesizeNote(input);
  }
}

export const defaultAdaptiveScribingModel = new AdaptiveScribingModel();
