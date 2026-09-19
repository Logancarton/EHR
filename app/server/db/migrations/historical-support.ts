import type { DatabaseSync } from "node:sqlite";

/**
 * Historical SQLite migration support. These functions are part of already-issued
 * migration semantics. Prefer duplication/versioning over changing behavior used
 * by an old migration.
 */
/**
 * Renames `table` to `${table}_legacy_20260918`, recreates it from
 * `createSql`, copies `copyColumns` across, and drops the legacy table.
 * Unlike `relaxPatientIdToOptional`, this has no idempotency guard of its
 * own — callers only invoke it once, from inside a guard that checks the
 * cluster as a whole (see `relaxDocumentsCluster`).
 */
/**
 * `ALTER TABLE ... RENAME TO` carries a table's named indexes along with it
 * under their original names — it does not free those names. A `CREATE INDEX
 * IF NOT EXISTS` of the same name for the newly-created replacement table
 * then silently no-ops (the name is still taken, by an index now sitting on
 * the legacy table), and dropping the legacy table afterward destroys that
 * index for good — the replacement table is left with no index of that name,
 * and nothing errors to say so. `dropIndexes` names every index the legacy
 * table might still be holding so this function drops them by name right
 * after the rename, freeing the names before `createSql` tries to reuse them.
 */
export function recreateTable(
  db: DatabaseSync,
  options: { table: string; createSql: string; copyColumns: readonly string[]; dropIndexes?: readonly string[] },
): void {
  const { table, createSql, copyColumns, dropIndexes = [] } = options;
  const legacyTable = `${table}_legacy_20260918`;
  db.exec(`ALTER TABLE ${table} RENAME TO ${legacyTable}`);
  for (const indexName of dropIndexes) db.exec(`DROP INDEX IF EXISTS ${indexName}`);
  db.exec(createSql);
  const columnList = copyColumns.join(", ");
  db.exec(`INSERT INTO ${table} (${columnList}) SELECT ${columnList} FROM ${legacyTable}`);
  db.exec(`DROP TABLE ${legacyTable}`);
}

/**
 * Relaxes `documents.patient_id` to optional (D-077), coordinated with every
 * table that holds a `FOREIGN KEY ... REFERENCES documents(id)`:
 * `document_versions`, `document_workflow_events`, and
 * `identity_document_reviews`.
 *
 * SQLite rewrites a referencing table's FOREIGN KEY clause to follow a
 * `RENAME TO` of the table it targets — `ALTER TABLE documents RENAME TO
 * documents_legacy_20260918` retargets all three of those tables' FK clauses
 * to `documents_legacy_20260918` in place, before this function ever touches
 * them. If the legacy table were dropped before they were repointed, the
 * DROP's implicit row-delete would either fail outright against
 * `document_versions`/`document_workflow_events`'s `ON DELETE RESTRICT`, or
 * — worse, on a database with real `identity_document_reviews` rows already
 * on it from before this migration — silently cascade-delete them. So every
 * dependent table is recreated (repointed at the real `documents` table,
 * which already exists again by then) before the legacy `documents` table is
 * finally dropped.
 */
