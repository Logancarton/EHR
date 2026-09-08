import type { MedicationPrescriptionIntent } from "./medication-prescription-intent";
import type { ClinicalPermission } from "../server/auth/provider-context";

export type OmniboxSurface =
  | "general"
  | "encounter"
  | "labs"
  | "medications"
  | "messages"
  | "history"
  | "orders"
  | "tasks";

export type OmniboxMedicationPrescriptionDraft = Pick<MedicationPrescriptionIntent, "medicationName"> &
  Partial<Pick<
    MedicationPrescriptionIntent,
    | "genericName"
    | "strength"
    | "dose"
    | "form"
    | "route"
    | "frequency"
    | "quantity"
    | "daysSupply"
    | "refills"
    | "substitutionAllowed"
    | "sig"
    | "startDate"
    | "relationship"
    | "indication"
  >>;

export type OmniboxProposedActionIntent =
  | { type: "stage_lab_order"; name: string }
  | { type: "stage_medication_order"; name: string; prescription?: OmniboxMedicationPrescriptionDraft }
  | { type: "create_follow_up_task"; description: string }
  | { type: "draft_patient_message"; instruction: string };

export type RestrictedLegalAction =
  | "sign_encounter"
  | "authorize_order"
  | "transmit_order"
  | "send_prescription"
  | "authorize_controlled_substance"
  | "commit_diagnosis"
  | "send_external_patient_message"
  | "acknowledge_result"
  | "submit_claim";

