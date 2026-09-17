import { NextResponse } from "next/server";
import { getAuthenticatedProviderContext, assertPermission, hasPermission } from "../../../server/auth/provider-context";
import { clinicalActionError } from "../../../server/http/clinical-http";
import { IntakeRepository } from "../../../server/repositories/intake-repository";

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
