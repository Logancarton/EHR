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

function cleaned(value: string | undefined): string | null {
  const next = value?.trim().replace(/[?.!,]+$/, "").trim();
  return next && next.length <= 240 ? next : null;
}

function trailingPatientRef(query: string): string | undefined {
  const match = query.match(/\bfor\s+([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)?)\s*[?.!]*$/);
  return cleaned(match?.[1]) || undefined;
}

function possessiveMedication(query: string): { patientRef: string; name: string } | null {
  const match = query.match(
    /\b(?:refill|prescribe|prepare|draft|stage)(?:\s+(?:a|the))?(?:\s+(?:refill|prescription|rx))?\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?)['’]s\s+(.+?)\s*[?.!]*$/i,
  );
  const patientRef = cleaned(match?.[1]);
  const name = cleaned(match?.[2]);
  if (!patientRef || !name) return null;
  return { patientRef, name };
}

function genericMedication(query: string): string | null {
  const patterns = [
    /(?:draft|stage|prepare)\s+(?:a\s+)?(?:refill|prescription|rx)(?:\s+of|\s+for)?\s+(.+?)(?:\s+for\s+[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)?|$)/i,
    /(?:refill|prescribe)\s+(.+?)(?:\s+for\s+[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)?|$)/i,
  ];
  for (const pattern of patterns) {
    const value = cleaned(query.match(pattern)?.[1]);
    if (!value) continue;
    if (/^(?:her|his|their|the|this)?\s*(?:medication|medications|med|meds|prescription|rx)$/i.test(value)) return null;
    return value;
  }
  return null;
}

function navigationSection(query: string) {
  const q = query.toLowerCase();
  if (q.includes("lab")) return "labs" as const;
  if (q.includes("medication") || q.includes("meds")) return "medications" as const;
  if (q.includes("message")) return "messages" as const;
  if (q.includes("history") || q.includes("timeline")) return "history" as const;
  if (q.includes("task")) return "tasks" as const;
  if (q.includes("order")) return "orders" as const;
  if (q.includes("note") || q.includes("encounter")) return "encounter" as const;
  return "general" as const;
}

