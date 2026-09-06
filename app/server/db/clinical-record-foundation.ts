import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { patientLabHistory } from "../../lib/clinical-protocols";

function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }
function iso(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}
function hasRows(db: DatabaseSync, table: string, patientId: string, extra = "") {
  const allowed = new Set(["patient_allergies", "patient_problems", "patient_medications", "observations"]);
  if (!allowed.has(table)) throw new Error(`Unsupported migration table: ${table}`);
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE patient_id = ? ${extra}`).get(patientId) as { n: number };
  return Number(row?.n || 0) > 0;
}

function provenance(db: DatabaseSync, p: {
  id: string; patientId: string; entityType: string; entityId: string;
  activity: string; sourceType: string; sourceSystem: string; sourceRef: string;
  payload: unknown; createdAt: string;
}) {
  db.prepare(`INSERT OR IGNORE INTO provenance_events (
    id, patient_id, entity_type, entity_id, activity, source_type, source_system,
    source_ref, actor_id, actor_name, payload_sha256, metadata_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(p.id, p.patientId, p.entityType, p.entityId, p.activity, p.sourceType,
      p.sourceSystem, p.sourceRef, "system-migration", "Clinical record migration",
      hash(p.payload), JSON.stringify({ backfilled:true }), p.createdAt);

  db.prepare(`INSERT OR IGNORE INTO record_versions (
    id, patient_id, entity_type, entity_id, version_number, operation, snapshot_json,
    actor_id, actor_name, source_type, source_ref, created_at
  ) VALUES (?, ?, ?, ?, 1, 'backfill', ?, 'system-migration', 'Clinical record migration', ?, ?, ?)`)
    .run(`ver-${p.id}`, p.patientId, p.entityType, p.entityId, JSON.stringify(p.payload),
      p.sourceType, p.sourceRef, p.createdAt);
}

function backfillPatientJson(db: DatabaseSync) {
  const rows = db.prepare(`SELECT id, allergies_json, diagnoses_json, meds_json, vitals_json, created_at FROM patients`).all() as any[];
  for (const r of rows) {
    const at = r.created_at || new Date().toISOString();

    if (!hasRows(db, "patient_allergies", r.id)) {
      json<string[]>(r.allergies_json, []).forEach((substance, i) => {
        const id = `legacy-allergy-${r.id}-${i}`;
        const payload = { substance, status:"active" };
        db.prepare(`INSERT OR IGNORE INTO patient_allergies
          (id, patient_id, substance, status, source_type, source_system, source_ref, recorded_by, recorded_at, updated_at)
          VALUES (?, ?, ?, 'active', 'legacy-json', 'ehr-local', ?, 'system-migration', ?, ?)`)
          .run(id, r.id, substance, `patients/${r.id}/allergies_json`, at, at);
        provenance(db, { id:`prov-${id}`, patientId:r.id, entityType:"allergy", entityId:id,
          activity:"backfill", sourceType:"legacy-json", sourceSystem:"ehr-local",
          sourceRef:`patients/${r.id}/allergies_json`, payload, createdAt:at });
      });
    }

    if (!hasRows(db, "patient_problems", r.id)) {
      json<string[]>(r.diagnoses_json, []).forEach((display, i) => {
        const id = `legacy-problem-${r.id}-${i}`;
        const payload = { display_text:display, status:"active" };
        db.prepare(`INSERT OR IGNORE INTO patient_problems
          (id, patient_id, display_text, status, source_type, source_system, source_ref, recorded_by, recorded_at, updated_at)
          VALUES (?, ?, ?, 'active', 'legacy-json', 'ehr-local', ?, 'system-migration', ?, ?)`)
          .run(id, r.id, display, `patients/${r.id}/diagnoses_json`, at, at);
        provenance(db, { id:`prov-${id}`, patientId:r.id, entityType:"problem", entityId:id,
          activity:"backfill", sourceType:"legacy-json", sourceSystem:"ehr-local",
          sourceRef:`patients/${r.id}/diagnoses_json`, payload, createdAt:at });
      });
    }

    if (!hasRows(db, "patient_medications", r.id)) {
      json<string[]>(r.meds_json, []).forEach((display, i) => {
        const id = `legacy-med-${r.id}-${i}`;
        const payload = { display_text:display, medication_name:display, status:"active" };
        db.prepare(`INSERT OR IGNORE INTO patient_medications
          (id, patient_id, display_text, medication_name, status, source_type, source_system, source_ref, recorded_by, recorded_at, updated_at)
          VALUES (?, ?, ?, ?, 'active', 'legacy-json', 'ehr-local', ?, 'system-migration', ?, ?)`)
          .run(id, r.id, display, display, `patients/${r.id}/meds_json`, at, at);
        provenance(db, { id:`prov-${id}`, patientId:r.id, entityType:"medication", entityId:id,
          activity:"backfill", sourceType:"legacy-json", sourceSystem:"ehr-local",
          sourceRef:`patients/${r.id}/meds_json`, payload, createdAt:at });
      });
    }

    if (!hasRows(db, "observations", r.id, "AND category = 'vital-signs'")) {
      Object.entries(json<Record<string, string | number>>(r.vitals_json, {})).forEach(([key, value], i) => {
        const id = `legacy-vital-${r.id}-${i}`;
        const payload = { category:"vital-signs", code:key, test_name:key.toUpperCase(), value_text:String(value), status:"final" };
        db.prepare(`INSERT OR IGNORE INTO observations
          (id, patient_id, category, code, coding_system, test_name, effective_at, value_text,
           value_num, status, source_system, source_ref, observed_by, created_at, updated_at)
          VALUES (?, ?, 'vital-signs', ?, 'ehr-local', ?, ?, ?, ?, 'final', 'ehr-local', ?, 'system-migration', ?, ?)`)
          .run(id, r.id, key, key.toUpperCase(), at, String(value), typeof value === "number" ? value : null,
            `patients/${r.id}/vitals_json`, at, at);
        provenance(db, { id:`prov-${id}`, patientId:r.id, entityType:"observation", entityId:id,
          activity:"backfill", sourceType:"legacy-json", sourceSystem:"ehr-local",
          sourceRef:`patients/${r.id}/vitals_json`, payload, createdAt:at });
      });
    }
  }
}

function backfillLabs(db: DatabaseSync) {
  for (const [patientId, labs] of Object.entries(patientLabHistory)) {
    for (const lab of labs) {
      const at = iso(lab.date);
      db.prepare(`INSERT OR IGNORE INTO observations
        (id, patient_id, category, code, coding_system, test_name, effective_at, value_text,
         unit, reference_range, interpretation, status, source_system, source_ref, observed_by, created_at, updated_at)
        VALUES (?, ?, 'laboratory', ?, 'LOINC', ?, ?, ?, ?, ?, ?, 'final', 'synthetic-fixture-migration', ?, ?, ?, ?)`)
        .run(lab.id, patientId, lab.code, lab.testName, at, lab.value, lab.unit, lab.referenceRange,
          lab.flag || null, `clinical-protocols/patientLabHistory/${patientId}/${lab.id}`, lab.orderedBy, at, at);
      provenance(db, { id:`prov-${lab.id}`, patientId, entityType:"observation", entityId:lab.id,
        activity:"backfill", sourceType:"synthetic-fixture", sourceSystem:"ehr-prototype",
        sourceRef:`clinical-protocols/patientLabHistory/${patientId}/${lab.id}`, payload:lab, createdAt:at });
    }
  }
}

export function ensureClinicalRecordFoundation(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS patient_allergies (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, substance TEXT NOT NULL, reaction TEXT,
      severity TEXT, status TEXT NOT NULL DEFAULT 'active', source_type TEXT NOT NULL DEFAULT 'clinician',
      source_system TEXT NOT NULL DEFAULT 'ehr-local', source_ref TEXT, recorded_by TEXT NOT NULL,
      recorded_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE);

    CREATE TABLE IF NOT EXISTS patient_problems (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, code TEXT, coding_system TEXT, display_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', onset_date TEXT, resolved_date TEXT,
      source_type TEXT NOT NULL DEFAULT 'clinician', source_system TEXT NOT NULL DEFAULT 'ehr-local',
      source_ref TEXT, recorded_by TEXT NOT NULL, recorded_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE);

    CREATE TABLE IF NOT EXISTS patient_medications (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, display_text TEXT NOT NULL, medication_name TEXT NOT NULL,
      generic_name TEXT, strength TEXT, dose TEXT, route TEXT, frequency TEXT,
      status TEXT NOT NULL DEFAULT 'active', start_date TEXT, end_date TEXT, prescriber TEXT,
      source_type TEXT NOT NULL DEFAULT 'clinician', source_system TEXT NOT NULL DEFAULT 'ehr-local',
      source_ref TEXT, recorded_by TEXT NOT NULL, recorded_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE);

    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, category TEXT NOT NULL, code TEXT, coding_system TEXT,
      test_name TEXT NOT NULL, effective_at TEXT NOT NULL, value_text TEXT NOT NULL, value_num REAL,
      unit TEXT, reference_range TEXT, interpretation TEXT, status TEXT NOT NULL DEFAULT 'final',
      source_system TEXT NOT NULL, source_ref TEXT, order_id TEXT, document_id TEXT, observed_by TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL);

    CREATE TABLE IF NOT EXISTS insurance_policies (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, payer_name TEXT NOT NULL, plan_name TEXT,
      member_id TEXT, group_number TEXT, subscriber_name TEXT, relationship TEXT,
      status TEXT NOT NULL DEFAULT 'active', effective_date TEXT, termination_date TEXT,
      source_system TEXT NOT NULL DEFAULT 'ehr-local', source_ref TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE);

    CREATE TABLE IF NOT EXISTS pharmacies (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, ncpdp_id TEXT, phone TEXT, fax TEXT,
      address_line1 TEXT, address_line2 TEXT, city TEXT, state TEXT, postal_code TEXT,
      source_system TEXT NOT NULL DEFAULT 'ehr-local', source_ref TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS patient_pharmacies (
      patient_id TEXT NOT NULL, pharmacy_id TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY(patient_id, pharmacy_id),
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(pharmacy_id) REFERENCES pharmacies(id) ON DELETE CASCADE);

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, document_type TEXT NOT NULL, title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', current_version INTEGER NOT NULL DEFAULT 1,
      mime_type TEXT NOT NULL DEFAULT 'text/plain', storage_key TEXT, content_sha256 TEXT,
      source_system TEXT NOT NULL DEFAULT 'ehr-local', source_ref TEXT, created_by TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE);

    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY, document_id TEXT NOT NULL, version_number INTEGER NOT NULL,
      storage_key TEXT, content_text TEXT, mime_type TEXT NOT NULL DEFAULT 'text/plain',
      content_sha256 TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(document_id, version_number), FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE RESTRICT);

    CREATE TABLE IF NOT EXISTS result_acknowledgements (
      id TEXT PRIMARY KEY, observation_id TEXT NOT NULL UNIQUE, patient_id TEXT NOT NULL,
      acknowledged_by TEXT NOT NULL, acknowledged_at TEXT NOT NULL, disposition TEXT NOT NULL, note TEXT,
      FOREIGN KEY(observation_id) REFERENCES observations(id) ON DELETE RESTRICT,
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE RESTRICT);

    CREATE TABLE IF NOT EXISTS encounter_addenda (
      id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL, patient_id TEXT NOT NULL,
      addendum_type TEXT NOT NULL DEFAULT 'addendum', body TEXT NOT NULL, reason TEXT,
      created_by TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY(encounter_id) REFERENCES encounters(id) ON DELETE RESTRICT,
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE RESTRICT);

    CREATE TABLE IF NOT EXISTS record_versions (
      id TEXT PRIMARY KEY, patient_id TEXT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      version_number INTEGER NOT NULL, operation TEXT NOT NULL, snapshot_json TEXT NOT NULL,
      actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, source_type TEXT NOT NULL, source_ref TEXT,
      created_at TEXT NOT NULL, UNIQUE(entity_type, entity_id, version_number),
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE SET NULL);

    CREATE TABLE IF NOT EXISTS provenance_events (
      id TEXT PRIMARY KEY, patient_id TEXT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      activity TEXT NOT NULL, source_type TEXT NOT NULL, source_system TEXT NOT NULL, source_ref TEXT,
      actor_id TEXT, actor_name TEXT, payload_sha256 TEXT, metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL, FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE SET NULL);

    CREATE INDEX IF NOT EXISTS idx_allergies_patient_status ON patient_allergies(patient_id, status);
    CREATE INDEX IF NOT EXISTS idx_problems_patient_status ON patient_problems(patient_id, status);
    CREATE INDEX IF NOT EXISTS idx_medications_patient_status ON patient_medications(patient_id, status);
    CREATE INDEX IF NOT EXISTS idx_observations_patient_effective ON observations(patient_id, effective_at DESC);
    CREATE INDEX IF NOT EXISTS idx_insurance_patient_status ON insurance_policies(patient_id, status);
    CREATE INDEX IF NOT EXISTS idx_documents_patient ON documents(patient_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_versions_entity ON record_versions(entity_type, entity_id, version_number DESC);
    CREATE INDEX IF NOT EXISTS idx_provenance_entity ON provenance_events(entity_type, entity_id, created_at DESC);
  `);

  backfillPatientJson(db);
  backfillLabs(db);
}
