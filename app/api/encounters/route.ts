import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../server/actions/clinical-action-gateway";
import { assertPermission } from "../../server/auth/provider-context";
import { EncounterRepository } from "../../server/repositories/encounter-repository";
import { clinicalActionError, clinicalRequest } from "../../server/http/clinical-http";

export async function GET(req: Request) {
  try {
    const { actor } = clinicalRequest(req);
    assertPermission(actor, "read_clinical");

    const url = new URL(req.url);
    const patientId = url.searchParams.get("patientId");
    if (!patientId) {
      return NextResponse.json(
        { success: false, error: "patientId is required" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      encounters: EncounterRepository.getByPatient(patientId),
    });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.patientId) {
      return NextResponse.json(
        { success: false, error: "patientId is required" },
        { status: 400 },
      );
    }

    const { actor, context, expectedPatientId } = clinicalRequest(req, body.patientId);
    if (body.expectedActorId && body.expectedActorId !== actor.userId) {
      return NextResponse.json(
        {
          success: false,
          error: `Actor binding mismatch: queued encounter save belongs to ${body.expectedActorId}, not the current session.`,
        },
        { status: 409 },
      );
    }

    const { expectedActorId: _expectedActorId, ...draftPayload } = body;
    const saved = await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId,
      action: { type: "save_encounter_draft", payload: draftPayload },
    });

    return NextResponse.json({ success: true, encounter: saved });
  } catch (error) {
    return clinicalActionError(error);
  }
}
