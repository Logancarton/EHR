import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ageFromDateOfBirth } from "../../domain/patient-administration";
import { ClinicalActionGateway } from "../../server/actions/clinical-action-gateway";
import { assertPermission, hasPermission } from "../../server/auth/provider-context";
import {
  authenticatedClinicalRequest,
  clinicalActionError,
  clinicalRequest,
} from "../../server/http/clinical-http";
import { PatientRepository } from "../../server/repositories/patient-repository";
import { accessiblePatientIds } from "../../server/auth/patient-access";

export async function GET(req: Request) {
  try {
    const { actor } = authenticatedClinicalRequest(req);
    if (new URL(req.url).searchParams.get("view") === "booking") {
      if (!hasPermission(actor, "read_schedule") && !hasPermission(actor, "manage_appointments")) {
        assertPermission(actor, "read_schedule");
      }
      const patients = PatientRepository.getManyByIds(accessiblePatientIds(actor)).map((patient) => ({
        id: patient.id,
        name: patient.name,
        dob: patient.dob,
        age: patient.age,
        mrn: patient.mrn,
        status: patient.status,
        contact: { mobilePhone: patient.contact.mobilePhone, email: patient.contact.email },
      }));
      return NextResponse.json({ success: true, patients });
    }
    assertPermission(actor, "read_clinical");
    // The roster is the entry point to every chart, so it is narrowed to this
    // clinician's organization/assignment scope rather than the whole database.
    const patients = PatientRepository.getManyByIds(accessiblePatientIds(actor));
    return NextResponse.json({ success: true, patients });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const dob = typeof body.dob === "string" ? body.dob.trim() : "";
    const suppliedMrn = typeof body.mrn === "string" ? body.mrn.trim() : "";
    const mobilePhone = typeof body.contact?.mobilePhone === "string"
      ? body.contact.mobilePhone.trim()
      : "";
    const email = typeof body.contact?.email === "string"
      ? body.contact.email.trim()
      : "";
    const age = ageFromDateOfBirth(dob);
    if (!name || age === undefined) {
      return NextResponse.json(
        { success: false, error: "A name and valid date of birth are required to create a patient chart." },
        { status: 400 },
      );
    }
    if (body.allergies !== undefined && !Array.isArray(body.allergies)) {
      return NextResponse.json(
        { success: false, error: "allergies must be an array when provided" },
        { status: 400 },
      );
    }

    const initials = body.initials || name
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
          id: body.id || `patient-${randomUUID()}`,
          name,
          initials,
          dob,
          age,
          pronouns: body.pronouns || "",
          // MRNs are identifiers assigned by the EHR, never guessed by the booking UI.
          mrn: suppliedMrn || `MRN-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
          status: body.status || "New Patient",
          alert: body.alert,
          // Omitted allergy information is unknown/unassessed. NKDA must be explicit evidence.
          allergies: body.allergies ?? [],
          diagnoses: body.diagnoses || [],
          meds: body.meds || [],
          vitals: body.vitals || {},
          lastVisit: body.lastVisit || "No visits recorded",
          nextVisit: body.nextVisit || "Unscheduled",
          contact: mobilePhone || email ? { mobilePhone, email } : undefined,
        },
      },
    });
    return NextResponse.json({ success: true, patient }, { status: 201 });
  } catch (error) {
    return clinicalActionError(error);
  }
}