export type OmniboxPlannerIntent =
  | {
      kind: "navigate_patient";
      patientRef?: string;
      section: OmniboxSurface;
      target?: "patient_section" | "last_encounter";
    }
  | {
      kind: "clinical_question";
      patientRef?: string;
      question: string;
    }
  | {
      kind: "propose_clinical_actions";
      patientRef?: string;
      actions: OmniboxProposedActionIntent[];
    }
  | {
      kind: "restricted_legal_action";
      requestedAction: RestrictedLegalAction;
      patientRef?: string;
      reason: string;
    }
  | {
      kind: "clarification_required";
      field: "patient" | "medication" | "request";
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

export type OmniboxPatientIdentity = {
  id: string;
  name: string;
};

export type OmniboxPatientState = {
  active?: OmniboxPatientIdentity;
  requestedReference?: string;
  resolved?: OmniboxPatientIdentity & {
    source: "active_patient" | "mentioned_patient";
  };
  resolution: "resolved" | "not_required" | "required" | "not_found" | "ambiguous";
  switchRequired: boolean;
  candidates?: OmniboxPatientIdentity[];
};

export type OmniboxProposalBlockedReason =
  | "active_patient_mismatch"
  | "active_patient_required"
  | "patient_resolution_required"
  | "permission_denied";

type OmniboxProposalBase = {
  id: string;
  requestedPatientRef?: string;
  resolvedPatientId: string;
  activePatientId?: string;
  description: string;
  requiredPermission: ClinicalPermission;
  permission: "allowed" | "denied";
  requiresActivePatientConfirmation: boolean;
  humanReviewRequired: true;
  execution: "not_executed";
  blockedReason?: OmniboxProposalBlockedReason;
  provenance: string[];
};

export type OmniboxProposal =
  | (OmniboxProposalBase & {
      type: "stage_order";
      risk: "clinical_draft";
      parameters:
        | {
            orderType: "lab";
            name: string;
          }
        | {
            orderType: "medication";
            name: string;
            prescriptionIntent: MedicationPrescriptionIntent;
          };
    })
  | (OmniboxProposalBase & {
      type: "create_task";
      risk: "workflow_draft";
      parameters: {
        description: string;
      };
    })
  | (OmniboxProposalBase & {
      type: "draft_patient_message";
      risk: "communication_draft";
      parameters: {
        instruction: string;
      };
    });

export type OmniboxRestrictedActionPlan = {
  requestedAction: RestrictedLegalAction;
  description: string;
  requiredPermission?: ClinicalPermission;
  permission: "allowed" | "denied" | "not_modeled";
  humanReviewRequired: true;
  execution: "not_executed";
  blockedReason: "restricted_human_confirmation_required" | "permission_denied";
};

export type OmniboxEvidenceReference = {
  label: string;
  sourceRef: string;
  excerpt?: string;
};

export type OmniboxClarification = {
  required: true;
  field: "patient" | "medication" | "request";
  reason: "patient_required" | "patient_not_found" | "patient_ambiguous" | "medication_required" | "request_ambiguous";
  message: string;
  candidates?: OmniboxPatientIdentity[];
};

export type OmniboxNavigationSuggestion = {
  patientId: string;
  patientName: string;
  section: OmniboxSurface;
  target: "patient_section" | "last_encounter";
  requiresPatientSwitch: boolean;
  label: string;
};

export type OmniboxPlan = {
  query: string;
  intent: OmniboxPlannerIntent;
  confidence: number;
  planner: {
    provider: string;
    model: string;
  };
  patient: OmniboxPatientState;
  answer?: string;
  evidence: OmniboxEvidenceReference[];
  navigation?: OmniboxNavigationSuggestion;
  proposals: OmniboxProposal[];
  restrictedAction?: OmniboxRestrictedActionPlan;
  clarification?: OmniboxClarification;
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

const PLANNER_PAYLOAD_LIMIT = 20_000;
const MAX_ACTIONS = 8;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${label} contains an unexpected field: ${key}.`);
    }
  }
}

function validPatientRef(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 160;
}

function validShortText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function validOptionalText(value: unknown, maxLength: number): boolean {
  return value === undefined || validShortText(value, maxLength);
}

function validOptionalPositiveInteger(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value > 0);
}

function validOptionalNonnegativeInteger(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value >= 0);
}

function validatePatientRef(intent: Record<string, unknown>, label: string): void {
  if (intent.patientRef !== undefined && !validPatientRef(intent.patientRef)) {
    throw new Error(`${label} patient reference is invalid.`);
  }
}

const PRESCRIPTION_RELATIONSHIPS = new Set(["unspecified", "continue", "change", "replace", "new"]);

function validateMedicationPrescriptionDraft(value: unknown): value is OmniboxMedicationPrescriptionDraft {
  if (!isObject(value)) return false;
  assertAllowedKeys(value, [
    "medicationName",
    "genericName",
    "strength",
    "dose",
    "form",
    "route",
    "frequency",
    "quantity",
    "daysSupply",
    "refills",
    "substitutionAllowed",
    "sig",
    "startDate",
    "relationship",
    "indication",
  ], "Medication prescription draft");

  if (!validShortText(value.medicationName, 240)) return false;
  if (!validOptionalText(value.genericName, 240)) return false;
  if (!validOptionalText(value.strength, 120)) return false;
  if (!validOptionalText(value.dose, 120)) return false;
  if (!validOptionalText(value.form, 120)) return false;
  if (!validOptionalText(value.route, 120)) return false;
  if (!validOptionalText(value.frequency, 160)) return false;
  if (!validOptionalPositiveInteger(value.quantity)) return false;
  if (!validOptionalPositiveInteger(value.daysSupply)) return false;
  if (!validOptionalNonnegativeInteger(value.refills)) return false;
  if (value.substitutionAllowed !== undefined && typeof value.substitutionAllowed !== "boolean") return false;
  if (!validOptionalText(value.sig, 1000)) return false;
  if (!validOptionalText(value.startDate, 80)) return false;
  if (value.relationship !== undefined && !PRESCRIPTION_RELATIONSHIPS.has(String(value.relationship))) return false;
  if (!validOptionalText(value.indication, 500)) return false;
  return true;
}

function validateAction(value: unknown): value is OmniboxProposedActionIntent {
  if (!isObject(value)) return false;
  switch (value.type) {
    case "stage_lab_order":
      assertAllowedKeys(value, ["type", "name"], "Clinical action");
      return validShortText(value.name, 240);
    case "stage_medication_order":
      assertAllowedKeys(value, ["type", "name", "prescription"], "Clinical action");
      if (!validShortText(value.name, 240)) return false;
      return value.prescription === undefined || validateMedicationPrescriptionDraft(value.prescription);
    case "create_follow_up_task":
      assertAllowedKeys(value, ["type", "description"], "Clinical action");
      return validShortText(value.description, 500);
    case "draft_patient_message":
      assertAllowedKeys(value, ["type", "instruction"], "Clinical action");
      return validShortText(value.instruction, 1000);
    default:
      return false;
  }
}

const VALID_SECTIONS = new Set<OmniboxSurface>([
  "general",
  "encounter",
  "labs",
  "medications",
  "messages",
  "history",
  "orders",
  "tasks",
]);

const RESTRICTED_ACTIONS = new Set<RestrictedLegalAction>([
  "sign_encounter",
  "authorize_order",
  "transmit_order",
  "send_prescription",
  "authorize_controlled_substance",
  "commit_diagnosis",
  "send_external_patient_message",
  "acknowledge_result",
  "submit_claim",
]);

/**
 * Model/provider output is untrusted input. This validator rejects unknown fields,
 * unsupported action types, malformed patient references, out-of-range confidence,
 * and oversized payloads before any patient/context resolution occurs.
 */
export function validateOmniboxPlanningModelOutput(value: unknown): OmniboxPlanningModelOutput {
  let serialized = "";
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("Omnibox planner returned a non-serializable plan.");
  }
  if (!serialized || serialized.length > PLANNER_PAYLOAD_LIMIT) {
    throw new Error("Omnibox planner response exceeded the allowed payload size.");
  }
  if (!isObject(value) || !isObject(value.intent)) {
    throw new Error("Omnibox planner returned an invalid typed plan.");
  }
  assertAllowedKeys(value, ["intent", "confidence"], "Omnibox planner response");

  const confidence = value.confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("Omnibox planner confidence must be between 0 and 1.");
  }

  const intent = value.intent;
  switch (intent.kind) {
    case "navigate_patient": {
      assertAllowedKeys(intent, ["kind", "patientRef", "section", "target"], "Navigation intent");
      validatePatientRef(intent, "Navigation intent");
      if (!VALID_SECTIONS.has(intent.section as OmniboxSurface)) {
        throw new Error("Navigation intent contains an invalid section.");
      }
      if (intent.target !== undefined && intent.target !== "patient_section" && intent.target !== "last_encounter") {
        throw new Error("Navigation intent contains an invalid target.");
      }
      break;
    }
    case "clinical_question":
      assertAllowedKeys(intent, ["kind", "patientRef", "question"], "Question intent");
      validatePatientRef(intent, "Question intent");
      if (!validShortText(intent.question, 4000)) throw new Error("Question intent requires question text.");
      break;
    case "propose_clinical_actions":
      assertAllowedKeys(intent, ["kind", "patientRef", "actions"], "Clinical action intent");
      validatePatientRef(intent, "Clinical action intent");
      if (!Array.isArray(intent.actions) || intent.actions.length < 1 || intent.actions.length > MAX_ACTIONS) {
        throw new Error("Clinical action intent contains an invalid number of proposed actions.");
      }
      for (const action of intent.actions) {
        if (!validateAction(action)) throw new Error("Clinical action intent contains an unsupported or malformed action.");
      }
      break;
    case "restricted_legal_action":
      assertAllowedKeys(intent, ["kind", "requestedAction", "patientRef", "reason"], "Restricted legal action");
      validatePatientRef(intent, "Restricted action");
      if (!RESTRICTED_ACTIONS.has(intent.requestedAction as RestrictedLegalAction)) {
        throw new Error("Restricted legal action is invalid.");
      }
      if (!validShortText(intent.reason, 800)) throw new Error("Restricted action requires a bounded reason.");
      break;
    case "clarification_required":
      assertAllowedKeys(intent, ["kind", "field", "reason"], "Clarification intent");
      if (intent.field !== "patient" && intent.field !== "medication" && intent.field !== "request") {
        throw new Error("Clarification intent contains an invalid field.");
      }
      if (!validShortText(intent.reason, 800)) throw new Error("Clarification intent requires a bounded reason.");
      break;
    case "unrecognized":
      assertAllowedKeys(intent, ["kind", "reason"], "Unrecognized intent");
      if (!validShortText(intent.reason, 800)) throw new Error("Unrecognized intent requires a bounded reason.");
      break;
    default:
      throw new Error("Omnibox planner returned an unsupported intent kind.");
  }

  return value as OmniboxPlanningModelOutput;
}
