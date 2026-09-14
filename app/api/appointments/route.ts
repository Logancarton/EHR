import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../server/actions/clinical-action-gateway";
import { assertPermission, hasPermission } from "../../server/auth/provider-context";
import {
  authenticatedClinicalRequest,
  clinicalActionError,
  clinicalRequest,
} from "../../server/http/clinical-http";
import {
  AppointmentRepository,
  AppointmentConcurrencyError,
} from "../../server/repositories/appointment-repository";
import { filterToAccessiblePatients } from "../../server/auth/patient-access";
import type { AppointmentStatus } from "../../lib/schedule-data";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || undefined;
    const patientId = searchParams.get("patientId") || undefined;
    const status = (searchParams.get("status") as AppointmentStatus) || undefined;
    const { actor } = authenticatedClinicalRequest(req, patientId);

    const canReadClinical = hasPermission(actor, "read_clinical");
    const canReadSchedule = hasPermission(actor, "read_schedule") || hasPermission(actor, "manage_appointments");
    if (!canReadClinical && !canReadSchedule) {
      assertPermission(actor, "read_schedule");
    }

    // The schedule is a cross-patient surface, so it is narrowed to this actor's
    // reachable population the way the roster and the practice queues are.
    const appointments = filterToAccessiblePatients(
      actor,
      AppointmentRepository.list({ date, patientId, status }),
      (appointment) => appointment.patientId,
    );

    // DB-2 & DB-4: If caller lacks clinical reading authority (e.g. billing scope or non-clinical
    // manager), strip clinical narrative text (chiefComplaint) and clinical intake status before response leaves server.
    const sanitizedAppointments = canReadClinical
      ? appointments
      : appointments.map(({ chiefComplaint: _c, intakeStatus: _i, ...safeAppointment }) => safeAppointment);

    return NextResponse.json({ success: true, appointments: sanitizedAppointments });
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
          modality: body.modality,
          providerId: body.providerId,
          providerName: body.providerName,
          assignedStaffId: body.assignedStaffId,
          assignedStaffName: body.assignedStaffName,
          intakeStatus: body.intakeStatus,
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
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: "id is required" },
        { status: 400 },
      );
    }

    const existing = AppointmentRepository.getById(body.id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Appointment not found: ${body.id}` },
        { status: 404 },
      );
    }

    const expectedVersion = typeof body.expectedVersion === "number"
      ? body.expectedVersion
      : (typeof body.updates?.expectedVersion === "number" ? body.updates.expectedVersion : undefined);

    if (body.action === "cancel" || body.status === "cancelled") {
      if (!body.cancellationReason) {
        return NextResponse.json(
          { success: false, error: "cancellationReason is required when cancelling" },
          { status: 400 },
        );
      }
      const appointment = await ClinicalActionGateway.execute({
        ...clinicalRequest(req, existing.patientId),
        action: {
          type: "cancel_appointment",
          payload: {
            appointmentId: body.id,
            cancellationReason: body.cancellationReason,
            cancellationNote: body.cancellationNote,
            expectedVersion,
          },
        },
      });
      return NextResponse.json({ success: true, appointment });
    }

    if (body.updates) {
      const { expectedVersion: _ev, ...cleanUpdates } = body.updates;
      const appointment = await ClinicalActionGateway.execute({
        ...clinicalRequest(req, existing.patientId),
        action: {
          type: "update_appointment",
          payload: {
            appointmentId: body.id,
            updates: cleanUpdates,
            expectedVersion,
          },
        },
      });
      return NextResponse.json({ success: true, appointment });
    }

    if (body.status) {
      const appointment = await ClinicalActionGateway.execute({
        ...clinicalRequest(req, existing.patientId),
        action: {
          type: "update_appointment_status",
          payload: {
            appointmentId: body.id,
            status: body.status as AppointmentStatus,
            expectedVersion,
          },
        },
      });
      return NextResponse.json({ success: true, appointment });
    }

    return NextResponse.json(
      { success: false, error: "Either status, updates, or cancellationReason is required" },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof AppointmentConcurrencyError) {
      return NextResponse.json(
        {
          success: false,
          conflict: true,
          error: error.message,
          serverVersion: error.serverVersion,
          currentAppointment: error.currentAppointment,
        },
        { status: 409 },
      );
    }
    return clinicalActionError(error);
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    const existing = AppointmentRepository.getById(body.id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Appointment not found: ${body.id}` },
        { status: 404 },
      );
    }

    const { id, expectedVersion, ...updates } = body;
    const appointment = await ClinicalActionGateway.execute({
      ...clinicalRequest(req, existing.patientId),
      action: {
        type: "update_appointment",
        payload: {
          appointmentId: id,
          updates,
          expectedVersion: typeof expectedVersion === "number" ? expectedVersion : undefined,
        },
      },
    });
    return NextResponse.json({ success: true, appointment });
  } catch (error) {
    if (error instanceof AppointmentConcurrencyError) {
      return NextResponse.json(
        {
          success: false,
          conflict: true,
          error: error.message,
          serverVersion: error.serverVersion,
          currentAppointment: error.currentAppointment,
        },
        { status: 409 },
      );
    }
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
