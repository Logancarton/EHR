import { assertPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import { AuditRepository } from "../repositories/audit-repository";
import { DocumentWorkflowRepository, type DocumentWorkflowStatus } from "../repositories/document-workflow-repository";
import type { ClinicalExecutionContext } from "./clinical-service";

export const documentWorkflowService = {
  events(documentId: string, actor: ProviderContext) {
    assertPermission(actor, "read_clinical");
    return DocumentWorkflowRepository.events(documentId);
  },

  transition(
    documentId: string,
    toStatus: DocumentWorkflowStatus,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: { note?: string; supersededByDocumentId?: string } = {},
  ) {
    assertPermission(actor, "manage_clinical_record");
    const result = DocumentWorkflowRepository.transition(
      documentId,
      toStatus,
      { userId: actor.userId, displayName: providerLabel(actor) },
      input,
    );
    AuditRepository.log({
      userId: actor.userId,
      userName: providerLabel(actor),
      userRole: actor.role,
      eventType: "document_workflow_changed",
      patientId: result.document.patient_id,
      description: `Moved document ${result.document.title} to ${toStatus.replaceAll("_", " ")}.`,
      metadata: {
        source: context.source,
        requestId: context.requestId,
        documentId,
        workflowStatus: toStatus,
        workflowEventId: result.event?.id,
      },
    });
    return result;
  },
};
