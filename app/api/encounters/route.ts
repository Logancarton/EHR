import { NextResponse } from "next/server";
import { EncounterRepository } from "../../server/repositories/encounter-repository";
import { AuditRepository } from "../../server/repositories/audit-repository";

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

    const saved = EncounterRepository.saveDraft(body);

    AuditRepository.log({
      eventType: "note_drafted",
      patientId: saved.patientId,
      description: `Autosaved draft progress note for encounter ${saved.id} (${saved.type}).`,
      metadata: { encounterId: saved.id, emLevel: saved.emLevel, cptCode: saved.cptCode },
    });

    return NextResponse.json({ success: true, encounter: saved }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
