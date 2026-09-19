import type { DatabaseMigration } from "./types";
import { seedIntakeTemplates } from "./historical-support";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
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
  };
