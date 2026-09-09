import { NextResponse } from "next/server";
import { assertPermission } from "../../server/auth/provider-context";
import { ClinicalActionGateway, type ClinicalAction } from "../../server/actions/clinical-action-gateway";
import { validateClinicalRecordAction } from "../../server/actions/clinical-record-validation";
import { ClinicalRecordRepository } from "../../server/repositories/clinical-record-repository";
import { EncounterRepository } from "../../server/repositories/encounter-repository";
import { clinicalRecordService } from "../../server/services/clinical-record-service";
import {
  authenticatedClinicalRequest,
  clinicalActionError,
  clinicalRequest,
} from "../../server/http/clinical-http";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId") || undefined;
    const entityType = searchParams.get("entityType") || undefined;
    const entityId = searchParams.get("entityId") || undefined;
    const encounterId = searchParams.get("encounterId") || undefined;
    const documentId = searchParams.get("documentId") || undefined;
    const { actor } = authenticatedClinicalRequest(req, patientId);
    assertPermission(actor, "read_clinical");

    if (entityType && entityId) {
      if (!patientId) {
        return NextResponse.json({ success:false, error:"patientId is required for clinical record history" }, { status:400 });
      }
      const versions = ClinicalRecordRepository.versions(entityType, entityId);
      const provenance = ClinicalRecordRepository.provenance(entityType, entityId);
      const boundPatientIds = new Set(
        [...versions, ...provenance]
          .map((entry: any) => entry.patient_id)
          .filter((value: unknown): value is string => typeof value === "string" && Boolean(value)),
      );
      if ([...boundPatientIds].some((boundPatientId) => boundPatientId !== patientId)) {
        throw new Error(
          `Patient binding mismatch: active chart expects ${patientId}, but ${entityType} ${entityId} belongs to ${[...boundPatientIds][0]}.`,
        );
      }
      return NextResponse.json({ success:true, versions, provenance });
    }

    if (encounterId) {
      if (!patientId) {
        return NextResponse.json({ success:false, error:"patientId is required for encounter addenda" }, { status:400 });
      }
      const encounter = EncounterRepository.getById(encounterId);
      if (!encounter) throw new Error(`Encounter not found: ${encounterId}`);
      if (encounter.patientId !== patientId) {
        throw new Error(
          `Patient binding mismatch: active chart expects ${patientId}, but encounter ${encounterId} belongs to ${encounter.patientId}.`,
        );
      }
      return NextResponse.json({ success:true, addenda:ClinicalRecordRepository.addenda(encounterId) });
    }

    if (documentId) {
      if (!patientId) {
        return NextResponse.json({ success:false, error:"patientId is required for document versions" }, { status:400 });
      }
      const history = ClinicalRecordRepository.versions("document", documentId);
      const owner = history.find((entry: any) => typeof entry.patient_id === "string")?.patient_id;
      if (owner && owner !== patientId) {
        throw new Error(
          `Patient binding mismatch: active chart expects ${patientId}, but document ${documentId} belongs to ${owner}.`,
        );
      }
      const document = ClinicalRecordRepository.documents(patientId).find((entry: any) => entry.id === documentId);
      if (!document) throw new Error(`Document not found for patient ${patientId}: ${documentId}`);
      return NextResponse.json({ success:true, versions:ClinicalRecordRepository.documentVersions(documentId) });
    }

    if (!patientId) return NextResponse.json({ success:false, error:"patientId is required" }, { status:400 });
    return NextResponse.json({ success:true, record:clinicalRecordService.snapshot(patientId, actor) });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const allowed = new Set<ClinicalAction["type"]>([
      "add_allergy", "update_allergy",
      "add_problem", "update_problem",
      "add_medication", "update_medication",
      "add_observation",
      "add_insurance", "update_insurance",
      "add_pharmacy", "update_patient_pharmacy",
      "create_document", "revise_document",
      "acknowledge_result", "add_encounter_addendum",
    ]);
    if (!body?.type || !allowed.has(body.type)) {
      return NextResponse.json({ success:false, error:"Unsupported clinical record action" }, { status:400 });
    }

    const validatedAction = validateClinicalRecordAction(body);
    const action = validatedAction || { type:body.type, payload:body.payload || {} } as ClinicalAction;
    const result = await ClinicalActionGateway.execute({
      ...clinicalRequest(req),
      action,
    });
    return NextResponse.json({ success:true, result }, { status:201 });
  } catch (error) {
    return clinicalActionError(error);
  }
}
