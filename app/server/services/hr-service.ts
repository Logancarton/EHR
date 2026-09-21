import { hasPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import { PatientAccessError, accessSelectionForActor } from "../auth/patient-access";
import { AuditRepository } from "../repositories/audit-repository";
import { OrganizationRepository } from "../repositories/organization-repository";
import {
  HRRepository,
  type HrItemCategory,
  type HrRecord,
  type HrRecordItem,
} from "../repositories/hr-repository";

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
 * Writing splits into two tiers, because they are two different authorities:
 *
 * - **Assigning** — setting up someone's record and adding the insurance, licensing
 *   deadlines, coachings and goals it holds. `manage_hr`: owners, managers, and a
 *   designated HR administrator. Doing HR administration is what the designation is
 *   for. An employee without it cannot author HR material, including their own: the
 *   owner's rule is that a record is assigned *to* a person, not written *by* them.
 * - **Designating** — granting or revoking HR access itself. Owners and managers
 *   only, the same authority that administers memberships. A designated HR
 *   administrator deliberately cannot designate anyone else; an access grant that can
 *   reproduce itself without the owner is not a boundary.
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

const ASSIGNABLE_CATEGORIES: readonly HrItemCategory[] = [
  "license",
  "insurance",
  "coaching",
  "goal",
  "other",
];

/**
 * What an item's state can be. A closed set because these drive the deadline cues a
 * member acts on; free text would make "attention" and "Attention!" different states.
 */
const ASSIGNABLE_STATUSES = ["active", "attention", "in_progress", "scheduled", "completed"] as const;

export type HrItemStatus = (typeof ASSIGNABLE_STATUSES)[number];

export function isHrItemCategory(value: unknown): value is HrItemCategory {
  return ASSIGNABLE_CATEGORIES.includes(value as HrItemCategory);
}

export function isHrItemStatus(value: unknown): value is HrItemStatus {
  return ASSIGNABLE_STATUSES.includes(value as HrItemStatus);
}

export const HR_ITEM_CATEGORIES = ASSIGNABLE_CATEGORIES;
export const HR_ITEM_STATUSES = ASSIGNABLE_STATUSES;

/** A calendar date, or null. Rejects anything that is not a real day. */
function normalizeDueOn(value: string | null | undefined, field: string): string | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`${field} must be a calendar date in YYYY-MM-DD form.`);
  }
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw new Error(`${field} is not a real date.`);
  }
  return trimmed;
}

