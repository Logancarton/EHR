import { NextResponse } from "next/server";
import { AuditRepository, type AuditLogEntry } from "../../server/repositories/audit-repository";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit")) || 100;
    const patientId = searchParams.get("patientId") || undefined;

    const logs = AuditRepository.getRecent(limit, patientId);
    return NextResponse.json({ success: true, logs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.eventType || !body.description) {
      return NextResponse.json({ success: false, error: "eventType and description are required" }, { status: 400 });
    }

    const entry = AuditRepository.log({
      userId: body.userId || "dr-carton",
      userName: body.userName || "Dr. Logan Carton, MD",
      userRole: body.userRole || "Attending Physician",
      eventType: body.eventType,
      patientId: body.patientId,
      description: body.description,
      metadata: body.metadata || {},
    });

    return NextResponse.json({ success: true, log: entry }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
