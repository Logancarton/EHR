import { NextResponse } from "next/server";
import { getProviderContext } from "../../server/auth/provider-context";
import { ClinicalActionGateway } from "../../server/actions/clinical-action-gateway";
import { EncounterRepository } from "../../server/repositories/encounter-repository";

function mutationError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown clinical action error";
  const status = message.includes("lacks permission")
    ? 403
    : message.includes("not found")
      ? 404
      : 400;

  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId");
    if (!patientId) {
      return NextResponse.json({ success: false, error: "patientId query parameter is required" }, { status: 400 });
    }

    const encounters = EncounterRepository.getByPatient(patientId);
    return NextResponse.json({ success: true, encounters });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.patientId) {
      return NextResponse.json({ success: false, error: "patientId is required" }, { status: 400 });
    }

    const saved = await ClinicalActionGateway.execute({
      actor: getProviderContext(req),
      context: {
        source: "api",
        requestId: req.headers.get("x-request-id") || undefined,
      },
      action: {
        type: "save_encounter_draft",
        payload: body,
      },
    });

    return NextResponse.json({ success: true, encounter: saved }, { status: 200 });
  } catch (error) {
    return mutationError(error);
  }
}
