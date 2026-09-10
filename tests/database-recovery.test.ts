import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  DATABASE_PATH_VAR,
  DatabaseLocationError,
  resolveDatabaseLocation,
} from "../app/server/db/database-location";

test("the database location is explicit in production and defaulted in development", () => {
  const cwd = "/srv/ehr";

  const development = resolveDatabaseLocation({ cwd, nodeEnv: "development" });
  assert.equal(development.explicit, false);
  assert.ok(development.file.endsWith(join("data", "ehr.db")));

  // Production must say where clinical records live. A path derived from the
  // working directory silently moves — or is created empty — when the service is
  // restarted from somewhere else.
  assert.throws(
    () => resolveDatabaseLocation({ cwd, nodeEnv: "production" }),
    (error: unknown) => error instanceof DatabaseLocationError && String(error.message).includes(DATABASE_PATH_VAR),
    "production refuses to guess the database path",
  );

  assert.throws(
    () => resolveDatabaseLocation({ cwd, nodeEnv: "production", configuredPath: "data/ehr.db" }),
    (error: unknown) => error instanceof DatabaseLocationError,
    "a relative production path is the same accident as no path at all",
  );

  const productionPath = isAbsolute("/var/lib/ehr/clinical.db")
    ? "/var/lib/ehr/clinical.db"
    : resolve("/var/lib/ehr/clinical.db");
  const configured = resolveDatabaseLocation({
    cwd,
    nodeEnv: "production",
    configuredPath: productionPath,
  });
  assert.equal(configured.explicit, true);
  assert.equal(configured.file, resolve(productionPath));
  assert.equal(configured.directory, dirname(resolve(productionPath)));

  // Development may still point somewhere specific, relatively if it likes.
  const relative = resolveDatabaseLocation({ cwd, nodeEnv: "test", configuredPath: "tmp/x.db" });
  assert.equal(relative.file, resolve(cwd, "tmp/x.db"));
});

test("a backup captures committed clinical data and restoring it brings that data back", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-recovery-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-recovery-session-secret-0123456789";

  try {
    const [
      { backupDatabaseTo, verifyBackup, restoreDatabaseFrom },
      { getDatabase, getDatabaseFile },
      { PatientRepository },
      { ClinicalRecordRepository },
    ] = await Promise.all([
      import("../app/server/db/backup"),
      import("../app/server/db/connection"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/clinical-record-repository"),
    ]);

    // Write a clinical fact, so the backup is proven to carry records rather than
    // just a well-formed schema.
    PatientRepository.create({
      id: "recovery-patient", name: "Recovery Patient", initials: "RP", dob: "01/01/1990", age: 36,
      pronouns: "they/them", mrn: "REC-001", status: "Established",
      allergies: [], diagnoses: [], meds: [], vitals: {}, lastVisit: "Initial", nextVisit: "Unscheduled",
    });
    ClinicalRecordRepository.addProblem(
      { patientId: "recovery-patient", displayText: "Generalized anxiety disorder" },
      { userId: "recovery-test", displayName: "Recovery Test" },
      { system: "ehr-test", ref: "recovery" },
    );

    const backupFile = join(isolatedRoot, "backups", "clinical.db");
    const result = await backupDatabaseTo(backupFile);
    assert.ok(result.pages > 0);
    assert.ok(result.bytes > 0);

    // The database runs in WAL mode, so this is the assertion that matters: a plain
    // file copy could capture a main file whose recent commits are still in the log.
    const verification = verifyBackup(backupFile);
    assert.equal(verification.ok, true, `backup should verify: ${verification.integrityCheck}`);
    assert.ok(
      verification.patients > 0,
      "the backup carries committed records, not just an empty schema",
    );

    const refuseOverwrite = await backupDatabaseTo(backupFile).then(() => null, (error) => error);
    assert.ok(
      refuseOverwrite instanceof Error && /already exists/.test(refuseOverwrite.message),
      "backing up over an existing file is refused rather than leaving neither intact",
    );

    // ---- Lose the data ------------------------------------------------------
    const db = getDatabase();
    db.prepare("DELETE FROM patient_problems WHERE patient_id = ?").run("recovery-patient");
    db.prepare("DELETE FROM patients WHERE id = ?").run("recovery-patient");
    assert.equal(PatientRepository.getById("recovery-patient"), null, "the record is gone");

    // ---- Restore ------------------------------------------------------------
    const databaseFile = getDatabaseFile();
    db.close();

    const restored = restoreDatabaseFrom(backupFile, databaseFile);
    assert.equal(restored.target, databaseFile);
    assert.ok(
      restored.displacedTo && existsSync(restored.displacedTo),
      "the replaced database is moved aside, so restoring the wrong backup is recoverable",
    );
    assert.ok(
      !existsSync(`${databaseFile}-wal`),
      "the old write-ahead log is removed, so it cannot replay over the restored file",
    );

    // Read the restored file directly: the module-level connection in this process
    // was deliberately closed, and a restore is an operator action taken with the
    // service stopped.
    const { DatabaseSync } = await import("node:sqlite");
    const reopened = new DatabaseSync(databaseFile, { readOnly: true });
    try {
      const patient = reopened
        .prepare("SELECT name FROM patients WHERE id = ?")
        .get("recovery-patient") as { name?: string } | undefined;
      assert.equal(patient?.name, "Recovery Patient", "the patient record is back");

      const problem = reopened
        .prepare("SELECT display_text FROM patient_problems WHERE patient_id = ?")
        .get("recovery-patient") as { display_text?: string } | undefined;
      assert.equal(
        problem?.display_text,
        "Generalized anxiety disorder",
        "the clinical fact is back, not just the patient row",
      );
    } finally {
      reopened.close();
    }
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV; else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET; else env.EHR_SESSION_SECRET = originalSecret;
  }
});

test("a corrupt backup is refused rather than restored over live records", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-recovery-refuse-"));
  process.chdir(isolatedRoot);

  try {
    const { restoreDatabaseFrom, verifyBackup } = await import("../app/server/db/backup");

    const notADatabase = join(isolatedRoot, "corrupt.db");
    writeFileSync(notADatabase, "this is not a SQLite file");

    assert.throws(
      () => verifyBackup(notADatabase),
      "verifying a corrupt file fails rather than reporting ok",
    );
    assert.throws(
      () => restoreDatabaseFrom(notADatabase, join(isolatedRoot, "live.db")),
      "a backup that does not verify is never copied over the live database",
    );
    assert.equal(
      existsSync(join(isolatedRoot, "live.db")),
      false,
      "the refused restore wrote nothing",
    );

    assert.throws(
      () => verifyBackup(join(isolatedRoot, "missing.db")),
      /not found/,
      "a missing backup is reported plainly",
    );
  } finally {
    process.chdir(originalCwd);
  }
});
