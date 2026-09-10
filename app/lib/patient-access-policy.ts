/**
 * Patient-access authorization policy.
 *
 * Authentication answers "who is this user"; roles answer "what kind of action may
 * they take". Neither answers "which patients may they touch". That third question
 * is this module's only responsibility, and it is deliberately kept as pure logic so
 * the boundary can be reasoned about and tested without a database.
 *
 * The rule fails closed: a patient that belongs to no organization is reachable by
 * nobody, and a membership that is not active grants nothing.
 */

export type OrganizationMembershipStatus = "active" | "suspended" | "revoked";

/**
 * `organization` scope reaches every patient in that organization (a prescriber in a
 * small practice). `assigned` scope reaches only patients explicitly linked to the
 * user's care team inside that organization (a coordinator covering named patients).
 */
export type PatientAccessScope = "organization" | "assigned";

export type OrganizationMembership = {
  organizationId: string;
  userId: string;
  status: OrganizationMembershipStatus;
  patientAccessScope: PatientAccessScope;
};

export type PatientAccessDenialReason =
  | "patient-unassigned"
  | "no-active-membership"
  | "assignment-required";

export type PatientAccessDecision =
  | { allowed: true; organizationId: string; via: "organization" | "assignment" }
  | { allowed: false; reason: PatientAccessDenialReason; organizationId: string | null };

export type PatientAccessInput = {
  patientId: string;
  /** The organization that owns the patient record, or null when the record is unassigned. */
  patientOrganizationId: string | null;
  memberships: readonly OrganizationMembership[];
  /** Patient ids explicitly assigned to this user's care team. */
  assignedPatientIds: ReadonlySet<string>;
};

export function activeMemberships(
  memberships: readonly OrganizationMembership[],
): OrganizationMembership[] {
  return memberships.filter((membership) => membership.status === "active");
}

export function decidePatientAccess(input: PatientAccessInput): PatientAccessDecision {
  const { patientOrganizationId, assignedPatientIds } = input;

  // An unassigned patient record is not "everyone's patient"; it is nobody's until
  // an organization owns it. Treating absence as openness would make every future
  // import or backfill path a silent access hole.
  if (!patientOrganizationId) {
    return { allowed: false, reason: "patient-unassigned", organizationId: null };
  }

  const membership = activeMemberships(input.memberships)
    .find((candidate) => candidate.organizationId === patientOrganizationId);

  if (!membership) {
    return { allowed: false, reason: "no-active-membership", organizationId: patientOrganizationId };
  }

  if (membership.patientAccessScope === "organization") {
    return { allowed: true, organizationId: patientOrganizationId, via: "organization" };
  }

  if (assignedPatientIds.has(input.patientId)) {
    return { allowed: true, organizationId: patientOrganizationId, via: "assignment" };
  }

  return { allowed: false, reason: "assignment-required", organizationId: patientOrganizationId };
}

export function denialMessage(patientId: string, decision: PatientAccessDecision): string {
  if (decision.allowed) return "";
  switch (decision.reason) {
    case "patient-unassigned":
      return `Patient access denied: patient ${patientId} is not assigned to an organization.`;
    case "no-active-membership":
      return `Patient access denied: no active membership in the organization that owns patient ${patientId}.`;
    case "assignment-required":
      return `Patient access denied: patient ${patientId} is outside this user's assigned patient scope.`;
  }
}

/**
 * The list-side companion to `decidePatientAccess`. A roster, queue, or cross-patient
 * search must narrow to the same set the single-patient check would allow, rather than
 * loading everything and hoping a later check catches it.
 */
export type PatientAccessSelection = {
  /** Organizations whose entire patient population is reachable. */
  organizationIds: string[];
  /** Organizations reachable only through explicit care-team assignment. */
  assignedScopeOrganizationIds: string[];
};

export function resolveAccessSelection(
  memberships: readonly OrganizationMembership[],
): PatientAccessSelection {
  const organizationIds: string[] = [];
  const assignedScopeOrganizationIds: string[] = [];

  for (const membership of activeMemberships(memberships)) {
    if (membership.patientAccessScope === "organization") organizationIds.push(membership.organizationId);
    else assignedScopeOrganizationIds.push(membership.organizationId);
  }

  return { organizationIds, assignedScopeOrganizationIds };
}

export function hasAnyAccess(selection: PatientAccessSelection): boolean {
  return selection.organizationIds.length > 0 || selection.assignedScopeOrganizationIds.length > 0;
}
