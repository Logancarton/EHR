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

export const OLLAMA_NOTE_REFERENCE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    selections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          entityId: { type: "string" },
          spanStart: { anyOf: [{ type: "integer" }, { type: "null" }] },
          spanEnd: { anyOf: [{ type: "integer" }, { type: "null" }] },
          confidence: { type: "number", minimum: 0.5, maximum: 1 },
        },
        required: ["entityId", "spanStart", "spanEnd", "confidence"],
      },
    },
  },
  required: ["selections"],
};
