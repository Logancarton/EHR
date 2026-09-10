import {
  decidePatientAccess,
  denialMessage,
  hasAnyAccess,
  resolveAccessSelection,
  type PatientAccessDecision,
  type PatientAccessSelection,
} from "../../lib/patient-access-policy";
import { OrganizationRepository } from "../repositories/organization-repository";
import type { ProviderContext } from "./provider-context";

/**
 * Distinct from `AuthenticationError` (who) and permission errors (what kind of
 * action). This is "which patients", and it maps to 403 rather than 401 because the
 * caller is a known, authenticated user who simply may not reach this chart.
 */
export class PatientAccessError extends Error {
  readonly patientId: string;

  constructor(patientId: string, message: string) {
    super(message);
    this.name = "PatientAccessError";
    this.patientId = patientId;
  }
}

export function resolvePatientAccess(actor: ProviderContext, patientId: string): PatientAccessDecision {
  const memberships = OrganizationRepository.membershipsForUser(actor.userId);
  return decidePatientAccess({
    patientId,
    patientOrganizationId: OrganizationRepository.organizationForPatient(patientId),
    memberships,
    assignedPatientIds: new Set(OrganizationRepository.assignedPatientIds(actor.userId)),
  });
}

export function canAccessPatient(actor: ProviderContext, patientId: string): boolean {
  return resolvePatientAccess(actor, patientId).allowed;
}

export function assertPatientAccess(actor: ProviderContext, patientId: string): void {
  const decision = resolvePatientAccess(actor, patientId);
  if (decision.allowed) return;
  throw new PatientAccessError(patientId, denialMessage(patientId, decision));
}

export function accessSelectionForActor(actor: ProviderContext): PatientAccessSelection {
  return resolveAccessSelection(OrganizationRepository.membershipsForUser(actor.userId));
}

/**
 * The patient population this actor may see on cross-patient surfaces (roster,
 * practice queues, cross-chart search). Returns an empty list rather than throwing:
 * a clinician with no membership sees an empty roster, not an error page.
 */
export function accessiblePatientIds(actor: ProviderContext): string[] {
  const selection = accessSelectionForActor(actor);
  if (!hasAnyAccess(selection)) return [];
  return OrganizationRepository.accessiblePatientIds({
    userId: actor.userId,
    organizationIds: selection.organizationIds,
    assignedScopeOrganizationIds: selection.assignedScopeOrganizationIds,
  });
}

export function accessiblePatientIdSet(actor: ProviderContext): Set<string> {
  return new Set(accessiblePatientIds(actor));
}

/** Narrows any already-loaded cross-patient rows to the actor's reachable population. */
export function filterToAccessiblePatients<T>(
  actor: ProviderContext,
  rows: readonly T[],
  patientIdOf: (row: T) => string | null | undefined,
): T[] {
  const allowed = accessiblePatientIdSet(actor);
  return rows.filter((row) => {
    const patientId = patientIdOf(row);
    // Rows with no patient (e.g. a personal task) are not patient-scoped data.
    if (!patientId) return true;
    return allowed.has(patientId);
  });
}

/**
 * Places a newly created patient under the creating clinician's organization. A
 * patient must never be created outside every access boundary, so a clinician with
 * no active organization membership cannot create one.
 */
export function organizationForNewPatient(actor: ProviderContext): string {
  const selection = accessSelectionForActor(actor);
  const organizationId = selection.organizationIds[0] ?? selection.assignedScopeOrganizationIds[0];
  if (!organizationId) {
    throw new PatientAccessError(
      "(new)",
      `Patient access denied: user ${actor.userId} has no active organization membership and cannot create a patient record.`,
    );
  }
  return organizationId;
}
