import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { CREATE_TABLES_SQL } from "./schema";
import { seedDatabaseIfEmpty } from "./seed";
import { seedTeamCollaboration } from "./team-seed";
import { ensureChartIntegrity } from "./chart-integrity";
import { ensureClinicalRecordFoundation } from "./clinical-record-foundation";
import { ensureChartCommunicationFoundation } from "./chart-communication-foundation";
import { ensureDocumentWorkflowFoundation } from "./document-workflow-foundation";

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

  // Additive/idempotent migrations. Real clinical reads now flow from normalized
  // records; legacy JSON and synthetic fixtures are only backfill sources.
  ensureClinicalRecordFoundation(db);
  ensureDocumentWorkflowFoundation(db);
  ensureChartCommunicationFoundation(db);
  ensureChartIntegrity(db);

  dbInstance = db;
  return db;
}
