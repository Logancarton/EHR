import { hasPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import { PatientAccessError, accessSelectionForActor } from "../auth/patient-access";
import { AuditRepository } from "../repositories/audit-repository";
import { OrganizationRepository } from "../repositories/organization-repository";
import { HRRepository, type HrRecord } from "../repositories/hr-repository";

/**
 * The HR authorization boundary (D-086).
 *
 * Two scopes, and the difference between them is the whole point of this file:
 *
 * - **Your own record** — insurance, licensing deadlines, coachings, goals. Every
 *   authenticated member, always, no permission required. It is their own material.
 * - **Anyone else's record** — the staff directory and other people's personnel data.
 *   Owners, managers, and members an owner or manager has designated as HR personnel.
 *
 * Personnel data is not clinical data. Clinical role grants nothing here: a physician
 * is not an HR administrator by virtue of being a physician. That is why the check is
 * `manage_hr` rather than anything derived from `ProviderRole`.
 *
 * Refusals throw. A caller who may not read a record gets an error, never an empty
 * list or a thinned-out copy — a surface that degrades quietly teaches people it is
 * showing them everything there is.
 */

export class HRAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HRAccessError";
  }
}

export type HrDirectoryEntry = {
  userId: string;
  displayName: string;
  credentials?: string;
  role: string;
  active: boolean;
  membershipRole: string;
  /** Whether this member has been designated HR personnel. */
  hrDesignated: boolean;
  record: HrRecord | null;
};

function auditActor(actor: ProviderContext) {
  return { userId: actor.userId, userName: providerLabel(actor), userRole: actor.role };
}

/**
 * The organization whose HR this actor is acting inside.
 *
 * Mirrors the rule organization administration already uses: an explicit target is
 * honoured only when the actor actively belongs to it, so passing an id can never
 * reach another practice.
 */
function hrOrganization(actor: ProviderContext, requested?: string): string {
  const selection = accessSelectionForActor(actor);
  const memberships = [...selection.organizationIds, ...selection.assignedScopeOrganizationIds];

  if (requested) {
    if (!memberships.includes(requested)) {
      throw new PatientAccessError(
        "(organization)",
        `HR access denied: ${actor.userId} has no active membership in ${requested}.`,
      );
    }
    return requested;
  }
  if (memberships.length === 0) {
    throw new PatientAccessError(
      "(organization)",
      `HR access denied: ${actor.userId} has no active organization membership.`,
    );
  }
  if (memberships.length > 1) {
    throw new Error("Specify which organization's HR to open; this user belongs to more than one.");
  }
  return memberships[0];
}

export const HRService = {
  /**
   * Whether this actor may reach other people's HR records. The UI asks so it can
   * present the right thing; it is not the check that protects anything. Every read
   * below enforces the boundary itself.
   */
  canReadOthers(actor: ProviderContext): boolean {
    return hasPermission(actor, "manage_hr");
  },

  /** The actor's own record. No permission needed, and no audit event: it is theirs. */
  ownRecord(actor: ProviderContext, organizationId?: string): {
    organizationId: string;
    userId: string;
    record: HrRecord | null;
    canReadOthers: boolean;
  } {
    const target = hrOrganization(actor, organizationId);
    return {
      organizationId: target,
      userId: actor.userId,
      record: HRRepository.recordFor(target, actor.userId),
      canReadOthers: HRService.canReadOthers(actor),
    };
  },

  /**
   * Another member's record, or the actor's own when the ids match.
   *
   * The self case is checked first so a member always reaches their own material even
   * if a designation is later revoked.
   */
  recordForMember(
    actor: ProviderContext,
    userId: string,
    organizationId?: string,
  ): { organizationId: string; record: HrRecord | null } {
    const target = hrOrganization(actor, organizationId);

    if (userId !== actor.userId) {
      if (!HRService.canReadOthers(actor)) {
        throw new HRAccessError(
          `HR access denied: ${actor.userId} may read only their own HR record.`,
        );
      }
      const member = OrganizationRepository.membersOf(target).find((m) => m.userId === userId);
      if (!member) {
        throw new HRAccessError(`HR access denied: ${userId} is not a member of ${target}.`);
      }
      AuditRepository.log({
        ...auditActor(actor),
        eventType: "hr_record_viewed",
        description: `Viewed the HR record of ${member.displayName}`,
        metadata: { subjectUserId: userId, organizationId: target },
      });
    }

    return { organizationId: target, record: HRRepository.recordFor(target, userId) };
  },

  /**
   * Every member's HR record. Restricted to owners, managers, and designated HR
   * personnel — this is the surface the old fixture roster exposed to everyone.
   */
  directory(actor: ProviderContext, organizationId?: string): {
    organizationId: string;
    entries: HrDirectoryEntry[];
  } {
    const target = hrOrganization(actor, organizationId);
    if (!HRService.canReadOthers(actor)) {
      throw new HRAccessError(
        `HR access denied: ${actor.userId} is not an owner, manager, or designated HR administrator.`,
      );
    }

    const entries = OrganizationRepository.membersOf(target).map((member) => ({
      userId: member.userId,
      displayName: member.displayName,
      credentials: member.credentials,
      role: member.role,
      active: member.active,
      membershipRole: member.membershipRole,
      hrDesignated: member.hrAccess === "designated",
      record: HRRepository.recordFor(target, member.userId),
    }));

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "hr_record_viewed",
      description: `Opened the HR directory for ${entries.length} members`,
      metadata: { organizationId: target, memberCount: entries.length },
    });

    return { organizationId: target, entries };
  },
};
