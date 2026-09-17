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
  {
    id: "2026-09-14-001-encounter-appointment-link",
    description: "Associate an encounter with the appointment the visit was started from",
    apply(db) {
      // The dashboard closed appointments by matching the signed encounter's
      // patient, so signing one note marked every visit that patient had that day
      // completed — a second appointment, a cancelled one, a follow-up next week.
      // A visit is a specific appointment, and only the record can say which.
      //
      // Nullable and deliberately not backfilled, for the same reason as
      // `orders.encounter_id` (2026-09-13-003): an encounter written before this
      // column existed genuinely has no recorded appointment, and inferring one
      // from same-day proximity would manufacture the association the column is
      // meant to make trustworthy. An unlinked encounter closes nothing.
      addColumnIfMissing(db, "encounters", "appointment_id", "TEXT");
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_encounters_appointment
          ON encounters (appointment_id);
      `);
    },
  },
  {
    id: "2026-09-14-002-appointment-roster-fields",
    description: "Add modality, provider, staff assignment, intake status, and cancellation fields to appointments",
    apply(db) {
      addColumnIfMissing(db, "appointments", "modality", "TEXT DEFAULT 'in-person'");
      addColumnIfMissing(db, "appointments", "provider_id", "TEXT");
      addColumnIfMissing(db, "appointments", "provider_name", "TEXT");
      addColumnIfMissing(db, "appointments", "assigned_staff_id", "TEXT");
      addColumnIfMissing(db, "appointments", "assigned_staff_name", "TEXT");
      addColumnIfMissing(db, "appointments", "intake_status", "TEXT DEFAULT 'completed'");
      addColumnIfMissing(db, "appointments", "cancellation_reason", "TEXT");
      addColumnIfMissing(db, "appointments", "cancellation_note", "TEXT");
      addColumnIfMissing(db, "appointments", "cancelled_at", "TEXT");
      addColumnIfMissing(db, "appointments", "cancelled_by", "TEXT");
    },
  },
  {
    id: "2026-09-14-003-preference-revisions",
    description: "Add revision counter to provider preferences for optimistic concurrency",
    apply(db) {
      addColumnIfMissing(db, "provider_preferences", "revision", "INTEGER NOT NULL DEFAULT 1");
    },
  },
  {
    id: "2026-09-14-004-appointment-version-and-handoffs",
    description: "Add appointment version for optimistic concurrency and create appointment handoffs table",
    apply(db) {
      addColumnIfMissing(db, "appointments", "version", "INTEGER NOT NULL DEFAULT 1");

      db.exec(`
        CREATE TABLE IF NOT EXISTS appointment_handoffs (
          id TEXT PRIMARY KEY,
          appointment_id TEXT NOT NULL,
          patient_id TEXT NOT NULL,
          from_user_id TEXT NOT NULL,
          from_user_name TEXT NOT NULL,
          to_user_id TEXT NOT NULL,
          to_user_name TEXT NOT NULL,
          reason TEXT NOT NULL,
          clinical_summary TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          decline_reason TEXT,
          history_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE CASCADE,
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_appointment_handoffs_apt
          ON appointment_handoffs (appointment_id, status);
        CREATE INDEX IF NOT EXISTS idx_appointment_handoffs_to_user
          ON appointment_handoffs (to_user_id, status);
        CREATE INDEX IF NOT EXISTS idx_appointment_handoffs_from_user
          ON appointment_handoffs (from_user_id, status);
      `);
    },
  },
  {
    id: "2026-09-14-005-appointment-lifecycle-and-followup",
    description: "Add operational and lifecycle timestamps, notes, and follow-up links to appointments",
    apply(db) {
      addColumnIfMissing(db, "appointments", "notes", "TEXT");
      addColumnIfMissing(db, "appointments", "arrived_at", "TEXT");
      addColumnIfMissing(db, "appointments", "started_at", "TEXT");
      addColumnIfMissing(db, "appointments", "completed_at", "TEXT");
      addColumnIfMissing(db, "appointments", "follow_up_interval", "TEXT");
      addColumnIfMissing(db, "appointments", "origin_appointment_id", "TEXT");
    },
  },

  {
    id: "2026-09-15-001-billing-charge-records",
    description: "Add durable billing charge records derived from signed encounters (P9-0 / P9-B)",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS billing_charges (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          patient_id TEXT NOT NULL,
          -- One charge per signed encounter. The uniqueness is enforced here rather
          -- than in a service check so a concurrent second preparation loses at the
          -- database instead of creating a duplicate claimable record.
          encounter_id TEXT NOT NULL UNIQUE,
          encounter_snapshot_sha256 TEXT NOT NULL,
          service_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'prepared',
          procedure_codes_json TEXT NOT NULL DEFAULT '[]',
          diagnosis_codes_json TEXT NOT NULL DEFAULT '[]',
          coverage_basis TEXT NOT NULL DEFAULT 'none-on-file',
          coverage_id TEXT,
          coverage_payer_name TEXT,
          prepared_by TEXT NOT NULL,
          prepared_by_name TEXT NOT NULL,
          prepared_at TEXT NOT NULL,
          reviewed_by TEXT,
          reviewed_by_name TEXT,
          reviewed_at TEXT,
          review_note TEXT,
          voided_by TEXT,
          voided_at TEXT,
          void_reason TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
          FOREIGN KEY (encounter_id) REFERENCES encounters (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_billing_charges_organization
          ON billing_charges (organization_id, status, service_date DESC);
        CREATE INDEX IF NOT EXISTS idx_billing_charges_patient
          ON billing_charges (patient_id, service_date DESC);
      `);
    },
  },
  {
    id: "2026-09-15-002-signed-encounter-date-projection",
    description: "Derived, rebuildable normalization of encounter signing timestamps for windowed reads",
    apply(db) {
      db.exec(`
        -- A projection, not a correction. Signed encounters are immutable by
        -- trigger and their recorded signing timestamp is left exactly as written;
        -- this table holds a derived instant beside it so a date-windowed query can
        -- be correct without rewriting a legal record.
        --
        -- 'unparseable' is a first-class outcome. A row that cannot be placed in
        -- time keeps its raw value, carries no instant, and is countable — so a
        -- windowed report can state how many records it could not place instead of
        -- silently dropping them.
        CREATE TABLE IF NOT EXISTS encounter_signed_at_projection (
          encounter_id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL,
          signed_at_raw TEXT NOT NULL,
          signed_at_iso TEXT,
          parse_status TEXT NOT NULL,
          projected_at TEXT NOT NULL,
          FOREIGN KEY (encounter_id) REFERENCES encounters (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_encounter_signed_projection_iso
          ON encounter_signed_at_projection (signed_at_iso);
        CREATE INDEX IF NOT EXISTS idx_encounter_signed_projection_status
          ON encounter_signed_at_projection (parse_status);
        CREATE INDEX IF NOT EXISTS idx_encounter_signed_projection_patient
          ON encounter_signed_at_projection (patient_id, signed_at_iso);
      `);
    },
  },
  {
    id: "2026-09-15-003-medication-indication",
    description: "Carry the prescribing indication onto the authoritative medication record (P3-C)",
    apply(db) {
      // P3-C asks for indication to be exposed "where useful". The prescription
      // intent has carried one all along (`MedicationPrescriptionIntent.indication`)
      // and the confirmation step dropped it on the floor, so the reason a
      // medication is being taken existed at the moment of prescribing and was
      // absent from the chart a minute later.
      addColumnIfMissing(db, "patient_medications", "indication", "TEXT");
    },
  },
  {
    id: "2026-09-15-004-care-completion-worklist",
    description: "Provider patient pins and care-completion deferrals (DB-10)",
    apply(db) {
      db.exec(`
        -- A pin is a personal view preference, not an access grant. It records
        -- that this user wants this patient on their own board and nothing else:
        -- no care-team membership, no clinical responsibility, no widened reach.
        -- Patient access is re-checked on every read and every write, so a pin
        -- that outlives access resolves to nothing rather than to a name.
        CREATE TABLE IF NOT EXISTS provider_patient_worklist_pins (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          patient_id TEXT NOT NULL,
          pinned_by TEXT NOT NULL,
          pinned_at TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'manual',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (user_id, patient_id),
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_worklist_pins_user
          ON provider_patient_worklist_pins (user_id, pinned_at DESC);
        CREATE INDEX IF NOT EXISTS idx_worklist_pins_patient
          ON provider_patient_worklist_pins (patient_id);

        -- Deferral is the one piece of care-completion state that has nowhere
        -- else to live: "I know, and here is why it is waiting" is not recorded
        -- by any clinical record. It is deliberately NOT a completion flag —
        -- there is no 'complete' status here, because completion is always read
        -- from the authoritative workflow the item projects.
        --
        -- item_key is rule identity plus the authoritative row the item is
        -- about, never display text, so relabelling a rule cannot orphan a
        -- recorded reason.
        CREATE TABLE IF NOT EXISTS care_completion_deferrals (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          patient_id TEXT NOT NULL,
          rule_id TEXT NOT NULL,
          item_key TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'deferred',
          reason_code TEXT NOT NULL,
          reason_text TEXT,
          deferred_by TEXT NOT NULL,
          deferred_by_name TEXT NOT NULL,
          deferred_at TEXT NOT NULL,
          resume_at TEXT,
          encounter_id TEXT,
          resolved_at TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (user_id, patient_id, item_key),
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_care_completion_deferrals_scope
          ON care_completion_deferrals (user_id, patient_id, status);
      `);

      // Messages carried only a locale clock string ("11:42 AM"), which cannot be
      // ordered or windowed. The care-completion projection has to answer "was a
      // message sent to this patient *after* the note was signed", so it needs an
      // instant. Existing rows keep a null: a message that cannot be placed in
      // time is reported as unusable evidence rather than guessed at.
      addColumnIfMissing(db, "messages", "created_at", "TEXT");
    },
  },
  {
    id: "2026-09-17-001-intake-foundation",
    description:
      "Intake episodes/notes (staff workflow state), consent templates/signatures, form " +
      "templates/submissions, payer-plan participation, eligibility checks and payment-method " +
      "references. Readiness is computed over these plus existing administrative/appointment " +
      "records rather than stored as a duplicate checklist — see D-075.",
    apply(db) {
      db.exec(`
        -- One row per patient-linked appointment that is carrying someone through
        -- intake. Durable staff-workflow state only: assignment, follow-up, the
        -- staff-review sign-off, and disposition. Readiness itself is a projection
        -- computed at read time, not stored here.
        CREATE TABLE IF NOT EXISTS intake_episodes (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL,
          appointment_id TEXT NOT NULL,
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
          FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_intake_episodes_patient ON intake_episodes (patient_id);
        CREATE INDEX IF NOT EXISTS idx_intake_episodes_disposition ON intake_episodes (disposition_status);

        CREATE TABLE IF NOT EXISTS intake_notes (
          id TEXT PRIMARY KEY,
          episode_id TEXT NOT NULL,
          patient_id TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'note',
          body TEXT NOT NULL,
          author_id TEXT NOT NULL,
          author_name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (episode_id) REFERENCES intake_episodes (id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_intake_notes_episode ON intake_notes (episode_id, created_at);

        -- Practice-authored consent language, versioned. Editing a template later
        -- never touches a signature already recorded against a prior version.
        CREATE TABLE IF NOT EXISTS consent_templates (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL DEFAULT 'other',
          title TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          body_text TEXT NOT NULL,
          requires_guardian_signature INTEGER NOT NULL DEFAULT 0,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        -- Signed artifacts are immutable: this build has no capture pad, so every
        -- row is honestly 'staff_attested' rather than a simulated e-signature.
        CREATE TABLE IF NOT EXISTS consent_signatures (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL,
          template_id TEXT NOT NULL,
          template_version INTEGER NOT NULL,
          signer_name TEXT NOT NULL,
          signer_relationship TEXT NOT NULL DEFAULT 'self',
          method TEXT NOT NULL DEFAULT 'staff_attested',
          recorded_by_id TEXT NOT NULL,
          recorded_by_name TEXT NOT NULL,
          signed_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
          FOREIGN KEY (template_id) REFERENCES consent_templates (id)
        );
        CREATE INDEX IF NOT EXISTS idx_consent_signatures_patient ON consent_signatures (patient_id);

        CREATE TRIGGER IF NOT EXISTS consent_signatures_immutable_update
        BEFORE UPDATE ON consent_signatures
        BEGIN
          SELECT RAISE(ABORT, 'Signed consents are immutable; record a new signature for corrections.');
        END;
        CREATE TRIGGER IF NOT EXISTS consent_signatures_immutable_delete
        BEFORE DELETE ON consent_signatures
        BEGIN
          SELECT RAISE(ABORT, 'Signed consents are immutable; record a new signature for corrections.');
        END;

        -- Minimal versioned form foundation (P7-A/B). sections_json holds the
        -- schema; the UI renderer is generic rather than one bespoke page per form.
        CREATE TABLE IF NOT EXISTS form_templates (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          category TEXT NOT NULL DEFAULT 'intake',
          sections_json TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS form_submissions (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL,
          template_id TEXT NOT NULL,
          template_version INTEGER NOT NULL,
          respondent TEXT NOT NULL DEFAULT 'staff',
          respondent_name TEXT,
          answers_json TEXT NOT NULL DEFAULT '{}',
          status TEXT NOT NULL DEFAULT 'in_progress',
          submitted_at TEXT,
          reviewed_by_id TEXT,
          reviewed_by_name TEXT,
          reviewed_at TEXT,
          review_notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
          FOREIGN KEY (template_id) REFERENCES form_templates (id)
        );
        CREATE INDEX IF NOT EXISTS idx_form_submissions_patient ON form_submissions (patient_id);

        -- Practice configuration, not patient data: which payer/product/plan this
        -- practice currently participates with. A coverage policy's payer name is
        -- matched against this table; no configured row means "needs review", never
        -- an inferred "accepted".
        CREATE TABLE IF NOT EXISTS payer_plan_participations (
          id TEXT PRIMARY KEY,
          organization_id TEXT,
          payer_name TEXT NOT NULL,
          product TEXT,
          plan_name TEXT,
          network TEXT,
          effective_date TEXT,
          end_date TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          notes TEXT,
          source TEXT NOT NULL DEFAULT 'practice_configured',
          created_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        -- One append-only row per eligibility attempt. 'adapter' is reserved for a
        -- future real clearinghouse; today every row is 'manual_staff_attestation'
        -- because no vendor is connected, and that distinction is preserved rather
        -- than blurred.
        CREATE TABLE IF NOT EXISTS eligibility_checks (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL,
          coverage_policy_id TEXT NOT NULL,
          result TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'manual_staff_attestation',
          adapter_id TEXT,
          note TEXT,
          checked_by_id TEXT,
          checked_by_name TEXT,
          checked_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_eligibility_checks_patient ON eligibility_checks (patient_id, checked_at);

        -- No PAN/CVV ever lands here — only a processor reference and safe display
        -- metadata, or an explicit staff waiver. 'not_configured' is not a status
        -- this table stores; its absence for a patient means not configured.
        CREATE TABLE IF NOT EXISTS payment_method_references (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL,
          status TEXT NOT NULL,
          processor_ref TEXT,
          brand TEXT,
          last_four TEXT,
          expiration TEXT,
          waiver_reason TEXT,
          recorded_by_id TEXT,
          recorded_by_name TEXT,
          recorded_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_payment_method_references_patient ON payment_method_references (patient_id, recorded_at);
      `);

      seedIntakeTemplates(db);
    },
  },
  {
    id: "2026-09-17-002-intake-prospective-identity",
    description:
      "Prospective/pre-chart identity (D-076): a tentative caller no longer requires a " +
      "clinical chart. Adds prospective_persons and identity_document_reviews, and relaxes " +
      "patient_id to optional (adding prospective_person_id alongside it) on every Intake " +
      "evidence table so an episode, note, consent signature, form submission, eligibility " +
      "check, or payment record can belong to a prospect before promotion. Also adds explicit " +
      "in_network/out_of_network status to payer-plan participation and structured benefit " +
      "evidence to eligibility checks.",
    apply(db) {
      db.exec(`
        -- The pre-chart identity stage. Deliberately administrative-only: no
        -- clinical fields exist here to put them in.
        CREATE TABLE IF NOT EXISTS prospective_persons (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          name TEXT NOT NULL,
          dob TEXT,
          mobile_phone TEXT,
          email TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          promoted_patient_id TEXT,
          promoted_at TEXT,
          promoted_by TEXT,
          promotion_kind TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
          FOREIGN KEY (promoted_patient_id) REFERENCES patients (id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_prospective_persons_org ON prospective_persons (organization_id, status);
        CREATE INDEX IF NOT EXISTS idx_prospective_persons_promoted ON prospective_persons (promoted_patient_id);

        -- The explicit human-confirmation event a government-ID document needs
        -- before identity counts as confirmed. Generic document workflow_status
        -- governs the document; this governs the identity claim it supports.
        CREATE TABLE IF NOT EXISTS identity_document_reviews (
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
      `);

      relaxPatientIdToOptional(db, {
        table: "intake_episodes",
        createSql: `
          CREATE TABLE intake_episodes (
            id TEXT PRIMARY KEY,
            patient_id TEXT,
            prospective_person_id TEXT,
            appointment_id TEXT NOT NULL,
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
        `,
        copyColumns: [
          "id", "patient_id", "appointment_id", "organization_id", "assigned_staff_id", "assigned_staff_name",
          "follow_up_at", "last_outreach_at", "guardian_situation", "staff_review_resolved_at",
          "staff_review_resolved_by", "disposition_status", "disposition_reason", "disposition_note",
          "disposed_at", "disposed_by", "created_at", "updated_at",
        ],
      });

      relaxPatientIdToOptional(db, {
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
        copyColumns: ["id", "episode_id", "patient_id", "kind", "body", "author_id", "author_name", "created_at"],
      });

      relaxPatientIdToOptional(db, {
        table: "consent_signatures",
        createSql: `
          CREATE TABLE consent_signatures (
            id TEXT PRIMARY KEY,
            patient_id TEXT,
            prospective_person_id TEXT,
            template_id TEXT NOT NULL,
            template_version INTEGER NOT NULL,
            signer_name TEXT NOT NULL,
            signer_relationship TEXT NOT NULL DEFAULT 'self',
            method TEXT NOT NULL DEFAULT 'staff_attested',
            recorded_by_id TEXT NOT NULL,
            recorded_by_name TEXT NOT NULL,
            signed_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
            FOREIGN KEY (prospective_person_id) REFERENCES prospective_persons (id) ON DELETE CASCADE,
            FOREIGN KEY (template_id) REFERENCES consent_templates (id)
          );
          CREATE INDEX IF NOT EXISTS idx_consent_signatures_patient ON consent_signatures (patient_id);
          CREATE INDEX IF NOT EXISTS idx_consent_signatures_prospect ON consent_signatures (prospective_person_id);
          CREATE TRIGGER IF NOT EXISTS consent_signatures_immutable_update
          BEFORE UPDATE ON consent_signatures
          BEGIN
            SELECT RAISE(ABORT, 'Signed consents are immutable; record a new signature for corrections.');
          END;
          CREATE TRIGGER IF NOT EXISTS consent_signatures_immutable_delete
          BEFORE DELETE ON consent_signatures
          BEGIN
            SELECT RAISE(ABORT, 'Signed consents are immutable; record a new signature for corrections.');
          END;
        `,
        copyColumns: [
          "id", "patient_id", "template_id", "template_version", "signer_name", "signer_relationship",
          "method", "recorded_by_id", "recorded_by_name", "signed_at", "created_at",
        ],
      });

      relaxPatientIdToOptional(db, {
        table: "form_submissions",
        createSql: `
          CREATE TABLE form_submissions (
            id TEXT PRIMARY KEY,
            patient_id TEXT,
            prospective_person_id TEXT,
            template_id TEXT NOT NULL,
            template_version INTEGER NOT NULL,
            respondent TEXT NOT NULL DEFAULT 'staff',
            respondent_name TEXT,
            answers_json TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'in_progress',
            submitted_at TEXT,
            reviewed_by_id TEXT,
            reviewed_by_name TEXT,
            reviewed_at TEXT,
            review_notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
            FOREIGN KEY (prospective_person_id) REFERENCES prospective_persons (id) ON DELETE CASCADE,
            FOREIGN KEY (template_id) REFERENCES form_templates (id)
          );
          CREATE INDEX IF NOT EXISTS idx_form_submissions_patient ON form_submissions (patient_id);
          CREATE INDEX IF NOT EXISTS idx_form_submissions_prospect ON form_submissions (prospective_person_id);
        `,
        copyColumns: [
          "id", "patient_id", "template_id", "template_version", "respondent", "respondent_name",
          "answers_json", "status", "submitted_at", "reviewed_by_id", "reviewed_by_name", "review_notes",
          "created_at", "updated_at",
        ],
      });

      relaxPatientIdToOptional(db, {
        table: "eligibility_checks",
        createSql: `
          CREATE TABLE eligibility_checks (
            id TEXT PRIMARY KEY,
            patient_id TEXT,
            prospective_person_id TEXT,
            coverage_policy_id TEXT NOT NULL,
            result TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'manual_staff_attestation',
            adapter_id TEXT,
            note TEXT,
            benefit_evidence_json TEXT,
            checked_by_id TEXT,
            checked_by_name TEXT,
            checked_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
            FOREIGN KEY (prospective_person_id) REFERENCES prospective_persons (id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_eligibility_checks_patient ON eligibility_checks (patient_id, checked_at);
          CREATE INDEX IF NOT EXISTS idx_eligibility_checks_prospect ON eligibility_checks (prospective_person_id, checked_at);
        `,
        copyColumns: [
          "id", "patient_id", "coverage_policy_id", "result", "source", "adapter_id", "note",
          "checked_by_id", "checked_by_name", "checked_at", "created_at",
        ],
      });

      relaxPatientIdToOptional(db, {
        table: "payment_method_references",
        createSql: `
          CREATE TABLE payment_method_references (
            id TEXT PRIMARY KEY,
            patient_id TEXT,
            prospective_person_id TEXT,
            status TEXT NOT NULL,
            processor_ref TEXT,
            brand TEXT,
            last_four TEXT,
            expiration TEXT,
            waiver_reason TEXT,
            recorded_by_id TEXT,
            recorded_by_name TEXT,
            recorded_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
            FOREIGN KEY (prospective_person_id) REFERENCES prospective_persons (id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_payment_method_references_patient ON payment_method_references (patient_id, recorded_at);
          CREATE INDEX IF NOT EXISTS idx_payment_method_references_prospect ON payment_method_references (prospective_person_id, recorded_at);
        `,
        copyColumns: [
          "id", "patient_id", "status", "processor_ref", "brand", "last_four", "expiration", "waiver_reason",
          "recorded_by_id", "recorded_by_name", "recorded_at", "created_at",
        ],
      });

      addColumnIfMissing(db, "payer_plan_participations", "status", "TEXT NOT NULL DEFAULT 'in_network'");
    },
  },
  {
    id: "2026-09-18-001-document-insurance-prospective-identity",
    description:
      "Intake truth-continuity (D-077): a prospect can now own government-ID/insurance-card " +
      "documents and coverage policies before a chart exists. Relaxes patient_id to optional " +
      "(adding prospective_person_id alongside it) on documents, document_workflow_events, and " +
      "insurance_policies — the same relaxation pattern D-076 applied to the Intake evidence " +
      "tables — so a document or policy recorded pre-chart is the same durable row after " +
      "promotion, never copied or duplicated.",
    apply(db) {
      relaxDocumentsCluster(db);

      relaxPatientIdToOptional(db, {
        table: "insurance_policies",
        createSql: `
          CREATE TABLE insurance_policies (
            id TEXT PRIMARY KEY,
            patient_id TEXT,
            prospective_person_id TEXT,
            payer_name TEXT NOT NULL,
            plan_name TEXT,
            member_id TEXT,
            group_number TEXT,
            subscriber_name TEXT,
            relationship TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            effective_date TEXT,
            termination_date TEXT,
            source_system TEXT NOT NULL DEFAULT 'ehr-local',
            source_ref TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            subscriber_dob TEXT,
            coverage_priority INTEGER NOT NULL DEFAULT 1,
            coverage_type TEXT NOT NULL DEFAULT 'commercial',
            is_self_pay INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
            FOREIGN KEY (prospective_person_id) REFERENCES prospective_persons (id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_insurance_patient_status ON insurance_policies (patient_id, status);
          CREATE INDEX IF NOT EXISTS idx_insurance_prospect_status ON insurance_policies (prospective_person_id, status);
        `,
        copyColumns: [
          "id", "patient_id", "payer_name", "plan_name", "member_id", "group_number",
          "subscriber_name", "relationship", "status", "effective_date", "termination_date",
          "source_system", "source_ref", "created_at", "updated_at", "subscriber_dob",
          "coverage_priority", "coverage_type", "is_self_pay",
        ],
      });
    },
  },
];

/**
 * Renames `table` to `${table}_legacy_20260918`, recreates it from
 * `createSql`, copies `copyColumns` across, and drops the legacy table.
 * Unlike `relaxPatientIdToOptional`, this has no idempotency guard of its
 * own — callers only invoke it once, from inside a guard that checks the
 * cluster as a whole (see `relaxDocumentsCluster`).
 */
function recreateTable(
  db: DatabaseSync,
  options: { table: string; createSql: string; copyColumns: readonly string[] },
): void {
  const { table, createSql, copyColumns } = options;
  const legacyTable = `${table}_legacy_20260918`;
  db.exec(`ALTER TABLE ${table} RENAME TO ${legacyTable}`);
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
function relaxDocumentsCluster(db: DatabaseSync): void {
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
 * Recreates a table so its `patient_id` column becomes optional (SQLite
 * cannot drop a NOT NULL constraint in place). A no-op once already relaxed,
 * so this is safe to run against a fresh database that never had the
 * constraint. Existing rows keep their patient_id — already-valid foreign
 * keys stay valid on copy, and NULL values are simply exempt from the FK
 * check, so this never orphans or duplicates a row.
 */
function relaxPatientIdToOptional(
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
function seedIntakeTemplates(db: DatabaseSync): void {
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
