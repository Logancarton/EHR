import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { CREATE_TABLES_SQL } from "../app/server/db/schema";
import { seedDatabaseIfEmpty } from "../app/server/db/seed";
import { seedTeamCollaboration } from "../app/server/db/team-seed";
import { ensureAuthFoundation } from "../app/server/db/auth-foundation";
import { ensureClinicalRecordFoundation } from "../app/server/db/clinical-record-foundation";
import { ensureMedicationReconciliationFoundation } from "../app/server/db/medication-reconciliation-foundation";
import { ensurePrescriptionTransactionFoundation } from "../app/server/db/prescription-transaction-foundation";
import { ensurePrescriptionRefillFoundation } from "../app/server/db/prescription-refill-foundation";
import { ensurePrescriptionChangeRequestFoundation } from "../app/server/db/prescription-change-request-foundation";
import { ensurePrescriptionCallbackFoundation } from "../app/server/db/prescription-callback-foundation";
import { ensureDocumentWorkflowFoundation } from "../app/server/db/document-workflow-foundation";
import { ensureChartCommunicationFoundation } from "../app/server/db/chart-communication-foundation";
import { ensureChartIntegrity } from "../app/server/db/chart-integrity";
import { ensureOrganizationAccessSeed } from "../app/server/db/organization-seed";
import {
  APPLICATION_MIGRATIONS,
  applyMigrations,
  type DatabaseMigration,
} from "../app/server/db/migrations";

const EXPECTED_MIGRATION_IDS = [
  "2026-09-08-001-integration-configurations",
  "2026-09-08-002-prescription-outcome-uncertain",
  "2026-09-09-001-organization-patient-access",
  "2026-09-10-001-auth-activation-tokens",
  "2026-09-10-002-auth-login-throttle",
  "2026-09-10-003-encounter-note-sections",
  "2026-09-10-004-workspace-templates",
  "2026-09-11-001-patient-administrative-foundation",
  "2026-09-13-001-encounter-note-references",
  "2026-09-13-002-retire-prototype-note-tokens",
  "2026-09-13-003-encounter-scoped-orders",
  "2026-09-13-004-encounter-section-extractions",
  "2026-09-13-005-patient-photo-and-id",
  "2026-09-14-001-encounter-appointment-link",
  "2026-09-14-002-appointment-roster-fields",
  "2026-09-14-003-preference-revisions",
  "2026-09-14-004-appointment-version-and-handoffs",
  "2026-09-14-005-appointment-lifecycle-and-followup",
  "2026-09-15-001-billing-charge-records",
  "2026-09-15-002-signed-encounter-date-projection",
  "2026-09-15-003-medication-indication",
  "2026-09-15-004-care-completion-worklist",
  "2026-09-17-001-intake-foundation",
  "2026-09-17-002-intake-prospective-identity",
  "2026-09-18-001-document-insurance-prospective-identity",
  "2026-09-19-001-intake-episode-standalone",
  "2026-09-21-001-hr-records-and-designation",
  "2026-09-21-002-hr-item-source",
] as const;

function bootstrapLikeApplication(db: DatabaseSync): void {
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(CREATE_TABLES_SQL);
  seedDatabaseIfEmpty(db);
  seedTeamCollaboration(db);
  ensureAuthFoundation(db);
  ensureClinicalRecordFoundation(db);
  ensureMedicationReconciliationFoundation(db);
  ensurePrescriptionTransactionFoundation(db);
  ensurePrescriptionRefillFoundation(db);
  ensurePrescriptionChangeRequestFoundation(db);
  ensurePrescriptionCallbackFoundation(db);
  ensureDocumentWorkflowFoundation(db);
  ensureChartCommunicationFoundation(db);
  ensureChartIntegrity(db);
  applyMigrations(db);
  ensureOrganizationAccessSeed(db);
}

test("migration registry preserves the exact historical identity order", () => {
  assert.deepEqual(
    APPLICATION_MIGRATIONS.map((migration) => migration.id),
    EXPECTED_MIGRATION_IDS,
  );
});

test("already-applied migration IDs are never invoked again", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE schema_migrations (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  db.prepare(`
    INSERT INTO schema_migrations (id, description, applied_at)
    VALUES (?, ?, ?)
  `).run("skip-001", "already applied", "2026-09-18T00:00:00.000Z");

  const migration: DatabaseMigration = {
    id: "skip-001",
    description: "body must not run",
    apply() {
      throw new Error("historical migration re-executed");
    },
  };

  assert.doesNotThrow(() => applyMigrations(db, [migration]));
  db.close();
});

