import { AuthService } from "../auth/auth-service";
import { assertPermission, providerLabel, type ProviderContext, type ProviderRole } from "../auth/provider-context";
import { PatientAccessError, accessSelectionForActor } from "../auth/patient-access";
import { AuditRepository } from "../repositories/audit-repository";
import { AuthRepository } from "../repositories/auth-repository";
import { OrganizationRepository } from "../repositories/organization-repository";
import { UserRepository, type AppUser } from "../repositories/user-repository";
import type {
  OrganizationMembershipStatus,
  PatientAccessScope,
} from "../../lib/patient-access-policy";
import type { ClinicalExecutionContext } from "./clinical-service";

/**
 * Administering the users and memberships of one organization.
 *
 * D-033 made patient access enforceable; without this it was not operable — the only
 * way to provision a clinician or revoke their reach was a direct repository call.
 *
 * The rule that makes this safe is narrow and absolute: an administrator acts only
 * inside an organization they themselves actively belong to. Nothing here lets a
 * user reach into another practice, grant themselves membership somewhere new, or
 * widen their own scope by administering the organization that contains them.
 */

export type MembershipRole = "owner" | "manager" | "member";

export type OrganizationMemberView = {
  userId: string;
  displayName: string;
  credentials?: string;
  role: string;
  active: boolean;
  status: OrganizationMembershipStatus;
  patientAccessScope: PatientAccessScope;
  /** Who administers the practice, as distinct from the clinical role. */
  membershipRole: MembershipRole;
};

export function isMembershipRole(value: unknown): value is MembershipRole {
  return value === "owner" || value === "manager" || value === "member";
}

function isProviderRole(value: unknown): value is ProviderRole {
  return value === "provider" || value === "staff" || value === "clinical_assistant";
}

function auditActor(actor: ProviderContext) {
  return { userId: actor.userId, userName: providerLabel(actor), userRole: actor.role };
}

/**
 * Resolves the organization this actor may administer.
 *
 * An explicit target is honoured only when the actor actively belongs to it. Passing
 * an organization id is therefore never a way to reach a different practice — it only
 * disambiguates when the actor belongs to more than one.
 */
function administeredOrganization(actor: ProviderContext, requested?: string): string {
  const selection = accessSelectionForActor(actor);
  const memberships = [...selection.organizationIds, ...selection.assignedScopeOrganizationIds];

  if (requested) {
    if (!memberships.includes(requested)) {
      throw new PatientAccessError(
        "(organization)",
        `Organization access denied: ${actor.userId} has no active membership in ${requested}.`,
      );
    }
    return requested;
  }

  if (memberships.length === 0) {
    throw new PatientAccessError(
      "(organization)",
      `Organization access denied: ${actor.userId} has no active organization membership.`,
    );
  }
  if (memberships.length > 1) {
    throw new Error("Specify which organization to administer; this user belongs to more than one.");
  }
  return memberships[0];
}

