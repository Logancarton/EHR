import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../../server/actions/clinical-action-gateway";
import { chartCommunicationService } from "../../../server/services/chart-communication-service";
import { authenticatedClinicalRequest, clinicalActionError } from "../../../server/http/clinical-http";
import { assertPermission } from "../../../server/auth/provider-context";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId");
    if (!patientId) {
      return NextResponse.json({ success: false, error: "patientId is required" }, { status: 400 });
    }
    const { actor } = authenticatedClinicalRequest(req, patientId);
    assertPermission(actor, "read_clinical");
    return NextResponse.json({
      success: true,
      communications: chartCommunicationService.list(patientId, actor),
    });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.patientId || !body.threadId || !body.mode) {
      return NextResponse.json(
        { success: false, error: "patientId, threadId, and mode are required" },
        { status: 400 },
      );
    }
    if (!["message", "conversation", "summary"].includes(body.mode)) {
      return NextResponse.json({ success: false, error: "Unsupported charting mode" }, { status: 400 });
    }

    const clinicalReq = authenticatedClinicalRequest(req, body.patientId);

    const communication = await ClinicalActionGateway.execute({
      ...clinicalReq,
      action: {
        type: "save_message_to_chart",
        payload: {
          patientId: body.patientId,
          threadId: body.threadId,
          mode: body.mode,
          messageId: body.messageId,
          summaryText: body.summaryText,
        },
      },
    });

    return NextResponse.json({ success: true, communication }, { status: 201 });
  } catch (error) {
    return clinicalActionError(error);
  }
}
