import { NextResponse } from "next/server";
import { clinicalActionError, clinicalRequest } from "../../server/http/clinical-http";
import { patientPrescribingWorkspaceService } from "../../server/services/patient-prescribing-workspace-service";

export async function GET(req: Request) {
  try {
    const request = clinicalRequest(req);
    const patientId = request.expectedPatientId;
    if (!patientId) {
      return NextResponse.json(
        { success: false, error: "Patient prescribing workspace reads require an active patient context." },
        { status: 400 },
      );
    }

    const requestedPatientId = new URL(req.url).searchParams.get("patientId");
    if (requestedPatientId && requestedPatientId !== patientId) {
      return NextResponse.json(
        { success: false, error: `Patient binding mismatch: active chart expects ${patientId}, but the requested prescribing workspace is ${requestedPatientId}.` },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      workspace: await patientPrescribingWorkspaceService.project(patientId, request.actor),
    });
  } catch (error) {
    return clinicalActionError(error);
  }
}
