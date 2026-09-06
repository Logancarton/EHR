import { NextResponse } from "next/server";
import { assertPermission, getProviderContext } from "../../server/auth/provider-context";
import { ClinicalActionGateway, type ClinicalAction } from "../../server/actions/clinical-action-gateway";
import { ClinicalRecordRepository } from "../../server/repositories/clinical-record-repository";
import { clinicalRecordService } from "../../server/services/clinical-record-service";
import { clinicalActionError, clinicalRequest } from "../../server/http/clinical-http";

export async function GET(req: Request) {
  try {
    const actor = getProviderContext(req);
    assertPermission(actor, "read_clinical");
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId") || undefined;
    const entityType = searchParams.get("entityType") || undefined;
    const entityId = searchParams.get("entityId") || undefined;
    const encounterId = searchParams.get("encounterId") || undefined;
    const documentId = searchParams.get("documentId") || undefined;

    if (entityType && entityId) {
      return NextResponse.json({
        success: true,
        versions: ClinicalRecordRepository.versions(entityType, entityId),
        provenance: ClinicalRecordRepository.provenance(entityType, entityId),
      });
    }
    if (encounterId) {
      return NextResponse.json({ success:true, addenda:ClinicalRecordRepository.addenda(encounterId) });
    }
    if (documentId) {
      return NextResponse.json({ success:true, versions:ClinicalRecordRepository.documentVersions(documentId) });
    }
    if (!patientId) {
      return NextResponse.json({ success:false, error:"patientId is required" }, { status:400 });
    }
    return NextResponse.json({ success:true, record:clinicalRecordService.snapshot(patientId, actor) });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const allowed = new Set<ClinicalAction["type"]>([
      "add_allergy", "add_problem", "add_medication", "add_observation", "add_insurance",
      "add_pharmacy", "create_document", "revise_document", "acknowledge_result",
      "add_encounter_addendum",
    ]);
    if (!body?.type || !allowed.has(body.type)) {
      return NextResponse.json({ success:false, error:"Unsupported clinical record action" }, { status:400 });
    }
    const result = await ClinicalActionGateway.execute({
      ...clinicalRequest(req),
      action: { type:body.type, payload:body.payload || {} } as ClinicalAction,
    });
    return NextResponse.json({ success:true, result }, { status:201 });
  } catch (error) {
    return clinicalActionError(error);
  }
}
