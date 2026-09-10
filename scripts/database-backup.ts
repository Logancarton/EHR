/**
 * Operator tooling for backing up, verifying, and restoring the clinical database.
 *
 *   npx tsx scripts/database-backup.ts backup  <destination.db>
 *   npx tsx scripts/database-backup.ts verify  <backup.db>
 *   npx tsx scripts/database-backup.ts restore <backup.db>
 *
 * Restore replaces every clinical record in the system, so it lives here rather
 * than behind any HTTP route: it is an operator action taken with the service
 * stopped, not something reachable from a logged-in session. The current database
 * is moved aside rather than deleted, so a restore of the wrong backup is itself
 * recoverable.
 */
import { backupDatabaseTo, restoreDatabaseFrom, verifyBackup } from "../app/server/db/backup";
import { DATABASE_PATH_VAR, resolveDatabaseLocation } from "../app/server/db/database-location";

function usage(): never {
  console.error("Usage: database-backup.ts <backup|verify|restore> <path>");
  process.exit(2);
}

async function main() {
  const [command, target] = process.argv.slice(2);
  if (!command || !target) usage();

  const location = resolveDatabaseLocation({
    configuredPath: process.env[DATABASE_PATH_VAR],
    nodeEnv: process.env.NODE_ENV,
    cwd: process.cwd(),
  });

  if (command === "backup") {
    const result = await backupDatabaseTo(target);
    const verification = verifyBackup(result.file);
    // Verifying immediately keeps a backup from being a hypothesis until the day
    // somebody needs it.
    if (!verification.ok) {
      console.error(`Backup wrote ${result.file} but it failed verification: ${verification.integrityCheck}`);
      process.exit(1);
    }
    console.log(
      `Backed up ${location.file} -> ${result.file} ` +
      `(${result.pages} pages, ${result.bytes} bytes, ${verification.patients} patients). Verified ok.`,
    );
    return;
  }

  if (command === "verify") {
    const verification = verifyBackup(target);
    console.log(
      `${verification.file}: integrity=${verification.integrityCheck}, ` +
      `tables=${verification.tables}, patients=${verification.patients}`,
    );
    process.exit(verification.ok ? 0 : 1);
  }

  if (command === "restore") {
    const result = restoreDatabaseFrom(target, location.file);
    console.log(
      `Restored ${result.restoredFrom} -> ${result.target}` +
      (result.displacedTo ? `; previous database kept at ${result.displacedTo}` : ""),
    );
    console.log("Start the service only after confirming this is the intended backup.");
    return;
  }

  usage();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
