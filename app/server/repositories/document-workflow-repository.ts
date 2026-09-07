import { createHash, randomUUID } from "node:crypto";
import { getDatabase } from "../db/connection";

export type DocumentWorkflowStatus = "received" | "needs_review" | "reviewed" | "filed" | "superseded";
export type DocumentWorkflowActor = { userId: string; displayName: string };

const allowedTransitions: Record<DocumentWorkflowStatus, readonly DocumentWorkflowStatus[]> = {
  received: ["needs_review"],
  needs_review: ["reviewed"],
  reviewed: ["filed"],
  filed: ["superseded"],
  superseded: [],
};

function now() { return new Date().toISOString(); }
function id(prefix: string) { return `${prefix}-${randomUUID()}`; }
function sha(value: unknown) { return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }

function nextVersion(entityId: string) {
  const row = getDatabase().prepare(`SELECT COALESCE(MAX(version_number), 0) AS n FROM record_versions WHERE entity_type = 'document' AND entity_id = ?`).get(entityId) as { n: number };
  return Number(row?.n || 0) + 1;
}

export const DocumentWorkflowRepository = {
  events(documentId: string) {
    return getDatabase().prepare(`SELECT * FROM document_workflow_events WHERE document_id = ? ORDER BY created_at ASC`).all(documentId) as any[];
  },

  transition(documentId: string, toStatus: DocumentWorkflowStatus, actor: DocumentWorkflowActor, input: { note?: string; supersededByDocumentId?: string } = {}) {
    const db = getDatabase();
    const doc = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(documentId) as any;
    if (!doc) throw new Error(`Document not found: ${documentId}`);

    const fromStatus = String(doc.workflow_status || "received") as DocumentWorkflowStatus;
    if (!allowedTransitions[fromStatus]?.includes(toStatus)) {
      throw new Error(`Invalid document workflow transition: ${fromStatus} -> ${toStatus}`);
    }

    if (toStatus === "superseded") {
      if (!input.supersededByDocumentId) throw new Error("A replacement document is required before superseding a document.");
      const replacement = db.prepare(`SELECT patient_id, workflow_status FROM documents WHERE id = ?`).get(input.supersededByDocumentId) as { patient_id: string; workflow_status?: string | null } | undefined;
      if (!replacement) throw new Error(`Replacement document not found: ${input.supersededByDocumentId}`);
      if (replacement.patient_id !== doc.patient_id) throw new Error("A document may only be superseded by a document belonging to the same patient.");
      if (input.supersededByDocumentId === documentId) throw new Error("A document cannot supersede itself.");
      if (replacement.workflow_status === "superseded") throw new Error("A superseded document cannot be used as the active replacement.");
    }

    const at = now();
    const eventId = id("docwf");
    const reviewFields = toStatus === "reviewed" ? { reviewedBy: actor.displayName, reviewedAt: at } : null;
    const filedFields = toStatus === "filed" ? { filedBy: actor.displayName, filedAt: at } : null;

    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(`UPDATE documents SET workflow_status = ?, workflow_updated_at = ?,
        reviewed_by = COALESCE(?, reviewed_by), reviewed_at = COALESCE(?, reviewed_at),
        filed_by = COALESCE(?, filed_by), filed_at = COALESCE(?, filed_at),
        superseded_by_document_id = ?, updated_at = ? WHERE id = ?`)
        .run(
          toStatus, at,
          reviewFields?.reviewedBy || null, reviewFields?.reviewedAt || null,
          filedFields?.filedBy || null, filedFields?.filedAt || null,
          toStatus === "superseded" ? input.supersededByDocumentId || null : doc.superseded_by_document_id || null,
          at, documentId,
        );

      db.prepare(`INSERT INTO document_workflow_events
        (id, document_id, patient_id, from_status, to_status, note, actor_id, actor_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(eventId, documentId, doc.patient_id, fromStatus, toStatus, input.note || null, actor.userId, actor.displayName, at);

      const updated = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(documentId) as any;
      const versionNumber = nextVersion(documentId);
      db.prepare(`INSERT INTO record_versions
        (id, patient_id, entity_type, entity_id, version_number, operation, snapshot_json, actor_id, actor_name, source_type, source_ref, created_at)
        VALUES (?, ?, 'document', ?, ?, 'workflow_transition', ?, ?, ?, 'clinician', ?, ?)`)
        .run(id("ver"), doc.patient_id, documentId, versionNumber, JSON.stringify(updated), actor.userId, actor.displayName, `documents/${documentId}/workflow`, at);
      db.prepare(`INSERT INTO provenance_events
        (id, patient_id, entity_type, entity_id, activity, source_type, source_system, source_ref, actor_id, actor_name, payload_sha256, metadata_json, created_at)
        VALUES (?, ?, 'document', ?, 'workflow_transition', 'clinician', 'ehr-local', ?, ?, ?, ?, ?, ?)`)
        .run(id("prov"), doc.patient_id, documentId, `documents/${documentId}/workflow`, actor.userId, actor.displayName,
          sha(updated), JSON.stringify({ eventId, fromStatus, toStatus, note: input.note || null }), at);
      db.exec("COMMIT");
      return { document: updated, event: db.prepare(`SELECT * FROM document_workflow_events WHERE id = ?`).get(eventId) };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  },
};
