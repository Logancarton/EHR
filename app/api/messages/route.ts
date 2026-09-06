import { NextResponse } from "next/server";
import { MessageRepository } from "../../server/repositories/message-repository";
import { AuditRepository } from "../../server/repositories/audit-repository";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId");
    if (!patientId) {
      return NextResponse.json({ success: false, error: "patientId is required" }, { status: 400 });
    }

    const threads = MessageRepository.getThreadsByPatient(patientId);
    return NextResponse.json({ success: true, threads });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.patientId || !body.threadId || !body.content) {
      return NextResponse.json({ success: false, error: "patientId, threadId, and content are required" }, { status: 400 });
    }

    const newMessage = MessageRepository.addMessage({
      patientId: body.patientId,
      threadId: body.threadId,
      senderRole: body.senderRole || "provider",
      senderName: body.senderName || "Dr. Logan Carton, MD",
      content: body.content,
      channel: body.channel || "portal",
    });

    AuditRepository.log({
      eventType: "message_sent",
      patientId: body.patientId,
      description: `Sent clinical message in thread ${body.threadId} via ${newMessage.channel}.`,
      metadata: { messageId: newMessage.id, senderRole: newMessage.senderRole },
    });

    return NextResponse.json({ success: true, message: newMessage }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!body.threadId) {
      return NextResponse.json({ success: false, error: "threadId is required" }, { status: 400 });
    }

    MessageRepository.markRead(body.threadId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
