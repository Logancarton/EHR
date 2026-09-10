import { NextResponse } from "next/server";
import { assertPermission } from "../../../server/auth/provider-context";
import { ClinicalActionGateway } from "../../../server/actions/clinical-action-gateway";
import {
  authenticatedClinicalRequest,
  clinicalActionError,
  clinicalRequest,
} from "../../../server/http/clinical-http";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { actor, context, expectedPatientId } = authenticatedClinicalRequest(req, id);
    assertPermission(actor, "read_clinical");

    const patient = await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId,
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
      ...clinicalRequest(req, id),
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
