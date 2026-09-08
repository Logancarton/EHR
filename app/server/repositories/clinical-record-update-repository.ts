import { createHash, randomUUID } from "node:crypto";
import { getDatabase } from "../db/connection";
import type { AllergySeverity, AllergyStatus, MedicationStatus, ProblemStatus } from "../../domain/clinical-records";
import type { RecordActor, RecordSource } from "./clinical-record-repository";

function now() { return new Date().toISOString(); }
function today() { return now().slice(0, 10); }
function id(prefix: string) { return `${prefix}-${randomUUID()}`; }
function sha(value: unknown) { return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }

type ClinicalSqlValue = string | number | null | undefined;

function stamp(entityType: string, entityId: string, patientId: string, operation: string,
  snapshot: unknown, actor: RecordActor, source: RecordSource = {}) {
  const db = getDatabase();
  const existing = db.prepare(`SELECT COALESCE(MAX(version_number), 0) AS n FROM record_versions WHERE entity_type = ? AND entity_id = ?`)
    .get(entityType, entityId) as { n: number };
  const versionNumber = Number(existing?.n || 0) + 1;
  const at = now();
  db.prepare(`INSERT INTO record_versions
    (id, patient_id, entity_type, entity_id, version_number, operation, snapshot_json,
     actor_id, actor_name, source_type, source_ref, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id("ver"), patientId, entityType, entityId, versionNumber, operation, JSON.stringify(snapshot),
      actor.userId, actor.displayName, source.type || "clinician", source.ref || null, at);
  db.prepare(`INSERT INTO provenance_events
    (id, patient_id, entity_type, entity_id, activity, source_type, source_system, source_ref,
     actor_id, actor_name, payload_sha256, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)`)
    .run(id("prov"), patientId, entityType, entityId, operation, source.type || "clinician",
      source.system || "ehr-local", source.ref || null, actor.userId, actor.displayName, sha(snapshot), at);
}

function updateRow(options: {
  table: "patient_allergies" | "patient_problems" | "patient_medications" | "insurance_policies";
  entityType: "allergy" | "problem" | "medication" | "insurance";
  recordId: string;
  columns: Record<string, ClinicalSqlValue>;
  actor: RecordActor;
  source?: RecordSource;
}) {
  const db = getDatabase();
  const current = db.prepare(`SELECT * FROM ${options.table} WHERE id = ?`).get(options.recordId) as any;
  if (!current) throw new Error(`${options.entityType} not found: ${options.recordId}`);

  const entries = Object.entries(options.columns).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return current;
  const set = entries.map(([column]) => `${column} = ?`).join(", ");
  const values: Array<string | number | null> = entries.map(([, value]) => value ?? null);
  db.prepare(`UPDATE ${options.table} SET ${set}, updated_at = ? WHERE id = ?`)
    .run(...values, now(), options.recordId);
  const updated = db.prepare(`SELECT * FROM ${options.table} WHERE id = ?`).get(options.recordId) as any;
  stamp(options.entityType, options.recordId, current.patient_id, "update", updated, options.actor, options.source);
  return updated;
}

export const ClinicalRecordUpdateRepository = {
  updateAllergy(recordId: string, patch: {
    reaction?: string | null;
    severity?: AllergySeverity;
    status?: AllergyStatus;
  }, actor: RecordActor, source: RecordSource = {}) {
    return updateRow({
      table:"patient_allergies", entityType:"allergy", recordId, actor, source,
      columns:{ reaction:patch.reaction, severity:patch.severity, status:patch.status },
    });
  },

  updateProblem(recordId: string, patch: {
    displayText?: string;
    code?: string | null;
    codingSystem?: string | null;
    onsetDate?: string | null;
    status?: ProblemStatus;
    resolvedDate?: string | null;
  }, actor: RecordActor, source: RecordSource = {}) {
    const normalizedResolvedDate = patch.status === "resolved"
      ? patch.resolvedDate || today()
      : patch.status !== undefined
        ? null
        : patch.resolvedDate;

    return updateRow({
      table:"patient_problems", entityType:"problem", recordId, actor, source,
      columns:{
        display_text:patch.displayText,
        code:patch.code,
        coding_system:patch.codingSystem,
        onset_date:patch.onsetDate,
        status:patch.status,
        resolved_date:normalizedResolvedDate,
      },
    });
  },

  updateMedication(recordId: string, patch: {
    displayText?: string;
    medicationName?: string;
    genericName?: string | null;
    strength?: string | null;
    dose?: string | null;
    route?: string | null;
    frequency?: string | null;
    startDate?: string | null;
    prescriber?: string | null;
    status?: MedicationStatus;
    endDate?: string | null;
  }, actor: RecordActor, source: RecordSource = {}) {
    const normalizedEndDate = patch.status === "discontinued" || patch.status === "completed"
      ? patch.endDate || today()
      : patch.status === "active"
        ? null
        : patch.endDate;

    return updateRow({
      table:"patient_medications", entityType:"medication", recordId, actor, source,
      columns:{
        display_text:patch.displayText,
        medication_name:patch.medicationName,
        generic_name:patch.genericName,
        strength:patch.strength,
        dose:patch.dose,
        route:patch.route,
        frequency:patch.frequency,
        start_date:patch.startDate,
        prescriber:patch.prescriber,
        status:patch.status,
        end_date:normalizedEndDate,
      },
    });
  },

  updateInsurance(recordId: string, patch: {
    planName?: string | null;
    memberId?: string | null;
    groupNumber?: string | null;
    subscriberName?: string | null;
    relationship?: string | null;
    status?: "active" | "inactive" | "terminated" | "entered-in-error";
    terminationDate?: string | null;
  }, actor: RecordActor, source: RecordSource = {}) {
    return updateRow({
      table:"insurance_policies", entityType:"insurance", recordId, actor, source,
      columns:{
        plan_name:patch.planName,
        member_id:patch.memberId,
        group_number:patch.groupNumber,
        subscriber_name:patch.subscriberName,
        relationship:patch.relationship,
        status:patch.status,
        termination_date:patch.terminationDate,
      },
    });
  },

  updatePatientPharmacy(patientId: string, pharmacyId: string, patch: {
    priority?: number;
    status?: "active" | "inactive";
  }, actor: RecordActor, source: RecordSource = {}) {
    const db = getDatabase();
    const current = db.prepare(`SELECT * FROM patient_pharmacies WHERE patient_id = ? AND pharmacy_id = ?`)
      .get(patientId, pharmacyId) as any;
    if (!current) throw new Error(`Patient pharmacy link not found: ${pharmacyId}`);
    const priority = patch.priority ?? current.priority;
    const status = patch.status ?? current.status;
    db.prepare(`UPDATE patient_pharmacies SET priority = ?, status = ?, updated_at = ? WHERE patient_id = ? AND pharmacy_id = ?`)
      .run(priority, status, now(), patientId, pharmacyId);
    const updated = db.prepare(`SELECT * FROM patient_pharmacies WHERE patient_id = ? AND pharmacy_id = ?`)
      .get(patientId, pharmacyId) as any;
    stamp("pharmacy", pharmacyId, patientId, "update-link", updated, actor, source);
    return updated;
  },
};