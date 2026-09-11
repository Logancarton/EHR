import { NextResponse } from "next/server";
import { getAuthenticatedProviderContext } from "../../../server/auth/provider-context";
import {
  WorkspaceTemplateError,
  WorkspaceTemplateService,
} from "../../../server/services/workspace-template-service";
import { clinicalActionError } from "../../../server/http/clinical-http";

/**
 * The practice's shared workspace layouts.
 *
 * GET is open to every active member — these are the defaults a clinician
 * returns to, not an administrative screen. PUT and DELETE are restricted to an
 * owner or manager inside the service, so a provider can read the practice's
 * layouts but never rewrite what everyone else sees.
 */

function templateError(error: unknown) {
  if (error instanceof WorkspaceTemplateError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  return clinicalActionError(error);
}

export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId") || undefined;
    return NextResponse.json({ success: true, ...WorkspaceTemplateService.list(actor, organizationId) });
  } catch (error) {
    return templateError(error);
  }
}

export async function PUT(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "A template object is required." }, { status: 400 });
    }
    const template = WorkspaceTemplateService.save(actor, body);
    return NextResponse.json({ success: true, template });
  } catch (error) {
    return templateError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "A template id is required." }, { status: 400 });
    }
    WorkspaceTemplateService.remove(actor, id, searchParams.get("organizationId") || undefined);
    return NextResponse.json({ success: true });
  } catch (error) {
    return templateError(error);
  }
}