function requiredText(value: unknown, field: string, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${field} is required.`);
  if (text.length > max) throw new Error(`${field} must be ${max} characters or fewer.`);
  return text;
}

function optionalText(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error(`${field} is invalid.`);
  const text = value.trim();
  if (text.length > max) throw new Error(`${field} must be ${max} characters or fewer.`);
  return text;
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

  /**
   * Whether this actor may set up a record or assign items to one. Same grant as
   * reading other people's records: doing HR administration is what the designation is
   * for. The UI asks so it can decide whether to offer the forms at all.
   */
  canAssign(actor: ProviderContext): boolean {
    return hasPermission(actor, "manage_hr");
  },

  /**
   * Whether this actor may grant or revoke the HR designation. Deliberately narrower
   * than `canAssign`: owners and managers only, so HR access cannot propagate without
   * the practice's administrators.
   */
  canDesignate(actor: ProviderContext): boolean {
    return hasPermission(actor, "manage_organization");
  },

  /** The actor's own record. No permission needed, and no audit event: it is theirs. */
  ownRecord(actor: ProviderContext, organizationId?: string): {
    organizationId: string;
    userId: string;
    record: HrRecord | null;
    canReadOthers: boolean;
    canAssign: boolean;
    canDesignate: boolean;
  } {
    const target = hrOrganization(actor, organizationId);
    return {
      organizationId: target,
      userId: actor.userId,
      record: HRRepository.recordFor(target, actor.userId),
      // Three separate questions rather than one "isAdmin". The screen offers a
      // control only when the server has already said yes to that exact act, so a
      // control can never appear for something the next request would refuse.
      canReadOthers: HRService.canReadOthers(actor),
      canAssign: HRService.canAssign(actor),
      canDesignate: HRService.canDesignate(actor),
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
    canAssign: boolean;
    canDesignate: boolean;
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

    return {
      organizationId: target,
      entries,
      canAssign: HRService.canAssign(actor),
      canDesignate: HRService.canDesignate(actor),
    };
  },

  /**
   * Create or update the employment facts at the head of a member's record.
   *
   * The record has to exist before anything can be assigned into it, so this is the
   * first act of HR administration for a new employee. It is idempotent: running it
   * again corrects the employment type or start date rather than creating a second
   * record.
   */
  assignRecord(
    actor: ProviderContext,
    input: {
      userId: string;
      employmentType?: string;
      startedOn?: string | null;
      organizationId?: string;
    },
  ): { organizationId: string; record: HrRecord } {
    const target = hrOrganization(actor, input.organizationId);
    const member = HRService.assertAssignable(actor, target, input.userId);

    const record = HRRepository.upsertRecord({
      organizationId: target,
      userId: member.userId,
      employmentType: optionalText(input.employmentType, "employmentType", 200),
      startedOn: normalizeDueOn(input.startedOn, "startedOn"),
      assignedBy: actor.userId,
    });

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "hr_record_assigned",
      description: `Set up the HR record for ${member.displayName}`,
      metadata: {
        subjectUserId: member.userId,
        organizationId: target,
        employmentType: record.employmentType,
        startedOn: record.startedOn,
      },
    });

    return { organizationId: target, record };
  },

  /**
   * Assign one item — an insurance plan, a licensing deadline, a coaching, a goal —
   * into a member's record.
   *
   * Refuses when the member has no record yet rather than creating one implicitly:
   * setting somebody up is its own act with its own audit entry, and an item that
   * quietly conjured a personnel record would hide that it happened.
   */
  assignItem(
    actor: ProviderContext,
    input: {
      userId: string;
      category: HrItemCategory;
      title: string;
      detail?: string;
      status?: HrItemStatus;
      dueOn?: string | null;
      organizationId?: string;
    },
  ): { organizationId: string; record: HrRecord; item: HrRecordItem } {
    const target = hrOrganization(actor, input.organizationId);
    const member = HRService.assertAssignable(actor, target, input.userId);

    if (!isHrItemCategory(input.category)) {
      throw new Error(`category must be one of: ${ASSIGNABLE_CATEGORIES.join(", ")}.`);
    }
    if (input.status !== undefined && !isHrItemStatus(input.status)) {
      throw new Error(`status must be one of: ${ASSIGNABLE_STATUSES.join(", ")}.`);
    }

    const record = HRRepository.recordFor(target, member.userId);
    if (!record) {
      throw new Error(
        `${member.displayName} has no HR record yet. Set up the record before assigning items to it.`,
      );
    }

    const item = HRRepository.addItem({
      recordId: record.id,
      category: input.category,
      title: requiredText(input.title, "title", 200),
      detail: optionalText(input.detail, "detail", 1000),
      status: input.status ?? "active",
      dueOn: normalizeDueOn(input.dueOn, "dueOn"),
      assignedBy: actor.userId,
      source: "assigned",
    });

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "hr_record_assigned",
      description: `Assigned "${item.title}" to the HR record of ${member.displayName}`,
      metadata: {
        subjectUserId: member.userId,
        organizationId: target,
        itemId: item.id,
        category: item.category,
        dueOn: item.dueOn,
      },
    });

    return {
      organizationId: target,
      record: HRRepository.recordById(record.id) ?? record,
      item,
    };
  },

  /**
   * Grant or revoke the HR designation on one membership.
   *
   * Owners and managers only. Refused for a member who is already an owner or manager,
   * because they hold HR access inherently — a toggle that appeared to grant something
   * already held, and appeared to revoke something it cannot take away, would be
   * lying about who can see personnel data.
   */
  setDesignation(
    actor: ProviderContext,
    input: { userId: string; designated: boolean; organizationId?: string },
  ): { organizationId: string; userId: string; hrDesignated: boolean } {
    const target = hrOrganization(actor, input.organizationId);

    if (!HRService.canDesignate(actor)) {
      throw new HRAccessError(
        `HR access denied: only an owner or manager may grant or revoke the HR designation.`,
      );
    }

    const member = OrganizationRepository.membersOf(target).find((m) => m.userId === input.userId);
    if (!member) {
      throw new HRAccessError(`HR access denied: ${input.userId} is not a member of ${target}.`);
    }
    if (member.membershipRole === "owner" || member.membershipRole === "manager") {
      throw new Error(
        `${member.displayName} is an organization ${member.membershipRole} and already has HR access. ` +
          `Change their organization role to change that.`,
      );
    }
    if (member.status !== "active") {
      throw new Error(
        `${member.displayName}'s membership is ${member.status}. Restore it before granting HR access.`,
      );
    }

    const designation = input.designated ? "designated" : "none";
    if (!OrganizationRepository.setHrAccess(target, member.userId, designation)) {
      throw new HRAccessError(`HR access denied: ${input.userId} is not a member of ${target}.`);
    }

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "hr_access_designation_changed",
      description: input.designated
        ? `Designated ${member.displayName} as HR personnel`
        : `Revoked ${member.displayName}'s HR designation`,
      metadata: { subjectUserId: member.userId, organizationId: target, designation },
    });

    return { organizationId: target, userId: member.userId, hrDesignated: input.designated };
  },

  /**
   * Shared precondition for every assignment: the actor may administer HR here, and
   * the subject is an active member of this organization.
   *
   * The permission check comes first so an unauthorized caller learns they may not
   * assign, rather than learning whether a particular colleague exists.
   */
  assertAssignable(
    actor: ProviderContext,
    organizationId: string,
    userId: string,
  ): { userId: string; displayName: string } {
    if (!HRService.canAssign(actor)) {
      throw new HRAccessError(
        `HR access denied: ${actor.userId} is not an owner, manager, or designated HR administrator.`,
      );
    }
    const member = OrganizationRepository.membersOf(organizationId).find((m) => m.userId === userId);
    if (!member) {
      throw new HRAccessError(`HR access denied: ${userId} is not a member of ${organizationId}.`);
    }
    if (member.status !== "active") {
      throw new Error(
        `${member.displayName}'s membership is ${member.status}. Restore it before assigning HR material.`,
      );
    }
    return { userId: member.userId, displayName: member.displayName };
  },
};
