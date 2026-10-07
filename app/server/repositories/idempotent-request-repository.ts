import { createHash } from "node:crypto";
import { getDatabase } from "../db/connection";

/**
 * A repeated request for a create the server already performed.
 *
 * 409 while the first request is still running, 422 when the key is reused for a
 * different request — both are refusals the caller can act on, never a second write.
 */
export class IdempotencyConflictError extends Error {
  readonly status: number;
  constructor(message: string, status: 409 | 422) {
    super(message);
    this.name = "IdempotencyConflictError";
    this.status = status;
  }
}

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/** A client key is accepted only in a narrow, opaque shape. */
export function normalizeIdempotencyKey(value: string | null | undefined): string | undefined {
  const key = value?.trim();
  if (!key) return undefined;
  if (!KEY_PATTERN.test(key)) {
    throw new IdempotencyConflictError("Idempotency-Key must be 8–128 letters, digits, '-' or '_'.", 422);
  }
  return key;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Runs `perform` at most once per (actor, key). The reservation is written before
 * the action runs, so two concurrent requests cannot both write; a failed action
 * releases it, so a genuine retry after a refusal can still proceed.
 */
export async function runIdempotently<T>(
  input: { actorId: string; key: string; actionType: string; payload: unknown },
  perform: () => Promise<T> | T,
): Promise<T> {
  const db = getDatabase();
  const requestHash = createHash("sha256").update(stableStringify(input.payload)).digest("hex");
  const reserved = db.prepare(`
    INSERT OR IGNORE INTO idempotent_requests
      (actor_id, idempotency_key, action_type, request_hash, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(input.actorId, input.key, input.actionType, requestHash, new Date().toISOString());

  if (Number(reserved.changes) === 0) {
    const existing = db.prepare(
      "SELECT action_type, request_hash, status, response_json FROM idempotent_requests WHERE actor_id = ? AND idempotency_key = ?",
    ).get(input.actorId, input.key) as
      | { action_type: string; request_hash: string; status: string; response_json: string | null }
      | undefined;
    if (!existing || existing.action_type !== input.actionType || existing.request_hash !== requestHash) {
      throw new IdempotencyConflictError("This request key was already used for a different request.", 422);
    }
    if (existing.status !== "completed" || existing.response_json === null) {
      throw new IdempotencyConflictError("This request is already being processed.", 409);
    }
    return JSON.parse(existing.response_json) as T;
  }

  try {
    const result = await perform();
    db.prepare(`
      UPDATE idempotent_requests SET status = 'completed', response_json = ?, completed_at = ?
      WHERE actor_id = ? AND idempotency_key = ?
    `).run(JSON.stringify(result ?? null), new Date().toISOString(), input.actorId, input.key);
    return result;
  } catch (error) {
    db.prepare("DELETE FROM idempotent_requests WHERE actor_id = ? AND idempotency_key = ?").run(input.actorId, input.key);
    throw error;
  }
}
