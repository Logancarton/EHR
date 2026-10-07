import { NextResponse } from "next/server";
import { authenticatedClinicalRequest, clinicalActionError } from "../../../../server/http/clinical-http";
import { IntakeError, intakeService } from "../../../../server/services/intake-service";
import { IntakeRepository } from "../../../../server/repositories/intake-repository";
import {
  REMOTE_ASSESSMENT_INSTRUMENTS,
  REMOTE_ASSESSMENT_LABELS,
} from "../../../../domain/patient-form-requests";

/**
 * Forms a clinician asks this patient to complete before a visit.
 *
 * GET lists what can be requested (the self-report scales a patient may complete
 * alone and the active consent templates) and the requests already sent. POST
 * records a request in a new message thread and returns the patient's link once
 * (it is never stored), or with `action: "revoke"` stops an open link.
 */

function errorResponse(error: unknown) {
  if (error instanceof IntakeError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  return clinicalActionError(error);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { actor } = authenticatedClinicalRequest(req, id);
    return NextResponse.json({
      success: true,
      requests: intakeService.listPatientFormRequests(actor, id),
      assessments: REMOTE_ASSESSMENT_INSTRUMENTS.map((instrument) => ({
        instrument,
        label: REMOTE_ASSESSMENT_LABELS[instrument],
      })),
      consents: IntakeRepository.listActiveConsentTemplates().map((t) => ({
        templateId: t.id,
        title: t.title,
        category: t.category,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { actor, context } = authenticatedClinicalRequest(req, id);
    const body = (await req.json()) as { action?: string; invitationId?: string; items?: unknown; releases?: unknown; ttlDays?: number; note?: string };
    if (body.action === "revoke") {
      const request = intakeService.revokePatientFormRequest(actor, context, { patientId: id, invitationId: String(body.invitationId ?? "") });
      return NextResponse.json({ success: true, request });
    }
    const result = intakeService.requestPatientForms(actor, context, {
      patientId: id,
      items: body.items,
      releases: body.releases,
      ttlDays: body.ttlDays,
      note: body.note,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