export function relaxDocumentsCluster(db: DatabaseSync): void {
  const columns = db.prepare(`PRAGMA table_info(documents)`).all() as Array<{ name?: unknown; notnull?: unknown }>;
  const patientIdColumn = columns.find((c) => c.name === "patient_id");
  if (columns.length > 0 && (!patientIdColumn || patientIdColumn.notnull === 0)) return; // already relaxed

  const documentsCreateSql = `
    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      patient_id TEXT,
      prospective_person_id TEXT,
      document_type TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      current_version INTEGER NOT NULL DEFAULT 1,
      mime_type TEXT NOT NULL DEFAULT 'text/plain',
      storage_key TEXT,
      content_sha256 TEXT,
      source_system TEXT NOT NULL DEFAULT 'ehr-local',
      source_ref TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      workflow_status TEXT NOT NULL DEFAULT 'received',
      workflow_updated_at TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      filed_by TEXT,
      filed_at TEXT,
      superseded_by_document_id TEXT,
      FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
      FOREIGN KEY (prospective_person_id) REFERENCES prospective_persons (id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_documents_patient ON documents (patient_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_documents_prospect ON documents (prospective_person_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_document_workflow_status ON documents (workflow_status, updated_at DESC);
  `;
  const documentsColumns = [
    "id", "patient_id", "document_type", "title", "status", "current_version", "mime_type",
    "storage_key", "content_sha256", "source_system", "source_ref", "created_by", "created_at",
    "updated_at", "workflow_status", "workflow_updated_at", "reviewed_by", "reviewed_at",
    "filed_by", "filed_at", "superseded_by_document_id",
  ];

  if (columns.length === 0) {
    // documents does not exist yet (fresh-install edge case) — create the
    // relaxed shape directly; document_versions/document_workflow_events/
    // identity_document_reviews are created elsewhere already targeting it,
    // so there is no rename to coordinate.
    db.exec(documentsCreateSql);
    return;
  }

  db.exec(`ALTER TABLE documents RENAME TO documents_legacy_20260918`);
  db.exec(documentsCreateSql);
  db.exec(`INSERT INTO documents (${documentsColumns.join(", ")}) SELECT ${documentsColumns.join(", ")} FROM documents_legacy_20260918`);

  recreateTable(db, {
    table: "document_versions",
    createSql: `
      CREATE TABLE document_versions (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL, version_number INTEGER NOT NULL,
        storage_key TEXT, content_text TEXT, mime_type TEXT NOT NULL DEFAULT 'text/plain',
        content_sha256 TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(document_id, version_number), FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE RESTRICT
      );
    `,
    copyColumns: ["id", "document_id", "version_number", "storage_key", "content_text", "mime_type", "content_sha256", "created_by", "created_at"],
  });

  recreateTable(db, {
    table: "document_workflow_events",
    createSql: `
      CREATE TABLE document_workflow_events (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        patient_id TEXT,
        prospective_person_id TEXT,
        from_status TEXT NOT NULL,
        to_status TEXT NOT NULL,
        note TEXT,
        actor_id TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_document_workflow_events ON document_workflow_events (document_id, created_at DESC);
      CREATE TRIGGER IF NOT EXISTS trg_document_workflow_events_no_update
        BEFORE UPDATE ON document_workflow_events
        BEGIN
          SELECT RAISE(ABORT, 'Document workflow events are immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS trg_document_workflow_events_no_delete
        BEFORE DELETE ON document_workflow_events
        BEGIN
          SELECT RAISE(ABORT, 'Document workflow events are immutable');
        END;
    `,
    copyColumns: ["id", "document_id", "patient_id", "from_status", "to_status", "note", "actor_id", "actor_name", "created_at"],
  });

  recreateTable(db, {
    table: "identity_document_reviews",
    createSql: `
      CREATE TABLE identity_document_reviews (
        id TEXT PRIMARY KEY,
        patient_id TEXT,
        prospective_person_id TEXT,
        document_id TEXT NOT NULL,
        document_version INTEGER,
        reviewer_id TEXT NOT NULL,
        reviewer_name TEXT NOT NULL,
        result TEXT NOT NULL,
        legible INTEGER NOT NULL DEFAULT 1,
        conflict_note TEXT,
        confirmed_fields_json TEXT,
        reviewed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_identity_document_reviews_document ON identity_document_reviews (document_id, reviewed_at DESC);
    `,
    copyColumns: [
      "id", "patient_id", "prospective_person_id", "document_id", "document_version", "reviewer_id",
      "reviewer_name", "result", "legible", "conflict_note", "confirmed_fields_json", "reviewed_at", "created_at",
    ],
  });

  db.exec(`DROP TABLE documents_legacy_20260918`);
}

