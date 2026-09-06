import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../db/connection";
import { type Patient } from "../../domain/patient";

export type PatientRecord = Patient & {
  allergies: string[];
  vitals: { bp?: string; hr?: number; wt?: string; bmi?: string };
  createdAt: string;
  updatedAt: string;
};

function parse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function patientProjection(db: DatabaseSync, r: any): PatientRecord {
  const allergies = (db.prepare(`SELECT substance FROM patient_allergies WHERE patient_id = ? AND status = 'active' ORDER BY recorded_at ASC`).all(r.id) as any[])
    .map(x => String(x.substance));
  const diagnoses = (db.prepare(`SELECT display_text FROM patient_problems WHERE patient_id = ? AND status = 'active' ORDER BY recorded_at ASC`).all(r.id) as any[])
    .map(x => String(x.display_text));
  const meds = (db.prepare(`SELECT display_text FROM patient_medications WHERE patient_id = ? AND status = 'active' ORDER BY recorded_at ASC`).all(r.id) as any[])
    .map(x => String(x.display_text));
  const vitalRows = db.prepare(`SELECT code, value_text, value_num FROM observations WHERE patient_id = ? AND category = 'vital-signs' ORDER BY effective_at DESC`).all(r.id) as any[];
  const vitals: PatientRecord["vitals"] = {};
  for (const v of vitalRows) {
    const code = String(v.code || "").toLowerCase();
    if (!vitals.bp && (code === "bp" || code.includes("blood-pressure"))) vitals.bp = v.value_text;
    if (vitals.hr === undefined && (code === "hr" || code.includes("pulse"))) vitals.hr = Number(v.value_num ?? v.value_text);
    if (!vitals.wt && (code === "wt" || code.includes("weight"))) vitals.wt = v.value_text;
    if (!vitals.bmi && code === "bmi") vitals.bmi = v.value_text;
  }

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
    // Normalized tables are authoritative. Legacy JSON is fallback only for a database
    // that has not yet completed the additive backfill migration.
    allergies: allergies.length ? allergies : parse(r.allergies_json, []),
    diagnoses: diagnoses.length ? diagnoses : parse(r.diagnoses_json, []),
    meds: meds.length ? meds : parse(r.meds_json, []),
    vitals: Object.keys(vitals).length ? vitals : parse(r.vitals_json, {}),
    lastVisit: r.last_visit,
    nextVisit: r.next_visit,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function insertCompatibilityFacts(db: DatabaseSync, record: PatientRecord) {
  const at = record.createdAt;
  record.allergies.forEach((substance, i) => db.prepare(`INSERT OR IGNORE INTO patient_allergies
    (id, patient_id, substance, status, source_type, source_system, source_ref, recorded_by, recorded_at, updated_at)
    VALUES (?, ?, ?, 'active', 'patient-create', 'ehr-local', ?, 'ehr-system', ?, ?)`)
    .run(`create-allergy-${record.id}-${i}`, record.id, substance, `patients/${record.id}`, at, at));
  record.diagnoses.forEach((display, i) => db.prepare(`INSERT OR IGNORE INTO patient_problems
    (id, patient_id, display_text, status, source_type, source_system, source_ref, recorded_by, recorded_at, updated_at)
    VALUES (?, ?, ?, 'active', 'patient-create', 'ehr-local', ?, 'ehr-system', ?, ?)`)
    .run(`create-problem-${record.id}-${i}`, record.id, display, `patients/${record.id}`, at, at));
  record.meds.forEach((display, i) => db.prepare(`INSERT OR IGNORE INTO patient_medications
    (id, patient_id, display_text, medication_name, status, source_type, source_system, source_ref, recorded_by, recorded_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', 'patient-create', 'ehr-local', ?, 'ehr-system', ?, ?)`)
    .run(`create-med-${record.id}-${i}`, record.id, display, display, `patients/${record.id}`, at, at));
}

export const PatientRepository = {
  getAll(): PatientRecord[] {
    const db = getDatabase();
    return (db.prepare("SELECT * FROM patients ORDER BY name ASC").all() as any[]).map(r => patientProjection(db, r));
  },

  getById(id: string): PatientRecord | null {
    const db = getDatabase();
    const r = db.prepare("SELECT * FROM patients WHERE id = ?").get(id) as any;
    return r ? patientProjection(db, r) : null;
  },

  update(id: string, updates: Partial<PatientRecord>): PatientRecord | null {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };

    // Demographic shell + legacy compatibility cache only. Clinical facts are mutated
    // through ClinicalRecordRepository so history/provenance cannot be bypassed.
    db.prepare(`UPDATE patients SET
      name=?, dob=?, age=?, status=?, pronouns=?, initials=?, alert=?,
      allergies_json=?, diagnoses_json=?, meds_json=?, vitals_json=?,
      last_visit=?, next_visit=?, updated_at=? WHERE id=?`).run(
      merged.name, merged.dob, merged.age, merged.status, merged.pronouns, merged.initials,
      merged.alert || null, JSON.stringify(merged.allergies), JSON.stringify(merged.diagnoses),
      JSON.stringify(merged.meds), JSON.stringify(merged.vitals), merged.lastVisit, merged.nextVisit,
      merged.updatedAt, id,
    );
    return this.getById(id);
  },

  create(patient: Omit<PatientRecord, "createdAt" | "updatedAt">): PatientRecord {
    const db = getDatabase(); const at = new Date().toISOString();
    const record: PatientRecord = { ...patient, createdAt: at, updatedAt: at };
    db.prepare(`INSERT INTO patients (
      id,name,dob,age,mrn,status,pronouns,initials,alert,allergies_json,diagnoses_json,meds_json,vitals_json,
      last_visit,next_visit,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      record.id, record.name, record.dob, record.age, record.mrn, record.status, record.pronouns,
      record.initials, record.alert || null, JSON.stringify(record.allergies || []),
      JSON.stringify(record.diagnoses || []), JSON.stringify(record.meds || []), JSON.stringify(record.vitals || {}),
      record.lastVisit || "Initial", record.nextVisit || "Unscheduled", at, at,
    );
    insertCompatibilityFacts(db, record);
    return this.getById(record.id)!;
  },
};
