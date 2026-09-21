import { NextResponse } from "next/server";
import { getAuthenticatedProviderContext } from "../../../server/auth/provider-context";
import { HRService } from "../../../server/services/hr-service";
import { clinicalActionError } from "../../../server/http/clinical-http";

/**
 * Every member's HR record (D-086).
 *
 * Owners, managers, and designated HR personnel only. This is the surface the old
 * fixture roster showed to anyone who opened the module; an unauthorized caller now
 * gets a 403 rather than a directory.
 */
export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const url = new URL(req.url);
    const organizationId = url.searchParams.get("organizationId")?.trim() || undefined;
    return NextResponse.json({ success: true, ...HRService.directory(actor, organizationId) });
  } catch (error) {
    return clinicalActionError(error);
  }
}
