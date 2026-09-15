import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../server/actions/clinical-action-gateway";
import { getAuthenticatedProviderContext } from "../../server/auth/provider-context";
import { authenticatedClinicalRequest, clinicalActionError } from "../../server/http/clinical-http";
import { BillingRepository } from "../../server/repositories/billing-repository";
import { billingService } from "../../server/services/billing-service";

/**
 * The billing surface's only data source (roadmap P9-0).
 *
 * Every row a clinician sees comes from here, scoped by the caller's own
 * organization membership and patient access. The screen holds no seeded claims
 * and cannot invent one, which is the containment half of P9-0; the
 * authorization happens in `billingService`, so rows and totals are refused
 * together rather than separately.
 */
export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const { searchParams } = new URL(req.url);
    const requestedDays = Number(searchParams.get("periodDays") || 30);
    const periodDays = Number.isFinite(requestedDays) ? Math.max(1, Math.min(requestedDays, 365)) : 30;

    return NextResponse.json({ success: true, ...billingService.worklist(actor, { periodDays }) });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const operation = typeof body?.operation === "string" ? body.operation : "";

    if (operation === "prepare") {
      if (!body?.encounterId) {
        return NextResponse.json({ success: false, error: "encounterId is required" }, { status: 400 });
      }
      const result = await ClinicalActionGateway.execute({
        ...authenticatedClinicalRequest(req, typeof body.patientId === "string" ? body.patientId : undefined),
        action: { type: "prepare_billing_charge", payload: { encounterId: String(body.encounterId) } },
      });
      return NextResponse.json({ success: true, charge: result });
    }

    if (operation === "review" || operation === "void") {
      if (!body?.chargeId) {
        return NextResponse.json({ success: false, error: "chargeId is required" }, { status: 400 });
      }
      // The charge's own record decides which chart this belongs to. Trusting a
      // client-supplied patient id here would let a stale screen bind a financial
      // action to the wrong patient.
      const charge = BillingRepository.getById(String(body.chargeId));
      if (!charge) {
        return NextResponse.json({ success: false, error: `Billing charge not found: ${body.chargeId}` }, { status: 404 });
      }

      const expectedVersion = Number.isFinite(Number(body.expectedVersion))
        ? Number(body.expectedVersion)
        : undefined;

      if (operation === "void" && typeof body.reason !== "string") {
        return NextResponse.json({ success: false, error: "reason is required to void a charge" }, { status: 400 });
      }

      const result = await ClinicalActionGateway.execute({
        ...authenticatedClinicalRequest(req, charge.patientId),
        action:
          operation === "review"
            ? {
                type: "review_billing_charge",
                payload: {
                  chargeId: charge.id,
                  note: typeof body.note === "string" ? body.note : undefined,
                  expectedVersion,
                },
              }
            : {
                type: "void_billing_charge",
                payload: { chargeId: charge.id, reason: String(body.reason), expectedVersion },
              },
      });
      return NextResponse.json({ success: true, charge: result });
    }

    if (operation === "submit") {
      // Present on purpose. A screen that offers submission must get a refusal
      // that names the reason, not a 404 that looks like a bug — and nothing is
      // written on the way out.
      const actor = getAuthenticatedProviderContext(req);
      billingService.submitClaim(String(body?.chargeId || ""), actor);
    }

    return NextResponse.json(
      { success: false, error: "operation must be prepare, review, void, or submit" },
      { status: 400 },
    );
  } catch (error) {
    return clinicalActionError(error);
  }
}
