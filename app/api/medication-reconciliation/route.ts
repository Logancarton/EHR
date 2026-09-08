import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../server/actions/clinical-action-gateway";
import { validateMedicationReconciliationAction } from "../../server/actions/medication-reconciliation-validation";
import { clinicalActionError, clinicalRequest } from "../../server/http/clinical-http";
import { medicationReconciliationService } from "../../server/services/medication-reconciliation-service";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId") || undefined;
    if (!patientId) {
      return NextResponse.json({ success: false, error: "patientId is required" }, { status: 400 });
    }

    const request = clinicalRequest(req);
    if (!request.expectedPatientId) {
      throw new Error("Patient-bound medication reconciliation read requires active patient context.");
    }
    if (request.expectedPatientId !== patientId) {
      throw new Error(
        `Patient binding mismatch: active chart expects ${request.expectedPatientId}, but medication candidates were requested for ${patientId}.`,
      );
    }

    return NextResponse.json({
      success: true,
      candidates: medicationReconciliationService.list(patientId, request.actor),
      reviews: medicationReconciliationService.review(patientId, request.actor),
    });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const allowed = new Set([
      "record_medication_candidate",
      "edit_medication_candidate",
      "reconcile_medication_candidate",
    ]);
    if (!body?.type || !allowed.has(body.type)) {
      return NextResponse.json({ success: false, error: "Unsupported medication reconciliation action" }, { status: 400 });
    }

    const action = validateMedicationReconciliationAction(body);
    if (!action) {
      return NextResponse.json({ success: false, error: "Invalid medication reconciliation action" }, { status: 400 });
    }

    const request = clinicalRequest(req);
    if (action.type === "edit_medication_candidate") {
      if (!request.expectedPatientId) {
        throw new Error("Patient-bound medication candidate edit requires active patient context.");
      }
      const result = medicationReconciliationService.editCandidate(
        action.payload,
        request.actor,
        request.context,
        request.expectedPatientId,
      );
      return NextResponse.json({ success: true, result }, { status: 201 });
    }

    const result = await ClinicalActionGateway.execute({
      ...request,
      action,
    });
    return NextResponse.json({ success: true, result }, { status: 201 });
  } catch (error) {
    return clinicalActionError(error);
  }
}
