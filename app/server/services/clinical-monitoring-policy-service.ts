import {
  medicationProtocols,
  resolveMonitoringRules,
  type MonitoringPolicyOverride,
} from "../../lib/clinical-protocols";
import {
  accessSelectionForActor,
  assertPatientAccess,
} from "../auth/patient-access";
import { providerLabel, type ProviderContext } from "../auth/provider-context";
import { AuditRepository } from "../repositories/audit-repository";
import {
  ClinicalMonitoringPolicyRepository,
  type MonitoringPolicyScope,
} from "../repositories/clinical-monitoring-policy-repository";
import { OrganizationRepository } from "../repositories/organization-repository";

export class ClinicalMonitoringPolicyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ClinicalMonitoringPolicyError";
  }
}

const PRACTICE_EDITORS = new Set(["owner", "manager"]);
const MAX_REASON = 500;

function organizationFor(actor: ProviderContext, patientId?: string): string {
  if (patientId) {
    assertPatientAccess(actor, patientId);
    const organizationId = OrganizationRepository.organizationForPatient(patientId);
    if (!organizationId) {
      throw new ClinicalMonitoringPolicyError("That patient is not assigned to an organization.", 409);
    }
    return organizationId;
  }

  const selection = accessSelectionForActor(actor);
  const organizationId =
    selection.organizationIds[0] ?? selection.assignedScopeOrganizationIds[0];
  if (!organizationId) {
    throw new ClinicalMonitoringPolicyError("You do not belong to an active organization.", 403);
  }
  return organizationId;
}

function membershipRole(actor: ProviderContext, organizationId: string): "owner" | "manager" | "member" {
  const membership = OrganizationRepository.membershipsForUser(actor.userId).find(
    (item) => item.organizationId === organizationId && item.status === "active",
  );
  return membership?.membershipRole ?? "member";
}

function overridesFor(
  organizationId: string,
  scopeType: MonitoringPolicyScope,
  scopeId: string,
): MonitoringPolicyOverride[] {
  return ClinicalMonitoringPolicyRepository.list(organizationId, scopeType, scopeId);
}

function ruleExists(ruleId: string): boolean {
  return medicationProtocols.some((rule) => rule.id === ruleId);
}

function integer(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ClinicalMonitoringPolicyError(`${field} must be a number.`, 400);
  }
  const parsed = Math.trunc(value);
  if (parsed < min || parsed > max) {
    throw new ClinicalMonitoringPolicyError(
      `${field} must be between ${min} and ${max} days.`,
      400,
    );
  }
  return parsed;
}

function optionalReason(value: unknown, required: boolean): string | null {
  if (value === undefined || value === null) {
    if (required) {
      throw new ClinicalMonitoringPolicyError(
        "A patient-specific monitoring exception requires a documented reason.",
        400,
      );
    }
    return null;
  }
  if (typeof value !== "string") {
    throw new ClinicalMonitoringPolicyError("Reason must be text.", 400);
  }
  const reason = value.trim();
  if (required && reason.length < 3) {
    throw new ClinicalMonitoringPolicyError(
      "A patient-specific monitoring exception requires a documented reason.",
      400,
    );
  }
  if (reason.length > MAX_REASON) {
    throw new ClinicalMonitoringPolicyError(
      `Reason must be at most ${MAX_REASON} characters.`,
      400,
    );
  }
  return reason || null;
}

function assertScopeEditor(
  actor: ProviderContext,
  organizationId: string,
  scope: MonitoringPolicyScope,
  patientId?: string,
): void {
  if (scope === "practice") {
    if (!PRACTICE_EDITORS.has(membershipRole(actor, organizationId))) {
      throw new ClinicalMonitoringPolicyError(
        "Only a practice owner or manager can change practice monitoring defaults.",
        403,
      );
    }
    return;
  }

  if (scope === "provider") {
    if (actor.role !== "provider") {
      throw new ClinicalMonitoringPolicyError(
        "Only a prescribing provider can set a personal monitoring override.",
        403,
      );
    }
    return;
  }

  if (!patientId) {
    throw new ClinicalMonitoringPolicyError("patientId is required for a patient exception.", 400);
  }
  assertPatientAccess(actor, patientId);
  if (actor.role !== "provider") {
    throw new ClinicalMonitoringPolicyError(
      "Only a provider can set a patient-specific monitoring exception.",
      403,
    );
  }
}

function scopeId(
  scope: MonitoringPolicyScope,
  organizationId: string,
  actor: ProviderContext,
  patientId?: string,
): string {
  if (scope === "practice") return organizationId;
  if (scope === "provider") return actor.userId;
  if (!patientId) throw new ClinicalMonitoringPolicyError("patientId is required.", 400);
  return patientId;
}

