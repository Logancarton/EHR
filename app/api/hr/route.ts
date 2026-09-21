import { NextResponse } from "next/server";
import { getAuthenticatedProviderContext } from "../../server/auth/provider-context";
import { HRService } from "../../server/services/hr-service";
import { clinicalActionError } from "../../server/http/clinical-http";

/**
 * A member's own HR record (D-086).
 *
 * Open to every authenticated member with no permission check, because the record
 * this returns is always theirs. `userId` narrows to someone else's record, and the
 * service refuses that unless the caller is an owner, manager, or designated HR
 * administrator — the refusal is a 403, never an empty record.
 */
export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const url = new URL(req.url);
    const requestedUserId = url.searchParams.get("userId")?.trim();
    const organizationId = url.searchParams.get("organizationId")?.trim() || undefined;

    if (requestedUserId && requestedUserId !== actor.userId) {
      const result = HRService.recordForMember(actor, requestedUserId, organizationId);
      return NextResponse.json({
        success: true,
        organizationId: result.organizationId,
        userId: requestedUserId,
        record: result.record,
        canReadOthers: HRService.canReadOthers(actor),
      });
    }

    return NextResponse.json({ success: true, ...HRService.ownRecord(actor, organizationId) });
  } catch (error) {
    return clinicalActionError(error);
  }
}
