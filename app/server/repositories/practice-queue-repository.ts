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
  orderId: string | null;
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
  workflowStatus: string;
  workflowUpdatedAt: string | null;
  currentVersion: number;
  mimeType: string | null;
  storageKey: string | null;
  sourceSystem: string | null;
  sourceRef: string | null;
  createdBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  filedBy: string | null;
  filedAt: string | null;
  supersededByDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PracticeUnsignedEncounterRow = {
  encounterId: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  patientInitials: string;
  encounterType: string;
  date: string;
  chiefComplaint: string;
  appointmentId: string | null;
  updatedAt: string;
};

export type PracticeRefillQueueRow = {
  requestId: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  patientInitials: string;
  medicationName: string;
  requestSource: string;
  sourceSystem: string;
  sourceReference: string | null;
  status: string;
  requestedAt: string;
  note: string | null;
  priorOrderId: string;
};

export type PracticeHandoffQueueRow = {
  handoffId: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  patientInitials: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  reason: string;
  clinicalSummary: string;
  status: string;
  createdAt: string;
};

export type PracticeVisitPrepSummary = {
  appointmentId: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  patientInitials: string;
  time: string;
  duration: string;
  visitType: string;
  chiefComplaint: string;
  room: string | null;
  providerId: string | null;
  providerName: string | null;
  lastVisitDate: string | null;
  activeDiagnosesCount: number;
  topDiagnoses: string[];
  activeMedicationsCount: number;
  vitals: {
    recordedAt?: string;
    bp?: string;
    hr?: number;
    wt?: string;
  };
  hasUnsignedDraft: boolean;
  unacknowledgedLabsCount: number;
};

export type PracticeQueueCounts = {
  unsigned: number;
  labs: number;
  documents: number;
  refills: number;
  handoffs: number;
};

/**
 * Cross-patient queues must be narrowed to the caller's accessible patient
 * population before the LIMIT is applied, otherwise a scoped clinician would see a
 * short page assembled from charts they may not open.
 */
function scopeClause(column: string, patientIds: readonly string[] | undefined): {
  sql: string;
  params: string[];
} {
  if (!patientIds) return { sql: "", params: [] };
  if (patientIds.length === 0) return { sql: " AND 1 = 0", params: [] };
  return {
    sql: ` AND ${column} IN (${patientIds.map(() => "?").join(", ")})`,
    params: [...patientIds],
  };
}