test("partial upgrades execute only the remaining ordered suffix", () => {
  const db = new DatabaseSync(":memory:");
  const calls: string[] = [];
  const migrations: readonly DatabaseMigration[] = ["test-001", "test-002", "test-003"].map((id) => ({
    id,
    description: id,
    apply() {
      calls.push(id);
    },
  }));

  applyMigrations(db, migrations.slice(0, 2));
  assert.deepEqual(calls, ["test-001", "test-002"]);
  calls.length = 0;

  applyMigrations(db, migrations);
  assert.deepEqual(calls, ["test-003"]);
  const ledger = db.prepare(`
    SELECT id FROM schema_migrations ORDER BY id
  `).all() as Array<{ id: string }>;
  assert.deepEqual(ledger.map((row) => row.id), ["test-001", "test-002", "test-003"]);
  db.close();
});

test("migration failure is atomic and the same ID can be retried after correction", () => {
  const db = new DatabaseSync(":memory:");
  const failing: DatabaseMigration = {
    id: "retry-001",
    description: "failure fixture",
    apply(target) {
      target.exec("CREATE TABLE retry_fixture (id TEXT PRIMARY KEY);");
      throw new Error("synthetic failure");
    },
  };

  assert.throws(() => applyMigrations(db, [failing]), /Database migration retry-001 failed/);
  assert.equal(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='retry_fixture'").get(),
    undefined,
  );
  assert.equal(
    db.prepare("SELECT id FROM schema_migrations WHERE id='retry-001'").get(),
    undefined,
  );

  const corrected: DatabaseMigration = {
    ...failing,
    description: "corrected fixture",
    apply(target) {
      target.exec("CREATE TABLE retry_fixture (id TEXT PRIMARY KEY);");
    },
  };
  assert.doesNotThrow(() => applyMigrations(db, [corrected]));
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='retry_fixture'").get());
  assert.ok(db.prepare("SELECT id FROM schema_migrations WHERE id='retry-001'").get());
  db.close();
});

test("duplicate and out-of-order migration definitions fail before execution", () => {
  const db = new DatabaseSync(":memory:");
  let executions = 0;
  const migration = (id: string): DatabaseMigration => ({
    id,
    description: id,
    apply() {
      executions += 1;
    },
  });

  assert.throws(
    () => applyMigrations(db, [migration("dup-001"), migration("dup-001")]),
    /identities must be unique/,
  );
  assert.equal(executions, 0);

  assert.throws(
    () => applyMigrations(db, [migration("order-002"), migration("order-001")]),
    /deterministic identity order/,
  );
  assert.equal(executions, 0);
  db.close();
});

test("fresh and already-migrated application databases preserve ledger and data", () => {
  const db = new DatabaseSync(":memory:");
  bootstrapLikeApplication(db);

  const firstLedger = db.prepare(`
    SELECT id, applied_at FROM schema_migrations ORDER BY id
  `).all() as Array<{ id: string; applied_at: string }>;
  assert.deepEqual(firstLedger.map((row) => row.id), EXPECTED_MIGRATION_IDS);

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO integration_configurations (
      id, adapter_id, purpose, environment, enabled, scope_type, scope_id,
      non_secret_config_json, secret_refs_json, version,
      created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0, 'practice', NULL, '{}', '{}', 1, ?, ?, ?, ?)
  `).run("migration-regression-sentinel", "sentinel-adapter", "test", "test", "fixture", "fixture", now, now);

  bootstrapLikeApplication(db);

  const secondLedger = db.prepare(`
    SELECT id, applied_at FROM schema_migrations ORDER BY id
  `).all() as Array<{ id: string; applied_at: string }>;
  assert.deepEqual(secondLedger, firstLedger, "historical ledger timestamps must remain unchanged");
  assert.equal(
    (db.prepare("SELECT adapter_id FROM integration_configurations WHERE id = ?")
      .get("migration-regression-sentinel") as { adapter_id: string }).adapter_id,
    "sentinel-adapter",
  );

  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  const integrity = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
  assert.equal(integrity.integrity_check, "ok");
  db.close();
});
