import type { DatabaseSync } from "node:sqlite";

/**
 * Durable callback replay/binding ledger. It deliberately stores no raw HTTP body,
 * headers, signatures, credentials, cookies, tokens, or vendor transport payloads.
 */
export function ensurePrescriptionCallbackFoundation(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prescription_callback_receipts (
      id TEXT PRIMARY KEY,
      adapter_id TEXT NOT NULL,
      external_message_id TEXT NOT NULL,
      callback_type TEXT NOT NULL
        CHECK(callback_type IN ('transaction-event', 'refill-request', 'change-request')),
      correlation_id TEXT NOT NULL,
      normalized_fingerprint TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      transaction_event_id TEXT,
      refill_request_id TEXT,
      change_request_id TEXT,
      status TEXT NOT NULL DEFAULT 'processing'
        CHECK(status IN ('processing', 'processed', 'rejected')),
      failure_code TEXT,
      received_at TEXT NOT NULL,
      processed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(adapter_id, external_message_id),
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE RESTRICT,
      FOREIGN KEY(transaction_id) REFERENCES prescription_transactions(id) ON DELETE RESTRICT,
      FOREIGN KEY(transaction_event_id) REFERENCES prescription_transaction_events(id) ON DELETE RESTRICT,
      FOREIGN KEY(refill_request_id) REFERENCES prescription_refill_requests(id) ON DELETE RESTRICT,
      FOREIGN KEY(change_request_id) REFERENCES prescription_change_requests(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_prescription_callback_receipts_patient
      ON prescription_callback_receipts(patient_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prescription_callback_receipts_transaction
      ON prescription_callback_receipts(transaction_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prescription_callback_receipts_status
      ON prescription_callback_receipts(status, updated_at DESC);
  `);
}