/**
 * Relaxes `intake_episodes.appointment_id` to optional, so an episode can
 * exist before any visit is scheduled (a prospect or patient starting
 * identity/coverage/document/consent work ahead of a first booked hold).
 * Coordinated with `intake_notes` for the same reason `relaxDocumentsCluster`
 * coordinates `document_versions`/`document_workflow_events`/
 * `identity_document_reviews`: `ALTER TABLE ... RENAME TO` retargets
 * `intake_notes`'s `FOREIGN KEY ... REFERENCES intake_episodes(id) ON DELETE
 * CASCADE` at the about-to-be-legacy table, and dropping that table would
 * otherwise implicitly delete its rows — cascading away real intake notes on
 * a database that already has them, not merely failing loudly.
 *
 * Adds two partial unique indexes so at most one appointment-less episode
 * exists per subject — `getOrCreateStandalone` relies on that to stay a
 * true get-or-create rather than a race that can double-insert.
 */
export function relaxIntakeEpisodeAppointment(db: DatabaseSync): void {
  const columns = db.prepare(`PRAGMA table_info(intake_episodes)`).all() as Array<{ name?: unknown; notnull?: unknown }>;
  const appointmentIdColumn = columns.find((c) => c.name === "appointment_id");
  if (columns.length > 0 && (!appointmentIdColumn || appointmentIdColumn.notnull === 0)) {
    // Already relaxed — the indexes are declared CREATE UNIQUE INDEX IF NOT
    // EXISTS below regardless, so a partially-applied prior run still finishes.
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_episodes_standalone_patient
        ON intake_episodes (patient_id) WHERE appointment_id IS NULL AND patient_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_episodes_standalone_prospect
        ON intake_episodes (prospective_person_id) WHERE appointment_id IS NULL AND prospective_person_id IS NOT NULL;
    `);
    return;
  }

  const episodesCreateSql = `
    CREATE TABLE intake_episodes (
      id TEXT PRIMARY KEY,
      patient_id TEXT,
      prospective_person_id TEXT,
      appointment_id TEXT,
      organization_id TEXT,
      assigned_staff_id TEXT,
      assigned_staff_name TEXT,
      follow_up_at TEXT,
      last_outreach_at TEXT,
      guardian_situation TEXT NOT NULL DEFAULT 'not_applicable',
      staff_review_resolved_at TEXT,
      staff_review_resolved_by TEXT,
      disposition_status TEXT NOT NULL DEFAULT 'active',
      disposition_reason TEXT,
      disposition_note TEXT,
      disposed_at TEXT,
      disposed_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (appointment_id),
      FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
      FOREIGN KEY (prospective_person_id) REFERENCES prospective_persons (id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_intake_episodes_patient ON intake_episodes (patient_id);
    CREATE INDEX IF NOT EXISTS idx_intake_episodes_prospect ON intake_episodes (prospective_person_id);
    CREATE INDEX IF NOT EXISTS idx_intake_episodes_disposition ON intake_episodes (disposition_status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_episodes_standalone_patient
      ON intake_episodes (patient_id) WHERE appointment_id IS NULL AND patient_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_episodes_standalone_prospect
      ON intake_episodes (prospective_person_id) WHERE appointment_id IS NULL AND prospective_person_id IS NOT NULL;
  `;
  const episodesColumns = [
    "id", "patient_id", "prospective_person_id", "appointment_id", "organization_id", "assigned_staff_id",
    "assigned_staff_name", "follow_up_at", "last_outreach_at", "guardian_situation", "staff_review_resolved_at",
    "staff_review_resolved_by", "disposition_status", "disposition_reason", "disposition_note",
    "disposed_at", "disposed_by", "created_at", "updated_at",
  ];

  if (columns.length === 0) {
    db.exec(episodesCreateSql);
    return;
  }

  db.exec(`ALTER TABLE intake_episodes RENAME TO intake_episodes_legacy_20260919`);
  // See `recreateTable`'s doc comment: these names are still held by the
  // just-renamed legacy table, so they must be freed before the new table's
  // CREATE INDEX statements below can actually take effect.
  db.exec(`
    DROP INDEX IF EXISTS idx_intake_episodes_patient;
    DROP INDEX IF EXISTS idx_intake_episodes_prospect;
    DROP INDEX IF EXISTS idx_intake_episodes_disposition;
  `);
  db.exec(episodesCreateSql);
  db.exec(`INSERT INTO intake_episodes (${episodesColumns.join(", ")}) SELECT ${episodesColumns.join(", ")} FROM intake_episodes_legacy_20260919`);

  recreateTable(db, {
    table: "intake_notes",
    createSql: `
      CREATE TABLE intake_notes (
        id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        patient_id TEXT,
        prospective_person_id TEXT,
        kind TEXT NOT NULL DEFAULT 'note',
        body TEXT NOT NULL,
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (episode_id) REFERENCES intake_episodes (id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_intake_notes_episode ON intake_notes (episode_id, created_at);
    `,
    copyColumns: ["id", "episode_id", "patient_id", "prospective_person_id", "kind", "body", "author_id", "author_name", "created_at"],
    dropIndexes: ["idx_intake_notes_episode"],
  });

  db.exec(`DROP TABLE intake_episodes_legacy_20260919`);

  // Restores the index D-077's documents-cluster relax lost the same way
  // (`identity_document_reviews` has no `ensure*Foundation` function that
  // re-declares it every boot the way `documents`/`document_workflow_events`
  // do, so unlike those it never self-healed). Safe unconditionally: no
  // rename happens here, so there is no stale name to collide with.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_identity_document_reviews_document ON identity_document_reviews (document_id, reviewed_at DESC);`);
}

/**
 * Recreates a table so its `patient_id` column becomes optional (SQLite
 * cannot drop a NOT NULL constraint in place). A no-op once already relaxed,
 * so this is safe to run against a fresh database that never had the
 * constraint. Existing rows keep their patient_id — already-valid foreign
 * keys stay valid on copy, and NULL values are simply exempt from the FK
 * check, so this never orphans or duplicates a row.
 */
export function relaxPatientIdToOptional(
  db: DatabaseSync,
  options: { table: string; createSql: string; copyColumns: readonly string[] },
): void {
  const { table, createSql, copyColumns } = options;
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: unknown; notnull?: unknown }>;
  if (columns.length === 0) {
    // Table does not exist yet on this database (fresh install order edge
    // case) — the base migration/foundation that creates it already uses
    // the relaxed shape going forward is not guaranteed, so create it here.
    db.exec(createSql);
    return;
  }
  const patientIdColumn = columns.find((c) => c.name === "patient_id");
  if (!patientIdColumn || patientIdColumn.notnull === 0) return;

  const legacyTable = `${table}_legacy_20260917`;
  db.exec(`ALTER TABLE ${table} RENAME TO ${legacyTable}`);
  db.exec(createSql);
  const columnList = copyColumns.join(", ");
  db.exec(`INSERT INTO ${table} (${columnList}) SELECT ${columnList} FROM ${legacyTable}`);
  db.exec(`DROP TABLE ${legacyTable}`);
}

/**
 * Seed the standard consent categories and one initial psychiatric intake
 * form template so Intake has something real to project readiness against on
 * a fresh database. Practice-authored template management (edit, upload a
 * PDF packet, retire) remains open work; these are a starting foundation, not
 * a finished template editor. Idempotent by fixed id.
 */
export function seedIntakeTemplates(db: DatabaseSync): void {
  const at = new Date().toISOString();
  const consentTemplates: Array<{ id: string; category: string; title: string; body: string; requiresGuardian: 0 | 1 }> = [
    {
      id: "consent-treatment",
      category: "treatment",
      title: "Consent to Treatment",
      body: "I consent to psychiatric evaluation and treatment by this practice, including medication management and/or psychotherapy as clinically recommended.",
      requiresGuardian: 1,
    },
    {
      id: "consent-privacy",
      category: "privacy",
      title: "HIPAA / Privacy Acknowledgement",
      body: "I acknowledge receipt of this practice's Notice of Privacy Practices describing how my health information may be used and disclosed.",
      requiresGuardian: 1,
    },
    {
      id: "consent-financial",
      category: "financial",
      title: "Financial Policy",
      body: "I understand my financial responsibility for services rendered, including copays, coinsurance, and charges not covered by insurance.",
      requiresGuardian: 1,
    },
    {
      id: "consent-telehealth",
      category: "telehealth",
      title: "Telehealth Consent",
      body: "I consent to receive care via telehealth when clinically appropriate and understand its benefits and limitations relative to an in-person visit.",
      requiresGuardian: 1,
    },
  ];

  for (const template of consentTemplates) {
    db.prepare(
      `INSERT OR IGNORE INTO consent_templates (
        id, category, title, version, body_text, requires_guardian_signature, active, created_at, updated_at
      ) VALUES (?,?,?,1,?,?,1,?,?)`,
    ).run(template.id, template.category, template.title, template.body, template.requiresGuardian, at, at);
  }

  const psychiatricIntakeSections = [
    {
      id: "presenting",
      title: "Presenting concerns",
      fields: [
        { id: "chief_concern", label: "What brings you in today?", type: "textarea", required: true },
        { id: "symptom_duration", label: "How long has this been going on?", type: "text" },
      ],
    },
    {
      id: "medications",
      title: "Current medications",
      fields: [
        { id: "current_medications", label: "List current medications, doses, and prescribers", type: "textarea" },
        { id: "allergies", label: "Medication allergies or intolerances", type: "textarea" },
      ],
    },
    {
      id: "psychiatric_history",
      title: "Psychiatric history",
      fields: [
        { id: "prior_diagnoses", label: "Prior psychiatric diagnoses", type: "textarea" },
        { id: "prior_medication_trials", label: "Prior psychiatric medication trials and response", type: "textarea" },
        { id: "prior_hospitalizations", label: "Prior psychiatric hospitalizations", type: "textarea" },
      ],
    },
    {
      id: "safety",
      title: "Safety history",
      fields: [
        { id: "self_harm_history", label: "History of self-harm or suicidal thoughts/attempts", type: "textarea" },
        { id: "current_safety_concern", label: "Any current thoughts of harming yourself or others?", type: "yesno" },
      ],
    },
    {
      id: "substance_use",
      title: "Substance use history",
      fields: [
        { id: "substance_use", label: "Alcohol, tobacco, or other substance use", type: "textarea" },
      ],
    },
    {
      id: "medical_family_social",
      title: "Medical, family, and social history",
      fields: [
        { id: "medical_history", label: "Relevant medical history", type: "textarea" },
        { id: "family_psychiatric_history", label: "Family psychiatric history", type: "textarea" },
        { id: "social_history", label: "Living situation, work/school, support system", type: "textarea" },
      ],
    },
  ];

  db.prepare(
    `INSERT OR IGNORE INTO form_templates (
      id, title, version, category, sections_json, active, created_at, updated_at
    ) VALUES ('form-psychiatric-intake', 'Initial Psychiatric Intake', 1, 'intake', ?, 1, ?, ?)`,
  ).run(JSON.stringify(psychiatricIntakeSections), at, at);
}

/**
 * Additive column migration that tolerates the column already existing.
 *
 * The base schema runs its CREATE TABLE before the migration ledger, so a fresh
 * database already has these columns while an existing one does not. Checking
 * first is what lets a single migration serve both.
 */
export function addColumnIfMissing(
  db: DatabaseSync,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: unknown }>;
  if (columns.some((entry) => entry.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
