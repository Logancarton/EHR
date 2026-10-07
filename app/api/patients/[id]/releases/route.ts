import { NextResponse } from "next/server";
import { authenticatedClinicalRequest, clinicalActionError } from "../../../../server/http/clinical-http";
import {
  ReleaseAuthorizationError,
  releaseAuthorizationService,
} from "../../../../server/services/release-authorization-service";

/** This chart's releases of information (D-129): list, and record a revocation. */
function errorResponse(error: unknown) {
  if (error instanceof ReleaseAuthorizationError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  return clinicalActionError(error);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { actor } = authenticatedClinicalRequest(req, id);
    return NextResponse.json({ success: true, releases: releaseAuthorizationService.list(actor, id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { actor, context } = authenticatedClinicalRequest(req, id);
    const body = (await req.json()) as { action?: string; releaseId?: string; note?: string };
    if (body.action !== "revoke") return NextResponse.json({ success: false, error: "Unsupported action." }, { status: 400 });
    const release = releaseAuthorizationService.revoke(actor, context, {
      patientId: id,
      releaseId: String(body.releaseId ?? ""),
      note: String(body.note ?? ""),
    });
    return NextResponse.json({ success: true, release });
  } catch (error) {
    return errorResponse(error);
  }
}
