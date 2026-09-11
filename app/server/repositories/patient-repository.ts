import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../db/connection";
import { type Patient } from "../../domain/patient";
import {
  type ContactPermission,
  type PatientContact,
  type PatientIdentity,
  type PatientRecordStatus,
  type PreferredContactMethod,
  ageFromDateOfBirth,
} from "../../domain/patient-administration";
import { DEFAULT_ORGANIZATION_ID } from "../db/migrations";

export type PatientRecord = Patient & {
  allergies: string[];
  vitals: { bp?: string; hr?: number; wt?: string; bmi?: string };
  /** Identity and contact detail; see `domain/patient-administration`. */
  identity: PatientIdentity;
  contact: PatientContact;
  createdAt: string;
  updatedAt: string;
};

/**
 * What a caller supplies when writing a patient. Identity and contact are partial:
 * a chart is created from whatever intake actually collected, and the projection
 * fills the rest from the row's defaults.
 */
export type PatientWriteInput = Omit<PatientRecord, "createdAt" | "updatedAt" | "identity" | "contact"> & {
  identity?: Partial<PatientIdentity>;
  contact?: Partial<PatientContact>;
};

/** 1 yes, 0 no, NULL nobody has asked. The third state is the point. */
function permission(value: unknown): ContactPermission {
  if (value === null || value === undefined) return undefined;
  return Number(value) === 1;
}

function permissionValue(value: ContactPermission): number | null {
  return value === undefined ? null : value ? 1 : 0;
}

function text(value: unknown): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : undefined;
}

function parse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function patientProjection(db: DatabaseSync, r: any): PatientRecord {
  const allergies = (db.prepare(`SELECT substance FROM patient_allergies WHERE patient_id = ? AND status = 'active' ORDER BY recorded_at ASC`).all(r.id) as any[]).map(x => String(x.substance));
  const diagnoses = (db.prepare(`SELECT display_text FROM patient_problems WHERE patient_id = ? AND status = 'active' ORDER BY recorded_at ASC`).all(r.id) as any[]).map(x => String(x.display_text));
  const meds = (db.prepare(`SELECT display_text FROM patient_medications WHERE patient_id = ? AND status = 'active' ORDER BY recorded_at ASC`).all(r.id) as any[]).map(x => String(x.display_text));
  const vitalRows = db.prepare(`SELECT code, value_text, value_num FROM observations WHERE patient_id = ? AND category = 'vital-signs' ORDER BY effective_at DESC`).all(r.id) as any[];
  const vitals: PatientRecord["vitals"] = {};
  for (const v of vitalRows) {
    const code = String(v.code || "").toLowerCase();
    if (!vitals.bp && (code === "bp" || code.includes("blood-pressure"))) vitals.bp = v.value_text;
    if (vitals.hr === undefined && (code === "hr" || code.includes("pulse"))) vitals.hr = Number(v.value_num ?? v.value_text);
    if (!vitals.wt && (code === "wt" || code.includes("weight"))) vitals.wt = v.value_text;
    if (!vitals.bmi && code === "bmi") vitals.bmi = v.value_text;
  }

  const identity: PatientIdentity = {
    legalName: r.name,
    preferredName: text(r.preferred_name),
    dob: r.dob,
    sexAtBirth: text(r.sex_at_birth),
    genderIdentity: text(r.gender_identity),
    pronouns: r.pronouns,
    mrn: r.mrn,
    preferredLanguage: text(r.preferred_language),
    timeZone: text(r.time_zone),
    recordStatus: (text(r.record_status) as PatientRecordStatus) || "active",
    deceasedDate: text(r.deceased_date),
  };

  const contact: PatientContact = {
    mobilePhone: text(r.mobile_phone),
    alternatePhone: text(r.alternate_phone),
    email: text(r.email),
    addressLine1: text(r.address_line1),
    addressLine2: text(r.address_line2),
    city: text(r.city),
    state: text(r.state),
    postalCode: text(r.postal_code),
    country: text(r.country),
    preferredContactMethod: text(r.preferred_contact_method) as PreferredContactMethod | undefined,
    allowVoicemail: permission(r.allow_voicemail),
    allowSms: permission(r.allow_sms),
    allowEmail: permission(r.allow_email),
    contactNotes: text(r.contact_notes),
  };

  return {
    id:r.id, name:r.name, initials:r.initials, dob:r.dob,
    // Derived, never stored: a birthday used to make the record silently wrong.
    age: ageFromDateOfBirth(r.dob) ?? 0,
    pronouns:r.pronouns,
    mrn:r.mrn, status:r.status, alert:r.alert || undefined,
    allergies:allergies.length ? allergies : parse(r.allergies_json, []),
    diagnoses:diagnoses.length ? diagnoses : parse(r.diagnoses_json, []),
    meds:meds.length ? meds : parse(r.meds_json, []),
    vitals:Object.keys(vitals).length ? vitals : parse(r.vitals_json, {}),
    lastVisit:r.last_visit, nextVisit:r.next_visit, identity, contact,
    createdAt:r.created_at, updatedAt:r.updated_at,
  };
}

