import { getDatabase } from "../db/connection";
import { type Patient } from "../../domain/patient";

export type PatientRecord = Patient & {
  allergies: string[];
  vitals: { bp?: string; hr?: number; wt?: string; bmi?: string };
  createdAt: string;
  updatedAt: string;
};

export const PatientRepository = {
  getAll(): PatientRecord[] {
    const db = getDatabase();
    const rows = db.prepare("SELECT * FROM patients ORDER BY name ASC").all() as any[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      initials: r.initials,
      dob: r.dob,
      age: Number(r.age),
      pronouns: r.pronouns,
      mrn: r.mrn,
      status: r.status,
      alert: r.alert || undefined,
      allergies: JSON.parse(r.allergies_json || "[]"),
      diagnoses: JSON.parse(r.diagnoses_json || "[]"),
      meds: JSON.parse(r.meds_json || "[]"),
      vitals: JSON.parse(r.vitals_json || "{}"),
      lastVisit: r.last_visit,
      nextVisit: r.next_visit,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  getById(id: string): PatientRecord | null {
    const db = getDatabase();
    const r = db.prepare("SELECT * FROM patients WHERE id = ?").get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      initials: r.initials,
      dob: r.dob,
      age: Number(r.age),
      pronouns: r.pronouns,
      mrn: r.mrn,
      status: r.status,
      alert: r.alert || undefined,
      allergies: JSON.parse(r.allergies_json || "[]"),
      diagnoses: JSON.parse(r.diagnoses_json || "[]"),
      meds: JSON.parse(r.meds_json || "[]"),
      vitals: JSON.parse(r.vitals_json || "{}"),
      lastVisit: r.last_visit,
      nextVisit: r.next_visit,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  update(id: string, updates: Partial<PatientRecord>): PatientRecord | null {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return null;

    const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    db.prepare(`
      UPDATE patients SET
        name = ?, dob = ?, age = ?, status = ?, pronouns = ?, initials = ?, alert = ?,
        allergies_json = ?, diagnoses_json = ?, meds_json = ?, vitals_json = ?,
        last_visit = ?, next_visit = ?, updated_at = ?
      WHERE id = ?
    `).run(
      merged.name,
      merged.dob,
      merged.age,
      merged.status,
      merged.pronouns,
      merged.initials,
      merged.alert || null,
      JSON.stringify(merged.allergies),
      JSON.stringify(merged.diagnoses),
      JSON.stringify(merged.meds),
      JSON.stringify(merged.vitals),
      merged.lastVisit,
      merged.nextVisit,
      merged.updatedAt,
      id
    );

    return merged;
  },

  create(patient: Omit<PatientRecord, "createdAt" | "updatedAt">): PatientRecord {
    const db = getDatabase();
    const now = new Date().toISOString();
    const record: PatientRecord = { ...patient, createdAt: now, updatedAt: now };

    db.prepare(`
      INSERT INTO patients (
        id, name, dob, age, mrn, status, pronouns, initials, alert,
        allergies_json, diagnoses_json, meds_json, vitals_json,
        last_visit, next_visit, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.name,
      record.dob,
      record.age,
      record.mrn,
      record.status,
      record.pronouns,
      record.initials,
      record.alert || null,
      JSON.stringify(record.allergies || []),
      JSON.stringify(record.diagnoses || []),
      JSON.stringify(record.meds || []),
      JSON.stringify(record.vitals || {}),
      record.lastVisit || "Initial",
      record.nextVisit || "Unscheduled",
      now,
      now
    );

    return record;
  },
};
