import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../server/actions/clinical-action-gateway";
import { assertPermission, hasPermission } from "../../server/auth/provider-context";
import { isProspectivePersonId } from "../../lib/schedule-data";
import { accessiblePatientIds } from "../../server/auth/patient-access";
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
    // An intake contact has no chart. Their conversation is front-door
    // administrative work (D-074, D-076), so whoever may write to them — front
    // desk included — may read it. A chart's conversation is clinical and still
    // needs `read_clinical` (D-051).
    const intakeConversation = Boolean(patientId && isProspectivePersonId(patientId));
    if (!(intakeConversation && hasPermission(actor, "send_message"))) {
      assertPermission(actor, "read_clinical");
    }
    if (patientId) {
      const threads = MessageRepository.getThreadsByPatient(patientId);
      return NextResponse.json({ success: true, threads });
    }

    // The practice-wide list is scoped to the charts this clinician may reach —
    // their organizations and, for assigned-scope members, their assignments —
    // exactly as the roster and practice queues are. It was unscoped.
    const threads = MessageRepository.getAllThreads(accessiblePatientIds(actor));
    return NextResponse.json({ success: true, threads });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.isNewThread || !body.threadId) {
      if (!body.patientId || !body.subject || !body.content) {
        return NextResponse.json(
          { success: false, error: "patientId, subject, and content are required to start a new thread" },
          { status: 400 },
        );
      }

      const thread = await ClinicalActionGateway.execute({
        ...clinicalRequest(req),
        action: {
          type: "create_message_thread",
          payload: {
            patientId: body.patientId,
            subject: body.subject,
            category: body.category || "general",
            urgency: body.urgency || "routine",
            content: body.content,
            channel: body.channel || "portal",
            attachments: body.attachments,
          },
        },
      });

      return NextResponse.json({ success: true, thread }, { status: 201 });
    }

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
          attachments: body.attachments,
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
