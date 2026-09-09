import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../server/actions/clinical-action-gateway";
import { assertPermission } from "../../server/auth/provider-context";
import {
  authenticatedClinicalRequest,
  clinicalActionError,
  clinicalRequest,
} from "../../server/http/clinical-http";
import { PatientRepository } from "../../server/repositories/patient-repository";

export async function GET(req: Request) {
  try {
    const { actor } = authenticatedClinicalRequest(req);
    assertPermission(actor, "read_clinical");
    return NextResponse.json({ success: true, patients: PatientRepository.getAll() });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.name || !body.dob || !body.mrn) {
      return NextResponse.json(
        { success: false, error: "name, dob, and mrn are required" },
        { status: 400 },
      );
    }
    if (body.allergies !== undefined && !Array.isArray(body.allergies)) {
      return NextResponse.json(
        { success: false, error: "allergies must be an array when provided" },
        { status: 400 },
      );
    }

    const initials = body.initials || String(body.name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase())
      .join("");

    const patient = await ClinicalActionGateway.execute({
      ...clinicalRequest(req),
      action: {
        type: "create_patient",
        payload: {
          id: body.id || `patient-${Date.now()}`,
          name: body.name,
          initials,
          dob: body.dob,
          age: Number(body.age) || 30,
          pronouns: body.pronouns || "they/them",
          mrn: body.mrn,
          status: body.status || "New Patient",
          alert: body.alert,
          // Omitted allergy information is unknown/unassessed. NKDA must be explicit evidence.
          allergies: body.allergies ?? [],
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
