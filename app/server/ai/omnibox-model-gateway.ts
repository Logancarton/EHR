import {
  type OmniboxMedicationPrescriptionDraft,
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
    /(?:draft|stage|prepare|order)\s+(?:a\s+)?(.+?)(?:\s+for\s+[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)?|$)/i,
  ];
  for (const pattern of patterns) {
    const value = cleaned(query.match(pattern)?.[1]);
    if (!value) continue;
    if (/^(?:her|his|their|the|this)?\s*(?:medication|medications|med|meds|prescription|rx)$/i.test(value)) return null;
    return value;
  }
  return null;
}

function canonicalStrength(raw: string): string | undefined {
  const match = raw.match(/\b(\d+(?:\.\d+)?)\s*(mcg|mg|g|ml)\b/i);
  if (!match) return undefined;
  const unit = match[2].toLowerCase() === "ml" ? "mL" : match[2].toLowerCase();
  return `${match[1]} ${unit}`;
}

function explicitFrequency(raw: string): string | undefined {
  if (/\b(?:four times daily|four times a day|qid)\b/i.test(raw)) return "Four times daily";
  if (/\b(?:three times daily|three times a day|tid)\b/i.test(raw)) return "Three times daily";
  if (/\b(?:twice daily|twice a day|bid)\b/i.test(raw)) return "Twice daily";
  if (/\b(?:once daily|once a day|every day|qd)\b/i.test(raw)) return "Once daily";
  if (/\b(?:every morning|qam)\b/i.test(raw)) return "Every morning";
  if (/\b(?:at bedtime|nightly|qhs)\b/i.test(raw)) return "At bedtime";
  const everyHours = raw.match(/\bevery\s+(\d{1,2})\s+hours?\b/i);
  if (everyHours) return `Every ${everyHours[1]} hours`;
  if (/\bas needed\b|\bprn\b/i.test(raw)) return "As needed";
  return undefined;
}

function explicitRoute(raw: string): string | undefined {
  if (/\b(?:by mouth|oral(?:ly)?|p\.?o\.?)\b/i.test(raw)) return "Oral";
  if (/\bsublingual(?:ly)?\b/i.test(raw)) return "Sublingual";
  if (/\btopical(?:ly)?\b/i.test(raw)) return "Topical";
  if (/\b(?:inhaled|inhalation)\b/i.test(raw)) return "Inhaled";
  if (/\bintramuscular(?:ly)?\b|\bim\b/i.test(raw)) return "Intramuscular";
  return undefined;
}

function explicitForm(raw: string): string | undefined {
  if (/\btablets?\b/i.test(raw)) return "Tablet";
  if (/\bcapsules?\b/i.test(raw)) return "Capsule";
  if (/\bpatch(?:es)?\b/i.test(raw)) return "Patch";
  if (/\bsolutions?\b/i.test(raw)) return "Solution";
  if (/\bsuspensions?\b/i.test(raw)) return "Suspension";
  return undefined;
}

function explicitRelationship(query: string): OmniboxMedicationPrescriptionDraft["relationship"] | undefined {
  if (/\b(?:switch|replace)\b/i.test(query)) return "replace";
  if (/\b(?:increase|decrease|change|adjust)\b/i.test(query)) return "change";
  if (/\b(?:refill|continue|renew)\b/i.test(query)) return "continue";
  if (/\b(?:start|new medication|initiate)\b/i.test(query)) return "new";
  return undefined;
}

