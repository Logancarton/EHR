import { NextResponse } from "next/server";
import { OrganizationAdminService, isMembershipRole } from "../../../server/services/organization-admin-service";
import { authenticatedClinicalRequest, clinicalActionError } from "../../../server/http/clinical-http";

/**
 * Administration of the organization's own users and memberships.
 *
 * Every handler derives the actor from the server session and refuses to act outside
 * an organization that actor actively belongs to. A client-supplied `organizationId`
 * only disambiguates between the actor's own memberships; it is never a way to reach
 * another practice.
 */

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown, field: string, max = 200): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > max) throw new Error(`${field} is invalid.`);
  return value;
}

export async function GET(req: Request) {
  try {
    const { actor } = authenticatedClinicalRequest(req);
    const { searchParams } = new URL(req.url);
    const organizationId = optionalString(searchParams.get("organizationId"), "organizationId");
    return NextResponse.json({ success: true, ...OrganizationAdminService.listMembers(actor, organizationId) });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const { actor, context } = authenticatedClinicalRequest(req);
    const body: unknown = await req.json();
    if (!isObject(body)) throw new Error("Request body must be an object.");
    for (const key of Object.keys(body)) {
      if (!["id", "displayName", "credentials", "role", "organizationId", "patientAccessScope"].includes(key)) {
        throw new Error(`Request contains an unexpected field: ${key}.`);
      }
    }

    const scope = optionalString(body.patientAccessScope, "patientAccessScope", 32);
    if (scope !== undefined && scope !== "organization" && scope !== "assigned") {
      throw new Error("patientAccessScope must be organization or assigned.");
    }

    const result = OrganizationAdminService.provisionUser(
      {
        id: optionalString(body.id, "id", 160),
        displayName: String(body.displayName ?? ""),
        credentials: optionalString(body.credentials, "credentials", 120),
        role: body.role as never,
        organizationId: optionalString(body.organizationId, "organizationId"),
        patientAccessScope: scope,
      },
      actor,
      context,
    );
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const { actor, context } = authenticatedClinicalRequest(req);
    const body: unknown = await req.json();
    if (!isObject(body)) throw new Error("Request body must be an object.");
    for (const key of Object.keys(body)) {
      if (!["userId", "organizationId", "status", "patientAccessScope", "membershipRole", "active", "issueActivationToken", "clearLoginLockout"].includes(key)) {
        throw new Error(`Request contains an unexpected field: ${key}.`);
      }
    }

    const userId = optionalString(body.userId, "userId", 160);
    if (!userId) throw new Error("userId is required.");
    const organizationId = optionalString(body.organizationId, "organizationId");

    // Issuing an activation token is its own act, never bundled with a status or
    // scope change: the response carries a secret, and mixing it into a routine
    // membership edit would scatter that secret through unrelated call sites.
    if (body.issueActivationToken !== undefined) {
      if (body.issueActivationToken !== true) throw new Error("issueActivationToken must be true.");
      if (Object.keys(body).some((key) => !["userId", "organizationId", "issueActivationToken"].includes(key))) {
        throw new Error("Issue an activation token on its own request.");
      }
      const issued = OrganizationAdminService.issueActivationToken({ userId, organizationId }, actor, context);
      return NextResponse.json({ success: true, ...issued });
    }

    if (body.clearLoginLockout !== undefined) {
      if (body.clearLoginLockout !== true) throw new Error("clearLoginLockout must be true.");
      if (Object.keys(body).some((key) => !["userId", "organizationId", "clearLoginLockout"].includes(key))) {
        throw new Error("Clear a login lockout on its own request.");
      }
      const cleared = OrganizationAdminService.clearLoginLockout({ userId, organizationId }, actor, context);
      return NextResponse.json({ success: true, ...cleared });
    }

    // Activation is a change to the user record; status and scope are changes to one
    // membership. They are deliberately separate operations rather than one merged
    // patch, so an administrator cannot half-apply the wider act by accident.
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") throw new Error("active must be a boolean.");
      if (body.status !== undefined || body.patientAccessScope !== undefined || body.membershipRole !== undefined) {
        throw new Error("Change activation separately from membership status, scope, or role.");
      }
      const result = OrganizationAdminService.setUserActive(
        { userId, active: body.active, organizationId },
        actor,
        context,
      );
      return NextResponse.json({ success: true, ...result });
    }

    const status = optionalString(body.status, "status", 32);
    if (status !== undefined && status !== "active" && status !== "suspended" && status !== "revoked") {
      throw new Error("status must be active, suspended, or revoked.");
    }
    const scope = optionalString(body.patientAccessScope, "patientAccessScope", 32);
    if (scope !== undefined && scope !== "organization" && scope !== "assigned") {
      throw new Error("patientAccessScope must be organization or assigned.");
    }
    const membershipRole = optionalString(body.membershipRole, "membershipRole", 16);
    if (membershipRole !== undefined && !isMembershipRole(membershipRole)) {
      throw new Error("membershipRole must be owner, manager, or member.");
    }
    if (status === undefined && scope === undefined && membershipRole === undefined) {
      throw new Error("Provide status, patientAccessScope, membershipRole, or active.");
    }

    const result = OrganizationAdminService.updateMembership(
      { userId, organizationId, status, patientAccessScope: scope, membershipRole },
      actor,
      context,
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return clinicalActionError(error);
  }
}
