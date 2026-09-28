import { NextResponse } from "next/server";
import { getAuthenticatedProviderContext, assertPermission, hasPermission } from "../../../server/auth/provider-context";
import { clinicalActionError } from "../../../server/http/clinical-http";
import { IntakeRepository } from "../../../server/repositories/intake-repository";
import { intakeService } from "../../../server/services/intake-service";

/** The active form templates' schema, for rendering the generic intake-form fill
 * UI. Reads only template shape — never a patient's submitted answers. */
export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    if (!hasPermission(actor, "edit_patient")) assertPermission(actor, "read_clinical");
    return NextResponse.json({ success: true, templates: IntakeRepository.listActiveFormTemplates() });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    assertPermission(actor, "edit_patient");
    const body = await req.json();
    const context = { source: "api" as const, requestId: req.headers.get("x-request-id") || undefined };
    const template = intakeService.createFormTemplate(actor, context, {
      title: body.title,
      category: body.category,
      sections: body.sections,
      active: body.active,
    });
    return NextResponse.json({ success: true, template });
  } catch (error) {
    return clinicalActionError(error);
  }
}
