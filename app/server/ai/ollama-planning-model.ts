import type {
  OmniboxPlanningModel,
  OmniboxModelRequest,
} from "./omnibox-model-gateway";
import {
  type OmniboxPlanningModelOutput,
  type OmniboxSurface,
  validateOmniboxPlanningModelOutput,
} from "../../domain/omnibox";
import { defaultOllamaClient, OllamaClient } from "./ollama-client";

const KNOWN_LAB_NAMES = new Set([
  "cmp", "bmp", "cbc", "tsh", "lipid", "lipid panel", "lithium", "lithium level",
  "valproic acid", "depakote", "hemoglobin a1c", "a1c", "urinalysis", "hepatic panel"
]);

const SYSTEM_PROMPT = `You are a clinical EHR intent parser for Clinical Bond. Map the user query into a single JSON plan.

Examples:

1. Navigation:
Query: "open Maya Chen labs"
{"confidence": 0.95, "intent": {"kind": "navigate_patient", "patientRef": "Maya Chen", "section": "labs", "target": "patient_section"}}

Query: "navigate to Jordan Reed medications"
{"confidence": 0.95, "intent": {"kind": "navigate_patient", "patientRef": "Jordan Reed", "section": "medications", "target": "patient_section"}}

2. Lab Orders:
Query: "order a CBC for Jordan Reed"
{"confidence": 0.92, "intent": {"kind": "propose_clinical_actions", "patientRef": "Jordan Reed", "actions": [{"type": "stage_lab_order", "name": "CBC"}]}}

Query: "order a BMP for Maya Chen"
{"confidence": 0.92, "intent": {"kind": "propose_clinical_actions", "patientRef": "Maya Chen", "actions": [{"type": "stage_lab_order", "name": "BMP"}]}}

3. Medication Orders / Refills:
Query: "refill sertraline 50mg for Maya Chen"
{"confidence": 0.92, "intent": {"kind": "propose_clinical_actions", "patientRef": "Maya Chen", "actions": [{"type": "stage_medication_order", "name": "sertraline", "prescription": {"medicationName": "sertraline", "strength": "50mg"}}]}}

4. Follow-up Tasks:
Query: "create follow-up task to call Maya next week"
{"confidence": 0.9, "intent": {"kind": "propose_clinical_actions", "patientRef": "Maya", "actions": [{"type": "create_follow_up_task", "description": "Call Maya next week"}]}}

5. Clinical Questions:
Query: "what medications is Maya Chen currently taking?"
{"confidence": 0.9, "intent": {"kind": "clinical_question", "patientRef": "Maya Chen", "question": "what medications is Maya Chen currently taking?"}}

6. Restricted Actions:
Query: "sign Maya's encounter note"
{"confidence": 0.99, "intent": {"kind": "restricted_legal_action", "requestedAction": "sign_encounter", "reason": "Legal note signing must remain an explicit attributable human action."}}

Allowed sections: general, encounter, labs, medications, messages, history, orders, tasks.
Allowed action types: stage_lab_order, stage_medication_order, create_follow_up_task, draft_patient_message.
Allowed restricted actions: sign_encounter, authorize_order, transmit_order, send_prescription, commit_diagnosis, submit_claim.
Respond ONLY with a single JSON object.`;

function isObject(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === "object" && !Array.isArray(val);
}

function normalizeSection(raw: unknown): OmniboxSurface {
  if (typeof raw !== "string") return "general";
  const lower = raw.toLowerCase().trim();
  if (lower.includes("lab")) return "labs";
  if (lower.includes("med") || lower.includes("rx") || lower.includes("drug")) return "medications";
  if (lower.includes("enc") || lower.includes("visit") || lower.includes("note")) return "encounter";
  if (lower.includes("mess") || lower.includes("msg") || lower.includes("chat")) return "messages";
  if (lower.includes("hist") || lower.includes("timeline")) return "history";
  if (lower.includes("order")) return "orders";
  if (lower.includes("task")) return "tasks";
  return "general";
}

function canonicalStrength(raw: string): string {
  const match = raw.match(/\b(\d+(?:\.\d+)?)\s*(mcg|mg|g|ml)\b/i);
  if (!match) return raw;
  const unit = match[2].toLowerCase() === "ml" ? "mL" : match[2].toLowerCase();
  return `${match[1]} ${unit}`;
}

