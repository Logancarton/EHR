import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/connection";
import {
  normalizeProcedureCode,
  type ChargeTemplate,
  type ChargeTemplateAddOnPolicy,
  type FeeScheduleEntry,
  type PracticeBillingProfile,
  type ProviderBillingIdentity,
} from "../../domain/billing-setup";

/**
 * Storage for practice billing configuration (D-101).
 *
 * Plain persistence: authorization and validation live in the service. Every read
 * is scoped to one organization, because a fee schedule or a tax ID is the
 * practice's own and never another's.
 */

export class ChargeTemplateConcurrencyError extends Error {
  constructor(readonly serverVersion: number) {
    super(`Charge template version conflict: the server is at version ${serverVersion}. Reload and retry.`);
    this.name = "ChargeTemplateConcurrencyError";
  }
}

const EMPTY_PROFILE = (organizationId: string): PracticeBillingProfile => ({
  organizationId,
  legalName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  phone: "",
  taxId: "",
  groupNpi: "",
  updatedBy: null,
  updatedAt: null,
});

function asTemplate(row: any): ChargeTemplate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    noteTemplateId: row.note_template_id,
    primaryCode: row.primary_code,
    primaryDescription: row.primary_description || "",
    addOnPolicy: row.add_on_policy as ChargeTemplateAddOnPolicy,
    placeOfServiceInPerson: row.place_of_service_in_person || "",
    placeOfServiceTelehealth: row.place_of_service_telehealth || "",
    telehealthModifier: row.telehealth_modifier || "",
    active: Number(row.active) === 1,
    version: Number(row.version || 1),
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

