import { getDatabase } from "../db/connection";
import {
  MAX_MESSAGE_ATTACHMENTS,
  type MessageAttachment,
  type MessageAttachmentKind,
  type MessageAttachmentRef,
} from "../../domain/messages";
import { documentTypeLabel } from "../../lib/document-type-presentation";
import { formatClinicalDate } from "../../lib/clinical-date";

const KINDS = new Set<MessageAttachmentKind>(["document", "encounter", "assessment", "lab"]);

export type ResolvedAttachment = MessageAttachmentRef & { title: string; detail: string | null };

/** The practice calendar day, as clinicians read dates everywhere else. */
function day(value: string | null | undefined): string {
  return value ? formatClinicalDate(value) : "undated";
}

/**
 * Validates attachment requests against the chart (D-127). Every record must
 * exist and belong to `patientId`; a note must be signed, because an unsigned
 * draft is not yet part of the record and must not leave the practice; a
 * superseded document or an entered-in-error result is refused. Titles are
 * read here, never taken from the request.
 */
export function resolveMessageAttachments(patientId: string, refs: unknown): ResolvedAttachment[] {
  if (refs === undefined || refs === null) return [];
  if (!Array.isArray(refs)) throw new Error("Attachments must be a list.");
  if (refs.length > MAX_MESSAGE_ATTACHMENTS) {
    throw new Error(`A message can carry at most ${MAX_MESSAGE_ATTACHMENTS} attachments.`);
  }
  const db = getDatabase();
  const seen = new Set<string>();
  const resolved: ResolvedAttachment[] = [];
  for (const raw of refs) {
    const ref = raw as Partial<MessageAttachmentRef>;
    if (!ref || typeof ref.recordId !== "string" || !ref.recordId.trim() || !KINDS.has(ref.kind as MessageAttachmentKind)) {
      throw new Error("Each attachment needs a kind and a record id.");
    }
    const kind = ref.kind as MessageAttachmentKind;
    const recordId = ref.recordId.trim();
    const key = `${kind}:${recordId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const wrongPatient = () => new Error(`Attachment ${recordId} is not part of this patient's chart.`);
    if (kind === "document") {
      const row = db.prepare(
        `SELECT patient_id, title, document_type, current_version, workflow_status, created_at FROM documents WHERE id = ?`,
      ).get(recordId) as any;
      if (!row || row.patient_id !== patientId) throw wrongPatient();
      if (row.workflow_status === "superseded") throw new Error(`"${row.title}" has been superseded and cannot be attached.`);
      resolved.push({ kind, recordId, title: row.title, detail: `${documentTypeLabel(row.document_type)} · v${row.current_version} · ${day(row.created_at)}` });
    } else if (kind === "encounter") {
      const row = db.prepare(`SELECT patient_id, type, date, status, signed_by FROM encounters WHERE id = ?`).get(recordId) as any;
      if (!row || row.patient_id !== patientId) throw wrongPatient();
      if (row.status !== "signed") throw new Error("Only a signed note can be attached. Sign the note first.");
      resolved.push({ kind, recordId, title: `${row.type || "Visit"} note`, detail: `Signed${row.signed_by ? ` by ${row.signed_by}` : ""} · ${day(row.date)}` });
    } else if (kind === "assessment") {
      const row = db.prepare(
        `SELECT patient_id, title, total_score, max_score, severity, administered_at FROM clinical_assessments WHERE id = ?`,
      ).get(recordId) as any;
      if (!row || row.patient_id !== patientId) throw wrongPatient();
      resolved.push({ kind, recordId, title: row.title, detail: `Score ${row.total_score}/${row.max_score}${row.severity ? ` (${row.severity})` : ""} · ${day(row.administered_at)}` });
    } else {
      const row = db.prepare(
        `SELECT patient_id, category, test_name, value_text, unit, interpretation, status, effective_at FROM observations WHERE id = ?`,
      ).get(recordId) as any;
      if (!row || row.patient_id !== patientId || row.category !== "laboratory") throw wrongPatient();
      if (row.status === "entered-in-error" || row.status === "cancelled") throw new Error(`${row.test_name} is not a current result.`);
      resolved.push({
        kind,
        recordId,
        title: row.test_name,
        detail: `${row.value_text}${row.unit ? ` ${row.unit}` : ""}${row.interpretation ? ` (${row.interpretation})` : ""} · ${day(row.effective_at)}`,
      });
    }
  }
  return resolved;
}

export const MessageAttachmentRepository = {
  /** Records resolved attachments against a written message. */
  attach(messageId: string, patientId: string, attachments: readonly ResolvedAttachment[], createdBy: string): MessageAttachment[] {
    if (attachments.length === 0) return [];
    const db = getDatabase();
    const at = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO message_attachments (id, message_id, patient_id, kind, record_id, title, detail, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return attachments.map((attachment, index) => {
      const id = `msgatt-${Date.now()}-${index}-${Math.floor(Math.random() * 100000)}`;
      insert.run(id, messageId, patientId, attachment.kind, attachment.recordId, attachment.title, attachment.detail, createdBy, at);
      return { id, ...attachment };
    });
  },

  /** Attachments for these messages, keyed by message id. */
  forMessages(messageIds: readonly string[]): Map<string, MessageAttachment[]> {
    const result = new Map<string, MessageAttachment[]>();
    if (messageIds.length === 0) return result;
    const db = getDatabase();
    const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'message_attachments'`).get();
    if (!exists) return result;
    const rows = db.prepare(
      `SELECT * FROM message_attachments WHERE message_id IN (${messageIds.map(() => "?").join(", ")}) ORDER BY created_at ASC, id ASC`,
    ).all(...messageIds) as any[];
    for (const row of rows) {
      const list = result.get(row.message_id) ?? [];
      list.push({ id: row.id, kind: row.kind, recordId: row.record_id, title: row.title, detail: row.detail ?? null });
      result.set(row.message_id, list);
    }
    return result;
  },
};
