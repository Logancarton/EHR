import type { DatabaseMigration } from "./types";
import { addColumnIfMissing } from "./historical-support";

/**
 * Practice billing setup and attested add-on codes (D-101).
 *
 * Four practice-owned configuration tables — the billing profile, provider billing
 * identifiers, charge templates and the fee schedule — plus the two columns that
 * let a charge carry what they contribute. None of it is seeded: a price, an NPI
 * or a tax ID that nobody at the practice entered would be invented.
 *
 * `encounter_working_state.addon_codes_json` closes the gap ROADMAP P9-B recorded:
 * add-on codes shown and attested during signing were never persisted, so they
 * could not reach the signed snapshot or a charge. They are stored beside the
 * psychotherapy minutes they depend on.
 */
export const migration: DatabaseMigration = {
  id: "2026-09-24-001-billing-setup-and-addon-codes",
  description: "Add practice billing profile, provider identifiers, charge templates, fee schedule, and attested add-on codes",
  apply(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS billing_practice_profiles (
        organization_id TEXT PRIMARY KEY,
        legal_name TEXT NOT NULL DEFAULT '',
        address_line1 TEXT NOT NULL DEFAULT '',
        address_line2 TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT '',
        postal_code TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        tax_id TEXT NOT NULL DEFAULT '',
        group_npi TEXT NOT NULL DEFAULT '',
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS billing_provider_identifiers (
        organization_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        npi TEXT NOT NULL DEFAULT '',
        taxonomy_code TEXT NOT NULL DEFAULT '',
        license_number TEXT NOT NULL DEFAULT '',
        license_state TEXT NOT NULL DEFAULT '',
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (organization_id, user_id),
        FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES team_members (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS billing_charge_templates (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        name TEXT NOT NULL,
        note_template_id TEXT NOT NULL,
        primary_code TEXT NOT NULL,
        primary_description TEXT NOT NULL DEFAULT '',
        add_on_policy TEXT NOT NULL DEFAULT 'none' CHECK (add_on_policy IN ('none','psychotherapy-time')),
        place_of_service_in_person TEXT NOT NULL DEFAULT '',
        place_of_service_telehealth TEXT NOT NULL DEFAULT '',
        telehealth_modifier TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        version INTEGER NOT NULL DEFAULT 1,
        updated_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
      );

      -- One active template per note template per practice, enforced here so a
      -- charge can never be matched to two templates that disagree.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_charge_templates_active_note
        ON billing_charge_templates (organization_id, note_template_id) WHERE active = 1;

      CREATE TABLE IF NOT EXISTS billing_fee_schedule (
        organization_id TEXT NOT NULL,
        code TEXT NOT NULL,
        modifier TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (organization_id, code, modifier),
        FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
      );
    `);

    addColumnIfMissing(db, "billing_charges", "place_of_service", "TEXT");
    addColumnIfMissing(db, "billing_charges", "charge_template_id", "TEXT");
    addColumnIfMissing(db, "billing_charges", "charge_template_name", "TEXT");
    addColumnIfMissing(db, "encounter_working_state", "addon_codes_json", "TEXT NOT NULL DEFAULT '[]'");
  },
};
