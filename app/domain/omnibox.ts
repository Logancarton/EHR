import type { ClinicalPermission } from "../server/auth/provider-context";

export type OmniboxSurface =
  | "general"
  | "encounter"
  | "labs"
  | "medications"
  | "messages"
  | "history"
  | "orders";

export type OmniboxPlannerIntent =
  | {
      kind: "navigate_patient";
      patientRef: string;
      section?: OmniboxSurface;
    }
  | {
      kind: "clinical_question";
      patientRef?: string;
      question: string;
    }
  | {
      kind: "propose_clinical_actions";
      patientRef?: string;
      actions: Array<
        | { type: "stage_lab_order"; name: string }
        | { type: "stage_medication_order"; name: string }
      >;
    }
  | {
      kind: "restricted_legal_action";
      requestedAction: "sign_encounter" | "authorize_order" | "transmit_order";
      patientRef?: string;
      reason: string;
    }
  | {
      kind: "unrecognized";
      reason: string;
    };

export type OmniboxPlanningModelOutput = {
  intent: OmniboxPlannerIntent;
  confidence: number;
};

export type OmniboxPatientResolution = {
  id: string;
  name: string;
  source: "active_patient" | "mentioned_patient";
};

export type OmniboxProposal = {
  id: string;
  type: "stage_order";
  patientId: string;
  orderType: "lab" | "medication";
  name: string;
  risk: "clinical_draft";
  requiredPermission: ClinicalPermission;
  permission: "allowed" | "denied";
  confirmation: "review_required";
  execution: "not_executed";
  blockedReason?: "active_patient_mismatch" | "permission_denied";
};

export type OmniboxPlan = {
  query: string;
  intent: OmniboxPlannerIntent;
  confidence: number;
  planner: {
    provider: string;
    model: string;
  };
  patient?: OmniboxPatientResolution;
  proposals: OmniboxProposal[];
  context?: {
    surface: string;
    patientId: string;
    estimatedTokens: number;
    isTruncated: boolean;
    provenanceCount: number;
  };
  safety: {
    mutatesClinicalRecord: false;
    requiresHumanReview: boolean;
    blockedReasons: string[];
  };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validPatientRef(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 160;
}

function validAction(value: unknown): value is Extract<OmniboxPlannerIntent, { kind: "propose_clinical_actions" }>["actions"][number] {
  if (!isObject(value)) return false;
  if (value.type !== "stage_lab_order" && value.type !== "stage_medication_order") return false;
  return typeof value.name === "string" && value.name.trim().length > 0 && value.name.length <= 240;
}

/**
 * Runtime validation is mandatory because future LLM/provider adapters are untrusted
 * inputs to the clinical system even when their TypeScript interfaces compile.
 */
export function validateOmniboxPlanningModelOutput(value: unknown): OmniboxPlanningModelOutput {
  if (!isObject(value) || !isObject(value.intent)) {
    throw new Error("Omnibox planner returned an invalid typed plan.");
  }

  const confidence = value.confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("Omnibox planner confidence must be between 0 and 1.");
  }

  const intent = value.intent;
  switch (intent.kind) {
    case "navigate_patient": {
      if (!validPatientRef(intent.patientRef)) throw new Error("Navigation intent requires a patient reference.");
      const section = intent.section;
      if (section !== undefined && !["general", "encounter", "labs", "medications", "messages", "history", "orders"].includes(String(section))) {
        throw new Error("Navigation intent contains an invalid section.");
      }
      return value as unknown as OmniboxPlanningModelOutput;
    }
    case "clinical_question":
      if (intent.patientRef !== undefined && !validPatientRef(intent.patientRef)) throw new Error("Question intent patient reference is invalid.");
      if (typeof intent.question !== "string" || !intent.question.trim() || intent.question.length > 4000) throw new Error("Question intent requires question text.");
      return value as unknown as OmniboxPlanningModelOutput;
    case "propose_clinical_actions":
      if (intent.patientRef !== undefined && !validPatientRef(intent.patientRef)) throw new Error("Clinical action intent patient reference is invalid.");
      if (!Array.isArray(intent.actions) || intent.actions.length < 1 || intent.actions.length > 12 || !intent.actions.every(validAction)) {
        throw new Error("Clinical action intent contains invalid proposed actions.");
      }
      return value as unknown as OmniboxPlanningModelOutput;
    case "restricted_legal_action":
      if (!["sign_encounter", "authorize_order", "transmit_order"].includes(String(intent.requestedAction))) {
        throw new Error("Restricted legal action is invalid.");
      }
      if (intent.patientRef !== undefined && !validPatientRef(intent.patientRef)) throw new Error("Restricted action patient reference is invalid.");
      if (typeof intent.reason !== "string" || !intent.reason.trim()) throw new Error("Restricted action requires a reason.");
      return value as unknown as OmniboxPlanningModelOutput;
    case "unrecognized":
      if (typeof intent.reason !== "string" || !intent.reason.trim()) throw new Error("Unrecognized intent requires a reason.");
      return value as unknown as OmniboxPlanningModelOutput;
    default:
      throw new Error("Omnibox planner returned an unsupported intent kind.");
  }
}
