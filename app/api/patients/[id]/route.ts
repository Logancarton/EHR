import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../../server/actions/clinical-action-gateway";
import { clinicalActionError, clinicalRequest } from "../../../server/http/clinical-http";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const patient = await ClinicalActionGateway.execute({
      ...clinicalRequest(req),
      action: { type: "open_patient_chart", payload: { patientId: id } },
    });

    return NextResponse.json({ success: true, patient });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const updates = await req.json();

    const patient = await ClinicalActionGateway.execute({
      ...clinicalRequest(req),
      action: {
        type: "update_patient",
        payload: { patientId: id, updates },
      },
    });

    return NextResponse.json({ success: true, patient });
  } catch (error) {
    return clinicalActionError(error);
  }
}
