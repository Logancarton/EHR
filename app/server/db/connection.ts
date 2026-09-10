import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { CREATE_TABLES_SQL } from "./schema";
import { seedDatabaseIfEmpty } from "./seed";
import { seedTeamCollaboration } from "./team-seed";
import { ensureChartIntegrity } from "./chart-integrity";
import { ensureClinicalRecordFoundation } from "./clinical-record-foundation";
import { ensureMedicationReconciliationFoundation } from "./medication-reconciliation-foundation";
import { ensureChartCommunicationFoundation } from "./chart-communication-foundation";
import { ensureDocumentWorkflowFoundation } from "./document-workflow-foundation";
import { ensureAuthFoundation } from "./auth-foundation";
import { ensurePrescriptionTransactionFoundation } from "./prescription-transaction-foundation";
import { ensurePrescriptionRefillFoundation } from "./prescription-refill-foundation";
import { ensurePrescriptionChangeRequestFoundation } from "./prescription-change-request-foundation";
import { ensurePrescriptionCallbackFoundation } from "./prescription-callback-foundation";
import { applyMigrations } from "./migrations";
import { DATABASE_PATH_VAR, resolveDatabaseLocation } from "./database-location";
import { ensureOrganizationAccessSeed } from "./organization-seed";

let dbInstance: DatabaseSync | null = null;
let databaseFile: string | null = null;

/** The resolved path of the open database, for backup and operational tooling. */
export function getDatabaseFile(): string {
  if (!databaseFile) getDatabase();
  return databaseFile!;
}

export function getDatabase(): DatabaseSync {
  if (dbInstance) return dbInstance;

  // Production must state where the clinical database lives; development keeps the
  // familiar `data/ehr.db` default. See `database-location.ts`.
  const location = resolveDatabaseLocation({
    configuredPath: process.env[DATABASE_PATH_VAR],
    nodeEnv: process.env.NODE_ENV,
    cwd: process.cwd(),
  });
  if (!fs.existsSync(location.directory)) {
    fs.mkdirSync(location.directory, { recursive: true });
  }

  const db = new DatabaseSync(location.file);
  databaseFile = location.file;

  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(CREATE_TABLES_SQL);
  seedDatabaseIfEmpty(db);
  seedTeamCollaboration(db);

  // Legacy additive/idempotent foundations remain in place for compatibility
  // while new infrastructure begins using the explicit migration ledger.
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

  // Versioned migrations are deterministic and transactional. Phase 4K starts
  // the migration discipline here without attempting a whole-database rewrite.
  applyMigrations(db);

  // Patient-access records for the synthetic practice are kept coherent after the
  // one-time backfill so a later-seeded clinician is never left without reach.
  ensureOrganizationAccessSeed(db);

  dbInstance = db;
  return db;
}
