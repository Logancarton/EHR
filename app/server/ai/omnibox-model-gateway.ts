import {
  type OmniboxPlanningModelOutput,
  validateOmniboxPlanningModelOutput,
} from "../../domain/omnibox";

export type OmniboxModelRequest = {
  query: string;
};

export interface OmniboxPlanningModel {
  readonly provider: string;
  readonly model: string;
  plan(request: OmniboxModelRequest): Promise<unknown>;
}

const KNOWN_LABS: Array<[RegExp, string]> = [
  [/\bcmp\b|comprehensive metabolic panel/i, "CMP"],
  [/\bbmp\b|basic metabolic panel/i, "BMP"],
  [/\blithium (?:level|levels)\b|\blithium serum\b/i, "Lithium level"],
  [/\bvalproic acid (?:level|levels)\b|\bdepakote (?:level|levels)\b/i, "Valproic acid level"],
  [/\bcbc\b|complete blood count/i, "CBC"],
  [/\ba1c\b|hemoglobin a1c/i, "Hemoglobin A1c"],
  [/\blipid(?: panel)?\b/i, "Lipid panel"],
  [/\btsh\b|thyroid stimulating hormone/i, "TSH"],
];

function extractMedication(query: string): string | null {
  const patterns = [
    /(?:draft|stage|prepare)\s+(?:a\s+)?(?:refill|prescription|rx)(?:\s+of|\s+for)?\s+(.+?)(?:\s+for\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?|$)/i,
    /(?:refill|prescribe)\s+(.+?)(?:\s+for\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?|$)/i,
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern);
    const value = match?.[1]?.trim().replace(/[?.!,]+$/, "");
    if (value && value.length <= 120) return value;
  }
  return null;
}

function extractOpenPatientRef(query: string): string | null {
  const match = query.match(/^\s*(?:open|show|go to|navigate to)\s+(.+?)(?:'s)?(?:\s+(?:chart|labs|medications|meds|messages|history|last note))?[.!?]*\s*$/i);
  const value = match?.[1]?.trim();
  return value && value.length <= 160 ? value : null;
}

function navigationSection(query: string) {
  const q = query.toLowerCase();
  if (q.includes("lab")) return "labs" as const;
  if (q.includes("medication") || q.includes("meds")) return "medications" as const;
  if (q.includes("message")) return "messages" as const;
  if (q.includes("history") || q.includes("timeline")) return "history" as const;
  if (q.includes("note") || q.includes("encounter")) return "encounter" as const;
  return "general" as const;
}

/**
 * Deterministic prototype adapter. It deliberately behaves like an external model:
 * it emits an untrusted object that must pass runtime validation before the EHR uses it.
 * Future OpenAI/Gemini/local adapters implement the same interface without touching
 * clinical services or repositories.
 */
export class RuleBasedOmniboxPlanningModel implements OmniboxPlanningModel {
  readonly provider = "ehr-local";
  readonly model = "rule-planner-v1";

  async plan({ query }: OmniboxModelRequest): Promise<OmniboxPlanningModelOutput> {
    const q = query.trim();
    const normalized = q.toLowerCase();

    if (/\b(sign|finalize)\b.*\b(note|encounter|record)\b|\bsign this\b/.test(normalized)) {
      return {
        confidence: 0.99,
        intent: {
          kind: "restricted_legal_action",
          requestedAction: "sign_encounter",
          reason: "AI may prepare an encounter for closing, but legal note signing must remain an explicit attributable human action.",
        },
      };
    }
    if (/\bauthori[sz]e\b.*\border\b/.test(normalized)) {
      return {
        confidence: 0.99,
        intent: {
          kind: "restricted_legal_action",
          requestedAction: "authorize_order",
          reason: "AI may prepare an order, but order authorization must remain an explicit authorized-user action.",
        },
      };
    }
    if (/\b(transmit|send)\b.*\border\b/.test(normalized)) {
      return {
        confidence: 0.99,
        intent: {
          kind: "restricted_legal_action",
          requestedAction: "transmit_order",
          reason: "AI may prepare an order, but vendor transmission remains a separate explicit authoritative action.",
        },
      };
    }

    const openPatientRef = extractOpenPatientRef(q);
    if (openPatientRef) {
      return {
        confidence: 0.9,
        intent: {
          kind: "navigate_patient",
          patientRef: openPatientRef,
          section: navigationSection(q),
        },
      };
    }

    const isDraftAction = /\b(draft|stage|prepare|order|refill|prescribe)\b/i.test(q);
    const labs = KNOWN_LABS.filter(([pattern]) => pattern.test(q)).map(([, name]) => name);
    if (isDraftAction && labs.length > 0) {
      return {
        confidence: 0.94,
        intent: {
          kind: "propose_clinical_actions",
          actions: [...new Set(labs)].map((name) => ({ type: "stage_lab_order" as const, name })),
        },
      };
    }

    const medication = isDraftAction ? extractMedication(q) : null;
    if (medication) {
      return {
        confidence: 0.88,
        intent: {
          kind: "propose_clinical_actions",
          actions: [{ type: "stage_medication_order", name: medication }],
        },
      };
    }

    if (/\?|\b(show|what|when|compare|who|which|why|how|changed|overdue|last)\b/i.test(q)) {
      return {
        confidence: 0.72,
        intent: {
          kind: "clinical_question",
          question: q,
        },
      };
    }

    return {
      confidence: 0.35,
      intent: {
        kind: "unrecognized",
        reason: "The current prototype planner could not map this request to a safe typed intent.",
      },
    };
  }
}

export async function planWithModel(
  model: OmniboxPlanningModel,
  request: OmniboxModelRequest,
): Promise<OmniboxPlanningModelOutput> {
  const raw = await model.plan(request);
  return validateOmniboxPlanningModelOutput(raw);
}
