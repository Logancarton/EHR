import type { DatabaseSync } from "node:sqlite";
import type { DatabaseMigration } from "./types";

/**
 * Releases of information (D-129). One row per authorization a patient is asked
 * to sign: the party, direction, information categories, purpose and expiry, the
 * exact text shown (`authorization_text`, fixed at request time), and its
 * signature or revocation. Requested through a chart form link.
 */
export const migration: DatabaseMigration = {
  id: "2026-10-07-003-release-authorizations",
  description: "Release-of-information authorizations requested from the chart",
  apply(db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS release_authorizations (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('release-to', 'obtain-from', 'exchange')),
        party_name TEXT NOT NULL,
        party_organization TEXT,
        party_phone TEXT,
        party_fax TEXT,
        party_address TEXT,
        categories_json TEXT NOT NULL,
        purpose TEXT NOT NULL,
        expires_on TEXT NOT NULL,
        authorization_text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'signed', 'revoked')),
        invitation_id TEXT,
        signed_at TEXT,
        signer_name TEXT,
        signature_method TEXT,
        revoked_at TEXT,
        revoked_by_name TEXT,
        revocation_note TEXT,
        created_by_id TEXT NOT NULL,
        created_by_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_release_authorizations_patient
        ON release_authorizations (patient_id, created_at DESC);
    `);
  },
};
