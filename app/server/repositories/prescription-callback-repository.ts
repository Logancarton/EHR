import { createHash, randomUUID } from "node:crypto";
import type {
  PrescriptionCallbackReceipt,
  PrescriptionCallbackType,
} from "../../domain/prescription-callbacks";
import { getDatabase } from "../db/connection";

function id(prefix: string) { return `${prefix}-${randomUUID()}`; }
function now() { return new Date().toISOString(); }
function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function asReceipt(row: any): PrescriptionCallbackReceipt | null {
  if (!row) return null;
  return {
    id: row.id,
    adapterId: row.adapter_id,
    externalMessageId: row.external_message_id,
    callbackType: row.callback_type,
    correlationId: row.correlation_id,
    normalizedFingerprint: row.normalized_fingerprint,
    patientId: row.patient_id,
    orderId: row.order_id,
    transactionId: row.transaction_id,
    transactionEventId: row.transaction_event_id || undefined,
    refillRequestId: row.refill_request_id || undefined,
    changeRequestId: row.change_request_id || undefined,
    status: row.status,
    failureCode: row.failure_code || undefined,
    receivedAt: row.received_at,
    processedAt: row.processed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stamp(receipt: PrescriptionCallbackReceipt, activity: string) {
  const at = now();
  getDatabase().prepare(`INSERT INTO provenance_events (
    id, patient_id, entity_type, entity_id, activity, source_type, source_system, source_ref,
    actor_id, actor_name, payload_sha256, metadata_json, created_at
  ) VALUES (?, ?, 'prescription-callback', ?, ?, 'external-vendor', ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id("prov"), receipt.patientId, receipt.id, activity, receipt.adapterId,
      receipt.externalMessageId, `integration:${receipt.adapterId}`,
      `External prescribing adapter (${receipt.adapterId})`, hash(receipt),
      JSON.stringify({
        adapterId: receipt.adapterId,
        externalMessageId: receipt.externalMessageId,
        callbackType: receipt.callbackType,
        correlationId: receipt.correlationId,
        transactionId: receipt.transactionId,
        transactionEventId: receipt.transactionEventId,
        refillRequestId: receipt.refillRequestId,
        changeRequestId: receipt.changeRequestId,
        status: receipt.status,
        failureCode: receipt.failureCode,
        medicationTruthChanged: false,
      }),
      at,
    );
}

function sameBinding(
  receipt: PrescriptionCallbackReceipt,
  input: {
    callbackType: PrescriptionCallbackType;
    correlationId: string;
    normalizedFingerprint: string;
    patientId: string;
    orderId: string;
    transactionId: string;
  },
) {
  return receipt.callbackType === input.callbackType &&
    receipt.correlationId === input.correlationId &&
    receipt.normalizedFingerprint === input.normalizedFingerprint &&
    receipt.patientId === input.patientId &&
    receipt.orderId === input.orderId &&
    receipt.transactionId === input.transactionId;
}

export const PrescriptionCallbackRepository = {
  getById(receiptId: string): PrescriptionCallbackReceipt | null {
    return asReceipt(getDatabase().prepare(
      `SELECT * FROM prescription_callback_receipts WHERE id = ?`,
    ).get(receiptId));
  },

  getByIdentity(adapterId: string, externalMessageId: string): PrescriptionCallbackReceipt | null {
    return asReceipt(getDatabase().prepare(`
      SELECT * FROM prescription_callback_receipts
      WHERE adapter_id = ? AND external_message_id = ?
    `).get(adapterId, externalMessageId));
  },

  reserve(input: {
    adapterId: string;
    externalMessageId: string;
    callbackType: PrescriptionCallbackType;
    correlationId: string;
    normalizedFingerprint: string;
    patientId: string;
    orderId: string;
    transactionId: string;
    receivedAt: string;
  }): { receipt: PrescriptionCallbackReceipt; created: boolean } {
    const existing = this.getByIdentity(input.adapterId, input.externalMessageId);
    if (existing) {
      if (!sameBinding(existing, input)) {
        throw new Error(
          `Prescription callback identity ${input.adapterId}/${input.externalMessageId} is already bound to different normalized meaning or EHR identity.`,
        );
      }
      return { receipt: existing, created: false };
    }

    const receiptId = id("rxcallback");
    const at = now();
    getDatabase().prepare(`INSERT OR IGNORE INTO prescription_callback_receipts (
      id, adapter_id, external_message_id, callback_type, correlation_id,
      normalized_fingerprint, patient_id, order_id, transaction_id,
      transaction_event_id, refill_request_id, change_request_id,
      status, failure_code, received_at, processed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'processing', NULL, ?, NULL, ?, ?)`)
      .run(
        receiptId, input.adapterId, input.externalMessageId, input.callbackType,
        input.correlationId, input.normalizedFingerprint, input.patientId,
        input.orderId, input.transactionId, input.receivedAt, at, at,
      );

    const inserted = this.getByIdentity(input.adapterId, input.externalMessageId);
    if (!inserted) throw new Error("Prescription callback receipt was not created.");
    if (inserted.id !== receiptId) {
      if (!sameBinding(inserted, input)) {
        throw new Error(
          `Prescription callback identity ${input.adapterId}/${input.externalMessageId} was concurrently rebound to conflicting meaning.`,
        );
      }
      return { receipt: inserted, created: false };
    }
    stamp(inserted, "verified-callback-received");
    return { receipt: inserted, created: true };
  },

  markProcessed(
    receiptId: string,
    result: {
      transactionEventId?: string;
      refillRequestId?: string;
      changeRequestId?: string;
    },
  ): PrescriptionCallbackReceipt {
    const current = this.getById(receiptId);
    if (!current) throw new Error(`Prescription callback receipt not found: ${receiptId}`);
    if (current.status === "processed") {
      if (
        current.transactionEventId !== result.transactionEventId ||
        current.refillRequestId !== result.refillRequestId ||
        current.changeRequestId !== result.changeRequestId
      ) {
        throw new Error(`Prescription callback receipt ${receiptId} is already bound to different resulting entities.`);
      }
      return current;
    }
    if (current.status === "rejected") {
      throw new Error(`Prescription callback receipt ${receiptId} was already rejected.`);
    }

    const at = now();
    getDatabase().prepare(`UPDATE prescription_callback_receipts SET
      transaction_event_id = ?, refill_request_id = ?, change_request_id = ?,
      status = 'processed', failure_code = NULL, processed_at = ?, updated_at = ?
      WHERE id = ? AND status = 'processing'
    `).run(
      result.transactionEventId || null,
      result.refillRequestId || null,
      result.changeRequestId || null,
      at, at, receiptId,
    );
    const updated = this.getById(receiptId);
    if (!updated) throw new Error(`Prescription callback receipt not found after processing: ${receiptId}`);
    stamp(updated, "verified-callback-processed");
    return updated;
  },

  markRejected(receiptId: string, failureCode: string): PrescriptionCallbackReceipt {
    const current = this.getById(receiptId);
    if (!current) throw new Error(`Prescription callback receipt not found: ${receiptId}`);
    if (current.status === "processed") return current;
    if (current.status === "rejected") return current;

    const safeFailureCode = failureCode.replace(/[^a-z0-9_-]/gi, "_").slice(0, 80) || "rejected";
    const at = now();
    getDatabase().prepare(`UPDATE prescription_callback_receipts SET
      status = 'rejected', failure_code = ?, processed_at = ?, updated_at = ?
      WHERE id = ? AND status = 'processing'
    `).run(safeFailureCode, at, at, receiptId);
    const updated = this.getById(receiptId);
    if (!updated) throw new Error(`Prescription callback receipt not found after rejection: ${receiptId}`);
    stamp(updated, "verified-callback-rejected");
    return updated;
  },
};
