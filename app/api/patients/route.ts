import { NextResponse } from "next/server";
import { PatientRepository } from "../../server/repositories/patient-repository";
import { AuditRepository } from "../../server/repositories/audit-repository";

export async function GET() {
  try {
    const list = PatientRepository.getAll();
    return NextResponse.json({ success: true, patients: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.name || !body.dob || !body.mrn) {
      return NextResponse.json({ success: false, error: "Name, DOB, and MRN are required" }, { status: 400 });
    }

    const initials = body.initials || body.name.split(" ").map((n: string) => n[0]).join("").toUpperCase();
    const created = PatientRepository.create({
      id: body.id || `pt-${Date.now()}`,
      name: body.name,
      initials,
      dob: body.dob,
      age: Number(body.age) || 30,
      pronouns: body.pronouns || "they/them",
      mrn: body.mrn,
      status: body.status || "New Patient",
      alert: body.alert,
      allergies: body.allergies || ["NKDA"],
      diagnoses: body.diagnoses || [],
      meds: body.meds || [],
      vitals: body.vitals || {},
      lastVisit: "Initial Intake",
      nextVisit: body.nextVisit || "Scheduled",
    });

    AuditRepository.log({
      eventType: "chart_opened",
      patientId: created.id,
      description: `Created new patient chart for ${created.name} (MRN ${created.mrn}).`,
    });

    return NextResponse.json({ success: true, patient: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
