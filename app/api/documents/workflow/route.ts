import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../../server/actions/clinical-action-gateway";
import { assertPermission } from "../../../server/auth/provider-context";
import {
  authenticatedClinicalRequest,
  clinicalActionError,
  clinicalRequest,
} from "../../../server/http/clinical-http";
import { ClinicalRecordRepository } from "../../../server/repositories/clinical-record-repository";
import { documentWorkflowService } from "../../../server/services/document-workflow-service";
import type { DocumentWorkflowStatus } from "../../../server/repositories/document-workflow-repository";

const validStatuses = new Set<DocumentWorkflowStatus>(["received", "needs_review", "reviewed", "filed", "superseded"]);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get("documentId");
    const patientId = searchParams.get("patientId");
    if (!documentId || !patientId) {
      return NextResponse.json(
        { success:false, error:"patientId and documentId are required" },
        { status:400 },
      );
    }

    const { actor } = authenticatedClinicalRequest(req, patientId);
    assertPermission(actor, "read_clinical");

    const history = ClinicalRecordRepository.versions("document", documentId);
    const owner = history.find((entry: any) => typeof entry.patient_id === "string")?.patient_id;
    if (owner && owner !== patientId) {
      throw new Error(
        `Patient binding mismatch: active chart expects ${patientId}, but document ${documentId} belongs to ${owner}.`,
      );
    }
    const document = ClinicalRecordRepository.documents(patientId).find((entry: any) => entry.id === documentId);
    if (!document) throw new Error(`Document not found for patient ${patientId}: ${documentId}`);

    return NextResponse.json({ success:true, events:documentWorkflowService.events(documentId, actor) });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.documentId || !validStatuses.has(body.toStatus)) {
      return NextResponse.json({ success:false, error:"documentId and a valid toStatus are required" }, { status:400 });
    }
    const result = await ClinicalActionGateway.execute({
      ...authenticatedClinicalRequest(req),
      action:{
        type:"transition_document_workflow",
        payload:{
          documentId:String(body.documentId),
          toStatus:body.toStatus as DocumentWorkflowStatus,
          note:typeof body.note === "string" ? body.note : undefined,
          supersededByDocumentId:typeof body.supersededByDocumentId === "string" ? body.supersededByDocumentId : undefined,
        },
      },
    });
    return NextResponse.json({ success:true, result });
  } catch (error) {
    return clinicalActionError(error);
  }
}