function asFee(row: any): FeeScheduleEntry {
  return {
    organizationId: row.organization_id,
    code: row.code,
    modifier: row.modifier || "",
    description: row.description || "",
    amountCents: Number(row.amount_cents),
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export type ChargeTemplateInput = Omit<ChargeTemplate, "id" | "organizationId" | "version" | "updatedBy" | "updatedAt">;

export const BillingSetupRepository = {
  profile(organizationId: string): PracticeBillingProfile {
    const row = getDatabase()
      .prepare("SELECT * FROM billing_practice_profiles WHERE organization_id = ?")
      .get(organizationId) as any;
    if (!row) return EMPTY_PROFILE(organizationId);
    return {
      organizationId,
      legalName: row.legal_name || "",
      addressLine1: row.address_line1 || "",
      addressLine2: row.address_line2 || "",
      city: row.city || "",
      state: row.state || "",
      postalCode: row.postal_code || "",
      phone: row.phone || "",
      taxId: row.tax_id || "",
      groupNpi: row.group_npi || "",
      updatedBy: row.updated_by || null,
      updatedAt: row.updated_at || null,
    };
  },

  saveProfile(
    organizationId: string,
    input: Omit<PracticeBillingProfile, "organizationId" | "updatedBy" | "updatedAt">,
    userId: string,
  ): PracticeBillingProfile {
    const at = new Date().toISOString();
    getDatabase().prepare(`
      INSERT INTO billing_practice_profiles (
        organization_id, legal_name, address_line1, address_line2, city, state, postal_code,
        phone, tax_id, group_npi, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(organization_id) DO UPDATE SET
        legal_name = excluded.legal_name,
        address_line1 = excluded.address_line1,
        address_line2 = excluded.address_line2,
        city = excluded.city,
        state = excluded.state,
        postal_code = excluded.postal_code,
        phone = excluded.phone,
        tax_id = excluded.tax_id,
        group_npi = excluded.group_npi,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `).run(
      organizationId,
      input.legalName,
      input.addressLine1,
      input.addressLine2,
      input.city,
      input.state,
      input.postalCode,
      input.phone,
      input.taxId,
      input.groupNpi,
      userId,
      at,
    );
    return this.profile(organizationId);
  },

  /**
   * Every active clinical member of the practice with whatever identifiers the
   * practice recorded for them. A member with none is listed with blanks rather
   * than omitted, so the gap is visible where it is fixed.
   */
  providers(organizationId: string): ProviderBillingIdentity[] {
    const rows = getDatabase().prepare(`
      SELECT t.id AS user_id, t.display_name, t.credentials, t.role,
             b.npi, b.taxonomy_code, b.license_number, b.license_state, b.updated_by, b.updated_at
      FROM organization_memberships m
      JOIN team_members t ON t.id = m.user_id
      LEFT JOIN billing_provider_identifiers b
        ON b.organization_id = m.organization_id AND b.user_id = m.user_id
      WHERE m.organization_id = ? AND m.status = 'active' AND t.active = 1 AND t.role = 'provider'
      ORDER BY t.display_name ASC
    `).all(organizationId) as any[];
    return rows.map((row) => ({
      organizationId,
      userId: row.user_id,
      displayName: row.display_name,
      credentials: row.credentials || "",
      npi: row.npi || "",
      taxonomyCode: row.taxonomy_code || "",
      licenseNumber: row.license_number || "",
      licenseState: row.license_state || "",
      updatedBy: row.updated_by || null,
      updatedAt: row.updated_at || null,
    }));
  },

  provider(organizationId: string, userId: string): ProviderBillingIdentity | null {
    return this.providers(organizationId).find((provider) => provider.userId === userId) ?? null;
  },

  saveProvider(
    organizationId: string,
    userId: string,
    input: { npi: string; taxonomyCode: string; licenseNumber: string; licenseState: string },
    updatedBy: string,
  ): void {
    const at = new Date().toISOString();
    getDatabase().prepare(`
      INSERT INTO billing_provider_identifiers (
        organization_id, user_id, npi, taxonomy_code, license_number, license_state, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(organization_id, user_id) DO UPDATE SET
        npi = excluded.npi,
        taxonomy_code = excluded.taxonomy_code,
        license_number = excluded.license_number,
        license_state = excluded.license_state,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `).run(organizationId, userId, input.npi, input.taxonomyCode, input.licenseNumber, input.licenseState, updatedBy, at);
  },

  chargeTemplates(organizationId: string): ChargeTemplate[] {
    return (getDatabase()
      .prepare("SELECT * FROM billing_charge_templates WHERE organization_id = ? ORDER BY active DESC, name ASC")
      .all(organizationId) as any[]).map(asTemplate);
  },

  chargeTemplate(id: string): ChargeTemplate | null {
    const row = getDatabase().prepare("SELECT * FROM billing_charge_templates WHERE id = ?").get(id) as any;
    return row ? asTemplate(row) : null;
  },

  createChargeTemplate(organizationId: string, input: ChargeTemplateInput, userId: string): ChargeTemplate {
    const id = `ctpl-${randomUUID()}`;
    const at = new Date().toISOString();
    getDatabase().prepare(`
      INSERT INTO billing_charge_templates (
        id, organization_id, name, note_template_id, primary_code, primary_description, add_on_policy,
        place_of_service_in_person, place_of_service_telehealth, telehealth_modifier, active, version,
        updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      id,
      organizationId,
      input.name,
      input.noteTemplateId,
      normalizeProcedureCode(input.primaryCode),
      input.primaryDescription,
      input.addOnPolicy,
      input.placeOfServiceInPerson,
      input.placeOfServiceTelehealth,
      input.telehealthModifier.toUpperCase(),
      input.active ? 1 : 0,
      userId,
      at,
      at,
    );
    return this.chargeTemplate(id)!;
  },

  updateChargeTemplate(id: string, input: ChargeTemplateInput, userId: string, expectedVersion?: number): ChargeTemplate {
    const existing = this.chargeTemplate(id);
    if (!existing) throw new Error(`Charge template not found: ${id}`);
    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new ChargeTemplateConcurrencyError(existing.version);
    }
    const at = new Date().toISOString();
    const result = getDatabase().prepare(`
      UPDATE billing_charge_templates
      SET name = ?, note_template_id = ?, primary_code = ?, primary_description = ?, add_on_policy = ?,
          place_of_service_in_person = ?, place_of_service_telehealth = ?, telehealth_modifier = ?,
          active = ?, version = version + 1, updated_by = ?, updated_at = ?
      WHERE id = ? AND version = ?
    `).run(
      input.name,
      input.noteTemplateId,
      normalizeProcedureCode(input.primaryCode),
      input.primaryDescription,
      input.addOnPolicy,
      input.placeOfServiceInPerson,
      input.placeOfServiceTelehealth,
      input.telehealthModifier.toUpperCase(),
      input.active ? 1 : 0,
      userId,
      at,
      id,
      existing.version,
    );
    if (Number(result.changes) === 0) {
      throw new ChargeTemplateConcurrencyError(this.chargeTemplate(id)?.version ?? existing.version);
    }
    return this.chargeTemplate(id)!;
  },

  feeSchedule(organizationId: string): FeeScheduleEntry[] {
    return (getDatabase()
      .prepare("SELECT * FROM billing_fee_schedule WHERE organization_id = ? ORDER BY code ASC, modifier ASC")
      .all(organizationId) as any[]).map(asFee);
  },

  saveFee(
    organizationId: string,
    input: { code: string; modifier: string; description: string; amountCents: number },
    userId: string,
  ): FeeScheduleEntry {
    const at = new Date().toISOString();
    const code = normalizeProcedureCode(input.code);
    const modifier = input.modifier.trim().toUpperCase();
    getDatabase().prepare(`
      INSERT INTO billing_fee_schedule (organization_id, code, modifier, description, amount_cents, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(organization_id, code, modifier) DO UPDATE SET
        description = excluded.description,
        amount_cents = excluded.amount_cents,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `).run(organizationId, code, modifier, input.description, input.amountCents, userId, at);
    return this.feeSchedule(organizationId).find((entry) => entry.code === code && entry.modifier === modifier)!;
  },

  removeFee(organizationId: string, code: string, modifier: string): boolean {
    const result = getDatabase()
      .prepare("DELETE FROM billing_fee_schedule WHERE organization_id = ? AND code = ? AND modifier = ?")
      .run(organizationId, normalizeProcedureCode(code), modifier.trim().toUpperCase());
    return Number(result.changes) > 0;
  },
};