function normalizeActions(actions: unknown): unknown[] {
  if (!Array.isArray(actions)) return [];
  return actions.map((act) => {
    if (!isObject(act)) return act;
    const name = typeof act.name === "string" ? act.name.trim() : "";
    const lowerName = name.toLowerCase();

    // Auto-fix if model confused a lab order for medication order
    if (KNOWN_LAB_NAMES.has(lowerName) || lowerName.includes("panel") || lowerName.includes("level")) {
      return {
        type: "stage_lab_order",
        name: name || "Lab Order",
      };
    }

    if (act.type === "stage_medication_order") {
      const rx = isObject(act.prescription) ? act.prescription : undefined;
      const rawStrength = typeof rx?.strength === "string" ? rx.strength : undefined;
      const formattedStrength = rawStrength ? canonicalStrength(rawStrength) : undefined;
      return {
        type: "stage_medication_order",
        name: name || (typeof rx?.medicationName === "string" ? rx.medicationName : "Medication"),
        prescription: rx ? {
          medicationName: typeof rx.medicationName === "string" ? rx.medicationName : name,
          ...(formattedStrength ? { strength: formattedStrength, dose: formattedStrength } : {}),
        } : undefined,
      };
    }

    return act;
  });
}

export class OllamaOmniboxPlanningModel implements OmniboxPlanningModel {
  readonly provider = "ollama";
  readonly model: string;
  private readonly client: OllamaClient;

  constructor(modelName?: string, client: OllamaClient = defaultOllamaClient) {
    this.model = modelName || process.env.OLLAMA_MODEL || "llama3.2:1b";
    this.client = client;
  }

  async plan({ query }: OmniboxModelRequest): Promise<OmniboxPlanningModelOutput> {
    const trimmed = query.trim();
    if (!trimmed) {
      return {
        confidence: 0,
        intent: { kind: "unrecognized", reason: "Query is empty." },
      };
    }

    const rawResponse = await this.client.chatJson<unknown>(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: trimmed },
      ],
      {
        model: this.model,
        temperature: 0,
        format: "json",
        timeoutMs: 5000,
      },
    );

    if (!isObject(rawResponse) || !isObject(rawResponse.intent)) {
      throw new Error("Ollama returned invalid plan shape");
    }

    const rawIntent = rawResponse.intent;
    const confidence = typeof rawResponse.confidence === "number" ? Math.max(0, Math.min(1, rawResponse.confidence)) : 0.85;

    // Normalizations to ensure small model variances strictly conform to Clinical Bond schemas
    const sanitizedIntent: Record<string, unknown> = {
      kind: rawIntent.kind,
    };

    if (typeof rawIntent.patientRef === "string" && rawIntent.patientRef.trim()) {
      sanitizedIntent.patientRef = rawIntent.patientRef.trim();
    }

    if (rawIntent.kind === "navigate_patient") {
      sanitizedIntent.section = normalizeSection(rawIntent.section);
      sanitizedIntent.target = rawIntent.target === "last_encounter" ? "last_encounter" : "patient_section";
    } else if (rawIntent.kind === "propose_clinical_actions") {
      sanitizedIntent.actions = normalizeActions(rawIntent.actions);
    } else if (rawIntent.kind === "clinical_question") {
      sanitizedIntent.question = typeof rawIntent.question === "string" && rawIntent.question.trim()
        ? rawIntent.question.trim()
        : trimmed;
    } else if (rawIntent.kind === "restricted_legal_action") {
      sanitizedIntent.requestedAction = rawIntent.requestedAction || "sign_encounter";
      sanitizedIntent.reason = typeof rawIntent.reason === "string" && rawIntent.reason.trim()
        ? rawIntent.reason.trim()
        : "Consequential clinical actions require explicit attributable human authorization.";
    } else if (rawIntent.kind === "clarification_required") {
      sanitizedIntent.field = rawIntent.field === "medication" ? "medication" : "patient";
      sanitizedIntent.reason = typeof rawIntent.reason === "string" ? rawIntent.reason : "Clarification required.";
    } else {
      sanitizedIntent.kind = "unrecognized";
      sanitizedIntent.reason = typeof rawIntent.reason === "string" ? rawIntent.reason : "Intent could not be mapped.";
    }

    const sanitized = {
      confidence,
      intent: sanitizedIntent,
    };

    return validateOmniboxPlanningModelOutput(sanitized);
  }
}
