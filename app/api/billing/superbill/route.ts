import { NextResponse } from "next/server";
import { getAuthenticatedProviderContext } from "../../../server/auth/provider-context";
import { clinicalActionError } from "../../../server/http/clinical-http";
import { billingService } from "../../../server/services/billing-service";

/**
 * A superbill for one reviewed charge (BILL-3).
 *
 * The charge's own record decides the patient; a client-supplied patient id is
 * never trusted to bind a financial document. Generation is audited in the
 * service, and a refusal (unreviewed or void charge) is a 409 that writes nothing.
 */
export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const chargeId = new URL(req.url).searchParams.get("chargeId")?.trim();
    if (!chargeId) {
      return NextResponse.json({ success: false, error: "chargeId is required" }, { status: 400 });
    }
    const superbill = billingService.superbill(chargeId, actor, {
      source: "api",
      requestId: req.headers.get("x-request-id") || undefined,
    });
    return NextResponse.json({ success: true, superbill });
  } catch (error) {
    return clinicalActionError(error);
  }
}
