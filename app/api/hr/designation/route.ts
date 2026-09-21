import { NextResponse } from "next/server";
import { getAuthenticatedProviderContext } from "../../../server/auth/provider-context";
import { HRService } from "../../../server/services/hr-service";
import { clinicalActionError } from "../../../server/http/clinical-http";
import { hrRequestBody, optionalHrString } from "../request-body";

/**
 * Grant or revoke the HR designation on one membership (D-086).
 *
 * Its own route rather than a field on the record write, because it changes who may
 * see personnel data rather than what a record holds. Owners and managers only — a
 * designated HR administrator cannot designate anyone else, and the service refuses
 * with a 403 rather than reporting a write that did not happen.
 */
export async function PATCH(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const body = await hrRequestBody(req, ["userId", "designated", "organizationId"]);

    const userId = optionalHrString(body.userId, "userId", 160);
    if (!userId) throw new Error("userId is required.");
    if (typeof body.designated !== "boolean") throw new Error("designated must be a boolean.");

    const result = HRService.setDesignation(actor, {
      userId,
      designated: body.designated,
      organizationId: optionalHrString(body.organizationId, "organizationId", 160),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return clinicalActionError(error);
  }
}
