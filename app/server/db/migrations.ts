import type { DatabaseSync } from "node:sqlite";

/**
 * The synthetic development practice. Production provisioning creates real
 * organizations; this identity exists so local/seed data is owned rather than
 * floating outside every access boundary.
 */
export const DEFAULT_ORGANIZATION_ID = "org-northside-behavioral";
export const DEFAULT_ORGANIZATION_NAME = "Northside Behavioral Health";

export type DatabaseMigration = {
  id: string;
  description: string;
  apply(db: DatabaseSync): void;
};

function ensureMigrationLedger(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

export const APPLICATION_MIGRATIONS: readonly DatabaseMigration[] = [
  {
    id: "2026-09-08-001-integration-configurations",
    description: "Add vendor-neutral integration configuration records",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS integration_configurations (
          id TEXT PRIMARY KEY,
          adapter_id TEXT NOT NULL,
          purpose TEXT NOT NULL,
          environment TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 0,
          scope_type TEXT NOT NULL DEFAULT 'practice',
          scope_id TEXT,
          non_secret_config_json TEXT NOT NULL DEFAULT '{}',
          secret_refs_json TEXT NOT NULL DEFAULT '{}',
          version INTEGER NOT NULL DEFAULT 1,
          created_by TEXT NOT NULL,
          updated_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_integration_configurations_adapter
          ON integration_configurations(adapter_id, purpose, enabled);
        CREATE INDEX IF NOT EXISTS idx_integration_configurations_scope
          ON integration_configurations(scope_type, scope_id, purpose);
      `);
    },
  },
  {
    id: "2026-09-08-002-prescription-outcome-uncertain",
    description: "Index unresolved prescription transport outcomes for operational recovery",
    apply(db) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_prescription_transactions_uncertain
          ON prescription_transactions(state, updated_at DESC);
      `);
    },
  },
  {
    id: "2026-09-09-001-organization-patient-access",
    description: "Add organizations, memberships, and patient organization ownership",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS organizations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS organization_memberships (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          patient_access_scope TEXT NOT NULL DEFAULT 'organization',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (organization_id, user_id),
          FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES team_members (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS patient_organizations (
          patient_id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
          FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_organization_memberships_user
          ON organization_memberships (user_id, status);
        CREATE INDEX IF NOT EXISTS idx_patient_organizations_org
          ON patient_organizations (organization_id);
      `);

      // One-time adoption of records that predate patient-access scoping. Patients
      // and users created after this migration are assigned explicitly at creation;
      // this backfill deliberately does not run again.
      const now = new Date().toISOString();
      db.prepare(`
        INSERT OR IGNORE INTO organizations (id, name, status, created_at, updated_at)
        VALUES (?, ?, 'active', ?, ?)
      `).run(DEFAULT_ORGANIZATION_ID, DEFAULT_ORGANIZATION_NAME, now, now);

      const adoptPatient = db.prepare(`
        INSERT OR IGNORE INTO patient_organizations (patient_id, organization_id, created_at)
        VALUES (?, ?, ?)
      `);
      for (const row of db.prepare("SELECT id FROM patients").all() as Array<{ id: string }>) {
        adoptPatient.run(row.id, DEFAULT_ORGANIZATION_ID, now);
      }

      const adoptMember = db.prepare(`
        INSERT OR IGNORE INTO organization_memberships (
          id, organization_id, user_id, status, patient_access_scope, created_at, updated_at
        ) VALUES (?, ?, ?, 'active', ?, ?, ?)
      `);
      for (const row of db.prepare("SELECT id FROM team_members").all() as Array<{ id: string }>) {
        adoptMember.run(
          `membership-${DEFAULT_ORGANIZATION_ID}-${row.id}`,
          DEFAULT_ORGANIZATION_ID,
          row.id,
          "organization",
          now,
          now,
        );
      }
    },
  },
  {
    id: "2026-09-10-001-auth-activation-tokens",
    description: "Single-use activation tokens so a provisioned user sets their own password",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS auth_activation_tokens (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          issued_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          redeemed_at TEXT,
          FOREIGN KEY (user_id) REFERENCES team_members (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_auth_activation_tokens_user
          ON auth_activation_tokens (user_id, redeemed_at);
      `);
    },
  },
  {
    id: "2026-09-10-002-auth-login-throttle",
    description: "Durable failed-login counters so password guessing is rate limited",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS auth_login_attempts (
          username_key TEXT PRIMARY KEY,
          failed_attempts INTEGER NOT NULL DEFAULT 0,
          first_failure_at TEXT NOT NULL,
          last_failure_at TEXT NOT NULL,
          locked_until TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_locked
          ON auth_login_attempts (locked_until);
      `);
    },
  },
  {
    id: "2026-09-10-003-encounter-note-sections",
    description: "Persist review of symptoms, risk assessment, and follow-up as note columns",
    apply(db) {
      // Risk assessment and follow-up were draft-only fields: the client held them
      // but the save payload never carried them, so they lived in one browser and
      // were absent from the signed legal record. They become columns here alongside
      // the new review-of-symptoms section.
      addColumnIfMissing(db, "encounters", "review_of_symptoms", "TEXT NOT NULL DEFAULT ''");
      addColumnIfMissing(db, "encounters", "risk_assessment", "TEXT NOT NULL DEFAULT ''");
      addColumnIfMissing(db, "encounters", "follow_up", "TEXT NOT NULL DEFAULT ''");
    },
  },
  {
    id: "2026-09-10-004-workspace-templates",
    description: "Add membership roles and organization-owned workspace layout templates",
    apply(db) {
      // Memberships previously recorded only status and patient-access scope, so
      // there was nobody the system could authorise to administer shared settings.
      // Every existing member starts as 'member'; the backfill below promotes one.
      addColumnIfMissing(db, "organization_memberships", "membership_role", "TEXT NOT NULL DEFAULT 'member'");

      db.exec(`
        CREATE TABLE IF NOT EXISTS workspace_templates (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          icon TEXT NOT NULL DEFAULT 'dashboard',
          -- Empty means the template is offered to every role in the practice.
          applies_to_role TEXT NOT NULL DEFAULT '',
          sort_order INTEGER NOT NULL DEFAULT 0,
          config_json TEXT NOT NULL,
          created_by TEXT NOT NULL,
          updated_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (organization_id, name),
          FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_workspace_templates_org
          ON workspace_templates (organization_id, sort_order);
      `);

      // Every organization needs someone who can edit its templates, or the
      // feature ships unreachable. The earliest active membership is the closest
      // thing to "whoever set the practice up"; ties break on id so the choice is
      // deterministic rather than dependent on row order.
      const organizations = db.prepare(`SELECT id FROM organizations`).all() as Array<{ id: string }>;
      const firstMember = db.prepare(`
        SELECT user_id FROM organization_memberships
        WHERE organization_id = ? AND status = 'active'
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      `);
      const promote = db.prepare(`
        UPDATE organization_memberships
        SET membership_role = 'owner', updated_at = ?
        WHERE organization_id = ? AND user_id = ?
      `);
      const now = new Date().toISOString();
      for (const organization of organizations) {
        const owner = firstMember.get(organization.id) as { user_id?: string } | undefined;
        if (owner?.user_id) promote.run(now, organization.id, owner.user_id);
      }
    },
  },
  {
    id: "2026-09-11-001-patient-administrative-foundation",
    description: "Add patient identity, contact, related-person and care-network records",
    apply(db) {
      // Identity. `status` already existed but holds the clinical relationship
      // ("Established", "New Patient"); where the *record* stands is a separate
      // question, so it gets its own column rather than overloading that one.
      addColumnIfMissing(db, "patients", "preferred_name", "TEXT");
      addColumnIfMissing(db, "patients", "sex_at_birth", "TEXT");
      addColumnIfMissing(db, "patients", "gender_identity", "TEXT");
      addColumnIfMissing(db, "patients", "preferred_language", "TEXT");
      addColumnIfMissing(db, "patients", "time_zone", "TEXT");
      addColumnIfMissing(db, "patients", "record_status", "TEXT NOT NULL DEFAULT 'active'");
      addColumnIfMissing(db, "patients", "deceased_date", "TEXT");

      // Contact.
      addColumnIfMissing(db, "patients", "mobile_phone", "TEXT");
      addColumnIfMissing(db, "patients", "alternate_phone", "TEXT");
      addColumnIfMissing(db, "patients", "email", "TEXT");
      addColumnIfMissing(db, "patients", "address_line1", "TEXT");
      addColumnIfMissing(db, "patients", "address_line2", "TEXT");
      addColumnIfMissing(db, "patients", "city", "TEXT");
      addColumnIfMissing(db, "patients", "state", "TEXT");
      addColumnIfMissing(db, "patients", "postal_code", "TEXT");
      addColumnIfMissing(db, "patients", "country", "TEXT");
      addColumnIfMissing(db, "patients", "preferred_contact_method", "TEXT");
      addColumnIfMissing(db, "patients", "contact_notes", "TEXT");

      // Permission to use a channel is tri-state: 1 yes, 0 no, NULL nobody asked.
      // Leaving a voicemail about a psychiatric appointment is a disclosure, so
      // "not asked yet" must stay distinguishable from "no".
      addColumnIfMissing(db, "patients", "allow_voicemail", "INTEGER");
      addColumnIfMissing(db, "patients", "allow_sms", "INTEGER");
      addColumnIfMissing(db, "patients", "allow_email", "INTEGER");

      db.exec(`
        CREATE TABLE IF NOT EXISTS patient_related_people (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL,
          role TEXT NOT NULL,
          relationship TEXT,
          name TEXT NOT NULL,
          phone TEXT,
          alternate_phone TEXT,
          email TEXT,
          address_line1 TEXT,
          city TEXT,
          state TEXT,
          postal_code TEXT,
          -- How much may be discussed with this person. Being the right person to
          -- call about a missed appointment does not make someone the right person
          -- to discuss a diagnosis with.
          consent_scope TEXT NOT NULL DEFAULT 'none',
          priority INTEGER NOT NULL DEFAULT 1,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_patient_related_people_patient
          ON patient_related_people (patient_id, status, role, priority);

        CREATE TABLE IF NOT EXISTS patient_care_network (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL,
          role TEXT NOT NULL,
          name TEXT NOT NULL,
          organization TEXT,
          phone TEXT,
          fax TEXT,
          email TEXT,
          address_line1 TEXT,
          city TEXT,
          state TEXT,
          postal_code TEXT,
          npi TEXT,
          relationship_note TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_patient_care_network_patient
          ON patient_care_network (patient_id, status, role);
      `);

      // Coverage gains the fields a front office actually needs to file a claim
      // against the right policy in the right order.
      addColumnIfMissing(db, "insurance_policies", "subscriber_dob", "TEXT");
      addColumnIfMissing(db, "insurance_policies", "coverage_priority", "INTEGER NOT NULL DEFAULT 1");
      addColumnIfMissing(db, "insurance_policies", "coverage_type", "TEXT NOT NULL DEFAULT 'commercial'");
      addColumnIfMissing(db, "insurance_policies", "is_self_pay", "INTEGER NOT NULL DEFAULT 0");

      // Age was a stored column, so every chart aged out of date between writes and
      // a birthday silently made the record wrong. Date of birth is the fact; age is
      // derived from it at read time. SQLite can drop the column outright, and the
      // projection stops consulting it either way.
      const patientColumns = db.prepare(`PRAGMA table_info(patients)`).all() as Array<{ name?: unknown }>;
      if (patientColumns.some((entry) => entry.name === "age")) {
        try {
          db.exec(`ALTER TABLE patients DROP COLUMN age`);
        } catch {
          // An older SQLite cannot drop a column. Leaving it in place is harmless:
          // nothing reads it any more, and the projection derives age from dob.
        }
      }
    },
  },
  {
    id: "2026-09-13-001-encounter-note-references",
    description: "Add out-of-band references linking encounter note sections to clinical records",
    apply(db) {
      // A note references clinical records; it does not embed copies of them.
      // Earlier prototyping put markup tokens inside the narrative itself, which
      // made the note text and the structured record the same field: the tokens
      // leaked into every export, and the label carried a code that no record had
      // authorized. The reference lives beside the prose instead.
      //
      // The durable key is (encounter, section, entity). Character spans are a
      // presentation hint for underlining the referenced phrase and are
      // invalidated by the next edit anywhere earlier in the section; nothing
      // clinical or financial may depend on an offset.
      db.exec(`
        CREATE TABLE IF NOT EXISTS encounter_note_references (
          id TEXT PRIMARY KEY,
          encounter_id TEXT NOT NULL,
          patient_id TEXT NOT NULL,
          section TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          version_num INTEGER,
          span_start INTEGER,
          span_end INTEGER,
          -- Evidence class. 'action-derived' is the strongest: a staged order or a
          -- reconciliation performed in this encounter is structurally known and
          -- needs no language understanding. 'clinician-authored' is an explicit
          -- link. 'ai-extracted' is a proposal and nothing more.
          source TEXT NOT NULL DEFAULT 'ai-extracted',
          confidence REAL,
          -- Evidence becomes truth only by an explicit clinician act at signing,
          -- the same boundary medication reconciliation already draws (D-020).
          -- A rejected reference is retained rather than deleted: the fact that a
          -- proposal was declined is audit-relevant.
          status TEXT NOT NULL DEFAULT 'proposed',
          model_id TEXT,
          extracted_at TEXT,
          confirmed_by TEXT,
          confirmed_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (encounter_id, section, entity_type, entity_id),
          FOREIGN KEY (encounter_id) REFERENCES encounters (id) ON DELETE CASCADE,
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
        );

        -- The coding engine reads by encounter and status; the longitudinal
        -- timeline reads by entity ("which encounters addressed this problem?").
        CREATE INDEX IF NOT EXISTS idx_encounter_note_references_encounter
          ON encounter_note_references (encounter_id, status, section);
        CREATE INDEX IF NOT EXISTS idx_encounter_note_references_entity
          ON encounter_note_references (entity_type, entity_id, status);
        CREATE INDEX IF NOT EXISTS idx_encounter_note_references_patient
          ON encounter_note_references (patient_id, status);
      `);
    },
  },
  {
    id: "2026-09-13-002-retire-prototype-note-tokens",
    description: "Strip abandoned smart-chip markup from draft note text",
    apply(db) {
      // The smart-chip prototype wrote `@[type:Label|meta]` tokens into note
      // prose. That markup was never clinical content — it was an editor
      // affordance that leaked into the field — and it reaches every export
      // verbatim. Drafts are rewritten to the label the clinician saw.
      //
      // Drafts only. A signed encounter is hashed over its note text
      // (`chart-integrity.ts`), so silently rewriting one would both break its
      // integrity snapshot and alter a legal record after attestation. If a
      // signed note contains tokens, that is a finding to surface, not a string
      // to fix; the check below records it rather than repairing it.
      const TOKEN = /@\[(?:med|dx|lab|vital|scale|date|allergy):([^\]|]+)(?:\|[^\]]+)?\]/g;
      const strip = (value: unknown): string =>
        typeof value === "string" ? value.replace(TOKEN, (_match, label) => String(label)) : "";

      const textColumns = [
        "chief_complaint",
        "interval_history",
        "hpi",
        "review_of_symptoms",
        "treatment_response",
        "side_effects",
        "assessment",
        "risk_assessment",
        "follow_up",
        "plan",
      ] as const;

      const rows = db.prepare(`SELECT * FROM encounters`).all() as any[];
      for (const row of rows) {
        const mseRaw = typeof row.mse_json === "string" ? row.mse_json : "{}";
        const touchesText = textColumns.some((column) => String(row[column] ?? "").includes("@["));
        const touchesMse = mseRaw.includes("@[");
        if (!touchesText && !touchesMse) continue;

        if (row.status === "signed") {
          // Leave the record untouched and leave a trail. A signed note is not a
          // string this migration is entitled to rewrite.
          db.prepare(
            // Stable identity, so re-running the migration records the finding
            // once rather than colliding on it.
            `INSERT OR IGNORE INTO provenance_events
             (id, patient_id, entity_type, entity_id, activity, source_type, source_system,
              source_ref, actor_id, actor_name, payload_sha256, metadata_json, created_at)
             VALUES (?, ?, 'encounter', ?, 'prototype-markup-detected', 'derived', 'ehr-local',
                     NULL, 'system-migration', 'Prototype token retirement', '', ?, ?)`,
          ).run(
            `prov-token-${row.id}`,
            row.patient_id,
            row.id,
            JSON.stringify({ note: "Signed note contains prototype chip markup; not rewritten." }),
            new Date().toISOString(),
          );
          continue;
        }

        let mseJson = mseRaw;
        if (touchesMse) {
          try {
            const mse = JSON.parse(mseRaw) as Record<string, unknown>;
            for (const key of Object.keys(mse)) mse[key] = strip(mse[key]);
            mseJson = JSON.stringify(mse);
          } catch {
            // Unparseable MSE stays as it is rather than being replaced by a guess.
          }
        }

        db.prepare(
          `UPDATE encounters SET
             chief_complaint = ?, interval_history = ?, hpi = ?, review_of_symptoms = ?,
             treatment_response = ?, side_effects = ?, assessment = ?, risk_assessment = ?,
             follow_up = ?, plan = ?, mse_json = ?, updated_at = ?
           WHERE id = ?`,
        ).run(
          strip(row.chief_complaint),
          strip(row.interval_history),
          strip(row.hpi),
          strip(row.review_of_symptoms),
          strip(row.treatment_response),
          strip(row.side_effects),
          strip(row.assessment),
          strip(row.risk_assessment),
          strip(row.follow_up),
          strip(row.plan),
          mseJson,
          new Date().toISOString(),
          row.id,
        );
      }
    },
  },
  {
    id: "2026-09-13-003-encounter-scoped-orders",
    description: "Associate clinical orders with the encounter that produced them",
    apply(db) {
      // Orders were patient-scoped and time-ordered, never encounter-scoped, so
      // "what was ordered during this visit" could only be answered by guessing at
      // a time window. Prescription drug management is the Moderate-risk pillar of
      // a 99214; deriving it from a guess is the failure this reference layer
      // exists to remove.
      //
      // Nullable, and deliberately not backfilled. An order placed before this
      // column existed genuinely has no recorded encounter, and inferring one from
      // proximity would manufacture exactly the association the column is meant to
      // make trustworthy. Absence stays visible.
      addColumnIfMissing(db, "orders", "encounter_id", "TEXT");
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_orders_encounter
          ON orders (encounter_id, status);
      `);
    },
  },
  {
    id: "2026-09-13-004-encounter-section-extractions",
    description: "Record which note section text an extraction pass has already seen",
    apply(db) {
      // Extraction is debounced per section and must be free in the steady state:
      // re-reading text that has not changed costs money and latency and can only
      // return the same answer. The content hash is what makes a no-op a no-op.
      //
      // The model identity is part of the key in spirit: a different extractor may
      // legitimately reach a different answer about identical text, so a change of
      // implementation invalidates the skip.
      db.exec(`
        CREATE TABLE IF NOT EXISTS encounter_section_extractions (
          encounter_id TEXT NOT NULL,
          section TEXT NOT NULL,
          content_sha TEXT NOT NULL,
          model_id TEXT NOT NULL,
          extracted_at TEXT NOT NULL,
          PRIMARY KEY (encounter_id, section),
          FOREIGN KEY (encounter_id) REFERENCES encounters (id) ON DELETE CASCADE
        );
      `);
    },
  },
  {
    id: "2026-09-13-005-patient-photo-and-id",
    description: "Add patient photo, photo type, and government ID card fields",
    apply(db) {
      addColumnIfMissing(db, "patients", "photo_url", "TEXT");
      addColumnIfMissing(db, "patients", "photo_type", "TEXT DEFAULT 'license'");
      addColumnIfMissing(db, "patients", "id_card_json", "TEXT DEFAULT '{}'");
    },
  },
];

/**
 * Additive column migration that tolerates the column already existing.
 *
 * The base schema runs its CREATE TABLE before the migration ledger, so a fresh
 * database already has these columns while an existing one does not. Checking
 * first is what lets a single migration serve both.
 */
function addColumnIfMissing(
  db: DatabaseSync,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: unknown }>;
  if (columns.some((entry) => entry.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function validateMigrationOrder(migrations: readonly DatabaseMigration[]): void {
  const ids = migrations.map((migration) => migration.id);
  if (new Set(ids).size !== ids.length) throw new Error("Database migration identities must be unique.");
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  if (ids.some((id, index) => id !== sorted[index])) {
    throw new Error("Database migrations must be declared in deterministic identity order.");
  }
}

export function applyMigrations(
  db: DatabaseSync,
  migrations: readonly DatabaseMigration[] = APPLICATION_MIGRATIONS,
): void {
  ensureMigrationLedger(db);
  validateMigrationOrder(migrations);

  for (const migration of migrations) {
    const alreadyApplied = db.prepare(`SELECT id FROM schema_migrations WHERE id = ?`).get(migration.id);
    if (alreadyApplied) continue;

    db.exec("BEGIN IMMEDIATE");
    try {
      migration.apply(db);
      db.prepare(`INSERT INTO schema_migrations (id, description, applied_at) VALUES (?, ?, ?)`)
        .run(migration.id, migration.description, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Database migration ${migration.id} failed: ${message}`);
    }
  }
}
