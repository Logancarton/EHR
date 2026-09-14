import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../server/actions/clinical-action-gateway";
import { assertPermission } from "../../server/auth/provider-context";
import {
  authenticatedClinicalRequest,
  clinicalActionError,
  clinicalRequest,
} from "../../server/http/clinical-http";
import { AppointmentRepository } from "../../server/repositories/appointment-repository";
import { filterToAccessiblePatients } from "../../server/auth/patient-access";
import type { AppointmentStatus } from "../../lib/schedule-data";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || undefined;
    const patientId = searchParams.get("patientId") || undefined;
    const status = (searchParams.get("status") as AppointmentStatus) || undefined;
    const { actor } = authenticatedClinicalRequest(req, patientId);
    assertPermission(actor, "read_clinical");

    // The schedule is a cross-patient surface, so it is narrowed to this actor's
    // reachable population the way the roster and the practice queues are. Without
    // this, `read_clinical` alone returned every appointment in the database —
    // name, date of birth, MRN, insurance and reason for visit — across every
    // organization. Appointment writes were already patient-bound; reads were not.
    const appointments = filterToAccessiblePatients(
      actor,
      AppointmentRepository.list({ date, patientId, status }),
      (appointment) => appointment.patientId,
    );
    return NextResponse.json({ success: true, appointments });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.patientId || !body.date || !body.time) {
      return NextResponse.json(
        { success: false, error: "patientId, date, and time are required" },
        { status: 400 },
      );
    }

    const appointment = await ClinicalActionGateway.execute({
      ...clinicalRequest(req),
      action: {
        type: "create_appointment",
        payload: {
          id: body.id,
          patientId: body.patientId,
          date: body.date,
          time: body.time,
          duration: body.duration,
          type: body.type,
          status: body.status,
          chiefComplaint: body.chiefComplaint,
          room: body.room,
          alert: body.alert,
          insurance: body.insurance,
        },
      },
    });

    return NextResponse.json({ success: true, appointment }, { status: 201 });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!body.id || !body.status) {
      return NextResponse.json(
        { success: false, error: "id and status are required" },
        { status: 400 },
      );
    }

    const appointment = await ClinicalActionGateway.execute({
      ...clinicalRequest(req),
      action: {
        type: "update_appointment_status",
        payload: { appointmentId: body.id, status: body.status as AppointmentStatus },
      },
    });

    return NextResponse.json({ success: true, appointment });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Appointment id is required" }, { status: 400 });
    }

    await ClinicalActionGateway.execute({
      ...clinicalRequest(req),
      action: { type: "delete_appointment", payload: { appointmentId: id } },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    return clinicalActionError(error);
  }
}
