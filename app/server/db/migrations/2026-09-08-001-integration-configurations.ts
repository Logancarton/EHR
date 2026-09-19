import type { DatabaseMigration } from "./types";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-08-001-integration-configurations",
    description: "Add vendor-neutral integration configuration records",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS integration_configurations (
          id TEXT PRIMARY KEY,
          adapter_id TEXT NOT NULL,
          purpose TEXT NOT NULL,
          environment TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 0,
          scope_type TEXT NOT NULL DEFAULT 'practice',
          scope_id TEXT,
          non_secret_config_json TEXT NOT NULL DEFAULT '{}',
          secret_refs_json TEXT NOT NULL DEFAULT '{}',
          version INTEGER NOT NULL DEFAULT 1,
          created_by TEXT NOT NULL,
          updated_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_integration_configurations_adapter
          ON integration_configurations(adapter_id, purpose, enabled);
        CREATE INDEX IF NOT EXISTS idx_integration_configurations_scope
          ON integration_configurations(scope_type, scope_id, purpose);
      `);
    },
  };
