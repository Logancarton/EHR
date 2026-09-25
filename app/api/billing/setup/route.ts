import { NextResponse } from "next/server";
import { getAuthenticatedProviderContext } from "../../../server/auth/provider-context";
import { clinicalActionError } from "../../../server/http/clinical-http";
import { billingSetupService } from "../../../server/services/billing-setup-service";
import { builtInTemplates } from "../../../lib/encounter-engine";

/**
 * Practice billing setup (D-101): profile, provider identifiers, charge templates
 * and the fee schedule.
 *
 * Reads require financial access; writes require practice administration. The
 * service decides both, so this route only shapes requests. A validation refusal
 * is a 400 that names the field, and nothing is written on the way out.
 */
function context(req: Request) {
  return { source: "api" as const, requestId: req.headers.get("x-request-id") || undefined };
}

function setupError(error: unknown) {
  if (error instanceof Error && error.name === "BillingSetupValidationError") {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
  return clinicalActionError(error);
}

export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    return NextResponse.json({ success: true, setup: billingSetupService.view(actor) });
  } catch (error) {
    return setupError(error);
  }
}

export async function POST(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const operation = typeof body.operation === "string" ? body.operation : "";
    const ctx = context(req);

    switch (operation) {
      case "save-profile":
        billingSetupService.saveProfile(actor, ctx, body);
        break;
      case "save-provider":
        billingSetupService.saveProvider(actor, ctx, body);
        break;
      case "save-charge-template":
        billingSetupService.saveChargeTemplate(actor, ctx, body);
        break;
      case "create-starter-templates":
        billingSetupService.createStarterTemplates(actor, ctx, builtInTemplates);
        break;
      case "save-fee":
        billingSetupService.saveFee(actor, ctx, body);
        break;
      case "remove-fee":
        billingSetupService.removeFee(actor, ctx, body);
        break;
      default:
        return NextResponse.json(
          {
            success: false,
            error:
              "operation must be save-profile, save-provider, save-charge-template, create-starter-templates, save-fee, or remove-fee",
          },
          { status: 400 },
        );
    }

    return NextResponse.json({ success: true, setup: billingSetupService.view(actor) });
  } catch (error) {
    return setupError(error);
  }
}
