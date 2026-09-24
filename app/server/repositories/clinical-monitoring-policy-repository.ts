import { getDatabase } from "../db/connection";
import type { MonitoringPolicyOverride } from "../../lib/clinical-protocols";

export type MonitoringPolicyScope = "practice" | "provider" | "patient";

export type StoredMonitoringPolicyOverride = MonitoringPolicyOverride & {
  organizationId: string;
  scopeType: MonitoringPolicyScope;
  scopeId: string;
};

function mapRow(row: any): StoredMonitoringPolicyOverride {
  return {
    organizationId: row.organization_id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    ruleId: row.rule_id,
    intervalDays: row.interval_days == null ? undefined : Number(row.interval_days),
    dueSoonDays: row.due_soon_days == null ? undefined : Number(row.due_soon_days),
    overdueGraceDays: row.overdue_grace_days == null ? undefined : Number(row.overdue_grace_days),
    enabled: row.enabled == null ? undefined : Boolean(row.enabled),
    reason: row.reason || null,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export const ClinicalMonitoringPolicyRepository = {
  list(
    organizationId: string,
    scopeType: MonitoringPolicyScope,
    scopeId: string,
  ): StoredMonitoringPolicyOverride[] {
    const rows = getDatabase()
      .prepare(
        `SELECT * FROM clinical_monitoring_policy_overrides
         WHERE organization_id = ? AND scope_type = ? AND scope_id = ?
         ORDER BY rule_id`,
      )
      .all(organizationId, scopeType, scopeId) as any[];
    return rows.map(mapRow);
  },

  upsert(input: {
    organizationId: string;
    scopeType: MonitoringPolicyScope;
    scopeId: string;
    ruleId: string;
    intervalDays?: number;
    dueSoonDays?: number;
    overdueGraceDays?: number;
    enabled?: boolean;
    reason?: string | null;
    actorId: string;
  }): StoredMonitoringPolicyOverride {
    const now = new Date().toISOString();
    const id = `monitor-${input.organizationId}-${input.scopeType}-${input.scopeId}-${input.ruleId}`;

    getDatabase()
      .prepare(
        `INSERT INTO clinical_monitoring_policy_overrides (
          id, organization_id, scope_type, scope_id, rule_id,
          interval_days, due_soon_days, overdue_grace_days, enabled,
          reason, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (organization_id, scope_type, scope_id, rule_id) DO UPDATE SET
          interval_days = excluded.interval_days,
          due_soon_days = excluded.due_soon_days,
          overdue_grace_days = excluded.overdue_grace_days,
          enabled = excluded.enabled,
          reason = excluded.reason,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at`,
      )
      .run(
        id,
        input.organizationId,
        input.scopeType,
        input.scopeId,
        input.ruleId,
        input.intervalDays ?? null,
        input.dueSoonDays ?? null,
        input.overdueGraceDays ?? null,
        input.enabled === undefined ? null : input.enabled ? 1 : 0,
        input.reason?.trim() || null,
        input.actorId,
        now,
        now,
      );

    const row = getDatabase()
      .prepare(
        `SELECT * FROM clinical_monitoring_policy_overrides
         WHERE organization_id = ? AND scope_type = ? AND scope_id = ? AND rule_id = ?`,
      )
      .get(input.organizationId, input.scopeType, input.scopeId, input.ruleId) as any;
    if (!row) throw new Error("Clinical monitoring policy override could not be saved.");
    return mapRow(row);
  },

  remove(
    organizationId: string,
    scopeType: MonitoringPolicyScope,
    scopeId: string,
    ruleId: string,
  ): boolean {
    const result = getDatabase()
      .prepare(
        `DELETE FROM clinical_monitoring_policy_overrides
         WHERE organization_id = ? AND scope_type = ? AND scope_id = ? AND rule_id = ?`,
      )
      .run(organizationId, scopeType, scopeId, ruleId);
    return Number(result.changes) > 0;
  },
};
