import { NextResponse } from "next/server";
import { EncounterRepository } from "../../../server/repositories/encounter-repository";
import { AuditRepository } from "../../../server/repositories/audit-repository";

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
    const body = await req.json();
    const signedBy = body.signedBy || "Dr. Logan Carton, MD";

    const signed = EncounterRepository.sign(id, signedBy);
    if (!signed) {
      return NextResponse.json({ success: false, error: "Encounter not found" }, { status: 404 });
    }

    AuditRepository.log({
      eventType: "note_signed",
      patientId: signed.patientId,
      description: `Officially signed and locked psychiatric encounter ${signed.id} into the legal medical record.`,
      metadata: {
        encounterId: signed.id,
        signedBy,
        cptCode: signed.cptCode,
        emLevel: signed.emLevel,
      },
    });

    return NextResponse.json({ success: true, encounter: signed });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
