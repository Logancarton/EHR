import type { ProviderContext } from "../auth/provider-context";
import { hasPermission } from "../auth/provider-context";
import { ContextAssembler, type UserRole } from "../context/context-assembler";
import { PatientRepository, type PatientRecord } from "../repositories/patient-repository";
import type {
  OmniboxPatientResolution,
  OmniboxPlan,
  OmniboxPlannerIntent,
  OmniboxProposal,
  OmniboxSurface,
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

function contextRole(role: ProviderContext["role"]): UserRole {
  return role === "clinical_assistant" ? "clinical-assistant" : role;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function matchesPatientReference(patient: PatientRecord, reference: string): boolean {
  const ref = normalize(reference);
  if (!ref) return false;
  if (normalize(patient.id) === ref || normalize(patient.mrn) === ref || normalize(patient.name) === ref) return true;
  const nameParts = normalize(patient.name).split(" ").filter(Boolean);
  return nameParts.includes(ref);
}

function resolvePatientReference(reference: string, patients: PatientRecord[]): PatientRecord | null {
  const exact = patients.filter((patient) => matchesPatientReference(patient, reference));
  return exact.length === 1 ? exact[0] : null;
}

function findMentionedPatient(query: string, patients: PatientRecord[]): PatientRecord | null {
  const normalizedQuery = ` ${normalize(query)} `;
  const fullNameMatches = patients.filter((patient) => normalizedQuery.includes(` ${normalize(patient.name)} `));
  if (fullNameMatches.length === 1) return fullNameMatches[0];

  const partMatches = patients.filter((patient) =>
    normalize(patient.name)
      .split(" ")
      .filter((part) => part.length >= 3)
      .some((part) => normalizedQuery.includes(` ${part} `)),
  );
  return partMatches.length === 1 ? partMatches[0] : null;
}

function patientRefFromIntent(intent: OmniboxPlannerIntent): string | undefined {
  return "patientRef" in intent && typeof intent.patientRef === "string"
    ? intent.patientRef
    : undefined;
}

function sectionToContextSurface(section: OmniboxSurface | undefined) {
  if (section === "encounter") return "encounter-scribe" as const;
  if (section === "orders" || section === "labs" || section === "medications") return "order-cart" as const;
  if (section === "messages") return "patient-message" as const;
  if (section === "history") return "longitudinal-query" as const;
  return "general" as const;
}

function resolvePlanPatient(
  intent: OmniboxPlannerIntent,
  query: string,
  activePatient: PatientRecord | null,
  patients: PatientRecord[],
): { patient: PatientRecord | null; resolution?: OmniboxPatientResolution } {
  const plannerRef = patientRefFromIntent(intent);
  const mentioned = plannerRef
    ? resolvePatientReference(plannerRef, patients)
    : findMentionedPatient(query, patients);

  if (mentioned) {
    return {
      patient: mentioned,
      resolution: { id: mentioned.id, name: mentioned.name, source: "mentioned_patient" },
    };
  }
  if (activePatient) {
    return {
      patient: activePatient,
      resolution: { id: activePatient.id, name: activePatient.name, source: "active_patient" },
    };
  }
  return { patient: null };
}

function proposalBlock(
  actor: ProviderContext,
  activePatient: PatientRecord | null,
  targetPatient: PatientRecord,
): Pick<OmniboxProposal, "permission" | "blockedReason"> {
  if (!hasPermission(actor, "stage_order")) {
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

export class OmniboxPlannerService {
  constructor(
    private readonly planningModel: OmniboxPlanningModel = new RuleBasedOmniboxPlanningModel(),
  ) {}

  async plan(input: OmniboxPlanInput, actor: ProviderContext): Promise<OmniboxPlan> {
    const query = input.query?.trim();
    if (!query) throw new Error("Omnibox query is required.");
    if (query.length > 4000) throw new Error("Omnibox query is too long.");

    if (input.expectedPatientId && input.activePatientId && input.expectedPatientId !== input.activePatientId) {
      throw new Error(
        `Patient binding mismatch: active patient ${input.activePatientId} does not match request context ${input.expectedPatientId}.`,
      );
    }

    const activePatientId = input.activePatientId || input.expectedPatientId;
    const patients = PatientRepository.getAll();
    const activePatient = activePatientId ? PatientRepository.getById(activePatientId) : null;
    if (activePatientId && !activePatient) throw new Error("Active patient not found.");

    // Natural language is converted to a typed, runtime-validated intent before
    // authoritative patient/context resolution or permission/safety evaluation.
    const planned = await planWithModel(this.planningModel, { query });
    const { patient, resolution } = resolvePlanPatient(planned.intent, query, activePatient, patients);
    const blockedReasons: string[] = [];
    const proposals: OmniboxProposal[] = [];

    if (planned.intent.kind === "propose_clinical_actions") {
      if (!patient) {
        blockedReasons.push("patient_resolution_required");
      } else {
        const block = proposalBlock(actor, activePatient, patient);
        if (block.blockedReason) blockedReasons.push(block.blockedReason);

        planned.intent.actions.forEach((action, index) => {
          proposals.push({
            id: `proposal-${index + 1}`,
            type: "stage_order",
            patientId: patient.id,
            orderType: action.type === "stage_lab_order" ? "lab" : "medication",
            name: action.name,
            risk: "clinical_draft",
            requiredPermission: "stage_order",
            permission: block.permission,
            confirmation: "review_required",
            execution: "not_executed",
            blockedReason: block.blockedReason,
          });
        });
      }
    }

    if (planned.intent.kind === "restricted_legal_action") {
      blockedReasons.push(planned.intent.reason);
    }

    if (
      (planned.intent.kind === "clinical_question" || planned.intent.kind === "navigate_patient") &&
      !hasPermission(actor, "read_clinical")
    ) {
      blockedReasons.push("read_clinical_permission_required");
    }

    let context: OmniboxPlan["context"];
    if (patient && hasPermission(actor, "read_clinical")) {
      const assembled = ContextAssembler.assemble({
        patientId: patient.id,
        surface: sectionToContextSurface(input.activeSection),
        userRole: contextRole(actor.role),
        tokenBudget: 2500,
        searchQuery: planned.intent.kind === "clinical_question" ? planned.intent.question : query,
      });
      if (assembled) {
        context = {
          surface: assembled.surface,
          patientId: assembled.patient.id,
          estimatedTokens: assembled.estimatedTokens,
          isTruncated: assembled.isTruncated,
          provenanceCount: Object.keys(assembled.provenanceMap).length,
        };
      }
    }

    return {
      query,
      intent: planned.intent,
      confidence: planned.confidence,
      planner: {
        provider: this.planningModel.provider,
        model: this.planningModel.model,
      },
      patient: resolution,
      proposals,
      context,
      safety: {
        mutatesClinicalRecord: false,
        requiresHumanReview:
          proposals.length > 0 || planned.intent.kind === "restricted_legal_action",
        blockedReasons: [...new Set(blockedReasons)],
      },
    };
  }
}

export const omniboxPlannerService = new OmniboxPlannerService();
