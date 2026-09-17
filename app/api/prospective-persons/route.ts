import { NextResponse } from "next/server";
import { getAuthenticatedProviderContext } from "../../server/auth/provider-context";
import { clinicalActionError } from "../../server/http/clinical-http";
import { ProspectivePersonError, prospectivePersonService } from "../../server/services/prospective-person-service";

/**
 * The pre-chart identity stage (D-076): a tentative caller held as an
 * administrative record with no clinical chart until a human explicitly
 * promotes or links it. See `docs/DECISIONS.md` D-076.
 */
function prospectiveErrorResponse(error: unknown) {
  if (error instanceof ProspectivePersonError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  return clinicalActionError(error);
}

function executionContext(req: Request) {
  return { source: "api" as const, requestId: req.headers.get("x-request-id") || undefined };
}

export async function POST(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const body = await req.json();

    if (body.action === "find_duplicates") {
      const matches = prospectivePersonService.findPossibleDuplicates(actor, body.prospectiveId);
      return NextResponse.json({ success: true, matches });
    }

    if (body.action === "update") {
      const prospect = prospectivePersonService.update(actor, executionContext(req), {
        prospectiveId: body.prospectiveId,
        name: body.name,
        dob: body.dob,
        mobilePhone: body.mobilePhone,
        email: body.email,
      });
      return NextResponse.json({ success: true, prospect });
    }

    if (body.action === "promote") {
      const result = prospectivePersonService.promote(actor, executionContext(req), {
        prospectiveId: body.prospectiveId,
        mode: body.mode,
        existingPatientId: body.existingPatientId,
      });
      return NextResponse.json({ success: true, ...result });
    }

    const prospect = prospectivePersonService.create(
      { name: body.name, dob: body.dob, mobilePhone: body.mobilePhone, email: body.email },
      actor,
      executionContext(req),
    );
    return NextResponse.json({ success: true, prospect }, { status: 201 });
  } catch (error) {
    return prospectiveErrorResponse(error);
  }
}

export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    const prospect = prospectivePersonService.getById(actor, id);
    return NextResponse.json({ success: true, prospect });
  } catch (error) {
    return prospectiveErrorResponse(error);
  }
}
