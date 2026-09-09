import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../server/actions/clinical-action-gateway";
import { assertPermission } from "../../server/auth/provider-context";
import {
  authenticatedClinicalRequest,
  clinicalActionError,
  clinicalRequest,
} from "../../server/http/clinical-http";
import { MessageRepository } from "../../server/repositories/message-repository";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId");
    const { actor } = authenticatedClinicalRequest(req, patientId || undefined);
    assertPermission(actor, "read_clinical");
    if (!patientId) {
      return NextResponse.json({ success: false, error: "patientId is required" }, { status: 400 });
    }

    const threads = MessageRepository.getThreadsByPatient(patientId);
    return NextResponse.json({ success: true, threads });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.patientId || !body.threadId || !body.content) {
      return NextResponse.json(
        { success: false, error: "patientId, threadId, and content are required" },
        { status: 400 },
      );
    }

    const message = await ClinicalActionGateway.execute({
      ...clinicalRequest(req),
      action: {
        type: "send_message",
        payload: {
          patientId: body.patientId,
          threadId: body.threadId,
          content: body.content,
          channel: body.channel || "portal",
        },
      },
    });

    return NextResponse.json({ success: true, message }, { status: 201 });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!body.threadId) {
      return NextResponse.json({ success: false, error: "threadId is required" }, { status: 400 });
    }

    await ClinicalActionGateway.execute({
      ...clinicalRequest(req),
      action: { type: "mark_message_read", payload: { threadId: body.threadId } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return clinicalActionError(error);
  }
}
