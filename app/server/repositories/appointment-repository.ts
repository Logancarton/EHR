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
      createdAt: now,
      updatedAt: now,
    };

    db.prepare(`
      INSERT INTO appointments (
        id, date, patient_id, patient_name, dob, age, mrn,
        time, duration, type, status, chief_complaint, room,
        alert, insurance, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.date,
      record.patientId,
      record.patientName,
      record.dob,
      record.age,
      record.mrn,
      record.time,
      record.duration,
      record.type,
      record.status,
      record.chiefComplaint,
      record.room || null,
      record.alert || null,
      record.insurance,
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
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
