import type { DatabaseSync } from "node:sqlite";
import type { DatabaseMigration } from "./types";

/**
 * A create that the client may repeat — a network retry of a request that did
 * succeed, a second tab, a Retry press after a timeout — carries a client-made
 * key. The first request reserves (actor, key); a repeat with the same payload is
 * answered with the stored result instead of writing a second message or task.
 * Keys are per actor, so one user cannot replay another's request.
 */
export const migration: DatabaseMigration = {
  id: "2026-10-07-001-idempotent-requests",
  description: "Idempotency keys for repeatable create actions",
  apply(db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS idempotent_requests (
        actor_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        action_type TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
        response_json TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        PRIMARY KEY (actor_id, idempotency_key)
      );
    `);
  },
};
