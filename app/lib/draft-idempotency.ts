import { newIdempotencyKey } from "./api-client";

/**
 * One idempotency key per composed draft, kept until the server confirms it.
 *
 * The in-flight guard (use-in-flight) stops a second press while a create is
 * pending. It cannot help when the server wrote the record but the answer was
 * lost: the composer says "not added, try again", and the retry made a second
 * task. Reusing the draft's key lets the server replay its first result instead
 * (D-128's Idempotency-Key). A confirmed draft forgets its key, so writing the
 * same text again later is a new record.
 */
export function createDraftKeyRing(makeKey: () => string = newIdempotencyKey) {
  const keys = new Map<string, string>();
  return {
    keyFor(signature: string): string {
      let key = keys.get(signature);
      if (!key) {
        key = makeKey();
        keys.set(signature, key);
      }
      return key;
    },
    confirm(signature: string): void {
      keys.delete(signature);
    },
  };
}

export type DraftKeyRing = ReturnType<typeof createDraftKeyRing>;

/** The draft's identity: everything that, if changed, makes it a different record. */
export function draftSignature(...parts: ReadonlyArray<string | null | undefined>): string {
  return JSON.stringify(parts.map((part) => part ?? null));
}
