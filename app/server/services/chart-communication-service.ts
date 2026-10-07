import { getDatabase } from "../db/connection";
import { assertPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import { AuditRepository } from "../repositories/audit-repository";
import {
  ChartCommunicationRepository,
  type ChartCommunicationType,
} from "../repositories/chart-communication-repository";
import type { ClinicalExecutionContext } from "./clinical-service";
import { MessageAttachmentRepository } from "../repositories/message-attachment-repository";

type MessageRow = {
  id: string;
  patient_id: string;
  thread_id: string;
  subject: string;
  category: string;
  urgency: string;
  channel: string;
  sender_role: string;
  sender_name: string;
  content: string;
  timestamp: string;
};

function actorRef(actor: ProviderContext) {
  return { userId: actor.userId, displayName: providerLabel(actor) };
}

function loadThread(threadId: string): MessageRow[] {
  return getDatabase()
    .prepare("SELECT * FROM messages WHERE thread_id = ? ORDER BY rowid ASC")
    .all(threadId) as MessageRow[];
}

function assertSinglePatientThread(rows: MessageRow[], patientId: string, threadId: string) {
  if (rows.length === 0) throw new Error(`Message thread not found: ${threadId}`);
  const patientIds = [...new Set(rows.map((row) => row.patient_id))];
  if (patientIds.length !== 1) {
    throw new Error(`Patient binding integrity violation: message thread ${threadId} spans multiple patients.`);
  }
  if (patientIds[0] !== patientId) {
    throw new Error(`Message thread ${threadId} belongs to a different patient.`);
  }
}

/**
 * One message as charted text. What it carried (D-127) is listed under it, so
 * the charted record says which notes, scales, documents or results went with
 * the message, by name and record id.
 */
function messageLine(row: MessageRow, attachments: ReturnType<typeof MessageAttachmentRepository.forMessages>) {
  const line = `[${row.timestamp}] ${row.sender_name} (${row.sender_role}): ${row.content}`;
  const carried = attachments.get(row.id) ?? [];
  if (carried.length === 0) return line;
  return `${line}\n${carried.map((item) => `  Attached ${item.kind}: ${item.title}${item.detail ? ` (${item.detail})` : ""} [${item.recordId}]`).join("\n")}`;
}

function transcript(rows: MessageRow[]) {
  const attachments = MessageAttachmentRepository.forMessages(rows.map((row) => row.id));
  return rows.map((row) => messageLine(row, attachments)).join("\n\n");
}

export const chartCommunicationService = {
  list(patientId: string, actor: ProviderContext) {
    assertPermission(actor, "read_clinical");
    return ChartCommunicationRepository.listByPatient(patientId);
  },

  saveFromMessageThread(
    input: {
      patientId: string;
      threadId: string;
      mode: ChartCommunicationType;
      messageId?: string;
      summaryText?: string;
    },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ) {
    assertPermission(actor, "manage_clinical_record");
    const rows = loadThread(input.threadId);
    assertSinglePatientThread(rows, input.patientId, input.threadId);

    const first = rows[0];
    const sourceIds = rows.map((row) => row.id);
    let body = "";
    let sourceRef = `messages/threads/${input.threadId}`;
    let sourceMessageId: string | undefined;
    let chartSourceIds = sourceIds;

    if (input.mode === "message") {
      if (!input.messageId) throw new Error("messageId is required when saving a single message to the chart.");
      const message = rows.find((row) => row.id === input.messageId);
      if (!message) throw new Error(`Message ${input.messageId} was not found in thread ${input.threadId}.`);
      body = messageLine(message, MessageAttachmentRepository.forMessages([message.id]));
      sourceRef = `messages/${message.id}`;
      sourceMessageId = message.id;
      chartSourceIds = [message.id];
    } else if (input.mode === "conversation") {
      body = transcript(rows);
    } else {
      body = String(input.summaryText || "").trim();
      if (!body) throw new Error("summaryText is required when saving a clinical summary to the chart.");
      sourceRef = `messages/threads/${input.threadId}#clinical-summary`;
    }

    const titlePrefix =
      input.mode === "message"
        ? "Charted message"
        : input.mode === "conversation"
          ? "Charted conversation"
          : "Communication summary";

    const record = ChartCommunicationRepository.create({
      patientId: input.patientId,
      communicationType: input.mode,
      title: `${titlePrefix}: ${first.subject}`,
      body,
      channel: first.channel,
      sourceThreadId: input.threadId,
      sourceMessageId,
      sourceMessageIds: chartSourceIds,
      sourceSystem: "ehr-messaging",
      sourceRef,
      actor: actorRef(actor),
    });

    AuditRepository.log({
      userId: actor.userId,
      userName: providerLabel(actor),
      userRole: actor.role,
      eventType: "message_charted",
      patientId: input.patientId,
      description: `Saved ${input.mode} from message thread ${input.threadId} to the legal chart.`,
      metadata: {
        chartCommunicationId: record.id,
        threadId: input.threadId,
        messageId: sourceMessageId,
        mode: input.mode,
        sourceRef,
        source: context.source,
        requestId: context.requestId,
      },
    });

    return record;
  },
};
