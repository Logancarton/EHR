import type { DatabaseSync } from "node:sqlite";

/**
 * Additive development migration for refill/renewal workflow requests.
 * A refill request is workflow evidence awaiting review, not an outbound transport transaction.
 */
export function ensurePrescriptionRefillFoundation(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prescription_refill_requests (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      prior_order_id TEXT NOT NULL,
      prior_transaction_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      request_source TEXT NOT NULL,
      source_system TEXT NOT NULL,
      source_reference TEXT,
      note TEXT,
      idempotency_key TEXT NOT NULL UNIQUE,
      renewal_order_id TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
      FOREIGN KEY(prior_order_id) REFERENCES orders(id) ON DELETE RESTRICT,
      FOREIGN KEY(prior_transaction_id) REFERENCES prescription_transactions(id) ON DELETE RESTRICT,
      FOREIGN KEY(renewal_order_id) REFERENCES orders(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_prescription_refill_requests_patient
      ON prescription_refill_requests(patient_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prescription_refill_requests_prior_transaction
      ON prescription_refill_requests(prior_transaction_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prescription_refill_requests_renewal_order
      ON prescription_refill_requests(renewal_order_id);
  `);
}
