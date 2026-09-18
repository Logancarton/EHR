/**
 * Which authenticated user local browser preference/pin caches belong to.
 *
 * Server preference ownership is decided exclusively by the authenticated session
 * (see `/api/preferences`). But a few browser-side caches exist purely for instant
 * first-paint and offline resilience — full preferences in `preference-engine.ts`,
 * rail pins in `workspace-tools.ts` — and those live in plain localStorage, which
 * survives an account switch on a shared browser. Without a namespace, clinician B
 * could read (or worse, have re-uploaded to their own server record) a cache
 * clinician A left behind.
 *
 * `AuthSessionGate` is the one place identity transitions happen (fresh login,
 * development login, a confirmed account switch, logout), so it is the sole writer
 * here. Everything else only reads.
 */

let activeUserId: string | null = null;

export function setActiveCacheUserId(userId: string | null): void {
  activeUserId = userId;
}

/** Namespaces a base storage key to the current user, or `null` if nobody is authenticated yet. */
export function scopedStorageKey(baseKey: string): string | null {
  return activeUserId ? `${baseKey}::${activeUserId}` : null;
}
