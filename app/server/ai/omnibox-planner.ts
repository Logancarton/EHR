import type { ClinicalPermission, ProviderContext } from "../auth/provider-context";
import { hasPermission } from "../auth/provider-context";
import {
  ContextAssembler,
  type AssembledClinicalContext,
  type ClinicalSurface,
  type UserRole,
} from "../context/context-assembler";
import { PatientRepository, type PatientRecord } from "../repositories/patient-repository";
import type { MedicationPrescriptionIntent } from "../../domain/medication-prescription-intent";
import type {
  OmniboxClarification,
  OmniboxEvidenceReference,
  OmniboxPatientIdentity,
  OmniboxPatientState,
  OmniboxPlan,
  OmniboxPlannerIntent,
  OmniboxProposal,
  OmniboxProposalBlockedReason,
  OmniboxProposedActionIntent,
  OmniboxRestrictedActionPlan,
  OmniboxSurface,
  RestrictedLegalAction,
} from "../../domain/omnibox";
import {
  type OmniboxPlanningModel,
  RuleBasedOmniboxPlanningModel,
  planWithModel,
} from "./omnibox-model-gateway";

export type OmniboxPlanInput = {
  query: string;
  activePatientId?: string;
  activeSection?: OmniboxSurface;
  expectedPatientId?: string;
};

type PatientLookup =
  | { status: "resolved"; patient: PatientRecord; source: "active_patient" | "mentioned_patient"; requestedReference?: string }
  | { status: "required"; requestedReference?: string }
  | { status: "not_found"; requestedReference: string }
  | { status: "ambiguous"; requestedReference: string; candidates: PatientRecord[] }
  | { status: "not_required"; requestedReference?: undefined };

