import { createHash, randomUUID } from "node:crypto";
import {
  canTransitionPrescriptionTransaction,
  sanitizePrescriptionTransactionErrorMessage,
  sanitizePrescriptionTransactionMetadata,
  type PrescriptionDestination,
  type PrescriptionTransaction,
  type PrescriptionTransactionDirection,
  type PrescriptionTransactionError,
  type PrescriptionTransactionEvent,
  type PrescriptionTransactionState,
  type PrescriptionTransactionType,
} from "../../domain/prescription-transactions";
import { getDatabase } from "../db/connection";

export type TransactionProvenance = {
  actorId: string;
  actorName: string;
  sourceType: string;
  sourceSystem: string;
  sourceRef?: string;
};

function id(prefix: string) { return `${prefix}-${randomUUID()}`; }
function now() { return new Date().toISOString(); }
function json<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
function safeError(error: PrescriptionTransactionError | undefined): PrescriptionTransactionError | undefined {
  if (!error) return undefined;
  return { ...error, message: sanitizePrescriptionTransactionErrorMessage(error.message) };
}

function asTransaction(row: any): PrescriptionTransaction | null {
  if (!row) return null;
  const destination = json<PrescriptionDestination>(row.destination_json, {});
  return {
    id: row.id,
    orderId: row.order_id,
    patientId: row.patient_id,
    adapterId: row.adapter_id,
    vendorName: row.vendor_name,
    transactionType: row.transaction_type,
    state: row.state,
    ...(Object.keys(destination).length ? { destination } : {}),
    externalReferenceId: row.external_reference_id || undefined,
    relatedTransactionId: row.related_transaction_id || undefined,
    correlationId: row.correlation_id,
    idempotencyKey: row.idempotency_key,
    attemptCount: Number(row.attempt_count || 0),
    submittedAt: row.submitted_at || undefined,
    acknowledgedAt: row.acknowledged_at || undefined,
    failedAt: row.failed_at || undefined,
    canceledAt: row.canceled_at || undefined,
    lastError: row.last_error_message
      ? { message: row.last_error_message, code: row.last_error_code || undefined }
      : undefined,
    createdBy: row.created_by,
    sourceType: row.source_type,
    sourceRef: row.source_ref || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asEvent(row: any): PrescriptionTransactionEvent | null {
  if (!row) return null;
  return {
    id: row.id,
    transactionId: row.transaction_id,
    orderId: row.order_id,
    patientId: row.patient_id,
    eventKey: row.event_key,
    direction: row.direction,
    eventType: row.event_type,
    state: row.state,
    externalEventId: row.external_event_id || undefined,
    externalReferenceId: row.external_reference_id || undefined,
    metadata: json<Record<string, unknown>>(row.metadata_json, {}),
    error: row.error_message
      ? { message: row.error_message, code: row.error_code || undefined }
      : undefined,
    occurredAt: row.occurred_at,
    receivedAt: row.received_at,
    sourceSystem: row.source_system,
    evidenceCandidateId: row.evidence_candidate_id || undefined,
  };
}

function stampTransaction(
  transaction: PrescriptionTransaction,
  operation: string,
  provenance: TransactionProvenance,
) {
  const db = getDatabase();
  const count = db.prepare(`
    SELECT COALESCE(MAX(version_number), 0) AS n FROM record_versions
    WHERE entity_type = 'prescription-transaction' AND entity_id = ?
  `).get(transaction.id) as { n: number };
  const version = Number(count?.n || 0) + 1;
  const at = now();

  db.prepare(`INSERT INTO record_versions (
    id, patient_id, entity_type, entity_id, version_number, operation, snapshot_json,
    actor_id, actor_name, source_type, source_ref, created_at
  ) VALUES (?, ?, 'prescription-transaction', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id("ver"), transaction.patientId, transaction.id, version, operation,
      JSON.stringify(transaction), provenance.actorId, provenance.actorName,
      provenance.sourceType, provenance.sourceRef || null, at,
    );

  db.prepare(`INSERT INTO provenance_events (
    id, patient_id, entity_type, entity_id, activity, source_type, source_system, source_ref,
    actor_id, actor_name, payload_sha256, metadata_json, created_at
  ) VALUES (?, ?, 'prescription-transaction', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id("prov"), transaction.patientId, transaction.id, operation,
      provenance.sourceType, provenance.sourceSystem, provenance.sourceRef || null,
      provenance.actorId, provenance.actorName, hash(transaction),
      JSON.stringify({
        orderId: transaction.orderId,
        state: transaction.state,
        attemptCount: transaction.attemptCount,
        transactionType: transaction.transactionType,
        relatedTransactionId: transaction.relatedTransactionId,
      }),
      at,
    );
}

function stampEvent(event: PrescriptionTransactionEvent, provenance: TransactionProvenance) {
  const db = getDatabase();
  db.prepare(`INSERT INTO provenance_events (
    id, patient_id, entity_type, entity_id, activity, source_type, source_system, source_ref,
    actor_id, actor_name, payload_sha256, metadata_json, created_at
  ) VALUES (?, ?, 'prescription-transaction-event', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id("prov"), event.patientId, event.id, event.eventType,
      provenance.sourceType, provenance.sourceSystem, provenance.sourceRef || null,
      provenance.actorId, provenance.actorName, hash(event),
      JSON.stringify({ transactionId: event.transactionId, orderId: event.orderId, state: event.state }),
      now(),
    );
}

export const PrescriptionTransactionRepository = {
  getById(transactionId: string): PrescriptionTransaction | null {
    return asTransaction(getDatabase().prepare(`SELECT * FROM prescription_transactions WHERE id = ?`).get(transactionId));
  },

  getByCorrelationId(correlationId: string): PrescriptionTransaction | null {
    return asTransaction(getDatabase().prepare(`SELECT * FROM prescription_transactions WHERE correlation_id = ?`).get(correlationId));
  },

  getByOrder(orderId: string): PrescriptionTransaction[] {
    return (getDatabase().prepare(`SELECT * FROM prescription_transactions WHERE order_id = ? ORDER BY created_at DESC`)
      .all(orderId) as any[]).map((row) => asTransaction(row)!).filter(Boolean);
  },

  listByPatient(patientId: string): PrescriptionTransaction[] {
    return (getDatabase().prepare(`SELECT * FROM prescription_transactions WHERE patient_id = ? ORDER BY updated_at DESC`)
      .all(patientId) as any[]).map((row) => asTransaction(row)!).filter(Boolean);
  },

  listRelated(transactionId: string): PrescriptionTransaction[] {
    return (getDatabase().prepare(`SELECT * FROM prescription_transactions WHERE related_transaction_id = ? ORDER BY created_at ASC`)
      .all(transactionId) as any[]).map((row) => asTransaction(row)!).filter(Boolean);
  },

  getOrCreateOutbound(input: {
    orderId: string;
    patientId: string;
    adapterId: string;
    vendorName: string;
    transactionType: PrescriptionTransactionType;
    destination?: PrescriptionDestination;
    relatedTransactionId?: string;
    initialState?: PrescriptionTransactionState;
    idempotencyKey: string;
    createdBy: string;
    sourceType: string;
    sourceRef?: string;
  }, provenance: TransactionProvenance): PrescriptionTransaction {
    const db = getDatabase();
    const existing = asTransaction(db.prepare(`SELECT * FROM prescription_transactions WHERE idempotency_key = ?`)
      .get(input.idempotencyKey));
    if (existing) {
      if (
        existing.orderId !== input.orderId || existing.patientId !== input.patientId ||
        existing.adapterId !== input.adapterId || existing.transactionType !== input.transactionType ||
        (existing.relatedTransactionId || undefined) !== (input.relatedTransactionId || undefined)
      ) {
        throw new Error(`Prescription transaction idempotency key ${input.idempotencyKey} is already bound to another transaction identity.`);
      }
      return existing;
    }

    if (input.relatedTransactionId) {
      const related = this.getById(input.relatedTransactionId);
      if (!related) throw new Error(`Related prescription transaction not found: ${input.relatedTransactionId}`);
      if (related.patientId !== input.patientId || related.orderId !== input.orderId) {
        throw new Error(`Related prescription transaction ${input.relatedTransactionId} does not match patient/order identity.`);
      }
    }

    const transactionId = id("rxtx");
    const at = now();
    const correlationId = `rxcor-${randomUUID()}`;
    const initialState = input.initialState || "prepared";
    db.prepare(`INSERT INTO prescription_transactions (
      id, order_id, patient_id, adapter_id, vendor_name, transaction_type, state,
      destination_json, external_reference_id, related_transaction_id, correlation_id, idempotency_key, attempt_count,
      created_by, source_type, source_ref, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 0, ?, ?, ?, ?, ?)`)
      .run(
        transactionId, input.orderId, input.patientId, input.adapterId, input.vendorName,
        input.transactionType, initialState, JSON.stringify(input.destination || {}),
        input.relatedTransactionId || null, correlationId, input.idempotencyKey,
        input.createdBy, input.sourceType, input.sourceRef || null, at, at,
      );

    const created = this.getById(transactionId);
    if (!created) throw new Error(`Prescription transaction not found after creation: ${transactionId}`);
    stampTransaction(created, "create", provenance);
    return created;
  },

  startAttempt(transactionId: string, provenance: TransactionProvenance): PrescriptionTransaction {
    const db = getDatabase();
    const current = this.getById(transactionId);
    if (!current) throw new Error(`Prescription transaction not found: ${transactionId}`);
    if (!["prepared", "failed", "rejected", "change_requested", "cancellation_requested"].includes(current.state)) {
      throw new Error(`Prescription transaction ${transactionId} cannot start another attempt from state ${current.state}.`);
    }
    const at = now();
    db.prepare(`UPDATE prescription_transactions SET state = 'prepared', attempt_count = attempt_count + 1, updated_at = ? WHERE id = ?`)
      .run(at, transactionId);
    const updated = this.getById(transactionId)!;
    stampTransaction(updated, "attempt-prepared", provenance);
    return updated;
  },

  transitionState(
    transactionId: string,
    nextState: PrescriptionTransactionState,
    input: { externalReferenceId?: string; error?: PrescriptionTransactionError },
    provenance: TransactionProvenance,
  ): PrescriptionTransaction {
    const db = getDatabase();
    const current = this.getById(transactionId);
    if (!current) throw new Error(`Prescription transaction not found: ${transactionId}`);
    if (!canTransitionPrescriptionTransaction(current.state, nextState)) {
      throw new Error(`Invalid prescription transaction transition: ${current.state} -> ${nextState}.`);
    }
    if (
      current.externalReferenceId && input.externalReferenceId &&
      current.externalReferenceId !== input.externalReferenceId
    ) {
      throw new Error(`Prescription transaction ${transactionId} already has a different external reference.`);
    }
    if (current.state === nextState && !input.externalReferenceId && !input.error) return current;

    const normalizedError = safeError(input.error);
    const at = now();
    const externalReferenceId = current.externalReferenceId || input.externalReferenceId || null;
    const submittedAt = current.submittedAt || (nextState === "submitted" ? at : null);
    const acknowledgedAt = current.acknowledgedAt || (["acknowledged", "cancellation_acknowledged"].includes(nextState) ? at : null);
    const failedAt = nextState === "failed" ? at : current.failedAt || null;
    const canceledAt = current.canceledAt || (nextState === "canceled" ? at : null);
    const lastErrorCode = normalizedError?.code || current.lastError?.code || null;
    const lastErrorMessage = normalizedError?.message || current.lastError?.message || null;

    db.prepare(`UPDATE prescription_transactions SET
      state = ?, external_reference_id = ?, submitted_at = ?, acknowledged_at = ?, failed_at = ?,
      canceled_at = ?, last_error_code = ?, last_error_message = ?, updated_at = ? WHERE id = ?`)
      .run(
        nextState, externalReferenceId, submittedAt, acknowledgedAt, failedAt, canceledAt,
        lastErrorCode, lastErrorMessage, at, transactionId,
      );
    const updated = this.getById(transactionId)!;
    stampTransaction(updated, `state-${nextState}`, provenance);
    return updated;
  },

  getEventByKey(eventKey: string): PrescriptionTransactionEvent | null {
    return asEvent(getDatabase().prepare(`SELECT * FROM prescription_transaction_events WHERE event_key = ?`).get(eventKey));
  },

  listEvents(transactionId: string): PrescriptionTransactionEvent[] {
    return (getDatabase().prepare(`SELECT * FROM prescription_transaction_events WHERE transaction_id = ? ORDER BY received_at ASC`)
      .all(transactionId) as any[]).map((row) => asEvent(row)!).filter(Boolean);
  },

  recordEvent(input: {
    transaction: PrescriptionTransaction;
    eventKey: string;
    direction: PrescriptionTransactionDirection;
    eventType: string;
    state: PrescriptionTransactionState;
    externalEventId?: string;
    externalReferenceId?: string;
    metadata?: Record<string, unknown>;
    error?: PrescriptionTransactionError;
    occurredAt?: string;
    sourceSystem: string;
    evidenceCandidateId?: string;
  }, provenance: TransactionProvenance): { event: PrescriptionTransactionEvent; created: boolean } {
    const db = getDatabase();
    const existing = this.getEventByKey(input.eventKey);
    if (existing) {
      if (
        existing.transactionId !== input.transaction.id || existing.orderId !== input.transaction.orderId ||
        existing.patientId !== input.transaction.patientId
      ) {
        throw new Error(`Prescription event key ${input.eventKey} is already bound to another transaction.`);
      }
      return { event: existing, created: false };
    }

    const eventId = id("rxevt");
    const receivedAt = now();
    const safeMetadata = sanitizePrescriptionTransactionMetadata(input.metadata || {}) as Record<string, unknown>;
    const normalizedError = safeError(input.error);
    db.prepare(`INSERT INTO prescription_transaction_events (
      id, transaction_id, order_id, patient_id, event_key, direction, event_type, state,
      external_event_id, external_reference_id, metadata_json, error_code, error_message,
      occurred_at, received_at, source_system, evidence_candidate_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        eventId, input.transaction.id, input.transaction.orderId, input.transaction.patientId,
        input.eventKey, input.direction, input.eventType, input.state,
        input.externalEventId || null, input.externalReferenceId || null,
        JSON.stringify(safeMetadata), normalizedError?.code || null, normalizedError?.message || null,
        input.occurredAt || receivedAt, receivedAt, input.sourceSystem, input.evidenceCandidateId || null,
      );
    const event = asEvent(db.prepare(`SELECT * FROM prescription_transaction_events WHERE id = ?`).get(eventId));
    if (!event) throw new Error(`Prescription transaction event not found after creation: ${eventId}`);
    stampEvent(event, provenance);
    return { event, created: true };
  },
};
