import { createHash, randomUUID } from "node:crypto";
import type {
  PrescriptionRefillRequest,
  PrescriptionRefillRequestSource,
} from "../../domain/prescription-refills";
import { getDatabase } from "../db/connection";

export type RefillRequestProvenance = {
  actorId: string;
  actorName: string;
  sourceType: string;
  sourceSystem: string;
  sourceRef?: string;
};

function id(prefix: string) { return `${prefix}-${randomUUID()}`; }
function now() { return new Date().toISOString(); }
function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function asRefillRequest(row: any): PrescriptionRefillRequest | null {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    priorOrderId: row.prior_order_id,
    priorTransactionId: row.prior_transaction_id,
    status: row.status,
    requestSource: row.request_source,
    sourceSystem: row.source_system,
    sourceReference: row.source_reference || undefined,
    note: row.note || undefined,
    idempotencyKey: row.idempotency_key,
    renewalOrderId: row.renewal_order_id || undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stampRequest(
  request: PrescriptionRefillRequest,
  operation: string,
  provenance: RefillRequestProvenance,
) {
  const db = getDatabase();
  const count = db.prepare(`
    SELECT COALESCE(MAX(version_number), 0) AS n FROM record_versions
    WHERE entity_type = 'prescription-refill-request' AND entity_id = ?
  `).get(request.id) as { n: number };
  const version = Number(count?.n || 0) + 1;
  const at = now();

  db.prepare(`INSERT INTO record_versions (
    id, patient_id, entity_type, entity_id, version_number, operation, snapshot_json,
    actor_id, actor_name, source_type, source_ref, created_at
  ) VALUES (?, ?, 'prescription-refill-request', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id("ver"), request.patientId, request.id, version, operation,
      JSON.stringify(request), provenance.actorId, provenance.actorName,
      provenance.sourceType, provenance.sourceRef || null, at,
    );

  db.prepare(`INSERT INTO provenance_events (
    id, patient_id, entity_type, entity_id, activity, source_type, source_system, source_ref,
    actor_id, actor_name, payload_sha256, metadata_json, created_at
  ) VALUES (?, ?, 'prescription-refill-request', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id("prov"), request.patientId, request.id, operation,
      provenance.sourceType, provenance.sourceSystem, provenance.sourceRef || null,
      provenance.actorId, provenance.actorName, hash(request),
      JSON.stringify({
        priorOrderId: request.priorOrderId,
        priorTransactionId: request.priorTransactionId,
        status: request.status,
        requestSource: request.requestSource,
        renewalOrderId: request.renewalOrderId,
        medicationTruthChanged: false,
      }),
      at,
    );
}

export const PrescriptionRefillRepository = {
  getById(requestId: string): PrescriptionRefillRequest | null {
    return asRefillRequest(getDatabase().prepare(
      `SELECT * FROM prescription_refill_requests WHERE id = ?`,
    ).get(requestId));
  },

  getByIdempotencyKey(idempotencyKey: string): PrescriptionRefillRequest | null {
    return asRefillRequest(getDatabase().prepare(
      `SELECT * FROM prescription_refill_requests WHERE idempotency_key = ?`,
    ).get(idempotencyKey));
  },

  listByPatient(patientId: string): PrescriptionRefillRequest[] {
    return (getDatabase().prepare(`
      SELECT * FROM prescription_refill_requests
      WHERE patient_id = ?
      ORDER BY updated_at DESC
    `).all(patientId) as any[]).map((row) => asRefillRequest(row)!).filter(Boolean);
  },

  getOrCreate(input: {
    patientId: string;
    priorOrderId: string;
    priorTransactionId: string;
    requestSource: PrescriptionRefillRequestSource;
    sourceSystem: string;
    sourceReference?: string;
    note?: string;
    idempotencyKey: string;
    createdBy: string;
  }, provenance: RefillRequestProvenance): { request: PrescriptionRefillRequest; created: boolean } {
    const existing = this.getByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      if (
        existing.patientId !== input.patientId ||
        existing.priorOrderId !== input.priorOrderId ||
        existing.priorTransactionId !== input.priorTransactionId ||
        existing.requestSource !== input.requestSource
      ) {
        throw new Error(
          `Prescription refill idempotency key ${input.idempotencyKey} is already bound to another request identity.`,
        );
      }
      return { request: existing, created: false };
    }

    const requestId = id("rxrefill");
    const at = now();
    getDatabase().prepare(`INSERT INTO prescription_refill_requests (
      id, patient_id, prior_order_id, prior_transaction_id, status,
      request_source, source_system, source_reference, note, idempotency_key,
      renewal_order_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, NULL, ?, ?, ?)`)
      .run(
        requestId, input.patientId, input.priorOrderId, input.priorTransactionId,
        input.requestSource, input.sourceSystem, input.sourceReference || null,
        input.note || null, input.idempotencyKey, input.createdBy, at, at,
      );

    const request = this.getById(requestId);
    if (!request) throw new Error(`Prescription refill request not found after creation: ${requestId}`);
    stampRequest(request, "create", provenance);
    return { request, created: true };
  },

  markRenewalStaged(
    requestId: string,
    renewalOrderId: string,
    provenance: RefillRequestProvenance,
  ): PrescriptionRefillRequest {
    const current = this.getById(requestId);
    if (!current) throw new Error(`Prescription refill request not found: ${requestId}`);
    if (current.renewalOrderId) {
      if (current.renewalOrderId !== renewalOrderId) {
        throw new Error(`Prescription refill request ${requestId} is already linked to another renewal order.`);
      }
      return current;
    }
    if (current.status !== "pending") {
      throw new Error(`Prescription refill request ${requestId} cannot stage a renewal from status ${current.status}.`);
    }

    const at = now();
    getDatabase().prepare(`UPDATE prescription_refill_requests SET
      status = 'renewal_staged', renewal_order_id = ?, updated_at = ?
      WHERE id = ? AND status = 'pending' AND renewal_order_id IS NULL
    `).run(renewalOrderId, at, requestId);

    const updated = this.getById(requestId);
    if (!updated) throw new Error(`Prescription refill request not found after update: ${requestId}`);
    stampRequest(updated, "renewal-staged", provenance);
    return updated;
  },
};
