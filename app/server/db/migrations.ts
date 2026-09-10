import type { DatabaseSync } from "node:sqlite";

/**
 * The synthetic development practice. Production provisioning creates real
 * organizations; this identity exists so local/seed data is owned rather than
 * floating outside every access boundary.
 */
export const DEFAULT_ORGANIZATION_ID = "org-northside-behavioral";
export const DEFAULT_ORGANIZATION_NAME = "Northside Behavioral Health";

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
  {
    id: "2026-09-09-001-organization-patient-access",
    description: "Add organizations, memberships, and patient organization ownership",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS organizations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS organization_memberships (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          patient_access_scope TEXT NOT NULL DEFAULT 'organization',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (organization_id, user_id),
          FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES team_members (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS patient_organizations (
          patient_id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
          FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_organization_memberships_user
          ON organization_memberships (user_id, status);
        CREATE INDEX IF NOT EXISTS idx_patient_organizations_org
          ON patient_organizations (organization_id);
      `);

      // One-time adoption of records that predate patient-access scoping. Patients
      // and users created after this migration are assigned explicitly at creation;
      // this backfill deliberately does not run again.
      const now = new Date().toISOString();
      db.prepare(`
        INSERT OR IGNORE INTO organizations (id, name, status, created_at, updated_at)
        VALUES (?, ?, 'active', ?, ?)
      `).run(DEFAULT_ORGANIZATION_ID, DEFAULT_ORGANIZATION_NAME, now, now);

      const adoptPatient = db.prepare(`
        INSERT OR IGNORE INTO patient_organizations (patient_id, organization_id, created_at)
        VALUES (?, ?, ?)
      `);
      for (const row of db.prepare("SELECT id FROM patients").all() as Array<{ id: string }>) {
        adoptPatient.run(row.id, DEFAULT_ORGANIZATION_ID, now);
      }

      const adoptMember = db.prepare(`
        INSERT OR IGNORE INTO organization_memberships (
          id, organization_id, user_id, status, patient_access_scope, created_at, updated_at
        ) VALUES (?, ?, ?, 'active', ?, ?, ?)
      `);
      for (const row of db.prepare("SELECT id FROM team_members").all() as Array<{ id: string }>) {
        adoptMember.run(
          `membership-${DEFAULT_ORGANIZATION_ID}-${row.id}`,
          DEFAULT_ORGANIZATION_ID,
          row.id,
          "organization",
          now,
          now,
        );
      }
    },
  },
  {
    id: "2026-09-10-001-auth-activation-tokens",
    description: "Single-use activation tokens so a provisioned user sets their own password",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS auth_activation_tokens (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          issued_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          redeemed_at TEXT,
          FOREIGN KEY (user_id) REFERENCES team_members (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_auth_activation_tokens_user
          ON auth_activation_tokens (user_id, redeemed_at);
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
