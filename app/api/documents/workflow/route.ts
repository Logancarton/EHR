import { NextResponse } from "next/server";
import { getProviderContext } from "../../../server/auth/provider-context";
import { ClinicalActionGateway } from "../../../server/actions/clinical-action-gateway";
import { clinicalActionError, clinicalRequest } from "../../../server/http/clinical-http";
import { documentWorkflowService } from "../../../server/services/document-workflow-service";
import type { DocumentWorkflowStatus } from "../../../server/repositories/document-workflow-repository";

const validStatuses = new Set<DocumentWorkflowStatus>(["received", "needs_review", "reviewed", "filed", "superseded"]);

export async function GET(req: Request) {
  try {
    const actor = getProviderContext(req);
    const documentId = new URL(req.url).searchParams.get("documentId");
    if (!documentId) return NextResponse.json({ success:false, error:"documentId is required" }, { status:400 });
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
      ...clinicalRequest(req),
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
