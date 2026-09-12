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

type AdministrationKind = "related-person" | "care-network" | "coverage" | "pharmacy";

type AdministrationWrite = {
  kind: AdministrationKind;
  recordId?: string;
  values: Record<string, unknown>;
};

const KINDS: readonly AdministrationKind[] = ["related-person", "care-network", "coverage", "pharmacy"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as AdministrationWrite;

    if (!KINDS.includes(body.kind)) {
      return NextResponse.json(
        { success: false, error: `kind must be one of ${KINDS.join(", ")}` },
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
      const patch = body.values as never;
      const update =
        body.kind === "related-person"
          ? ({ type: "update_related_person", payload: { recordId: body.recordId, patch } } as const)
          : body.kind === "care-network"
            ? ({ type: "update_care_network_member", payload: { recordId: body.recordId, patch } } as const)
            : body.kind === "coverage"
              ? ({ type: "update_insurance", payload: { recordId: body.recordId, patch } } as const)
              // A pharmacy link is keyed by the pair, not by a record id, so the
              // "recordId" here is the pharmacy being re-prioritised or retired.
              : ({
                  type: "update_patient_pharmacy",
                  payload: { patientId: id, pharmacyId: body.recordId, patch },
                } as const);

      const record = await ClinicalActionGateway.execute({ ...request, action: update as never });
      return NextResponse.json({ success: true, record });
    }

    const payload = { ...body.values, patientId: id } as never;
    const create =
      body.kind === "related-person"
        ? ({ type: "add_related_person", payload } as const)
        : body.kind === "care-network"
          ? ({ type: "add_care_network_member", payload } as const)
          : body.kind === "coverage"
            ? ({ type: "add_insurance", payload } as const)
            : ({ type: "add_pharmacy", payload } as const);

    const record = await ClinicalActionGateway.execute({ ...request, action: create as never });
    return NextResponse.json({ success: true, record }, { status: 201 });
  } catch (error) {
    return clinicalActionError(error);
  }
}