export const PatientRepository = {
  getAll(): PatientRecord[] {
    const db = getDatabase();
    return (db.prepare("SELECT * FROM patients ORDER BY name ASC").all() as any[]).map(r => patientProjection(db, r));
  },
  /**
   * Roster/search surfaces must load only the patients the caller may reach. The
   * accessible id set is resolved by the patient-access boundary, not here.
   */
  getManyByIds(ids: readonly string[]): PatientRecord[] {
    if (ids.length === 0) return [];
    const db = getDatabase();
    const placeholders = ids.map(() => "?").join(", ");
    return (db
      .prepare(`SELECT * FROM patients WHERE id IN (${placeholders}) ORDER BY name ASC`)
      .all(...ids) as any[]).map(r => patientProjection(db, r));
  },
  getById(id: string): PatientRecord | null {
    const db = getDatabase(); const r = db.prepare("SELECT * FROM patients WHERE id = ?").get(id) as any;
    return r ? patientProjection(db, r) : null;
  },
  update(id: string, updates: Partial<PatientWriteInput>): PatientRecord | null {
    const db = getDatabase(); const existing = this.getById(id); if (!existing) return null;
    const merged = { ...existing, ...updates, updatedAt:new Date().toISOString() };
    // Identity and contact merge field by field, so a form that edits one section
    // cannot blank the other by omitting it.
    const identity = { ...existing.identity, ...(updates.identity || {}) };
    const contact = { ...existing.contact, ...(updates.contact || {}) };

    db.prepare(`UPDATE patients SET
      name=?,dob=?,status=?,pronouns=?,initials=?,alert=?,allergies_json=?,diagnoses_json=?,meds_json=?,vitals_json=?,
      last_visit=?,next_visit=?,
      preferred_name=?,sex_at_birth=?,gender_identity=?,preferred_language=?,time_zone=?,record_status=?,deceased_date=?,
      mobile_phone=?,alternate_phone=?,email=?,address_line1=?,address_line2=?,city=?,state=?,postal_code=?,country=?,
      preferred_contact_method=?,contact_notes=?,allow_voicemail=?,allow_sms=?,allow_email=?,
      updated_at=? WHERE id=?`).run(
      merged.name, merged.dob, merged.status, merged.pronouns, merged.initials, merged.alert || null,
      JSON.stringify(merged.allergies), JSON.stringify(merged.diagnoses), JSON.stringify(merged.meds), JSON.stringify(merged.vitals),
      merged.lastVisit, merged.nextVisit,
      identity.preferredName ?? null, identity.sexAtBirth ?? null, identity.genderIdentity ?? null,
      identity.preferredLanguage ?? null, identity.timeZone ?? null, identity.recordStatus ?? "active",
      identity.deceasedDate ?? null,
      contact.mobilePhone ?? null, contact.alternatePhone ?? null, contact.email ?? null,
      contact.addressLine1 ?? null, contact.addressLine2 ?? null, contact.city ?? null,
      contact.state ?? null, contact.postalCode ?? null, contact.country ?? null,
      contact.preferredContactMethod ?? null, contact.contactNotes ?? null,
      permissionValue(contact.allowVoicemail), permissionValue(contact.allowSms), permissionValue(contact.allowEmail),
      merged.updatedAt, id,
    );
    return this.getById(id);
  },
  /**
   * Organization ownership is written with the patient row, not after it. A patient
   * that briefly exists outside every access boundary is a patient no access check
   * can protect, so the two writes share one transaction.
   */
  create(
    patient: PatientWriteInput,
    organizationId: string = DEFAULT_ORGANIZATION_ID,
  ): PatientRecord {
    const db = getDatabase(); const at = new Date().toISOString();
    const record = patient;
    const identity = patient.identity || {};
    const contact = patient.contact || {};
    db.exec("BEGIN IMMEDIATE");
    try {
      // `age` is deliberately absent: date of birth is the stored fact.
      db.prepare(`INSERT INTO patients (
        id,name,dob,mrn,status,pronouns,initials,alert,allergies_json,diagnoses_json,meds_json,vitals_json,last_visit,next_visit,
        preferred_name,sex_at_birth,gender_identity,preferred_language,time_zone,record_status,deceased_date,
        mobile_phone,alternate_phone,email,address_line1,address_line2,city,state,postal_code,country,
        preferred_contact_method,contact_notes,allow_voicemail,allow_sms,allow_email,
        created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        record.id, record.name, record.dob, record.mrn, record.status, record.pronouns, record.initials,
        record.alert || null, JSON.stringify(record.allergies || []), JSON.stringify(record.diagnoses || []),
        JSON.stringify(record.meds || []), JSON.stringify(record.vitals || {}), record.lastVisit || "Initial",
        record.nextVisit || "Unscheduled",
        identity.preferredName ?? null, identity.sexAtBirth ?? null, identity.genderIdentity ?? null,
        identity.preferredLanguage ?? null, identity.timeZone ?? null, identity.recordStatus ?? "active",
        identity.deceasedDate ?? null,
        contact.mobilePhone ?? null, contact.alternatePhone ?? null, contact.email ?? null,
        contact.addressLine1 ?? null, contact.addressLine2 ?? null, contact.city ?? null,
        contact.state ?? null, contact.postalCode ?? null, contact.country ?? null,
        contact.preferredContactMethod ?? null, contact.contactNotes ?? null,
        permissionValue(contact.allowVoicemail), permissionValue(contact.allowSms), permissionValue(contact.allowEmail),
        at, at,
      );
      db.prepare(`INSERT OR IGNORE INTO patient_organizations (patient_id, organization_id, created_at) VALUES (?, ?, ?)`)
        .run(record.id, organizationId, at);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    // Clinical arrays above are a temporary compatibility cache. PatientRecordService
    // immediately writes authoritative normalized facts with provenance/version history.
    return patientProjection(db, db.prepare("SELECT * FROM patients WHERE id = ?").get(record.id));
  },
};
