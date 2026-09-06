import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../server/actions/clinical-action-gateway";
import { clinicalActionError, clinicalRequest } from "../../server/http/clinical-http";
import { PatientRepository } from "../../server/repositories/patient-repository";

export async function GET() {
  try {
    return NextResponse.json({ success: true, patients: PatientRepository.getAll() });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.name || !body.dob || !body.mrn) {
      return NextResponse.json(
        { success: false, error: "Name, DOB, and MRN are required" },
        { status: 400 },
      );
    }

    const initials =
      body.initials ||
      body.name
        .split(" ")
        .map((part: string) => part[0])
        .join("")
        .toUpperCase();

    const patient = await ClinicalActionGateway.execute({
      ...clinicalRequest(req),
      action: {
        type: "create_patient",
        payload: {
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
          lastVisit: body.lastVisit || "Initial Intake",
          nextVisit: body.nextVisit || "Scheduled",
        },
      },
    });

    return NextResponse.json({ success: true, patient }, { status: 201 });
  } catch (error) {
    return clinicalActionError(error);
  }
}
