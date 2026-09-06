import { NextResponse } from "next/server";
import { getProviderContext } from "../../../server/auth/provider-context";
import { ClinicalActionGateway } from "../../../server/actions/clinical-action-gateway";
import { EncounterRepository } from "../../../server/repositories/encounter-repository";

function mutationError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown clinical action error";
  const status = message.includes("lacks permission")
    ? 403
    : message.includes("not found")
      ? 404
      : 400;

  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const encounter = EncounterRepository.getById(id);
    if (!encounter) {
      return NextResponse.json({ success: false, error: "Encounter not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, encounter });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const signed = await ClinicalActionGateway.execute({
      actor: getProviderContext(req),
      context: {
        source: "api",
        requestId: req.headers.get("x-request-id") || undefined,
      },
      action: {
        type: "sign_encounter",
        payload: { encounterId: id },
      },
    });

    return NextResponse.json({ success: true, encounter: signed });
  } catch (error) {
    return mutationError(error);
  }
}
