import { NextResponse } from "next/server";
import { getAuthenticatedProviderContext } from "../../server/auth/provider-context";
import { HRService } from "../../server/services/hr-service";
import { clinicalActionError } from "../../server/http/clinical-http";
import { hrRequestBody, optionalHrString } from "./request-body";

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

/**
 * Set up or correct a member's HR record (D-086).
 *
 * The record has to exist before anything can be assigned into it, so this is the
 * first act of HR administration for a new employee. `manage_hr` — owners, managers,
 * and a designated HR administrator — enforced in the service, not here.
 */
export async function POST(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const body = await hrRequestBody(req, ["userId", "employmentType", "startedOn", "organizationId"]);

    const userId = optionalHrString(body.userId, "userId", 160);
    if (!userId) throw new Error("userId is required.");

    const result = HRService.assignRecord(actor, {
      userId,
      employmentType: optionalHrString(body.employmentType, "employmentType", 200),
      startedOn: optionalHrString(body.startedOn, "startedOn", 10) ?? null,
      organizationId: optionalHrString(body.organizationId, "organizationId", 160),
    });
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    return clinicalActionError(error);
  }
}
