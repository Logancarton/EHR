import type { DatabaseSync } from "node:sqlite";
import type { DatabaseMigration } from "./types";
import { APPLICATION_MIGRATIONS } from "./registry";

function ensureMigrationLedger(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

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
