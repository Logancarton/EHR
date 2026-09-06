import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { CREATE_TABLES_SQL } from "./schema";
import { seedDatabaseIfEmpty } from "./seed";
import { seedTeamCollaboration } from "./team-seed";
import { ensureChartIntegrity } from "./chart-integrity";

let dbInstance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (dbInstance) return dbInstance;

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, "ehr.db");
  const db = new DatabaseSync(dbPath);

  // Enable WAL mode for high performance concurrent reading
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  // Create base tables and indexes.
  db.exec(CREATE_TABLES_SQL);

  // Pre-seed with synthetic psychiatric patient charts if empty.
  seedDatabaseIfEmpty(db);

  // Collaboration fixtures are independent so existing local databases gain the
  // team workspace without wiping or rebuilding clinical records.
  seedTeamCollaboration(db);

  // Forward-compatible chart migration + signed-record integrity guardrails.
  // This intentionally runs after legacy seed data exists so historical signed
  // encounters can receive one-time integrity snapshots.
  ensureChartIntegrity(db);

  dbInstance = db;
  return db;
}
