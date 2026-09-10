import { DatabaseSync } from "node:sqlite";
import path from "node:path";
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
import { ensureOrganizationAccessSeed } from "./organization-seed";

let dbInstance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (dbInstance) return dbInstance;

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, "ehr.db");
  const db = new DatabaseSync(dbPath);

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