function explicitSig(query: string): string | undefined {
  const match = query.match(
    /\bsig\s*:\s*(.+?)(?=(?:\s*,?\s*)(?:#\s*\d+|(?:qty|quantity)\b|\d+\s+refills?\b|days?\s+supply\b)|$)/i,
  );
  const value = match?.[1]?.trim();
  return value && value.length <= 1000 ? value : undefined;
}

function structuredMedicationDraft(raw: string, query: string): OmniboxMedicationPrescriptionDraft | null {
  const strength = canonicalStrength(raw);
  const strengthMatch = raw.match(/\b\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml)\b/i);
  const firstInstruction = raw.search(
    /#\s*\d+|\b(?:once daily|once a day|twice daily|twice a day|three times daily|three times a day|four times daily|four times a day|every morning|at bedtime|nightly|qam|qhs|bid|tid|qid|qd|prn|as needed|by mouth|oral(?:ly)?|sublingual(?:ly)?|topical(?:ly)?|inhaled|inhalation)\b/i,
  );
  let nameEnd = raw.length;
  if (strengthMatch?.index !== undefined) nameEnd = Math.min(nameEnd, strengthMatch.index);
  if (firstInstruction >= 0) nameEnd = Math.min(nameEnd, firstInstruction);

  const nameSource = raw
    .slice(0, nameEnd)
    .replace(/^(?:the\s+|a\s+)?(?:new\s+|continue\s+|renew\s+|refill\s+|start\s+|initiate\s+|increase\s+|decrease\s+|change\s+|adjust\s+|switch\s+to\s+|replace\s+with\s+)?/i, "")
    .trim();
  const medicationName = cleaned(nameSource) || cleaned(raw.split(/[,#]/)[0]);
  if (!medicationName) return null;

  const quantityMatch = raw.match(/#\s*(\d+)\b|\b(?:qty|quantity)\s*(?:of|:|=)?\s*(\d+)\b/i);
  const refillsMatch = raw.match(/\b(\d+)\s+refills?\b/i);
  const daysSupplyMatch = raw.match(/\b(\d+)\s*[- ]?days?\s+supply\b|\bdays?\s+supply\s*(?:of|:|=)?\s*(\d+)\b/i);

  const quantity = Number(quantityMatch?.[1] || quantityMatch?.[2] || "") || undefined;
  const refillsRaw = refillsMatch?.[1];
  const refills = refillsRaw !== undefined ? Number(refillsRaw) : undefined;
  const daysSupply = Number(daysSupplyMatch?.[1] || daysSupplyMatch?.[2] || "") || undefined;
  const route = explicitRoute(raw);
  const form = explicitForm(raw);
  const frequency = explicitFrequency(raw);
  const sig = explicitSig(query);
  const relationship = explicitRelationship(query);

  const draft: OmniboxMedicationPrescriptionDraft = { medicationName };
  if (strength) {
    draft.strength = strength;
    draft.dose = strength;
  }
  if (route) draft.route = route;
  if (form) draft.form = form;
  if (frequency) draft.frequency = frequency;
  if (quantity !== undefined) draft.quantity = quantity;
  if (daysSupply !== undefined) draft.daysSupply = daysSupply;
  if (refills !== undefined) draft.refills = refills;
  if (sig) draft.sig = sig;
  if (relationship) draft.relationship = relationship;
  if (/\bdispense as written\b|\bdaw\b/i.test(query)) draft.substitutionAllowed = false;
  else if (/\bsubstitution allowed\b/i.test(query)) draft.substitutionAllowed = true;
  return draft;
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
  readonly model = "rule-planner-v3";

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
      const prescription = structuredMedicationDraft(possessive.name, q);
      return {
        confidence: 0.94,
        intent: {
          kind: "propose_clinical_actions",
          patientRef: possessive.patientRef,
          actions: [{
            type: "stage_medication_order",
            name: prescription?.medicationName || possessive.name,
            prescription: prescription || undefined,
          }],
        },
      };
    }

    const medication = isDraftAction ? genericMedication(q) : null;
    if (medication) {
      const prescription = structuredMedicationDraft(medication, q);
      return {
        confidence: 0.89,
        intent: {
          kind: "propose_clinical_actions",
          patientRef: trailingPatientRef(q),
          actions: [{
            type: "stage_medication_order",
            name: prescription?.medicationName || medication,
            prescription: prescription || undefined,
          }],
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
