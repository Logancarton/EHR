/**
 * How many failed password attempts an account tolerates before it is locked, and
 * for how long.
 *
 * Held as pure logic so the rule can be reasoned about and tested without a
 * database or a clock. The counter is keyed on the username being attempted, which
 * is the only identifier available before authentication succeeds.
 *
 * The trade-off this makes deliberately: keying on username means someone who knows
 * a clinician's username can lock that account by failing logins against it. The
 * alternative — no limit — leaves passwords open to unlimited guessing, which is
 * worse for a system holding clinical records. The sting is removed by letting an
 * administrator clear a lockout (see `OrganizationAdminService`), so a locked-out
 * clinician has a same-practice path back rather than waiting out the window.
 * Source-address limiting is the missing second dimension; it needs a trusted proxy
 * configuration before `x-forwarded-for` can be believed, so it is not attempted here.
 */

export const MAX_FAILED_ATTEMPTS = 10;
export const LOCKOUT_MS = 15 * 60 * 1000;
/** A run of failures older than this is stale and starts over. */
export const ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

export type LoginAttemptRecord = {
  failedAttempts: number;
  firstFailureAt: number;
  lastFailureAt: number;
  lockedUntil?: number;
};

export type LockState = { locked: boolean; until?: number };

export function lockState(record: LoginAttemptRecord | null, now: number): LockState {
  if (!record?.lockedUntil) return { locked: false };
  if (record.lockedUntil <= now) return { locked: false };
  return { locked: true, until: record.lockedUntil };
}

/**
 * The record to store after a failed attempt. Returns `lockedUntil` when this
 * failure is the one that trips the limit.
 */
export function recordFailure(
  record: LoginAttemptRecord | null,
  now: number,
): LoginAttemptRecord {
  const withinWindow = record && now - record.firstFailureAt <= ATTEMPT_WINDOW_MS;
  const priorAttempts = withinWindow ? record.failedAttempts : 0;
  const failedAttempts = priorAttempts + 1;

  return {
    failedAttempts,
    firstFailureAt: withinWindow ? record.firstFailureAt : now,
    lastFailureAt: now,
    lockedUntil: failedAttempts >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_MS : undefined,
  };
}

export function attemptsRemaining(record: LoginAttemptRecord | null, now: number): number {
  if (!record || now - record.firstFailureAt > ATTEMPT_WINDOW_MS) return MAX_FAILED_ATTEMPTS;
  return Math.max(0, MAX_FAILED_ATTEMPTS - record.failedAttempts);
}