function contextRole(role: ProviderContext["role"]): UserRole {
  return role === "clinical_assistant" ? "clinical-assistant" : role;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function patientIdentity(patient: PatientRecord): OmniboxPatientIdentity {
  return { id: patient.id, name: patient.name };
}

function patientRefFromIntent(intent: OmniboxPlannerIntent): string | undefined {
  return "patientRef" in intent && typeof intent.patientRef === "string"
    ? intent.patientRef
    : undefined;
}

function exactPatientMatches(reference: string, patients: PatientRecord[]): PatientRecord[] {
  const ref = normalize(reference);
  if (!ref) return [];
  return patients.filter((patient) => {
    if (normalize(patient.id) === ref || normalize(patient.mrn) === ref || normalize(patient.name) === ref) return true;
    const nameParts = normalize(patient.name).split(" ").filter(Boolean);
    return nameParts.includes(ref);
  });
}

function mentionedPatients(query: string, patients: PatientRecord[]): PatientRecord[] {
  const normalizedQuery = ` ${normalize(query)} `;
  const fullNameMatches = patients.filter((patient) => normalizedQuery.includes(` ${normalize(patient.name)} `));
  if (fullNameMatches.length > 0) return fullNameMatches;

  return patients.filter((patient) =>
    normalize(patient.name)
      .split(" ")
      .filter((part) => part.length >= 3)
      .some((part) => normalizedQuery.includes(` ${part} `)),
  );
}

function intentNeedsPatient(intent: OmniboxPlannerIntent): boolean {
  return intent.kind === "navigate_patient"
    || intent.kind === "clinical_question"
    || intent.kind === "propose_clinical_actions"
    || intent.kind === "restricted_legal_action";
}

function resolvePlanPatient(
  intent: OmniboxPlannerIntent,
  query: string,
  activePatient: PatientRecord | null,
  patients: PatientRecord[],
): PatientLookup {
  if (!intentNeedsPatient(intent)) return { status: "not_required" };

  const plannerRef = patientRefFromIntent(intent);
  if (plannerRef) {
    const matches = exactPatientMatches(plannerRef, patients);
    if (matches.length === 1) {
      return { status: "resolved", patient: matches[0], source: "mentioned_patient", requestedReference: plannerRef };
    }
    if (matches.length > 1) {
      return { status: "ambiguous", requestedReference: plannerRef, candidates: matches };
    }
    return { status: "not_found", requestedReference: plannerRef };
  }

  const mentioned = mentionedPatients(query, patients);
  if (mentioned.length === 1) {
    return {
      status: "resolved",
      patient: mentioned[0],
      source: "mentioned_patient",
      requestedReference: mentioned[0].name,
    };
  }
  if (mentioned.length > 1) {
    return { status: "ambiguous", requestedReference: "patient mentioned in request", candidates: mentioned };
  }
  if (activePatient) return { status: "resolved", patient: activePatient, source: "active_patient" };
  return { status: "required" };
}

function patientState(activePatient: PatientRecord | null, lookup: PatientLookup): OmniboxPatientState {
  const active = activePatient ? patientIdentity(activePatient) : undefined;
  if (lookup.status === "resolved") {
    const resolved = { ...patientIdentity(lookup.patient), source: lookup.source };
    return {
      active,
      requestedReference: lookup.requestedReference,
      resolved,
      resolution: "resolved",
      switchRequired: Boolean(active && active.id !== resolved.id),
    };
  }
  if (lookup.status === "ambiguous") {
    return {
      active,
      requestedReference: lookup.requestedReference,
      resolution: "ambiguous",
      switchRequired: false,
      candidates: lookup.candidates.map(patientIdentity),
    };
  }
  if (lookup.status === "not_found") {
    return {
      active,
      requestedReference: lookup.requestedReference,
      resolution: "not_found",
      switchRequired: false,
    };
  }
  return {
    active,
    requestedReference: lookup.requestedReference,
    resolution: lookup.status,
    switchRequired: false,
  };
}

function clarificationFromPatientLookup(lookup: PatientLookup): OmniboxClarification | undefined {
  if (lookup.status === "required") {
    return {
      required: true,
      field: "patient",
      reason: "patient_required",
      message: "Choose or name the patient before this patient-specific request can be planned.",
    };
  }
  if (lookup.status === "not_found") {
    return {
      required: true,
      field: "patient",
      reason: "patient_not_found",
      message: `No authoritative patient record uniquely matched “${lookup.requestedReference}”. The active patient was not substituted.`,
    };
  }
  if (lookup.status === "ambiguous") {
    return {
      required: true,
      field: "patient",
      reason: "patient_ambiguous",
      message: `More than one authoritative patient record matched “${lookup.requestedReference}”. Choose the intended patient.`,
      candidates: lookup.candidates.map(patientIdentity),
    };
  }
  return undefined;
}

function clarificationFromIntent(intent: OmniboxPlannerIntent): OmniboxClarification | undefined {
  if (intent.kind !== "clarification_required") return undefined;
  if (intent.field === "medication") {
    return {
      required: true,
      field: "medication",
      reason: "medication_required",
      message: intent.reason,
    };
  }
  if (intent.field === "patient") {
    return {
      required: true,
      field: "patient",
      reason: "patient_required",
      message: intent.reason,
    };
  }
  return {
    required: true,
    field: "request",
    reason: "request_ambiguous",
    message: intent.reason,
  };
}

function actionPermission(action: OmniboxProposedActionIntent): ClinicalPermission {
  if (action.type === "create_follow_up_task") return "manage_tasks";
  if (action.type === "draft_patient_message") return "send_message";
  return "stage_order";
}

function proposalBlock(
  actor: ProviderContext,
  permission: ClinicalPermission,
  activePatient: PatientRecord | null,
  targetPatient: PatientRecord,
): { permission: "allowed" | "denied"; blockedReason?: OmniboxProposalBlockedReason } {
  if (!hasPermission(actor, permission)) {
    return { permission: "denied", blockedReason: "permission_denied" };
  }
  if (!activePatient) {
    return { permission: "allowed", blockedReason: "active_patient_required" };
  }
  if (activePatient.id !== targetPatient.id) {
    return { permission: "allowed", blockedReason: "active_patient_mismatch" };
  }
  return { permission: "allowed" };
}

function proposalForAction(
  action: OmniboxProposedActionIntent,
  index: number,
  actor: ProviderContext,
  activePatient: PatientRecord | null,
  targetPatient: PatientRecord,
  requestedPatientRef?: string,
): OmniboxProposal {
  const requiredPermission = actionPermission(action);
  const block = proposalBlock(actor, requiredPermission, activePatient, targetPatient);
  const common = {
    id: `proposal-${index + 1}`,
    requestedPatientRef,
    resolvedPatientId: targetPatient.id,
    activePatientId: activePatient?.id,
    requiredPermission,
    permission: block.permission,
    requiresActivePatientConfirmation: !activePatient || activePatient.id !== targetPatient.id,
    humanReviewRequired: true as const,
    execution: "not_executed" as const,
    blockedReason: block.blockedReason,
    provenance: [`patients/${targetPatient.id}`],
  };

  if (action.type === "stage_lab_order") {
    return {
      ...common,
      type: "stage_order",
      risk: "clinical_draft",
      description: `Prepare lab order: ${action.name}`,
      parameters: { orderType: "lab", name: action.name },
    };
  }
  if (action.type === "stage_medication_order") {
    const draft = action.prescription || { medicationName: action.name };
    const prescriptionIntent: MedicationPrescriptionIntent = {
      ...draft,
      patientId: targetPatient.id,
      medicationName: draft.medicationName || action.name,
      source: "ai",
      lifecycle: "draft",
    };
    return {
      ...common,
      type: "stage_order",
      risk: "clinical_draft",
      description: `Prepare medication order: ${action.name}`,
      parameters: {
        orderType: "medication",
        name: action.name,
        prescriptionIntent,
      },
    };
  }
  if (action.type === "create_follow_up_task") {
    return {
      ...common,
      type: "create_task",
      risk: "workflow_draft",
      description: "Prepare a patient-linked follow-up task for review.",
      parameters: { description: action.description },
    };
  }
  return {
    ...common,
    type: "draft_patient_message",
    risk: "communication_draft",
    description: "Prepare a patient-message draft for review; do not send it.",
    parameters: { instruction: action.instruction },
  };
}

function restrictedPermission(action: RestrictedLegalAction): ClinicalPermission | undefined {
  switch (action) {
    case "sign_encounter": return "sign_encounter";
    case "authorize_order":
    case "authorize_controlled_substance": return "authorize_order";
    case "transmit_order":
    case "send_prescription": return "transmit_order";
    case "commit_diagnosis": return "manage_clinical_record";
    case "send_external_patient_message": return "send_message";
    case "acknowledge_result": return "acknowledge_result";
    case "submit_claim": return undefined;
  }
}

function restrictedPlan(intent: Extract<OmniboxPlannerIntent, { kind: "restricted_legal_action" }>, actor: ProviderContext): OmniboxRestrictedActionPlan {
  const requiredPermission = restrictedPermission(intent.requestedAction);
  const permission = requiredPermission
    ? (hasPermission(actor, requiredPermission) ? "allowed" as const : "denied" as const)
    : "not_modeled" as const;
  return {
    requestedAction: intent.requestedAction,
    description: intent.reason,
    requiredPermission,
    permission,
    humanReviewRequired: true,
    execution: "not_executed",
    blockedReason: permission === "denied" ? "permission_denied" : "restricted_human_confirmation_required",
  };
}

function contextSurfaceForIntent(intent: OmniboxPlannerIntent, query: string): ClinicalSurface | null {
  if (intent.kind === "navigate_patient") {
    return intent.target === "last_encounter" ? "longitudinal-query" : null;
  }
  if (intent.kind === "restricted_legal_action" || intent.kind === "clarification_required" || intent.kind === "unrecognized") {
    return null;
  }
  if (intent.kind === "propose_clinical_actions") {
    if (intent.actions.some(action => action.type === "draft_patient_message")) return "patient-message";
    if (intent.actions.some(action => action.type === "stage_lab_order" || action.type === "stage_medication_order")) return "order-cart";
    return "general";
  }

  const normalized = query.toLowerCase();
  if (/\b(reconcil|reconciliation|discrep|medication evidence|patient report|external history|stopped|discontinued|no longer taking)\b/.test(normalized)) {
    return "medication-review";
  }
  if (/\b(message|reply|response|portal|sms)\b/.test(normalized)) return "patient-message";
  if (/\b(lab|lithium|valpro|depakote|cbc|cmp|bmp|tsh|a1c|lipid|medication|meds|refill|prescription|order)\b/.test(normalized)) {
    return "order-cart";
  }
  return "longitudinal-query";
}

function clinicalSearchTerms(question: string): string {
  const mentioning = question.match(/\bmention(?:ing|ed)?\s+(.+?)\s*[?.!]*$/i)?.[1]?.trim();
  if (mentioning) return mentioning.slice(0, 500);
  const quoted = question.match(/["“](.+?)["”]/)?.[1]?.trim();
  return (quoted || question).slice(0, 500);
}

function labKeyword(question: string): string | null {
  const normalized = question.toLowerCase();
  if (normalized.includes("lithium")) return "lithium";
  if (normalized.includes("valpro") || normalized.includes("depakote")) return "valpro";
  if (/\bcbc\b|complete blood count/.test(normalized)) return "cbc";
  if (/\bcmp\b|comprehensive metabolic panel/.test(normalized)) return "cmp";
  if (/\bbmp\b|basic metabolic panel/.test(normalized)) return "bmp";
  if (/\btsh\b|thyroid/.test(normalized)) return "tsh";
  if (/\ba1c\b/.test(normalized)) return "a1c";
  if (/\blipid/.test(normalized)) return "lipid";
  return null;
}

function evidence(label: string, sourceRef: string, excerpt?: string): OmniboxEvidenceReference {
  return { label, sourceRef, excerpt };
}

function medicationReconciliationAnswer(
  context: AssembledClinicalContext,
): { answer: string; evidence: OmniboxEvidenceReference[] } | null {
  const pending = context.pendingMedicationCandidates || [];
  if (!pending.length) return null;
  const first = pending[0];
  const authoritative = context.activeMedications.length
    ? `Authoritative active medications: ${context.activeMedications.join(", ")}.`
    : "The bounded authoritative medication list contains no active medications.";
  const remaining = pending.length > 1 ? ` ${pending.length - 1} additional pending evidence item(s) are also in the bounded review context.` : "";
  return {
    answer: `${authoritative} Pending non-authoritative evidence says: “${first.rawEvidenceText}” Advisory interpretation: ${first.advisory.conflictSignal}${remaining} This evidence remains pending and has not changed medication truth; clinician reconciliation is required before any medication change.`,
    evidence: [evidence("Pending medication evidence", first.provenanceRef, first.rawEvidenceText)],
  };
}

function answerClinicalQuestion(question: string, context: AssembledClinicalContext): { answer: string; evidence: OmniboxEvidenceReference[] } {
  const normalized = question.toLowerCase();
  const keyword = labKeyword(question);
  if (keyword) {
    const lab = context.recentLabs.find(item => item.testName.toLowerCase().includes(keyword));
    if (lab) {
      const value = `${lab.value}${lab.unit ? ` ${lab.unit}` : ""}`;
      return {
        answer: `${lab.testName} was last recorded on ${lab.date} at ${value}.`,
        evidence: [evidence(lab.testName, `observations/${lab.id}`, `${lab.date}: ${value}`)],
      };
    }
    return {
      answer: `No ${keyword} result appears in the bounded recent-lab context assembled for this request.`,
      evidence: [],
    };
  }

  if (/\b(note|encounter)\b/.test(normalized) && context.searchMatches?.length) {
    const match = context.searchMatches[0];
    return {
      answer: `The most relevant matching encounter is from ${match.date}: ${match.snippet}`,
      evidence: [evidence(`Encounter ${match.date}`, match.provenanceRef, match.snippet)],
    };
  }

  if (/\b(reconcil|reconciliation|discrep|evidence|reported|reports|stopped|discontinued|no longer taking)\b/.test(normalized)) {
    const reconciliation = medicationReconciliationAnswer(context);
    if (reconciliation) return reconciliation;
  }

  if (/\bmedication|medications|meds|tried\b/.test(normalized)) {
    const pendingCount = context.pendingMedicationCandidates?.length || 0;
    if (!context.activeMedications.length) {
      return {
        answer: pendingCount
          ? `No active medications are present in the bounded authoritative context. ${pendingCount} pending medication evidence item(s) remain separate and require reconciliation.`
          : "No active medications are present in the bounded authoritative context for this request.",
        evidence: pendingCount
          ? [evidence("Pending medication evidence", context.pendingMedicationCandidates![0].provenanceRef, context.pendingMedicationCandidates![0].rawEvidenceText)]
          : [],
      };
    }
    const medicationRefs = Object.entries(context.provenanceMap)
      .filter(([key]) => key.startsWith("medication-") && !key.startsWith("medication-candidate-"))
      .slice(0, context.activeMedications.length)
      .map(([key, sourceRef], index) => evidence(context.activeMedications[index] || key, sourceRef));
    return {
      answer: `Current authoritative active medications: ${context.activeMedications.join(", ")}.${pendingCount ? ` ${pendingCount} pending medication evidence item(s) are separate from this list and require reconciliation.` : ""} This bounded context does not establish a complete historical medication-trial list.`,
      evidence: medicationRefs,
    };
  }

  if (/\bchanged\b.*\b(last|prior)\s+visit|since\s+(?:the\s+)?last\s+visit/.test(normalized) && context.recentEncounters.length) {
    const latest = context.recentEncounters[0];
    const prior = context.recentEncounters[1];
    if (prior) {
      return {
        answer: `Latest encounter (${latest.date}) assessment/plan: ${latest.assessment} ${latest.plan} Prior encounter (${prior.date}): ${prior.assessment} ${prior.plan}`,
        evidence: [
          evidence(`Encounter ${latest.date}`, latest.provenanceRef, `${latest.assessment} ${latest.plan}`),
          evidence(`Encounter ${prior.date}`, prior.provenanceRef, `${prior.assessment} ${prior.plan}`),
        ],
      };
    }
    return {
      answer: `Only one recent encounter is present in the bounded context (${latest.date}), so a prior-visit comparison cannot be made from this payload.`,
      evidence: [evidence(`Encounter ${latest.date}`, latest.provenanceRef, `${latest.assessment} ${latest.plan}`)],
    };
  }

  if (/\bmessage|reply|response\b/.test(normalized) && context.recentMessages?.length) {
    const message = context.recentMessages[0];
    return {
      answer: `Most recent message thread in the bounded context: “${message.subject}” (${message.urgency}).${message.summary ? ` ${message.summary}` : ""}`,
      evidence: [evidence(message.subject, `messages/threads/${message.id}`, message.summary)],
    };
  }

  if (context.searchMatches?.length) {
    const match = context.searchMatches[0];
    return {
      answer: `The bounded longitudinal search found a relevant encounter from ${match.date}: ${match.snippet}`,
      evidence: [evidence(`Encounter ${match.date}`, match.provenanceRef, match.snippet)],
    };
  }

  return {
    answer: "The request was understood, but the bounded authoritative context does not contain enough directly supporting evidence for a deterministic answer. No fact was inferred or invented.",
    evidence: [],
  };
}

function surfaceToNavigationSection(surface: OmniboxSurface): OmniboxSurface {
  return surface;
}

export class OmniboxPlannerService {
  constructor(
    private readonly planningModel: OmniboxPlanningModel = new RuleBasedOmniboxPlanningModel(),
  ) {}

  async plan(input: OmniboxPlanInput, actor: ProviderContext): Promise<OmniboxPlan> {
    const query = input.query?.trim();
    if (!query) throw new Error("Omnibox query is required.");
    if (query.length > 4000) throw new Error("Omnibox query is too long.");
    if (!hasPermission(actor, "read_clinical")) {
      throw new Error(`User ${actor.userId} (${actor.role}) lacks permission: read_clinical`);
    }

    if (input.expectedPatientId && input.activePatientId && input.expectedPatientId !== input.activePatientId) {
      throw new Error(
        `Patient binding mismatch: active patient ${input.activePatientId} does not match request context ${input.expectedPatientId}.`,
      );
    }

    const activePatientId = input.activePatientId || input.expectedPatientId;
    const activePatient = activePatientId ? PatientRepository.getById(activePatientId) : null;
    if (activePatientId && !activePatient) throw new Error("Active patient not found.");

    // Language interpretation happens before clinical context retrieval. The model
    // receives no repository/service/database handles and its output is runtime-validated.
    const planned = await planWithModel(this.planningModel, { query });
    const patients = intentNeedsPatient(planned.intent) ? PatientRepository.getAll() : [];
    const lookup = resolvePlanPatient(planned.intent, query, activePatient, patients);
    const patient = lookup.status === "resolved" ? lookup.patient : null;
    const patientInfo = patientState(activePatient, lookup);

    let clarification = clarificationFromIntent(planned.intent) || clarificationFromPatientLookup(lookup);
    const blockedReasons: string[] = [];
    const proposals: OmniboxProposal[] = [];
    const evidenceRefs: OmniboxEvidenceReference[] = [];
    let answer: string | undefined;
    let restrictedAction: OmniboxRestrictedActionPlan | undefined;

    const desiredSurface = contextSurfaceForIntent(planned.intent, query);
    let assembled: AssembledClinicalContext | null = null;
    if (patient && desiredSurface) {
      assembled = ContextAssembler.assemble({
        patientId: patient.id,
        surface: desiredSurface,
        userRole: contextRole(actor.role),
        tokenBudget: 2500,
        searchQuery: planned.intent.kind === "clinical_question" ? clinicalSearchTerms(planned.intent.question) : undefined,
      });
    }

    if (planned.intent.kind === "clinical_question" && assembled) {
      const response = answerClinicalQuestion(planned.intent.question, assembled);
      answer = response.answer;
      evidenceRefs.push(...response.evidence);
    }

    if (planned.intent.kind === "propose_clinical_actions") {
      if (!patient) {
        blockedReasons.push("patient_resolution_required");
        if (!clarification) {
          clarification = {
            required: true,
            field: "patient",
            reason: "patient_required",
            message: "Choose or name the patient before creating a patient-specific proposal.",
          };
        }
      } else {
        planned.intent.actions.forEach((action, index) => {
          const proposal = proposalForAction(
            action,
            index,
            actor,
            activePatient,
            patient,
            patientInfo.requestedReference,
          );
          proposals.push(proposal);
          if (proposal.blockedReason) blockedReasons.push(proposal.blockedReason);
        });
      }
    }

    if (planned.intent.kind === "restricted_legal_action") {
      restrictedAction = restrictedPlan(planned.intent, actor);
      blockedReasons.push(restrictedAction.blockedReason);
      if (restrictedAction.permission === "denied") blockedReasons.push("permission_denied");
    }

    if (clarification) blockedReasons.push(clarification.reason);

    const navigation = planned.intent.kind === "navigate_patient" && patient
      ? {
          patientId: patient.id,
          patientName: patient.name,
          section: surfaceToNavigationSection(planned.intent.section),
          target: planned.intent.target || "patient_section" as const,
          requiresPatientSwitch: Boolean(activePatient && activePatient.id !== patient.id),
          label: planned.intent.target === "last_encounter"
            ? `Open ${patient.name}'s last encounter`
            : `Open ${patient.name} · ${planned.intent.section}`,
        }
      : undefined;

    const context = assembled
      ? {
          surface: assembled.surface,
          patientId: assembled.patient.id,
          estimatedTokens: assembled.estimatedTokens,
          isTruncated: assembled.isTruncated,
          provenanceCount: Object.keys(assembled.provenanceMap).length,
        }
      : undefined;

    return {
      query,
      intent: planned.intent,
      confidence: planned.confidence,
      planner: {
        provider: this.planningModel.provider,
        model: this.planningModel.model,
      },
      patient: patientInfo,
      answer,
      evidence: evidenceRefs,
      navigation,
      proposals,
      restrictedAction,
      clarification,
      context,
      safety: {
        mutatesClinicalRecord: false,
        requiresHumanReview: proposals.length > 0 || Boolean(restrictedAction),
        blockedReasons: [...new Set(blockedReasons)],
      },
    };
  }
}

export const omniboxPlannerService = new OmniboxPlannerService();
