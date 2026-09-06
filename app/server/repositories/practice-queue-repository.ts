import { getDatabase } from "../db/connection";

export type PracticeLabQueueRow = {
  observationId: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  patientInitials: string;
  category: string;
  testName: string;
  effectiveAt: string;
  valueText: string;
  valueNum: number | null;
  unit: string | null;
  referenceRange: string | null;
  interpretation: string | null;
  status: string;
  sourceSystem: string | null;
  sourceRef: string | null;
  documentId: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  disposition: string | null;
  acknowledgementNote: string | null;
};

export type PracticeDocumentQueueRow = {
  documentId: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  patientInitials: string;
  documentType: string;
  title: string;
  status: string;
  currentVersion: number;
  mimeType: string | null;
  storageKey: string | null;
  sourceSystem: string | null;
  sourceRef: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export const PracticeQueueRepository = {
  labs(limit = 500): PracticeLabQueueRow[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT
        o.id AS observation_id,
        o.patient_id,
        p.name AS patient_name,
        p.mrn AS patient_mrn,
        p.initials AS patient_initials,
        o.category,
        o.test_name,
        o.effective_at,
        o.value_text,
        o.value_num,
        o.unit,
        o.reference_range,
        o.interpretation,
        o.status,
        o.source_system,
        o.source_ref,
        o.document_id,
        ra.acknowledged_by,
        ra.acknowledged_at,
        ra.disposition,
        ra.note AS acknowledgement_note
      FROM observations o
      JOIN patients p ON p.id = o.patient_id
      LEFT JOIN result_acknowledgements ra ON ra.observation_id = o.id
      WHERE LOWER(o.category) IN ('laboratory', 'lab', 'labs')
      ORDER BY
        CASE WHEN ra.acknowledged_at IS NULL THEN 0 ELSE 1 END ASC,
        CASE
          WHEN LOWER(COALESCE(o.interpretation, '')) IN ('critical', 'abnormal', 'high', 'low', 'positive') THEN 0
          ELSE 1
        END ASC,
        o.effective_at DESC
      LIMIT ?
    `).all(Math.max(1, Math.min(limit, 2000))) as any[];

    return rows.map((row) => ({
      observationId: String(row.observation_id),
      patientId: String(row.patient_id),
      patientName: String(row.patient_name),
      patientMrn: String(row.patient_mrn),
      patientInitials: String(row.patient_initials || ""),
      category: String(row.category || "laboratory"),
      testName: String(row.test_name || "Lab result"),
      effectiveAt: String(row.effective_at || ""),
      valueText: String(row.value_text || ""),
      valueNum: row.value_num === null || row.value_num === undefined ? null : Number(row.value_num),
      unit: row.unit ? String(row.unit) : null,
      referenceRange: row.reference_range ? String(row.reference_range) : null,
      interpretation: row.interpretation ? String(row.interpretation) : null,
      status: String(row.status || "final"),
      sourceSystem: row.source_system ? String(row.source_system) : null,
      sourceRef: row.source_ref ? String(row.source_ref) : null,
      documentId: row.document_id ? String(row.document_id) : null,
      acknowledgedBy: row.acknowledged_by ? String(row.acknowledged_by) : null,
      acknowledgedAt: row.acknowledged_at ? String(row.acknowledged_at) : null,
      disposition: row.disposition ? String(row.disposition) : null,
      acknowledgementNote: row.acknowledgement_note ? String(row.acknowledgement_note) : null,
    }));
  },

  documents(limit = 500): PracticeDocumentQueueRow[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT
        d.id AS document_id,
        d.patient_id,
        p.name AS patient_name,
        p.mrn AS patient_mrn,
        p.initials AS patient_initials,
        d.document_type,
        d.title,
        d.status,
        d.current_version,
        d.mime_type,
        d.storage_key,
        d.source_system,
        d.source_ref,
        d.created_by,
        d.created_at,
        d.updated_at
      FROM documents d
      JOIN patients p ON p.id = d.patient_id
      ORDER BY d.updated_at DESC, d.created_at DESC
      LIMIT ?
    `).all(Math.max(1, Math.min(limit, 2000))) as any[];

    return rows.map((row) => ({
      documentId: String(row.document_id),
      patientId: String(row.patient_id),
      patientName: String(row.patient_name),
      patientMrn: String(row.patient_mrn),
      patientInitials: String(row.patient_initials || ""),
      documentType: String(row.document_type || "document"),
      title: String(row.title || "Untitled document"),
      status: String(row.status || "active"),
      currentVersion: Number(row.current_version || 1),
      mimeType: row.mime_type ? String(row.mime_type) : null,
      storageKey: row.storage_key ? String(row.storage_key) : null,
      sourceSystem: row.source_system ? String(row.source_system) : null,
      sourceRef: row.source_ref ? String(row.source_ref) : null,
      createdBy: row.created_by ? String(row.created_by) : null,
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || row.created_at || ""),
    }));
  },
};
