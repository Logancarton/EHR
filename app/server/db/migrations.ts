import type { DatabaseSync } from "node:sqlite";

export type DatabaseMigration = {
  id: string;
  description: string;
  apply(db: DatabaseSync): void;
};

function ensureMigrationLedger(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

export const APPLICATION_MIGRATIONS: readonly DatabaseMigration[] = [
  {
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
  },
  {
    id: "2026-09-08-002-prescription-outcome-uncertain",
    description: "Index unresolved prescription transport outcomes for operational recovery",
    apply(db) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_prescription_transactions_uncertain
          ON prescription_transactions(state, updated_at DESC);
      `);
    },
  },
];

function validateMigrationOrder(migrations: readonly DatabaseMigration[]): void {
  const ids = migrations.map((migration) => migration.id);
  if (new Set(ids).size !== ids.length) throw new Error("Database migration identities must be unique.");
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  if (ids.some((id, index) => id !== sorted[index])) {
    throw new Error("Database migrations must be declared in deterministic identity order.");
  }
}

export function applyMigrations(
  db: DatabaseSync,
  migrations: readonly DatabaseMigration[] = APPLICATION_MIGRATIONS,
): void {
  ensureMigrationLedger(db);
  validateMigrationOrder(migrations);

  for (const migration of migrations) {
    const alreadyApplied = db.prepare(`SELECT id FROM schema_migrations WHERE id = ?`).get(migration.id);
    if (alreadyApplied) continue;

    db.exec("BEGIN IMMEDIATE");
    try {
      migration.apply(db);
      db.prepare(`INSERT INTO schema_migrations (id, description, applied_at) VALUES (?, ?, ?)`)
        .run(migration.id, migration.description, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Database migration ${migration.id} failed: ${message}`);
    }
  }
}
