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
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS intake_portal_invitations (
        id TEXT PRIMARY KEY,
        token_hash TEXT UNIQUE NOT NULL,
        episode_id TEXT NOT NULL,
        patient_id TEXT,
        prospective_person_id TEXT,
        target_email TEXT,
        target_phone TEXT,
        dob_verification_required INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_accessed_at TEXT,
        completed_at TEXT,
        created_by_id TEXT NOT NULL,
        created_by_name TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_intake_portal_invitations_token ON intake_portal_invitations(token_hash);
      CREATE INDEX IF NOT EXISTS idx_intake_portal_invitations_episode ON intake_portal_invitations(episode_id);
      CREATE INDEX IF NOT EXISTS idx_intake_portal_invitations_patient ON intake_portal_invitations(patient_id);
      CREATE INDEX IF NOT EXISTS idx_intake_portal_invitations_prospect ON intake_portal_invitations(prospective_person_id);
    `);
  } catch {}
}