export const ClinicalMonitoringPolicyService = {
  read(actor: ProviderContext, patientId?: string) {
    const organizationId = organizationFor(actor, patientId);
    const role = membershipRole(actor, organizationId);

    const practiceOverrides = overridesFor(organizationId, "practice", organizationId);
    const providerOverrides = overridesFor(organizationId, "provider", actor.userId);
    const patientOverrides = patientId
      ? overridesFor(organizationId, "patient", patientId)
      : [];

    const systemRules = medicationProtocols.map((rule) => ({ ...rule, evidenceAliases: [...rule.evidenceAliases] }));
    const practiceRules = resolveMonitoringRules(practiceOverrides);
    const providerRules = resolveMonitoringRules(practiceOverrides, providerOverrides);
    const effectiveRules = resolveMonitoringRules(
      practiceOverrides,
      providerOverrides,
      patientOverrides,
    );

    return {
      organizationId,
      membershipRole: role,
      patientId: patientId || null,
      canEditPractice: PRACTICE_EDITORS.has(role),
      canEditProvider: actor.role === "provider",
      canEditPatient: Boolean(patientId && actor.role === "provider"),
      systemRules,
      practiceRules,
      providerRules,
      effectiveRules,
      practiceOverrides,
      providerOverrides,
      patientOverrides,
    };
  },

  save(
    actor: ProviderContext,
    input: {
      scope: MonitoringPolicyScope;
      patientId?: string;
      ruleId: string;
      intervalDays: unknown;
      dueSoonDays: unknown;
      overdueGraceDays: unknown;
      enabled: unknown;
      reason?: unknown;
    },
  ) {
    if (!ruleExists(input.ruleId)) {
      throw new ClinicalMonitoringPolicyError("Unknown monitoring rule.", 404);
    }
    const organizationId = organizationFor(actor, input.patientId);
    assertScopeEditor(actor, organizationId, input.scope, input.patientId);

    const intervalDays = integer(input.intervalDays, "Monitoring interval", 1, 3650);
    const dueSoonDays = integer(input.dueSoonDays, "Due-soon window", 0, 3650);
    const overdueGraceDays = integer(input.overdueGraceDays, "Overdue grace period", 0, 3650);
    if (dueSoonDays > intervalDays) {
      throw new ClinicalMonitoringPolicyError(
        "Due-soon window cannot be longer than the monitoring interval.",
        400,
      );
    }
    if (typeof input.enabled !== "boolean") {
      throw new ClinicalMonitoringPolicyError("Enabled must be true or false.", 400);
    }

    const reason = optionalReason(input.reason, input.scope === "patient");
    const targetScopeId = scopeId(input.scope, organizationId, actor, input.patientId);

    const saved = ClinicalMonitoringPolicyRepository.upsert({
      organizationId,
      scopeType: input.scope,
      scopeId: targetScopeId,
      ruleId: input.ruleId,
      intervalDays,
      dueSoonDays,
      overdueGraceDays,
      enabled: input.enabled,
      reason,
      actorId: actor.userId,
    });

    AuditRepository.log({
      eventType: "clinical_monitoring_policy_updated",
      userId: actor.userId,
      userName: providerLabel(actor),
      userRole: actor.role,
      patientId: input.scope === "patient" ? input.patientId : undefined,
      description: `Updated ${input.scope} clinical monitoring policy ${input.ruleId}.`,
      metadata: {
        organizationId,
        scope: input.scope,
        ruleId: input.ruleId,
        intervalDays,
        dueSoonDays,
        overdueGraceDays,
        enabled: input.enabled,
        reason,
      },
    });

    return { saved, state: this.read(actor, input.patientId) };
  },

  reset(
    actor: ProviderContext,
    input: {
      scope: MonitoringPolicyScope;
      patientId?: string;
      ruleId: string;
    },
  ) {
    if (!ruleExists(input.ruleId)) {
      throw new ClinicalMonitoringPolicyError("Unknown monitoring rule.", 404);
    }
    const organizationId = organizationFor(actor, input.patientId);
    assertScopeEditor(actor, organizationId, input.scope, input.patientId);
    const targetScopeId = scopeId(input.scope, organizationId, actor, input.patientId);

    ClinicalMonitoringPolicyRepository.remove(
      organizationId,
      input.scope,
      targetScopeId,
      input.ruleId,
    );

    AuditRepository.log({
      eventType: "clinical_monitoring_policy_reset",
      userId: actor.userId,
      userName: providerLabel(actor),
      userRole: actor.role,
      patientId: input.scope === "patient" ? input.patientId : undefined,
      description: `Reset ${input.scope} clinical monitoring policy ${input.ruleId} to its inherited value.`,
      metadata: { organizationId, scope: input.scope, ruleId: input.ruleId },
    });

    return this.read(actor, input.patientId);
  },
};
