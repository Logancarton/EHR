/**
 * JSON schemas sent directly to Ollama's `format` field for the clinical outputs
 * that feed another EHR function. These do not replace runtime validation; they
 * constrain generation before the response reaches Clinical Bond.
 */

const stringField = { type: "string" } as const;

export const OLLAMA_SCRIBED_NOTE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    chiefComplaint: stringField,
    intervalHistory: stringField,
    treatmentResponse: stringField,
    sideEffects: stringField,
    mse: {
      type: "object",
      additionalProperties: false,
      properties: {
        appearance: stringField,
        behavior: stringField,
        speech: stringField,
        moodAffect: stringField,
        thoughtProcess: stringField,
        thoughtContent: stringField,
        cognition: stringField,
        insightJudgment: stringField,
      },
      required: [
        "appearance",
        "behavior",
        "speech",
        "moodAffect",
        "thoughtProcess",
        "thoughtContent",
        "cognition",
        "insightJudgment",
      ],
    },
    assessment: stringField,
    plan: stringField,
  },
  required: [
    "chiefComplaint",
    "intervalHistory",
    "treatmentResponse",
    "sideEffects",
    "mse",
    "assessment",
    "plan",
  ],
};

export const OLLAMA_CLINICAL_ANSWER_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    sourceKeys: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["answer", "sourceKeys"],
};
