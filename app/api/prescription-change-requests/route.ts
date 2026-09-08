import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../server/actions/clinical-action-gateway";
import { clinicalActionError, clinicalRequest } from "../../server/http/clinical-http";
import { prescriptionChangeRequestService } from "../../server/services/prescription-change-request-service";

export async function GET(req: Request) {
  try {
    const request = clinicalRequest(req);
    const patientId = request.expectedPatientId;
    if (!patientId) {
      return NextResponse.json(
        { success: false, error: "Prescription change-request reads require an active patient context." },
        { status: 400 },
      );
    }

    const changeRequestId = new URL(req.url).searchParams.get("changeRequestId");
    if (changeRequestId) {
      return NextResponse.json({
        success: true,
        changeRequest: prescriptionChangeRequestService.status(changeRequestId, patientId, request.actor),
      });
    }

    return NextResponse.json({
      success: true,
      changeRequests: prescriptionChangeRequestService.listStatus(patientId, request.actor),
    });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as {
      changeRequestId?: string;
      decision?: string;
    };

    if (!body.changeRequestId || typeof body.changeRequestId !== "string") {
      return NextResponse.json(
        { success: false, error: "changeRequestId is required." },
        { status: 400 },
      );
    }
    if (body.decision !== "accept" && body.decision !== "decline") {
      return NextResponse.json(
        { success: false, error: "decision must be accept or decline." },
        { status: 400 },
      );
    }

    const outcome = await ClinicalActionGateway.execute({
      action: {
        type: "respond_to_prescription_change_request",
        payload: { changeRequestId: body.changeRequestId, decision: body.decision },
      },
      ...clinicalRequest(req),
    });
    return NextResponse.json({ success: true, outcome });
  } catch (error) {
    return clinicalActionError(error);
  }
}