function navigationIntent(query: string): OmniboxPlanningModelOutput["intent"] | null {
  if (/^\s*(?:open|go to|navigate to)\s+(?:the\s+)?last\s+(?:encounter|note)\b/i.test(query)) {
    return {
      kind: "navigate_patient",
      section: "encounter",
      target: "last_encounter",
    };
  }

  const match = query.match(/^\s*(?:open|go to|navigate to|show(?!\s+me\b))\s+(.+?)\s*[.!?]*$/i);
  let patientRef = cleaned(match?.[1]);
  if (!patientRef) return null;

  patientRef = patientRef
    .replace(/(?:['’]s)?\s+(?:chart|labs?|medications?|meds|messages?|history|timeline|orders?|tasks?|last\s+(?:encounter|note))\s*$/i, "")
    .trim();
  if (!patientRef || /^(?:the\s+)?last\s+(?:encounter|note)$/i.test(patientRef)) return null;

  return {
    kind: "navigate_patient",
    patientRef,
    section: navigationSection(query),
    target: "patient_section",
  };
}

function restrictedIntent(query: string): OmniboxPlanningModelOutput["intent"] | null {
  const normalized = query.toLowerCase();
  if (/\b(sign|finalize)\b.*\b(note|encounter|record)\b|\bsign this\b/.test(normalized)) {
    return {
      kind: "restricted_legal_action",
      requestedAction: "sign_encounter",
      reason: "AI may prepare an encounter for closing, but legal note signing must remain an explicit attributable human action.",
    };
  }
  if (/\bauthori[sz]e\b.*\b(controlled|schedule\s*(?:ii|2)|epcs)\b/.test(normalized)) {
    return {
      kind: "restricted_legal_action",
      requestedAction: "authorize_controlled_substance",
      reason: "Controlled-substance authorization requires an explicit authorized human EPCS workflow.",
    };
  }
  if (/\bauthori[sz]e\b.*\border\b/.test(normalized)) {
    return {
      kind: "restricted_legal_action",
      requestedAction: "authorize_order",
      reason: "AI may prepare an order, but order authorization must remain an explicit authorized-user action.",
    };
  }
  if (/\b(send|transmit)\b.*\bprescription\b/.test(normalized)) {
    return {
      kind: "restricted_legal_action",
      requestedAction: "send_prescription",
      reason: "Prescription transmission must remain an explicit authorized-user action through the controlled order workflow.",
    };
  }
  if (/\b(transmit|send)\b.*\border\b/.test(normalized)) {
    return {
      kind: "restricted_legal_action",
      requestedAction: "transmit_order",
      reason: "AI may prepare an order, but vendor transmission remains a separate explicit authoritative action.",
    };
  }
  if (/\b(commit|add)\b.*\bdiagnos(?:is|es)\b/.test(normalized)) {
    return {
      kind: "restricted_legal_action",
      requestedAction: "commit_diagnosis",
      reason: "A diagnosis may be proposed, but committing it to the legal record requires explicit authorized-user review.",
    };
  }
  if (/\b(send)\b.*\b(patient\s+)?(?:message|reply|response)\b/.test(normalized) && !/\bdraft|prepare|write\b/.test(normalized)) {
    return {
      kind: "restricted_legal_action",
      requestedAction: "send_external_patient_message",
      reason: "External patient communication requires explicit authorized-user review before sending.",
    };
  }
  if (/\backnowledge\b.*\b(result|lab)\b/.test(normalized)) {
    return {
      kind: "restricted_legal_action",
      requestedAction: "acknowledge_result",
      reason: "Result acknowledgement is a legal clinical action and cannot be performed by the planning endpoint.",
    };
  }
  if (/\b(submit|send)\b.*\bclaim\b/.test(normalized)) {
    return {
      kind: "restricted_legal_action",
      requestedAction: "submit_claim",
      reason: "Claim submission is a consequential financial action and requires explicit human authorization.",
    };
  }
  return null;
}

/**
 * Deterministic development adapter. It deliberately behaves like an external model:
 * it emits an untrusted object that must pass runtime validation before the EHR uses it.
 * Future cloud or local model adapters implement the same interface without receiving
 * repositories, database handles, or clinical mutation services.
 */
export class RuleBasedOmniboxPlanningModel implements OmniboxPlanningModel {
  readonly provider = "ehr-local";
  readonly model = "rule-planner-v2";

  async plan({ query }: OmniboxModelRequest): Promise<OmniboxPlanningModelOutput> {
    const q = query.trim();

    const restricted = restrictedIntent(q);
    if (restricted) return { confidence: 0.99, intent: restricted };

    const navigation = navigationIntent(q);
    if (navigation) return { confidence: 0.92, intent: navigation };

    const isDraftAction = /\b(draft|stage|prepare|order|refill|prescribe|create|add|write)\b/i.test(q);
    const labs = KNOWN_LABS.filter(([pattern]) => pattern.test(q)).map(([, name]) => name);
    if (isDraftAction && labs.length > 0) {
      return {
        confidence: 0.95,
        intent: {
          kind: "propose_clinical_actions",
          patientRef: trailingPatientRef(q),
          actions: [...new Set(labs)].map((name) => ({ type: "stage_lab_order" as const, name })),
        },
      };
    }

    if (/\b(?:create|add|draft|make)\b.*\b(?:follow[- ]?up\s+)?task\b/i.test(q)) {
      return {
        confidence: 0.9,
        intent: {
          kind: "propose_clinical_actions",
          patientRef: trailingPatientRef(q),
          actions: [{ type: "create_follow_up_task", description: q }],
        },
      };
    }

    if (/\b(?:draft|prepare|write)\b.*\b(?:response|reply|message)\b/i.test(q)) {
      return {
        confidence: 0.91,
        intent: {
          kind: "propose_clinical_actions",
          patientRef: trailingPatientRef(q),
          actions: [{ type: "draft_patient_message", instruction: q }],
        },
      };
    }

    const possessive = isDraftAction ? possessiveMedication(q) : null;
    if (possessive) {
      return {
        confidence: 0.94,
        intent: {
          kind: "propose_clinical_actions",
          patientRef: possessive.patientRef,
          actions: [{ type: "stage_medication_order", name: possessive.name }],
        },
      };
    }

    const medication = isDraftAction ? genericMedication(q) : null;
    if (medication) {
      return {
        confidence: 0.89,
        intent: {
          kind: "propose_clinical_actions",
          patientRef: trailingPatientRef(q),
          actions: [{ type: "stage_medication_order", name: medication }],
        },
      };
    }

    if (/\b(refill|prescribe)\b/i.test(q) && /\b(?:medication|medications|med|meds|prescription|rx)\b/i.test(q)) {
      return {
        confidence: 0.95,
        intent: {
          kind: "clarification_required",
          field: "medication",
          reason: "The request does not identify a specific medication, so the planner will not guess.",
        },
      };
    }

    if (/\?|\b(show|what|when|compare|who|which|why|how|changed|overdue|last|mentioning|mentioned)\b/i.test(q)) {
      return {
        confidence: 0.78,
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
        reason: "The current deterministic planner could not map this request to a safe typed intent.",
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
