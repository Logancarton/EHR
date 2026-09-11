import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../../../server/actions/clinical-action-gateway";
import { assertPatientAccess } from "../../../../server/auth/patient-access";
import {
  authenticatedClinicalRequest,
  clinicalActionError,
  clinicalRequest,
} from "../../../../server/http/clinical-http";
import { patientAdministrationService } from "../../../../server/services/patient-administration-service";

/**
 * The administrative record for one chart: identity, contact, related people and
 * the outside care network, in a single read the editor can open with.
 *
 * Writes go through `ClinicalActionGateway` like every other consequential change,
 * so patient binding, access and audit are enforced in one place rather than here.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { actor, context } = authenticatedClinicalRequest(req, id);
    assertPatientAccess(actor, id);
    const record = patientAdministrationService.read(id, actor, context);
    return NextResponse.json({ success: true, record });
  } catch (error) {
    return clinicalActionError(error);
  }
}

type AdministrationWrite =
  | { kind: "related-person"; recordId?: string; values: Record<string, unknown> }
  | { kind: "care-network"; recordId?: string; values: Record<string, unknown> };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as AdministrationWrite;

    if (body.kind !== "related-person" && body.kind !== "care-network") {
      return NextResponse.json(
        { success: false, error: "kind must be 'related-person' or 'care-network'" },
        { status: 400 },
      );
    }
    if (!body.values || typeof body.values !== "object") {
      return NextResponse.json({ success: false, error: "values are required" }, { status: 400 });
    }

    const request = clinicalRequest(req, id);

    // An update names an existing row; the gateway resolves its patient from that row
    // rather than from the URL, so a mismatched pair is rejected rather than applied.
    if (body.recordId) {
      const record = await ClinicalActionGateway.execute({
        ...request,
        action:
          body.kind === "related-person"
            ? { type: "update_related_person", payload: { recordId: body.recordId, patch: body.values as never } }
            : { type: "update_care_network_member", payload: { recordId: body.recordId, patch: body.values as never } },
      });
      return NextResponse.json({ success: true, record });
    }

    const record = await ClinicalActionGateway.execute({
      ...request,
      action:
        body.kind === "related-person"
          ? { type: "add_related_person", payload: { ...body.values, patientId: id } as never }
          : { type: "add_care_network_member", payload: { ...body.values, patientId: id } as never },
    });
    return NextResponse.json({ success: true, record }, { status: 201 });
  } catch (error) {
    return clinicalActionError(error);
  }
}
