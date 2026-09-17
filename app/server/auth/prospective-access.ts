import { OrganizationRepository } from "../repositories/organization-repository";
import { ProspectivePersonRepository } from "../repositories/prospective-person-repository";
import type { ProviderContext } from "./provider-context";

/**
 * A prospective person is identity-bound but not a clinical chart, so the
 * full patient-access policy (organization scope + per-patient assignment)
 * does not apply. Organization membership is the whole question: any active
 * member of the owning organization may work front-door intake for it,
 * mirroring the D-074 precedent that administrative intake work does not
 * require clinical permissions or per-patient assignment. Access is
 * re-resolved on every call rather than cached on the actor.
 */
export class ProspectiveAccessError extends Error {
  constructor(message = "This actor cannot access this prospective record.") {
    super(message);
    this.name = "ProspectiveAccessError";
  }
}

function actorOrganizationIds(actor: ProviderContext): Set<string> {
  const ids = new Set<string>();
  if (actor.organizationId) ids.add(actor.organizationId);
  try {
    for (const membership of OrganizationRepository.membershipsForUser(actor.userId)) {
      if (membership.status === "active") ids.add(membership.organizationId);
    }
  } catch {
    // Membership lookup unavailable — fail closed with whatever we already have.
  }
  return ids;
}

export function canAccessProspectiveOrganization(actor: ProviderContext, organizationId: string): boolean {
  return actorOrganizationIds(actor).has(organizationId);
}

export function assertProspectiveOrganizationAccess(actor: ProviderContext, organizationId: string): void {
  if (!canAccessProspectiveOrganization(actor, organizationId)) {
    throw new ProspectiveAccessError(`Actor ${actor.userId} has no active membership in organization ${organizationId}.`);
  }
}

export function canAccessProspectivePerson(actor: ProviderContext, prospectiveId: string): boolean {
  const prospect = ProspectivePersonRepository.getById(prospectiveId);
  if (!prospect) return false;
  return canAccessProspectiveOrganization(actor, prospect.organizationId);
}

export function assertProspectivePersonAccess(actor: ProviderContext, prospectiveId: string): void {
  const prospect = ProspectivePersonRepository.getById(prospectiveId);
  if (!prospect) throw new ProspectiveAccessError(`Prospective record not found: ${prospectiveId}`);
  assertProspectiveOrganizationAccess(actor, prospect.organizationId);
}
