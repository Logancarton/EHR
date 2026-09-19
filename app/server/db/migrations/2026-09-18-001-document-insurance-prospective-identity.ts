import type { DatabaseMigration } from "./types";
import { relaxDocumentsCluster, relaxPatientIdToOptional } from "./historical-support";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
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
  };
