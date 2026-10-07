import { assertPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import { assertPatientAccess } from "../auth/patient-access";
import { AuditRepository } from "../repositories/audit-repository";
import { ClinicalRecordRepository } from "../repositories/clinical-record-repository";
import { DocumentWorkflowRepository, type DocumentWorkflowStatus } from "../repositories/document-workflow-repository";
import {
  SAFETY_PLAN_SECTIONS,
  cleanSafetyPlanAnswers,
  isSafetyPlanDraft,
  reviewedSafetyPlanText,
} from "../../domain/patient-form-requests";
import type { ClinicalExecutionContext } from "./clinical-service";

export class SafetyPlanError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** The workflow steps from a status to `filed`, in order. */
const PATH_TO_FILED: Record<DocumentWorkflowStatus, DocumentWorkflowStatus[]> = {
  received: ["needs_review", "reviewed", "filed"],
  needs_review: ["reviewed", "filed"],
  reviewed: ["filed"],
  filed: [],
  superseded: [],
};

/**
 * Finalizing a patient's safety-plan draft (D-129).
 *
 * The clinician goes over the patient's own draft with them, edits it, and
 * finalizes. That creates a new safety-plan document authored by the clinician
 * and filed as reviewed. The patient's draft is kept, walked through review, and
 * marked superseded by the finalized plan, so what the patient first wrote stays
 * in the record and points to what replaced it.
 */
export const safetyPlanService = {
  finalize(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: { patientId: string; draftDocumentId: string; answers: unknown },
  ): { documentId: string } {
    assertPermission(actor, "manage_clinical_record");
    assertPatientAccess(actor, input.patientId);
    const draft = ClinicalRecordRepository.getDocumentById(input.draftDocumentId);
    if (!draft || draft.patient_id !== input.patientId) throw new SafetyPlanError("Safety plan draft not found for this chart.", 404);
    if (!isSafetyPlanDraft(draft)) throw new SafetyPlanError("This document is not an unfinalized safety-plan draft.", 409);

    const answers = cleanSafetyPlanAnswers(input.answers);
    if (!SAFETY_PLAN_SECTIONS.some((section) => answers[section.id])) {
      throw new SafetyPlanError("A finalized safety plan needs at least one section filled in.");
    }

    const clinician = providerLabel(actor);
    const ref = { userId: actor.userId, displayName: clinician };
    const reviewedOn = new Date().toISOString().slice(0, 10);
    const finalized = ClinicalRecordRepository.createDocumentForSubject(
      {
        patientId: input.patientId,
        documentType: "safety_plan",
        title: `Safety plan — reviewed with patient (${reviewedOn})`,
        mimeType: "text/plain",
        contentText: reviewedSafetyPlanText(answers, reviewedOn, clinician),
      },
      ref,
      { type: "clinician", system: "ehr-local", ref: draft.id },
    ) as { id: string };

    const note = "Reviewed with the patient while finalizing their safety plan.";
    for (const step of PATH_TO_FILED.received) DocumentWorkflowRepository.transition(finalized.id, step, ref, { note });
    const draftStatus = String(draft.workflow_status || "received") as DocumentWorkflowStatus;
    for (const step of PATH_TO_FILED[draftStatus]) DocumentWorkflowRepository.transition(draft.id, step, ref, { note });
    DocumentWorkflowRepository.transition(draft.id, "superseded", ref, {
      note: "Superseded by the finalized safety plan.",
      supersededByDocumentId: finalized.id,
    });

    AuditRepository.log({
      userId: actor.userId,
      userName: clinician,
      userRole: actor.role,
      eventType: "document_created",
      patientId: input.patientId,
      description: `Finalized safety plan from the patient's draft ${draft.id}.`,
      metadata: { documentId: finalized.id, draftDocumentId: draft.id, source: context.source, requestId: context.requestId },
    });
    return { documentId: finalized.id };
  },
};
