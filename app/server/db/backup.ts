import { DatabaseSync, backup } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { getDatabase } from "./connection";

/**
 * Backing up and restoring the clinical database.
 *
 * Uses SQLite's online backup rather than copying the file. The database runs in
 * WAL mode, so a plain file copy can capture a main file whose recent commits are
 * still in the write-ahead log — a backup that restores to a silently older state
 * is worse than no backup, because nobody discovers it until they need it.
 *
 * Restoring is deliberately not exposed through any HTTP route. It replaces every
 * clinical record in the system, which is an operator action taken with the service
 * stopped, not something reachable from a logged-in session.
 */

export type BackupResult = {
  file: string;
  pages: number;
  bytes: number;
  completedAt: string;
};

export async function backupDatabaseTo(destinationPath: string): Promise<BackupResult> {
  const destination = path.resolve(destinationPath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(destination)) {
    // Overwriting an existing backup in place would leave neither the old nor the
    // new one intact if the copy failed partway.
    throw new Error(`Backup destination already exists: ${destination}`);
  }

  const pages = await backup(getDatabase(), destination);
  return {
    file: destination,
    pages,
    bytes: fs.statSync(destination).size,
    completedAt: new Date().toISOString(),
  };
}

export type BackupVerification = {
  file: string;
  ok: boolean;
  integrityCheck: string;
  tables: number;
  patients: number;
};

/**
 * Opens a backup and confirms it is a usable clinical database rather than a
 * well-formed but empty file. A backup nobody has restored is a hypothesis; this is
 * the cheapest way to keep it from being one.
 */
export function verifyBackup(backupPath: string): BackupVerification {
  const file = path.resolve(backupPath);
  if (!fs.existsSync(file)) throw new Error(`Backup not found: ${file}`);

  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = db.prepare("PRAGMA integrity_check").get() as Record<string, string>;
    const integrityCheck = String(Object.values(integrity)[0] ?? "unknown");

    const tables = db
      .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'")
      .get() as { count: number };
    const patients = db.prepare("SELECT COUNT(*) AS count FROM patients").get() as { count: number };

    return {
      file,
      ok: integrityCheck === "ok" && Number(tables.count) > 0,
      integrityCheck,
      tables: Number(tables.count),
      patients: Number(patients.count),
    };
  } finally {
    db.close();
  }
}

/**
 * Replaces the live database file with a verified backup.
 *
 * The service must not be running: this swaps the file underneath any open
 * connection. It refuses a backup that does not verify, and moves the current
 * database aside rather than deleting it, so a restore that turns out to be the
 * wrong one is itself recoverable.
 */
export function restoreDatabaseFrom(
  backupPath: string,
  targetPath: string,
): { restoredFrom: string; target: string; displacedTo: string | null } {
  const verification = verifyBackup(backupPath);
  if (!verification.ok) {
    throw new Error(`Refusing to restore: ${verification.file} failed integrity check (${verification.integrityCheck}).`);
  }

  const target = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  let displacedTo: string | null = null;
  if (fs.existsSync(target)) {
    displacedTo = `${target}.displaced-${Date.now()}`;
    fs.renameSync(target, displacedTo);
  }

  // WAL and shared-memory sidecars belong to the database being replaced. Leaving
  // them next to a restored file would let SQLite replay the old log over it.
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${target}${suffix}`;
    if (fs.existsSync(sidecar)) fs.rmSync(sidecar);
  }

  fs.copyFileSync(verification.file, target);
  return { restoredFrom: verification.file, target, displacedTo };
}
