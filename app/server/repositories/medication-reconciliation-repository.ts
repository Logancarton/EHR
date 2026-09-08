import { createHash, randomUUID } from "node:crypto";
import type {
  EditMedicationCandidateInput,
  MedicationCandidateStatus,
  MedicationReconciliationCandidate,
  MedicationReconciliationDecision,
  RecordMedicationCandidateInput,
} from "../../domain/medication-reconciliation";
import { getDatabase } from "../db/connection";
import type { RecordActor, RecordSource } from "./clinical-record-repository";

function id(prefix: string) { return `${prefix}-${randomUUID()}`; }
function now() { return new Date().toISOString(); }
function sha(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function asCandidate(row: unknown): MedicationReconciliationCandidate | null {
  if (!row) return null;
  const candidate = row as MedicationReconciliationCandidate;
  return {
    ...candidate,
    raw_evidence_text: candidate.raw_evidence_text || candidate.display_text,
  };
}

function stamp(
  candidate: MedicationReconciliationCandidate,
  operation: string,
  actor: RecordActor,
  source: RecordSource,
) {
  const db = getDatabase();
  const existing = db.prepare(`
    SELECT COALESCE(MAX(version_number), 0) AS n
    FROM record_versions
    WHERE entity_type = 'medication-candidate' AND entity_id = ?
  `).get(candidate.id) as { n: number };
  const at = now();
  const versionNumber = Number(existing?.n || 0) + 1;

  db.prepare(`INSERT INTO record_versions (
    id, patient_id, entity_type, entity_id, version_number, operation, snapshot_json,
    actor_id, actor_name, source_type, source_ref, created_at
  ) VALUES (?, ?, 'medication-candidate', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id("ver"), candidate.patient_id, candidate.id, versionNumber, operation,
      JSON.stringify(candidate), actor.userId, actor.displayName,
      source.type || "clinician", source.ref || null, at,
    );

  db.prepare(`INSERT INTO provenance_events (
    id, patient_id, entity_type, entity_id, activity, source_type, source_system, source_ref,
    actor_id, actor_name, payload_sha256, metadata_json, created_at
  ) VALUES (?, ?, 'medication-candidate', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id("prov"), candidate.patient_id, candidate.id, operation,
      source.type || "clinician", source.system || "ehr-local", source.ref || null,
      actor.userId, actor.displayName, sha(candidate),
      JSON.stringify({ linkedMedicationId: candidate.linked_medication_id, decision: candidate.decision }),
      at,
    );
}

export const MedicationReconciliationRepository = {
  list(patientId: string, status?: MedicationCandidateStatus): MedicationReconciliationCandidate[] {
    const db = getDatabase();
    const rows = status
      ? db.prepare(`SELECT * FROM medication_reconciliation_candidates
          WHERE patient_id = ? AND status = ? ORDER BY created_at DESC`).all(patientId, status)
      : db.prepare(`SELECT * FROM medication_reconciliation_candidates
          WHERE patient_id = ? ORDER BY status = 'pending' DESC, created_at DESC`).all(patientId);
    return rows.map((row) => asCandidate(row)!).filter(Boolean);
  },

  getById(candidateId: string): MedicationReconciliationCandidate | null {
    const row = getDatabase().prepare(`SELECT * FROM medication_reconciliation_candidates WHERE id = ?`)
      .get(candidateId);
    return asCandidate(row);
  },

  record(input: RecordMedicationCandidateInput, actor: RecordActor): MedicationReconciliationCandidate {
    const db = getDatabase();
    const candidateId = id("medcand");
    const at = now();
    const sourceSystem = input.sourceSystem || "ehr-local";
    const source: RecordSource = {
      type: input.sourceType,
      system: sourceSystem,
      ref: input.sourceRef,
    };

    db.prepare(`INSERT INTO medication_reconciliation_candidates (
      id, patient_id, source_type, source_system, source_ref, evidence_type,
      raw_evidence_text, display_text, medication_name, generic_name, strength, dose, route, frequency,
      start_date, end_date, prescriber, observed_at, status, linked_medication_id,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`)
      .run(
        candidateId, input.patientId, input.sourceType, sourceSystem, input.sourceRef || null,
        input.evidenceType || "other", input.displayText, input.displayText,
        input.medicationName || input.displayText, input.genericName || null, input.strength || null,
        input.dose || null, input.route || null, input.frequency || null, input.startDate || null,
        input.endDate || null, input.prescriber || null, input.observedAt || null,
        input.linkedMedicationId || null, actor.displayName, at, at,
      );

    const candidate = this.getById(candidateId);
    if (!candidate) throw new Error(`Medication candidate not found after creation: ${candidateId}`);
    stamp(candidate, "create", actor, source);
    return candidate;
  },

  editInterpretation(
    candidateId: string,
    patch: EditMedicationCandidateInput["patch"],
    actor: RecordActor,
  ): MedicationReconciliationCandidate {
    const db = getDatabase();
    const current = this.getById(candidateId);
    if (!current) throw new Error(`Medication candidate not found: ${candidateId}`);
    if (current.status !== "pending") {
      throw new Error(`Medication candidate ${candidateId} is already resolved as ${current.status}.`);
    }

    const next = {
      display_text: patch.displayText ?? current.display_text,
      medication_name: patch.medicationName ?? current.medication_name,
      generic_name: patch.genericName === undefined ? current.generic_name : patch.genericName,
      strength: patch.strength === undefined ? current.strength : patch.strength,
      dose: patch.dose === undefined ? current.dose : patch.dose,
      route: patch.route === undefined ? current.route : patch.route,
      frequency: patch.frequency === undefined ? current.frequency : patch.frequency,
      start_date: patch.startDate === undefined ? current.start_date : patch.startDate,
      end_date: patch.endDate === undefined ? current.end_date : patch.endDate,
      prescriber: patch.prescriber === undefined ? current.prescriber : patch.prescriber,
    };
    const at = now();
    db.prepare(`UPDATE medication_reconciliation_candidates SET
      display_text = ?, medication_name = ?, generic_name = ?, strength = ?, dose = ?, route = ?,
      frequency = ?, start_date = ?, end_date = ?, prescriber = ?, updated_at = ?
      WHERE id = ?`)
      .run(
        next.display_text, next.medication_name, next.generic_name, next.strength, next.dose,
        next.route, next.frequency, next.start_date, next.end_date, next.prescriber, at, candidateId,
      );

    const edited = this.getById(candidateId);
    if (!edited) throw new Error(`Medication candidate not found after interpretation edit: ${candidateId}`);
    stamp(edited, "edit-interpretation", actor, {
      type: "clinician",
      system: "ehr-local",
      ref: `medication-candidate/${candidateId}`,
    });
    return edited;
  },

  resolve(
    candidateId: string,
    decision: MedicationReconciliationDecision,
    linkedMedicationId: string | null,
    actor: RecordActor,
  ): MedicationReconciliationCandidate {
    const db = getDatabase();
    const current = this.getById(candidateId);
    if (!current) throw new Error(`Medication candidate not found: ${candidateId}`);
    if (current.status !== "pending") {
      throw new Error(`Medication candidate ${candidateId} is already resolved as ${current.status}.`);
    }

    const status: MedicationCandidateStatus = decision === "ignore" ? "ignored" : "accepted";
    const at = now();
    db.prepare(`UPDATE medication_reconciliation_candidates
      SET status = ?, linked_medication_id = ?, decision = ?, resolved_by = ?, resolved_at = ?, updated_at = ?
      WHERE id = ?`)
      .run(status, linkedMedicationId, decision, actor.displayName, at, at, candidateId);

    const resolved = this.getById(candidateId);
    if (!resolved) throw new Error(`Medication candidate not found after resolution: ${candidateId}`);
    stamp(resolved, `reconcile-${decision}`, actor, {
      type: "clinician",
      system: "ehr-local",
      ref: `medication-candidate/${candidateId}`,
    });
    return resolved;
  },
};
