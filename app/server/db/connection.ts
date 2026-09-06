import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { CREATE_TABLES_SQL } from "./schema";
import { seedDatabaseIfEmpty } from "./seed";

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

  // Create tables and indexes
  db.exec(CREATE_TABLES_SQL);

  // Pre-seed with synthetic psychiatric patient charts if empty
  seedDatabaseIfEmpty(db);

  dbInstance = db;
  return db;
}
