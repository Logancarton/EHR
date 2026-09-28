import type { DatabaseSync } from "node:sqlite";

/**
 * Intake foundation schema extensions (P7): digital signature capture,
 * attestation metadata, form submission review sign-offs, and pre-chart
 * prospective clinical assessment linkage.
 *
 * Runs after migrations so base intake tables created during migrations
 * receive these additive columns deterministically across all environments.
 */
export function ensureIntakeFoundation(db: DatabaseSync) {
  try {
    db.exec(`ALTER TABLE consent_signatures ADD COLUMN method TEXT DEFAULT 'staff_attested'`);
  } catch {}
  try {
    db.exec(`ALTER TABLE consent_signatures ADD COLUMN signature_data TEXT`);
  } catch {}
  try {
    db.exec(`ALTER TABLE consent_signatures ADD COLUMN attestation_statement TEXT`);
  } catch {}
  try {
    db.exec(`ALTER TABLE form_submissions ADD COLUMN review_notes TEXT`);
  } catch {}
  try {
    db.exec(`ALTER TABLE clinical_assessments ADD COLUMN prospective_person_id TEXT`);
  } catch {}
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_clinical_assessments_prospect ON clinical_assessments(prospective_person_id, instrument, administered_at DESC)`);
  } catch {}
}
