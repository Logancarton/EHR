import { NextResponse } from "next/server";
import { assertPermission, getAuthenticatedProviderContext } from "../../server/auth/provider-context";
import { AuditRepository } from "../../server/repositories/audit-repository";
import { clinicalActionError } from "../../server/http/clinical-http";

export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    assertPermission(actor, "read_clinical");

    const { searchParams } = new URL(req.url);
    const requestedLimit = Number(searchParams.get("limit") || 100);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 500) {
      return NextResponse.json(
        { success: false, error: "limit must be an integer between 1 and 500" },
        { status: 400 },
      );
    }
    const patientId = searchParams.get("patientId") || undefined;
    const logs = AuditRepository.getRecent(requestedLimit, patientId);
    return NextResponse.json({ success: true, logs });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    assertPermission(actor, "read_clinical");

    // Authoritative audit events are emitted at server workflow/service boundaries.
    // A generic client endpoint cannot truthfully assert that a note was signed,
    // an order was transmitted, or any other consequential event occurred.
    return NextResponse.json(
      {
        success: false,
        error: "Generic audit writes are disabled; authoritative workflows emit audit events on the server.",
      },
      { status: 405, headers: { Allow: "GET" } },
    );
  } catch (error) {
    return clinicalActionError(error);
  }
}
