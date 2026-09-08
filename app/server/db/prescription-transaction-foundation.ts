import type { DatabaseSync } from "node:sqlite";

/**
 * Additive development migration for vendor-neutral prescription transport state.
 * External transport state is intentionally separate from orders and medication truth.
 */
export function ensurePrescriptionTransactionFoundation(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prescription_transactions (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      adapter_id TEXT NOT NULL,
      vendor_name TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'prepared',
      destination_json TEXT NOT NULL DEFAULT '{}',
      external_reference_id TEXT,
      correlation_id TEXT NOT NULL UNIQUE,
      idempotency_key TEXT NOT NULL UNIQUE,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      submitted_at TEXT,
      acknowledged_at TEXT,
      failed_at TEXT,
      canceled_at TEXT,
      last_error_code TEXT,
      last_error_message TEXT,
      created_by TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_ref TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE RESTRICT,
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS prescription_transaction_events (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      event_key TEXT NOT NULL UNIQUE,
      direction TEXT NOT NULL,
      event_type TEXT NOT NULL,
      state TEXT NOT NULL,
      external_event_id TEXT,
      external_reference_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      error_code TEXT,
      error_message TEXT,
      occurred_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      source_system TEXT NOT NULL,
      evidence_candidate_id TEXT,
      FOREIGN KEY(transaction_id) REFERENCES prescription_transactions(id) ON DELETE RESTRICT,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE RESTRICT,
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
      FOREIGN KEY(evidence_candidate_id) REFERENCES medication_reconciliation_candidates(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_prescription_transactions_patient
      ON prescription_transactions(patient_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prescription_transactions_order
      ON prescription_transactions(order_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prescription_transactions_state
      ON prescription_transactions(state, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prescription_transactions_external_ref
      ON prescription_transactions(adapter_id, external_reference_id);
    CREATE INDEX IF NOT EXISTS idx_prescription_transaction_events_transaction
      ON prescription_transaction_events(transaction_id, received_at ASC);
    CREATE INDEX IF NOT EXISTS idx_prescription_transaction_events_patient
      ON prescription_transaction_events(patient_id, received_at DESC);
  `);
}