export const OrganizationAdminService = {
  listMembers(actor: ProviderContext, organizationId?: string): {
    organizationId: string;
    members: OrganizationMemberView[];
  } {
    assertPermission(actor, "manage_organization");
    const target = administeredOrganization(actor, organizationId);

    return {
      organizationId: target,
      members: OrganizationRepository.membersOf(target).map((member) => ({
        userId: member.userId,
        displayName: member.displayName,
        credentials: member.credentials,
        role: member.role,
        active: member.active,
        status: member.status,
        patientAccessScope: member.patientAccessScope,
        membershipRole: isMembershipRole(member.membershipRole) ? member.membershipRole : "member",
      })),
    };
  },

  /**
   * Creates a clinician and places them in the administrator's own organization.
   * A user is never created without a membership: an account that belongs to no
   * organization can authenticate but reach no chart, which is a confusing state to
   * hand someone rather than a useful one.
   */
  provisionUser(
    input: {
      id?: string;
      displayName: string;
      credentials?: string;
      role: ProviderRole;
      organizationId?: string;
      patientAccessScope?: PatientAccessScope;
    },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): { user: AppUser; organizationId: string; patientAccessScope: PatientAccessScope } {
    assertPermission(actor, "manage_organization");
    const target = administeredOrganization(actor, input.organizationId);

    const displayName = input.displayName?.trim();
    if (!displayName) throw new Error("displayName is required.");
    if (displayName.length > 200) throw new Error("displayName is too long.");
    if (!isProviderRole(input.role)) throw new Error("role must be provider, staff, or clinical_assistant.");

    const id = (input.id?.trim() || `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    if (id.length > 160) throw new Error("User id is too long.");
    if (UserRepository.getById(id)) throw new Error(`User already exists: ${id}`);

    const patientAccessScope = input.patientAccessScope ?? "assigned";
    const user = UserRepository.create({
      id,
      displayName,
      credentials: input.credentials?.trim() || undefined,
      role: input.role,
    });
    OrganizationRepository.upsertMembership({
      organizationId: target,
      userId: user.id,
      status: "active",
      patientAccessScope,
    });

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "organization_user_provisioned",
      description: `${providerLabel(actor)} provisioned ${displayName} (${input.role}) in ${target}.`,
      metadata: {
        source: context.source,
        requestId: context.requestId,
        organizationId: target,
        provisionedUserId: user.id,
        role: input.role,
        patientAccessScope,
      },
    });

    return { user, organizationId: target, patientAccessScope };
  },

  /**
   * Changes a member's standing or patient scope. Revoking or suspending also ends
   * that user's live sessions — the point of revoking access is that it takes effect
   * now, not when a token happens to expire.
   */
  updateMembership(
    input: {
      userId: string;
      organizationId?: string;
      status?: OrganizationMembershipStatus;
      patientAccessScope?: PatientAccessScope;
      membershipRole?: MembershipRole;
    },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): { member: OrganizationMemberView; revokedSessions: number } {
    assertPermission(actor, "manage_organization");
    const target = administeredOrganization(actor, input.organizationId);

    const existing = OrganizationRepository.membersOf(target)
      .find((member) => member.userId === input.userId);
    if (!existing) throw new Error(`Membership not found: ${input.userId} in ${target}.`);

    const status = input.status ?? existing.status;
    const patientAccessScope = input.patientAccessScope ?? existing.patientAccessScope;
    const previousRole = isMembershipRole(existing.membershipRole) ? existing.membershipRole : "member";
    const membershipRole = input.membershipRole ?? previousRole;

    // An administrator removing their own last foothold would lock the organization
    // out of administration entirely, with no path back through the product.
    if (input.userId === actor.userId && status !== "active") {
      throw new Error("An administrator cannot revoke their own membership.");
    }

    // Ownership cannot be self-granted. `manage_organization` is held by every
    // provider, so without this any clinician could promote themselves and then
    // rewrite the whole practice's shared settings — the precise thing the
    // owner/member split exists to prevent. Only a sitting owner moves the role.
    if (input.membershipRole !== undefined && input.membershipRole !== previousRole) {
      const actorIsOwner = OrganizationRepository.activeOwnerIds(target).includes(actor.userId);
      if (!actorIsOwner) {
        throw new Error("Only a practice owner can change who owns or manages the practice.");
      }
    }

    // The same lockout by a different route: ownership gates the practice's shared
    // settings, and nothing outside the database could restore it. An organization
    // therefore always keeps at least one active owner — whether the last one is
    // being demoted or deactivated.
    const losingOwnership =
      previousRole === "owner" && (membershipRole !== "owner" || status !== "active");
    if (losingOwnership) {
      const remaining = OrganizationRepository.activeOwnerIds(target)
        .filter((userId) => userId !== input.userId);
      if (remaining.length === 0) {
        throw new Error(
          "This practice would be left with no owner. Make someone else an owner first.",
        );
      }
    }

    OrganizationRepository.upsertMembership({
      organizationId: target,
      userId: input.userId,
      status,
      patientAccessScope,
      membershipRole,
    });

    const revokedSessions = status === "active" ? 0 : AuthRepository.revokeSessionsForUser(input.userId);

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "organization_membership_updated",
      description:
        `${providerLabel(actor)} set ${existing.displayName} to ${status}/${patientAccessScope} in ${target}.`,
      metadata: {
        source: context.source,
        requestId: context.requestId,
        organizationId: target,
        subjectUserId: input.userId,
        previousStatus: existing.status,
        status,
        previousPatientAccessScope: existing.patientAccessScope,
        patientAccessScope,
        previousMembershipRole: previousRole,
        membershipRole,
        revokedSessions,
      },
    });

    return {
      member: {
        userId: existing.userId,
        displayName: existing.displayName,
        credentials: existing.credentials,
        role: existing.role,
        active: existing.active,
        status,
        patientAccessScope,
        membershipRole,
      },
      revokedSessions,
    };
  },

  /**
   * Issues a single-use activation token so a member can set their own password.
   *
   * The token is returned once and handed over out-of-band; the administrator never
   * learns the resulting password. An administrator who set it would hold a working
   * credential for someone else's clinical account, which is precisely what an audit
   * trail attributing actions to that person is meant to rule out.
   */
  issueActivationToken(
    input: { userId: string; organizationId?: string },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): { userId: string; token: string; expiresAt: string } {
    assertPermission(actor, "manage_organization");
    const target = administeredOrganization(actor, input.organizationId);

    const member = OrganizationRepository.membersOf(target)
      .find((candidate) => candidate.userId === input.userId);
    if (!member) throw new Error(`Membership not found: ${input.userId} in ${target}.`);

    const issued = AuthService.issueActivationToken({ userId: input.userId, issuedBy: actor.userId });

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "organization_membership_updated",
      description: `${providerLabel(actor)} issued an account activation token for ${member.displayName}.`,
      metadata: {
        source: context.source,
        requestId: context.requestId,
        organizationId: target,
        subjectUserId: input.userId,
        // The token itself is never audited; only that one was issued and when it lapses.
        activationExpiresAt: issued.expiresAt,
      },
    });

    return { userId: input.userId, token: issued.token, expiresAt: issued.expiresAt };
  },

  /**
   * Clears a member's failed-login lockout.
   *
   * Rate limiting is keyed on username, which means a clinician can be locked out by
   * someone else guessing against their account. Without this, their only recourse
   * would be to wait out the window mid-clinic; with it, anyone administering their
   * own practice can put them back to work.
   */
  clearLoginLockout(
    input: { userId: string; organizationId?: string },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): { userId: string; cleared: boolean } {
    assertPermission(actor, "manage_organization");
    const target = administeredOrganization(actor, input.organizationId);

    const member = OrganizationRepository.membersOf(target)
      .find((candidate) => candidate.userId === input.userId);
    if (!member) throw new Error(`Membership not found: ${input.userId} in ${target}.`);

    const identity = AuthRepository.getIdentityByUserId(input.userId);
    if (!identity) throw new Error("This account has no credential, so it cannot be locked out.");
    AuthRepository.clearLoginAttempts(identity.username);

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "auth_login_unlocked",
      description: `${providerLabel(actor)} cleared the login lockout for ${member.displayName}.`,
      metadata: {
        source: context.source,
        requestId: context.requestId,
        organizationId: target,
        subjectUserId: input.userId,
      },
    });

    return { userId: input.userId, cleared: true };
  },

  /**
   * Activates or deactivates the user record itself. Deactivation is the wider act
   * than revoking one membership: it ends every session and stops authentication.
   */
  setUserActive(
    input: { userId: string; active: boolean; organizationId?: string },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): { user: AppUser; revokedSessions: number } {
    assertPermission(actor, "manage_organization");
    const target = administeredOrganization(actor, input.organizationId);

    const member = OrganizationRepository.membersOf(target)
      .find((candidate) => candidate.userId === input.userId);
    if (!member) throw new Error(`Membership not found: ${input.userId} in ${target}.`);
    if (input.userId === actor.userId && !input.active) {
      throw new Error("An administrator cannot deactivate their own account.");
    }

    const user = UserRepository.setActive(input.userId, input.active);
    if (!user) throw new Error(`User not found: ${input.userId}`);
    const revokedSessions = input.active ? 0 : AuthRepository.revokeSessionsForUser(input.userId);

    AuditRepository.log({
      ...auditActor(actor),
      eventType: input.active ? "organization_user_activated" : "organization_user_deactivated",
      description: `${providerLabel(actor)} ${input.active ? "activated" : "deactivated"} ${user.displayName}.`,
      metadata: {
        source: context.source,
        requestId: context.requestId,
        organizationId: target,
        subjectUserId: input.userId,
        revokedSessions,
      },
    });

    return { user, revokedSessions };
  },
};
