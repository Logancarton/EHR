import { createHash, randomUUID } from "node:crypto";
import type {
  PrescriptionChangeRequest,
  PrescriptionChangeRequestCategory,
  PrescriptionRequestedChanges,
} from "../../domain/prescription-changes";
import { getDatabase } from "../db/connection";

export type ChangeRequestProvenance = {
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

function asChangeRequest(row: any): PrescriptionChangeRequest | null {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    sourceOrderId: row.source_order_id,
    sourceTransactionId: row.source_transaction_id,
    adapterId: row.adapter_id,
    vendorName: row.vendor_name,
    externalRequestId: row.external_request_id,
    category: row.request_category,
    requestedChanges: JSON.parse(row.requested_changes_json || "{}"),
    summary: row.summary || undefined,
    sourceReference: row.source_reference || undefined,
    status: row.status,
    resultingOrderId: row.resulting_order_id || undefined,
    resolutionDecision: row.resolution_decision || undefined,
    resolvedById: row.resolved_by_id || undefined,
    resolvedByName: row.resolved_by_name || undefined,
    resolvedAt: row.resolved_at || undefined,
    receivedAt: row.received_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stampRequest(
  request: PrescriptionChangeRequest,
  operation: string,
  provenance: ChangeRequestProvenance,
) {
  const db = getDatabase();
  const count = db.prepare(`
    SELECT COALESCE(MAX(version_number), 0) AS n FROM record_versions
    WHERE entity_type = 'prescription-change-request' AND entity_id = ?
  `).get(request.id) as { n: number };
  const version = Number(count?.n || 0) + 1;
  const at = now();

  db.prepare(`INSERT INTO record_versions (
    id, patient_id, entity_type, entity_id, version_number, operation, snapshot_json,
    actor_id, actor_name, source_type, source_ref, created_at
  ) VALUES (?, ?, 'prescription-change-request', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id("ver"), request.patientId, request.id, version, operation,
      JSON.stringify(request), provenance.actorId, provenance.actorName,
      provenance.sourceType, provenance.sourceRef || null, at,
    );

  db.prepare(`INSERT INTO provenance_events (
    id, patient_id, entity_type, entity_id, activity, source_type, source_system, source_ref,
    actor_id, actor_name, payload_sha256, metadata_json, created_at
  ) VALUES (?, ?, 'prescription-change-request', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id("prov"), request.patientId, request.id, operation,
      provenance.sourceType, provenance.sourceSystem, provenance.sourceRef || null,
      provenance.actorId, provenance.actorName, hash(request),
      JSON.stringify({
        sourceOrderId: request.sourceOrderId,
        sourceTransactionId: request.sourceTransactionId,
        adapterId: request.adapterId,
        externalRequestId: request.externalRequestId,
        category: request.category,
        status: request.status,
        resultingOrderId: request.resultingOrderId,
        resolutionDecision: request.resolutionDecision,
        medicationTruthChanged: false,
      }),
      at,
    );
}

function sameRequestedChanges(
  left: PrescriptionRequestedChanges,
  right: PrescriptionRequestedChanges,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export const PrescriptionChangeRequestRepository = {
  getById(requestId: string): PrescriptionChangeRequest | null {
    return asChangeRequest(getDatabase().prepare(
      `SELECT * FROM prescription_change_requests WHERE id = ?`,
    ).get(requestId));
  },

  getByExternalIdentity(adapterId: string, externalRequestId: string): PrescriptionChangeRequest | null {
    return asChangeRequest(getDatabase().prepare(`
      SELECT * FROM prescription_change_requests
      WHERE adapter_id = ? AND external_request_id = ?
    `).get(adapterId, externalRequestId));
  },

  listByPatient(patientId: string): PrescriptionChangeRequest[] {
    return (getDatabase().prepare(`
      SELECT * FROM prescription_change_requests
      WHERE patient_id = ?
      ORDER BY updated_at DESC
    `).all(patientId) as any[]).map((row) => asChangeRequest(row)!).filter(Boolean);
  },

  getOrCreate(input: {
    patientId: string;
    sourceOrderId: string;
    sourceTransactionId: string;
    adapterId: string;
    vendorName: string;
    externalRequestId: string;
    category: PrescriptionChangeRequestCategory;
    requestedChanges: PrescriptionRequestedChanges;
    summary?: string;
    sourceReference?: string;
    receivedAt: string;
  }, provenance: ChangeRequestProvenance): { request: PrescriptionChangeRequest; created: boolean } {
    const existing = this.getByExternalIdentity(input.adapterId, input.externalRequestId);
    if (existing) {
      if (
        existing.patientId !== input.patientId ||
        existing.sourceOrderId !== input.sourceOrderId ||
        existing.sourceTransactionId !== input.sourceTransactionId
      ) {
        throw new Error(
          `Prescription change request identity ${input.adapterId}/${input.externalRequestId} is already bound to another patient or prescription.`,
        );
      }
      if (
        existing.category !== input.category ||
        !sameRequestedChanges(existing.requestedChanges, input.requestedChanges)
      ) {
        throw new Error(
          `Prescription change request identity ${input.adapterId}/${input.externalRequestId} was replayed with conflicting normalized content.`,
        );
      }
      return { request: existing, created: false };
    }

    const requestId = id("rxchange");
    const at = now();
    getDatabase().prepare(`INSERT INTO prescription_change_requests (
      id, patient_id, source_order_id, source_transaction_id, adapter_id, vendor_name,
      external_request_id, request_category, requested_changes_json, summary, source_reference,
      status, resulting_order_id, resolution_decision, resolved_by_id, resolved_by_name,
      resolved_at, received_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, NULL, NULL, ?, ?, ?)`)
      .run(
        requestId, input.patientId, input.sourceOrderId, input.sourceTransactionId,
        input.adapterId, input.vendorName, input.externalRequestId, input.category,
        JSON.stringify(input.requestedChanges), input.summary || null, input.sourceReference || null,
        input.receivedAt, at, at,
      );

    const request = this.getById(requestId);
    if (!request) throw new Error(`Prescription change request not found after creation: ${requestId}`);
    stampRequest(request, "create", provenance);
    return { request, created: true };
  },

  markAccepted(
    requestId: string,
    resultingOrderId: string,
    provenance: ChangeRequestProvenance,
  ): PrescriptionChangeRequest {
    const current = this.getById(requestId);
    if (!current) throw new Error(`Prescription change request not found: ${requestId}`);
    if (current.status === "accepted") {
      if (current.resultingOrderId !== resultingOrderId) {
        throw new Error(`Prescription change request ${requestId} is already linked to another replacement order.`);
      }
      return current;
    }
    if (current.status === "declined") {
      throw new Error(`Prescription change request ${requestId} was already declined and cannot be accepted.`);
    }

    const at = now();
    getDatabase().prepare(`UPDATE prescription_change_requests SET
      status = 'accepted', resulting_order_id = ?, resolution_decision = 'accepted',
      resolved_by_id = ?, resolved_by_name = ?, resolved_at = ?, updated_at = ?
      WHERE id = ? AND status = 'pending' AND resulting_order_id IS NULL
    `).run(resultingOrderId, provenance.actorId, provenance.actorName, at, at, requestId);

    const updated = this.getById(requestId);
    if (!updated) throw new Error(`Prescription change request not found after acceptance: ${requestId}`);
    stampRequest(updated, "accepted", provenance);
    return updated;
  },

  markDeclined(
    requestId: string,
    provenance: ChangeRequestProvenance,
  ): PrescriptionChangeRequest {
    const current = this.getById(requestId);
    if (!current) throw new Error(`Prescription change request not found: ${requestId}`);
    if (current.status === "declined") return current;
    if (current.status === "accepted") {
      throw new Error(`Prescription change request ${requestId} was already accepted and cannot be declined.`);
    }

    const at = now();
    getDatabase().prepare(`UPDATE prescription_change_requests SET
      status = 'declined', resolution_decision = 'declined',
      resolved_by_id = ?, resolved_by_name = ?, resolved_at = ?, updated_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(provenance.actorId, provenance.actorName, at, at, requestId);

    const updated = this.getById(requestId);
    if (!updated) throw new Error(`Prescription change request not found after decline: ${requestId}`);
    stampRequest(updated, "declined", provenance);
    return updated;
  },
};
