import { getDatabase } from "../db/connection";
import { AuditRepository } from "./audit-repository";
import type { ScheduleItem, AppointmentStatus, VisitType } from "../../lib/schedule-data";

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
    query += " ORDER BY date ASC, time ASC";

    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(mapRowToAppointment);
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

    AuditRepository.log({
      userId: "dr-carton",
      userName: "Dr. Logan Carton, MD",
      userRole: "provider",
      eventType: "appointment_scheduled",
      patientId: record.patientId,
      description: `Scheduled appointment created for ${record.patientName} on ${record.date} at ${record.time} (${record.type})`,
      metadata: { appointmentId: record.id, date: record.date, time: record.time, type: record.type },
    });

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

    AuditRepository.log({
      userId: "dr-carton",
      userName: "Dr. Logan Carton, MD",
      userRole: "provider",
      eventType: "appointment_updated",
      patientId: existing.patientId,
      description: `Appointment status updated from "${existing.status}" to "${newStatus}" for ${existing.patientName}`,
      metadata: { appointmentId: id, oldStatus: existing.status, newStatus },
    });

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

    AuditRepository.log({
      userId: "dr-carton",
      userName: "Dr. Logan Carton, MD",
      userRole: "provider",
      eventType: "appointment_updated",
      patientId: existing.patientId,
      description: `Appointment ${id} cancelled for ${existing.patientName} on ${existing.date}`,
      metadata: { appointmentId: id, patientId: existing.patientId },
    });

    return true;
  },
};

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
