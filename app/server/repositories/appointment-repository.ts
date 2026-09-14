import { getDatabase } from "../db/connection";
import {
  timeStringToMinutes,
  type ScheduleItem,
  type AppointmentStatus,
  type VisitType,
} from "../../lib/schedule-data";

export interface AppointmentRecord extends ScheduleItem {
  createdAt: string;
  updatedAt: string;
}

export const AppointmentRepository = {
  list(filter?: { date?: string; patientId?: string; status?: AppointmentStatus }): AppointmentRecord[] {
    const db = getDatabase();
    let query = "SELECT * FROM appointments";
    const params: any[] = [];
    const conditions: string[] = [];

    if (filter?.date) {
      conditions.push("date = ?");
      params.push(filter.date);
    }
    if (filter?.patientId) {
      conditions.push("patient_id = ?");
      params.push(filter.patientId);
    }
    if (filter?.status) {
      conditions.push("status = ?");
      params.push(filter.status);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    // Only the date orders in SQL. Appointment times are stored as clock text, so
    // `ORDER BY time` sorted them alphabetically: "01:15 PM" came before "09:00 AM",
    // and a clinic day opened with its afternoon.
    query += " ORDER BY date ASC";

    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(mapRowToAppointment).sort(byDateThenClockTime);
  },

  getById(id: string): AppointmentRecord | null {
    const db = getDatabase();
    const row = db.prepare("SELECT * FROM appointments WHERE id = ?").get(id) as any;
    if (!row) return null;
    return mapRowToAppointment(row);
  },

  create(appointment: Omit<AppointmentRecord, "createdAt" | "updatedAt">): AppointmentRecord {
    const db = getDatabase();
    const now = new Date().toISOString();
    const record: AppointmentRecord = {
      ...appointment,
      modality: appointment.modality || "in-person",
      createdAt: now,
      updatedAt: now,
    };

    db.prepare(`
      INSERT INTO appointments (
        id, date, patient_id, patient_name, dob, age, mrn,
        time, duration, type, status, chief_complaint, room,
        alert, insurance, modality, provider_id, provider_name,
        assigned_staff_id, assigned_staff_name, intake_status,
        cancellation_reason, cancellation_note, cancelled_at, cancelled_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.date,
      record.patientId,
      record.patientName,
      record.dob || null,
      record.age !== undefined ? record.age : null,
      record.mrn || null,
      record.time,
      record.duration,
      record.type,
      record.status,
      record.chiefComplaint || null,
      record.room || null,
      record.alert || null,
      record.insurance || null,
      record.modality || "in-person",
      record.providerId || null,
      record.providerName || null,
      record.assignedStaffId || null,
      record.assignedStaffName || null,
      record.intakeStatus || "completed",
      record.cancellationReason || null,
      record.cancellationNote || null,
      record.cancelledAt || null,
      record.cancelledBy || null,
      record.createdAt,
      record.updatedAt
    );

    return record;
  },

  updateStatus(id: string, newStatus: AppointmentStatus): AppointmentRecord | null {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE appointments SET
        status = ?,
        updated_at = ?
      WHERE id = ?
    `).run(newStatus, now, id);

    return {
      ...existing,
      status: newStatus,
      updatedAt: now,
    };
  },

  update(
    id: string,
    updates: Partial<Omit<AppointmentRecord, "id" | "createdAt" | "updatedAt">>,
  ): AppointmentRecord | null {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: AppointmentRecord = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    db.prepare(`
      UPDATE appointments SET
        date = ?,
        time = ?,
        duration = ?,
        type = ?,
        status = ?,
        chief_complaint = ?,
        room = ?,
        alert = ?,
        insurance = ?,
        modality = ?,
        provider_id = ?,
        provider_name = ?,
        assigned_staff_id = ?,
        assigned_staff_name = ?,
        intake_status = ?,
        cancellation_reason = ?,
        cancellation_note = ?,
        cancelled_at = ?,
        cancelled_by = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      updated.date,
      updated.time,
      updated.duration,
      updated.type,
      updated.status,
      updated.chiefComplaint || null,
      updated.room || null,
      updated.alert || null,
      updated.insurance || null,
      updated.modality || "in-person",
      updated.providerId || null,
      updated.providerName || null,
      updated.assignedStaffId || null,
      updated.assignedStaffName || null,
      updated.intakeStatus || "completed",
      updated.cancellationReason || null,
      updated.cancellationNote || null,
      updated.cancelledAt || null,
      updated.cancelledBy || null,
      updated.updatedAt,
      id
    );

    return updated;
  },

  cancel(
    id: string,
    cancellationReason: string,
    cancellationNote?: string,
    cancelledBy?: string,
  ): AppointmentRecord | null {
    const now = new Date().toISOString();
    return this.update(id, {
      status: "cancelled",
      cancellationReason,
      cancellationNote: cancellationNote || undefined,
      cancelledAt: now,
      cancelledBy: cancelledBy || undefined,
    });
  },

  delete(id: string): boolean {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return false;

    db.prepare("DELETE FROM appointments WHERE id = ?").run(id);
    return true;
  },
};

/** Chronological within a day, so a roster reads in the order the clinic happens. */
function byDateThenClockTime(a: AppointmentRecord, b: AppointmentRecord): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const minutes = timeStringToMinutes(a.time) - timeStringToMinutes(b.time);
  // A stable tiebreak keeps two appointments in the same slot from reordering
  // between reads, which would move a row out from under the pointer.
  return minutes !== 0 ? minutes : a.id.localeCompare(b.id);
}

function mapRowToAppointment(r: any): AppointmentRecord {
  return {
    id: r.id,
    date: r.date,
    patientId: r.patient_id,
    patientName: r.patient_name,
    dob: r.dob,
    age: Number(r.age),
    mrn: r.mrn,
    time: r.time,
    duration: r.duration,
    type: r.type as VisitType,
    status: r.status as AppointmentStatus,
    chiefComplaint: r.chief_complaint,
    room: r.room || undefined,
    alert: r.alert || undefined,
    insurance: r.insurance,
    modality: (r.modality as "in-person" | "video") || "in-person",
    providerId: r.provider_id || undefined,
    providerName: r.provider_name || undefined,
    assignedStaffId: r.assigned_staff_id || undefined,
    assignedStaffName: r.assigned_staff_name || undefined,
    intakeStatus: r.intake_status || undefined,
    cancellationReason: r.cancellation_reason || undefined,
    cancellationNote: r.cancellation_note || undefined,
    cancelledAt: r.cancelled_at || undefined,
    cancelledBy: r.cancelled_by || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
