import { getDatabase } from "../db/connection";
import { assertPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import { AuditRepository } from "../repositories/audit-repository";
import {
  ChartCommunicationRepository,
  type ChartCommunicationType,
} from "../repositories/chart-communication-repository";
import type { ClinicalExecutionContext } from "./clinical-service";

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

function transcript(rows: MessageRow[]) {
  return rows
    .map((row) => `[${row.timestamp}] ${row.sender_name} (${row.sender_role}): ${row.content}`)
    .join("\n\n");
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
      body = `[${message.timestamp}] ${message.sender_name} (${message.sender_role}): ${message.content}`;
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
