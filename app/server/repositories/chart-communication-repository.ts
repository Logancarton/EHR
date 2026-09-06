import { createHash, randomUUID } from "node:crypto";
import { getDatabase } from "../db/connection";

export type ChartCommunicationType = "message" | "conversation" | "summary";

export type ChartCommunicationRecord = {
  id: string;
  patientId: string;
  communicationType: ChartCommunicationType;
  title: string;
  body: string;
  channel?: string;
  sourceThreadId: string;
  sourceMessageId?: string;
  sourceMessageIds: string[];
  sourceSystem: string;
  sourceRef: string;
  contentSha256: string;
  occurredAt: string;
  createdBy: string;
  createdAt: string;
};

function sha(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseIds(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function mapRow(row: any): ChartCommunicationRecord {
  return {
    id: row.id,
    patientId: row.patient_id,
    communicationType: row.communication_type,
    title: row.title,
    body: row.body,
    channel: row.channel || undefined,
    sourceThreadId: row.source_thread_id,
    sourceMessageId: row.source_message_id || undefined,
    sourceMessageIds: parseIds(row.source_message_ids_json),
    sourceSystem: row.source_system,
    sourceRef: row.source_ref,
    contentSha256: row.content_sha256,
    occurredAt: row.occurred_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export const ChartCommunicationRepository = {
  listByPatient(patientId: string, limit = 100): ChartCommunicationRecord[] {
    return (getDatabase()
      .prepare("SELECT * FROM chart_communications WHERE patient_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(patientId, limit) as any[]).map(mapRow);
  },

  create(input: {
    patientId: string;
    communicationType: ChartCommunicationType;
    title: string;
    body: string;
    channel?: string;
    sourceThreadId: string;
    sourceMessageId?: string;
    sourceMessageIds: string[];
    sourceSystem?: string;
    sourceRef: string;
    occurredAt?: string;
    actor: { userId: string; displayName: string };
  }): ChartCommunicationRecord {
    const db = getDatabase();
    const id = `comm-${randomUUID()}`;
    const at = new Date().toISOString();
    const contentHash = sha(input.body);
    const sourceSystem = input.sourceSystem || "ehr-messaging";

    const existing = db.prepare(`
      SELECT * FROM chart_communications
      WHERE patient_id = ? AND communication_type = ? AND source_ref = ? AND content_sha256 = ?
      LIMIT 1
    `).get(input.patientId, input.communicationType, input.sourceRef, contentHash) as any;
    if (existing) return mapRow(existing);

    const snapshot = {
      patient_id: input.patientId,
      communication_type: input.communicationType,
      title: input.title,
      body: input.body,
      channel: input.channel || null,
      source_thread_id: input.sourceThreadId,
      source_message_id: input.sourceMessageId || null,
      source_message_ids: input.sourceMessageIds,
      source_system: sourceSystem,
      source_ref: input.sourceRef,
      content_sha256: contentHash,
      occurred_at: input.occurredAt || at,
      created_by: input.actor.displayName,
      created_at: at,
    };

    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(`
        INSERT INTO chart_communications (
          id, patient_id, communication_type, title, body, channel,
          source_thread_id, source_message_id, source_message_ids_json,
          source_system, source_ref, content_sha256, occurred_at, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.patientId,
        input.communicationType,
        input.title,
        input.body,
        input.channel || null,
        input.sourceThreadId,
        input.sourceMessageId || null,
        JSON.stringify(input.sourceMessageIds),
        sourceSystem,
        input.sourceRef,
        contentHash,
        input.occurredAt || at,
        input.actor.displayName,
        at,
      );

      db.prepare(`
        INSERT INTO record_versions (
          id, patient_id, entity_type, entity_id, version_number, operation,
          snapshot_json, actor_id, actor_name, source_type, source_ref, created_at
        ) VALUES (?, ?, 'chart_communication', ?, 1, 'create', ?, ?, ?, 'message-charting', ?, ?)
      `).run(
        `ver-${randomUUID()}`,
        input.patientId,
        id,
        JSON.stringify(snapshot),
        input.actor.userId,
        input.actor.displayName,
        input.sourceRef,
        at,
      );

      db.prepare(`
        INSERT INTO provenance_events (
          id, patient_id, entity_type, entity_id, activity, source_type, source_system,
          source_ref, actor_id, actor_name, payload_sha256, metadata_json, created_at
        ) VALUES (?, ?, 'chart_communication', ?, 'create', 'message-charting', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `prov-${randomUUID()}`,
        input.patientId,
        id,
        sourceSystem,
        input.sourceRef,
        input.actor.userId,
        input.actor.displayName,
        contentHash,
        JSON.stringify({
          communicationType: input.communicationType,
          sourceThreadId: input.sourceThreadId,
          sourceMessageId: input.sourceMessageId || null,
          sourceMessageIds: input.sourceMessageIds,
        }),
        at,
      );

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    const row = db.prepare("SELECT * FROM chart_communications WHERE id = ?").get(id) as any;
    return mapRow(row);
  },
};