export const PracticeQueueRepository = {
  labs(limit = 500, patientIds?: readonly string[]): PracticeLabQueueRow[] {
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
        o.order_id,
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
      WHERE LOWER(o.category) IN ('laboratory', 'lab', 'labs')${scopeClause("o.patient_id", patientIds).sql}
      ORDER BY
        CASE WHEN ra.acknowledged_at IS NULL THEN 0 ELSE 1 END ASC,
        CASE
          WHEN LOWER(COALESCE(o.interpretation, '')) IN ('critical', 'abnormal', 'high', 'low', 'positive') THEN 0
          ELSE 1
        END ASC,
        o.effective_at DESC
      LIMIT ?
    `).all(...scopeClause("o.patient_id", patientIds).params, Math.max(1, Math.min(limit, 2000))) as any[];

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
      orderId: row.order_id ? String(row.order_id) : null,
      sourceSystem: row.source_system ? String(row.source_system) : null,
      sourceRef: row.source_ref ? String(row.source_ref) : null,
      documentId: row.document_id ? String(row.document_id) : null,
      acknowledgedBy: row.acknowledged_by ? String(row.acknowledged_by) : null,
      acknowledgedAt: row.acknowledged_at ? String(row.acknowledged_at) : null,
      disposition: row.disposition ? String(row.disposition) : null,
      acknowledgementNote: row.acknowledgement_note ? String(row.acknowledgement_note) : null,
    }));
  },

  documents(limit = 500, patientIds?: readonly string[]): PracticeDocumentQueueRow[] {
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
        d.workflow_status,
        d.workflow_updated_at,
        d.current_version,
        d.mime_type,
        d.storage_key,
        d.source_system,
        d.source_ref,
        d.created_by,
        d.reviewed_by,
        d.reviewed_at,
        d.filed_by,
        d.filed_at,
        d.superseded_by_document_id,
        d.created_at,
        d.updated_at
      FROM documents d
      JOIN patients p ON p.id = d.patient_id
      WHERE 1 = 1${scopeClause("d.patient_id", patientIds).sql}
      ORDER BY
        CASE d.workflow_status
          WHEN 'received' THEN 0
          WHEN 'needs_review' THEN 1
          WHEN 'reviewed' THEN 2
          WHEN 'filed' THEN 3
          ELSE 4
        END ASC,
        d.updated_at DESC,
        d.created_at DESC
      LIMIT ?
    `).all(...scopeClause("d.patient_id", patientIds).params, Math.max(1, Math.min(limit, 2000))) as any[];

    return rows.map((row) => ({
      documentId: String(row.document_id),
      patientId: String(row.patient_id),
      patientName: String(row.patient_name),
      patientMrn: String(row.patient_mrn),
      patientInitials: String(row.patient_initials || ""),
      documentType: String(row.document_type || "document"),
      title: String(row.title || "Untitled document"),
      status: String(row.status || "active"),
      workflowStatus: String(row.workflow_status || "needs_review"),
      workflowUpdatedAt: row.workflow_updated_at ? String(row.workflow_updated_at) : null,
      currentVersion: Number(row.current_version || 1),
      mimeType: row.mime_type ? String(row.mime_type) : null,
      storageKey: row.storage_key ? String(row.storage_key) : null,
      sourceSystem: row.source_system ? String(row.source_system) : null,
      sourceRef: row.source_ref ? String(row.source_ref) : null,
      createdBy: row.created_by ? String(row.created_by) : null,
      reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
      filedBy: row.filed_by ? String(row.filed_by) : null,
      filedAt: row.filed_at ? String(row.filed_at) : null,
      supersededByDocumentId: row.superseded_by_document_id ? String(row.superseded_by_document_id) : null,
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || row.created_at || ""),
    }));
  },

  /**
   * Drafts still waiting for a signature, across the caller's whole population.
   *
   * The dashboard's attention queue was a hand-written fixture naming one chart,
   * which meant it said the same thing on an empty practice as on a backlog of
   * twenty. Unfinished notes are the one thing every clinician has to come back to,
   * and they are not confined to today's schedule — so this is a query over the
   * encounters that already exist rather than a new store.
   */
  unsignedEncounters(limit = 500, patientIds?: readonly string[]): PracticeUnsignedEncounterRow[] {
    const db = getDatabase();
    const scope = scopeClause("e.patient_id", patientIds);
    const rows = db.prepare(`
      SELECT
        e.id AS encounter_id,
        e.patient_id,
        p.name AS patient_name,
        p.mrn AS patient_mrn,
        p.initials AS patient_initials,
        e.type AS encounter_type,
        e.date,
        e.chief_complaint,
        e.appointment_id,
        e.updated_at
      FROM encounters e
      JOIN patients p ON p.id = e.patient_id
      WHERE e.status = 'draft'${scope.sql}
      ORDER BY e.updated_at DESC
      LIMIT ?
    `).all(...scope.params, Math.max(1, Math.min(limit, 2000))) as any[];

    return rows.map((row) => ({
      encounterId: String(row.encounter_id),
      patientId: String(row.patient_id),
      patientName: String(row.patient_name),
      patientMrn: String(row.patient_mrn),
      patientInitials: String(row.patient_initials || ""),
      encounterType: String(row.encounter_type || "Encounter"),
      date: String(row.date || ""),
      chiefComplaint: String(row.chief_complaint || ""),
      appointmentId: row.appointment_id ? String(row.appointment_id) : null,
      updatedAt: String(row.updated_at || ""),
    }));
  },

  refillRequests(limit = 500, patientIds?: readonly string[]): PracticeRefillQueueRow[] {
    const db = getDatabase();
    const scope = scopeClause("r.patient_id", patientIds);
    const rows = db.prepare(`
      SELECT
        r.id AS request_id,
        r.patient_id,
        p.name AS patient_name,
        p.mrn AS patient_mrn,
        p.initials AS patient_initials,
        COALESCE(o.name, 'Medication Renewal') AS medication_name,
        r.request_source,
        r.source_system,
        r.source_reference,
        r.status,
        r.created_at AS requested_at,
        r.note,
        r.prior_order_id
      FROM prescription_refill_requests r
      JOIN patients p ON p.id = r.patient_id
      LEFT JOIN orders o ON o.id = r.prior_order_id
      WHERE r.status = 'pending'${scope.sql}
      ORDER BY r.created_at DESC
      LIMIT ?
    `).all(...scope.params, Math.max(1, Math.min(limit, 2000))) as any[];

    return rows.map((row) => ({
      requestId: String(row.request_id),
      patientId: String(row.patient_id),
      patientName: String(row.patient_name),
      patientMrn: String(row.patient_mrn),
      patientInitials: String(row.patient_initials || ""),
      medicationName: String(row.medication_name),
      requestSource: String(row.request_source || "patient-portal"),
      sourceSystem: String(row.source_system || "internal"),
      sourceReference: row.source_reference ? String(row.source_reference) : null,
      status: String(row.status || "pending"),
      requestedAt: String(row.requested_at || ""),
      note: row.note ? String(row.note) : null,
      priorOrderId: String(row.prior_order_id || ""),
    }));
  },

  pendingHandoffs(limit = 500, patientIds?: readonly string[], toUserId?: string): PracticeHandoffQueueRow[] {
    const db = getDatabase();
    const scope = scopeClause("h.patient_id", patientIds);
    let userFilter = "";
    const userParams: string[] = [];
    if (toUserId) {
      userFilter = " AND h.to_user_id = ?";
      userParams.push(toUserId);
    }
    const rows = db.prepare(`
      SELECT
        h.id AS handoff_id,
        h.appointment_id,
        h.patient_id,
        p.name AS patient_name,
        p.mrn AS patient_mrn,
        p.initials AS patient_initials,
        h.from_user_id,
        h.from_user_name,
        h.to_user_id,
        h.to_user_name,
        h.reason,
        h.clinical_summary,
        h.status,
        h.created_at
      FROM appointment_handoffs h
      JOIN patients p ON p.id = h.patient_id
      WHERE h.status = 'pending'${userFilter}${scope.sql}
      ORDER BY h.created_at DESC
      LIMIT ?
    `).all(...userParams, ...scope.params, Math.max(1, Math.min(limit, 2000))) as any[];

    return rows.map((row) => ({
      handoffId: String(row.handoff_id),
      appointmentId: String(row.appointment_id),
      patientId: String(row.patient_id),
      patientName: String(row.patient_name),
      patientMrn: String(row.patient_mrn),
      patientInitials: String(row.patient_initials || ""),
      fromUserId: String(row.from_user_id),
      fromUserName: String(row.from_user_name),
      toUserId: String(row.to_user_id),
      toUserName: String(row.to_user_name),
      reason: String(row.reason || ""),
      clinicalSummary: String(row.clinical_summary || ""),
      status: String(row.status || "pending"),
      createdAt: String(row.created_at || ""),
    }));
  },

  visitPrepSummaries(date: string, limit = 100, patientIds?: readonly string[]): PracticeVisitPrepSummary[] {
    const db = getDatabase();
    const scope = scopeClause("a.patient_id", patientIds);
    const rows = db.prepare(`
      SELECT
        a.id AS appointment_id,
        a.patient_id,
        p.name AS patient_name,
        p.mrn AS patient_mrn,
        p.initials AS patient_initials,
        a.time,
        a.duration,
        a.type AS visit_type,
        a.chief_complaint,
        a.room,
        a.provider_id,
        a.provider_name,
        p.last_visit AS last_visit_date
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      WHERE a.date = ? AND a.status NOT IN ('cancelled', 'no-show')${scope.sql}
      ORDER BY a.time ASC
      LIMIT ?
    `).all(date, ...scope.params, Math.max(1, Math.min(limit, 500))) as any[];

    return rows.map((r) => {
      // Diagnoses
      const probRows = db.prepare(`SELECT display_text FROM patient_problems WHERE patient_id = ? AND status = 'active' ORDER BY recorded_at DESC`).all(r.patient_id) as any[];
      const topDiagnoses = probRows.slice(0, 3).map((x) => String(x.display_text));

      // Meds count
      const medCountRow = db.prepare(`SELECT COUNT(*) as count FROM patient_medications WHERE patient_id = ? AND status = 'active'`).get(r.patient_id) as any;
      const activeMedicationsCount = Number(medCountRow?.count || 0);

      // Latest vitals
      const vitalRows = db.prepare(`SELECT code, value_text, value_num, effective_at FROM observations WHERE patient_id = ? AND category = 'vital-signs' ORDER BY effective_at DESC`).all(r.patient_id) as any[];
      const vitals: PracticeVisitPrepSummary["vitals"] = {};
      if (vitalRows.length > 0) {
        vitals.recordedAt = vitalRows[0].effective_at;
        for (const v of vitalRows) {
          const code = String(v.code || "").toLowerCase();
          if (!vitals.bp && (code === "bp" || code.includes("blood-pressure"))) vitals.bp = v.value_text;
          if (vitals.hr === undefined && (code === "hr" || code.includes("pulse"))) vitals.hr = Number(v.value_num ?? v.value_text);
          if (!vitals.wt && (code === "wt" || code.includes("weight"))) vitals.wt = v.value_text;
        }
      }

      // Check draft
      const draftRow = db.prepare(`SELECT id FROM encounters WHERE appointment_id = ? AND status = 'draft'`).get(r.appointment_id) as any;
      const hasUnsignedDraft = Boolean(draftRow);

      // Unacknowledged labs
      const labCountRow = db.prepare(`
        SELECT COUNT(*) as count
        FROM observations o
        LEFT JOIN result_acknowledgements ra ON ra.observation_id = o.id
        WHERE o.patient_id = ? AND LOWER(o.category) IN ('laboratory', 'lab', 'labs') AND ra.acknowledged_at IS NULL
      `).get(r.patient_id) as any;
      const unacknowledgedLabsCount = Number(labCountRow?.count || 0);

      return {
        appointmentId: String(r.appointment_id),
        patientId: String(r.patient_id),
        patientName: String(r.patient_name),
        patientMrn: String(r.patient_mrn),
        patientInitials: String(r.patient_initials || ""),
        time: String(r.time),
        duration: String(r.duration || "30 min"),
        visitType: String(r.visit_type || "Follow-up"),
        chiefComplaint: String(r.chief_complaint || ""),
        room: r.room ? String(r.room) : null,
        providerId: r.provider_id ? String(r.provider_id) : null,
        providerName: r.provider_name ? String(r.provider_name) : null,
        lastVisitDate: r.last_visit_date ? String(r.last_visit_date) : null,
        activeDiagnosesCount: probRows.length,
        topDiagnoses,
        activeMedicationsCount,
        vitals,
        hasUnsignedDraft,
        unacknowledgedLabsCount,
      };
    });
  },

  queueCounts(patientIds?: readonly string[]): PracticeQueueCounts {
    const db = getDatabase();
    const encScope = scopeClause("patient_id", patientIds);
    const labScope = scopeClause("o.patient_id", patientIds);
    const docScope = scopeClause("patient_id", patientIds);
    const refScope = scopeClause("patient_id", patientIds);
    const hanScope = scopeClause("patient_id", patientIds);

    const unsigned = (db.prepare(`SELECT COUNT(*) as count FROM encounters WHERE status = 'draft'${encScope.sql}`).get(...encScope.params) as any)?.count || 0;

    const labs = (db.prepare(`
      SELECT COUNT(*) as count
      FROM observations o
      LEFT JOIN result_acknowledgements ra ON ra.observation_id = o.id
      WHERE LOWER(o.category) IN ('laboratory', 'lab', 'labs') AND ra.acknowledged_at IS NULL${labScope.sql}
    `).get(...labScope.params) as any)?.count || 0;

    const documents = (db.prepare(`SELECT COUNT(*) as count FROM documents WHERE workflow_status IN ('received', 'needs_review')${docScope.sql}`).get(...docScope.params) as any)?.count || 0;

    const refills = (db.prepare(`SELECT COUNT(*) as count FROM prescription_refill_requests WHERE status = 'pending'${refScope.sql}`).get(...refScope.params) as any)?.count || 0;

    const handoffs = (db.prepare(`SELECT COUNT(*) as count FROM appointment_handoffs WHERE status = 'pending'${hanScope.sql}`).get(...hanScope.params) as any)?.count || 0;

    return {
      unsigned: Number(unsigned),
      labs: Number(labs),
      documents: Number(documents),
      refills: Number(refills),
      handoffs: Number(handoffs),
    };
  },
};
