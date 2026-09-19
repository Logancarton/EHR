import type { DatabaseMigration } from "./types";
import { relaxPatientIdToOptional, addColumnIfMissing } from "./historical-support";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
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
  };
