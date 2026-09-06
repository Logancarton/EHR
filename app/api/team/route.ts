import { NextResponse } from "next/server";
import { collaborationService } from "../../server/services/collaboration-service";
import { clinicalActionError, clinicalRequest } from "../../server/http/clinical-http";

export async function GET(req: Request) {
  try {
    const { actor } = clinicalRequest(req);
    const team = collaborationService.snapshot(actor);
    return NextResponse.json({ success: true, team });
  } catch (error) {
    return clinicalActionError(error);
  }
}
