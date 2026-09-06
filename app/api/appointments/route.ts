import { NextResponse } from "next/server";
import { AppointmentRepository } from "../../server/repositories/appointment-repository";
import type { AppointmentStatus } from "../../lib/schedule-data";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || undefined;
    const patientId = searchParams.get("patientId") || undefined;
    const status = (searchParams.get("status") as AppointmentStatus) || undefined;

    const appointments = AppointmentRepository.list({ date, patientId, status });
    return NextResponse.json({ success: true, appointments });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.patientId || !body.patientName || !body.date || !body.time) {
      return NextResponse.json(
        { success: false, error: "patientId, patientName, date, and time are required" },
        { status: 400 }
      );
    }

    const appointment = AppointmentRepository.create({
      id: body.id || `apt-${Date.now().toString().slice(-6)}`,
      date: body.date,
      patientId: body.patientId,
      patientName: body.patientName,
      dob: body.dob || "01/01/1990",
      age: Number(body.age) || 30,
      mrn: body.mrn || "P-99999",
      time: body.time,
      duration: body.duration || "30 min",
      type: body.type || "30-min Med Check",
      status: body.status || "scheduled",
      chiefComplaint: body.chiefComplaint || "Scheduled psychiatric follow-up.",
      room: body.room,
      alert: body.alert,
      insurance: body.insurance || "Self-Pay / Commercial",
    });

    return NextResponse.json({ success: true, appointment }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!body.id || !body.status) {
      return NextResponse.json(
        { success: false, error: "id and status are required" },
        { status: 400 }
      );
    }

    const updated = AppointmentRepository.updateStatus(body.id, body.status as AppointmentStatus);
    if (!updated) {
      return NextResponse.json({ success: false, error: "Appointment not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, appointment: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Appointment id is required" }, { status: 400 });
    }

    const deleted = AppointmentRepository.delete(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Appointment not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
