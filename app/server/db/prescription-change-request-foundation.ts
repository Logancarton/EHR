import type { DatabaseSync } from "node:sqlite";

/**
 * Additive development migration for pharmacy/vendor prescription change requests.
 * A change request is non-authoritative workflow evidence, not prescription intent,
 * medication truth, or prescription transport state.
 */
export function ensurePrescriptionChangeRequestFoundation(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prescription_change_requests (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      source_order_id TEXT NOT NULL,
      source_transaction_id TEXT NOT NULL,
      adapter_id TEXT NOT NULL,
      vendor_name TEXT NOT NULL,
      external_request_id TEXT NOT NULL,
      request_category TEXT NOT NULL,
      requested_changes_json TEXT NOT NULL DEFAULT '{}',
      summary TEXT,
      source_reference TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'accepted', 'declined')),
      resulting_order_id TEXT,
      resolution_decision TEXT
        CHECK(resolution_decision IS NULL OR resolution_decision IN ('accepted', 'declined')),
      resolved_by_id TEXT,
      resolved_by_name TEXT,
      resolved_at TEXT,
      received_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(adapter_id, external_request_id),
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
      FOREIGN KEY(source_order_id) REFERENCES orders(id) ON DELETE RESTRICT,
      FOREIGN KEY(source_transaction_id) REFERENCES prescription_transactions(id) ON DELETE RESTRICT,
      FOREIGN KEY(resulting_order_id) REFERENCES orders(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_prescription_change_requests_patient
      ON prescription_change_requests(patient_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prescription_change_requests_source_transaction
      ON prescription_change_requests(source_transaction_id, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prescription_change_requests_resulting_order
      ON prescription_change_requests(resulting_order_id);
  `);
}
