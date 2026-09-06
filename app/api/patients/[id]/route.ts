import { NextResponse } from "next/server";
import { PatientRepository } from "../../../server/repositories/patient-repository";
import { AuditRepository } from "../../../server/repositories/audit-repository";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const patient = PatientRepository.getById(id);
    if (!patient) {
      return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
    }

    // HIPAA Audit: Log chart view event
    AuditRepository.log({
      eventType: "chart_opened",
      patientId: patient.id,
      description: `Viewed patient chart for ${patient.name} (MRN ${patient.mrn}).`,
    });

    return NextResponse.json({ success: true, patient });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = await req.json();
    const updated = PatientRepository.update(id, updates);
    if (!updated) {
      return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, patient: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
