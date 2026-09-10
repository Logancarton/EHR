import { NextResponse } from "next/server";
import { assertPermission } from "../../../server/auth/provider-context";
import { ClinicalActionGateway } from "../../../server/actions/clinical-action-gateway";
import { EncounterRepository } from "../../../server/repositories/encounter-repository";
import {
  authenticatedClinicalRequest,
  clinicalActionError,
  clinicalRequest,
} from "../../../server/http/clinical-http";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const encounter = EncounterRepository.getById(id);
    if (!encounter) {
      return NextResponse.json({ success: false, error: "Encounter not found" }, { status: 404 });
    }

    const { actor } = authenticatedClinicalRequest(req, encounter.patientId);
    assertPermission(actor, "read_clinical");

    return NextResponse.json({ success: true, encounter });
  } catch (error) {
    return clinicalActionError(error);
  }
}

async function signEncounter(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = EncounterRepository.getById(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Encounter not found" }, { status: 404 });
    }

    const signed = await ClinicalActionGateway.execute({
      ...clinicalRequest(req, existing.patientId),
      action: {
        type: "sign_encounter",
        payload: { encounterId: id },
      },
    });

    return NextResponse.json({ success: true, encounter: signed });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export const POST = signEncounter;
export const PATCH = signEncounter;
