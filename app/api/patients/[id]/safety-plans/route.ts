import { NextResponse } from "next/server";
import { authenticatedClinicalRequest, clinicalActionError } from "../../../../server/http/clinical-http";
import { SafetyPlanError, safetyPlanService } from "../../../../server/services/safety-plan-service";

/** Finalizes a patient's safety-plan draft into a reviewed plan (D-129). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { actor, context } = authenticatedClinicalRequest(req, id);
    const body = (await req.json()) as { draftDocumentId?: string; answers?: unknown };
    const result = safetyPlanService.finalize(actor, context, {
      patientId: id,
      draftDocumentId: String(body.draftDocumentId ?? ""),
      answers: body.answers,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof SafetyPlanError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    return clinicalActionError(error);
  }
}
