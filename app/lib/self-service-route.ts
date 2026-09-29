/**
 * Patient Self-Service Portal Routing (P7-F).
 *
 * Strict Authority Boundary Invariant:
 * The self-service portal (/intake/self-service) is a public, single-subject,
 * cryptographically tokenized surface for prospective and scheduled patients.
 * It operates strictly outside clinician/staff authentication and must never mount
 * provider workspace chrome, patient charts, or session expiry challenges.
 */

export const SELF_SERVICE_ROUTE_PREFIX = "/intake/self-service";

export function isPatientSelfServiceRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === SELF_SERVICE_ROUTE_PREFIX || pathname.startsWith(`${SELF_SERVICE_ROUTE_PREFIX}/`);
}
