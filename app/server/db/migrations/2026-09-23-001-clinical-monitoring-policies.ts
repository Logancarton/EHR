import type { DatabaseMigration } from "./types";

/**
 * Layered medication-monitoring interval overrides.
 *
 * Definitions stay in code so rule identity/rationale is reviewable. The database
 * stores only local policy choices: practice -> provider -> patient.
 */
export const migration: DatabaseMigration = {
  id: "2026-09-23-001-clinical-monitoring-policies",
  description: "Persist practice, provider, and patient clinical monitoring policy overrides",
  apply(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS clinical_monitoring_policy_overrides (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        scope_type TEXT NOT NULL CHECK (scope_type IN ('practice','provider','patient')),
        scope_id TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        interval_days INTEGER,
        due_soon_days INTEGER,
        overdue_grace_days INTEGER,
        enabled INTEGER,
        reason TEXT,
        updated_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (organization_id, scope_type, scope_id, rule_id)
      );

      CREATE INDEX IF NOT EXISTS idx_monitoring_policy_scope
        ON clinical_monitoring_policy_overrides (organization_id, scope_type, scope_id);
    `);
  },
};
