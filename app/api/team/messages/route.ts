import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../../server/actions/clinical-action-gateway";
import { collaborationService } from "../../../server/services/collaboration-service";
import { clinicalActionError, clinicalRequest } from "../../../server/http/clinical-http";

export async function GET(req: Request) {
  try {
    const { actor } = clinicalRequest(req);
    const { searchParams } = new URL(req.url);
    const partnerId = searchParams.get("partnerId");
    if (!partnerId) {
      return NextResponse.json({ success: false, error: "partnerId is required" }, { status: 400 });
    }

    const messages = collaborationService.conversation(partnerId, actor);
    return NextResponse.json({ success: true, messages });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // A patient-linked item names its chart; the binding (and its access check)
    // must reach the gateway, which refuses a patient-bound action without it.
    // It was dropped here, so linking a patient always failed.
    const { actor, context, expectedPatientId } = clinicalRequest(req, body.patientId || undefined);
    if (!body.partnerId || !body.content) {
      return NextResponse.json(
        { success: false, error: "partnerId and content are required" },
        { status: 400 },
      );
    }

    const message = await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId,
      action: {
        type: "team_send_message",
        payload: {
          partnerId: body.partnerId,
          content: body.content,
          patientId: body.patientId || undefined,
        },
      },
    });

    return NextResponse.json({ success: true, message }, { status: 201 });
  } catch (error) {
    return clinicalActionError(error);
  }
}
