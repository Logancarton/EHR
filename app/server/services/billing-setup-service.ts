import { assertPermission, hasPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import { accessSelectionForActor } from "../auth/patient-access";
import { AuditRepository } from "../repositories/audit-repository";
import { BillingSetupRepository, type ChargeTemplateInput } from "../repositories/billing-setup-repository";
import {
  CHARGE_TEMPLATE_ADD_ON_POLICIES,
  isValidModifier,
  isValidNpi,
  isValidPlaceOfService,
  isValidProcedureCode,
  isValidTaxId,
  normalizeProcedureCode,
  starterChargeTemplates,
  type BillingSetupView,
  type ChargeTemplate,
  type ChargeTemplateAddOnPolicy,
  type FeeScheduleEntry,
  type PracticeBillingProfile,
} from "../../domain/billing-setup";
import type { ClinicalExecutionContext } from "./clinical-service";

/**
 * Practice billing setup (D-101): the profile, provider identifiers, charge
 * templates and fee schedule.
 *
 * Reading needs financial access (`view_financial`), the same gate the worklist
 * has, because a fee schedule is the shape of the practice's finances. Changing
 * it needs `manage_organization` — owners and managers — because a price or a tax
 * ID is a practice decision, not something a biller infers.
 *
 * Every accepted change is audited with what changed. Every refusal writes
 * nothing.
 */

export class BillingSetupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingSetupValidationError";
  }
}

function organizationFor(actor: ProviderContext): string {
  const selection = accessSelectionForActor(actor);
  const organizationId = selection.organizationIds[0] ?? selection.assignedScopeOrganizationIds[0];
  if (!organizationId) {
    throw new Error(`User ${actor.userId} lacks permission: billing setup requires an organization membership.`);
  }
  return organizationId;
}

function text(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function audit(
  actor: ProviderContext,
  context: ClinicalExecutionContext,
  description: string,
  metadata: Record<string, unknown>,
) {
  AuditRepository.log({
    userId: actor.userId,
    userName: providerLabel(actor),
    userRole: actor.role,
    eventType: "billing_setup_updated",
    description,
    metadata: { source: context.source, requestId: context.requestId, ...metadata },
  });
}

function validateTemplate(input: Record<string, unknown>): ChargeTemplateInput {
  const name = text(input.name, 120);
  const noteTemplateId = text(input.noteTemplateId, 80);
  const primaryCode = normalizeProcedureCode(text(input.primaryCode, 12));
  const addOnPolicy = text(input.addOnPolicy, 40) as ChargeTemplateAddOnPolicy;
  const placeOfServiceInPerson = text(input.placeOfServiceInPerson, 2);
  const placeOfServiceTelehealth = text(input.placeOfServiceTelehealth, 2);
  const telehealthModifier = text(input.telehealthModifier, 2).toUpperCase();

  if (!name) throw new BillingSetupValidationError("A charge template needs a name.");
  if (!noteTemplateId) throw new BillingSetupValidationError("Choose the note template this charge template applies to.");
  if (!isValidProcedureCode(primaryCode)) {
    throw new BillingSetupValidationError(`"${primaryCode || "(blank)"}" is not a five-character procedure code.`);
  }
  if (!CHARGE_TEMPLATE_ADD_ON_POLICIES.includes(addOnPolicy)) {
    throw new BillingSetupValidationError("Add-on policy must be none or psychotherapy-time.");
  }
  for (const [label, value] of [["In-person", placeOfServiceInPerson], ["Telehealth", placeOfServiceTelehealth]] as const) {
    if (value && !isValidPlaceOfService(value)) {
      throw new BillingSetupValidationError(`${label} place of service must be a two-digit CMS code.`);
    }
  }
  if (telehealthModifier && !isValidModifier(telehealthModifier)) {
    throw new BillingSetupValidationError("The telehealth modifier must be two characters, e.g. 95.");
  }

  return {
    name,
    noteTemplateId,
    primaryCode,
    primaryDescription: text(input.primaryDescription, 200),
    addOnPolicy,
    placeOfServiceInPerson,
    placeOfServiceTelehealth,
    telehealthModifier,
    active: input.active !== false,
  };
}

export const billingSetupService = {
  organizationFor,

  view(actor: ProviderContext): BillingSetupView {
    assertPermission(actor, "view_financial");
    const organizationId = organizationFor(actor);
    return {
      profile: BillingSetupRepository.profile(organizationId),
      providers: BillingSetupRepository.providers(organizationId),
      chargeTemplates: BillingSetupRepository.chargeTemplates(organizationId),
      feeSchedule: BillingSetupRepository.feeSchedule(organizationId),
      canEdit: hasPermission(actor, "manage_organization"),
    };
  },

  /**
   * What the note's readiness panel may see: the active charge templates and the
   * fee schedule's codes, without the practice's tax identity. A clinician writing
   * a note needs to know whether the visit type is set up to bill, not the EIN.
   */
  readinessContext(actor: ProviderContext): {
    chargeTemplates: ChargeTemplate[];
    feeCodes: Array<{ code: string; modifier: string }>;
    rendering: { hasNpi: boolean };
  } {
    const organizationId = organizationFor(actor);
    const provider = BillingSetupRepository.provider(organizationId, actor.userId);
    return {
      chargeTemplates: BillingSetupRepository.chargeTemplates(organizationId).filter((template) => template.active),
      feeCodes: BillingSetupRepository.feeSchedule(organizationId).map((entry) => ({
        code: entry.code,
        modifier: entry.modifier,
      })),
      rendering: { hasNpi: Boolean(provider?.npi) },
    };
  },

  saveProfile(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: Record<string, unknown>,
  ): PracticeBillingProfile {
    assertPermission(actor, "manage_organization");
    const organizationId = organizationFor(actor);
    const taxId = text(input.taxId, 12);
    const groupNpi = text(input.groupNpi, 10);
    if (taxId && !isValidTaxId(taxId)) {
      throw new BillingSetupValidationError("Tax ID must be a nine-digit EIN, e.g. 12-3456789.");
    }
    if (groupNpi && !isValidNpi(groupNpi)) {
      throw new BillingSetupValidationError("Group NPI must be ten digits with a valid check digit.");
    }
    const saved = BillingSetupRepository.saveProfile(
      organizationId,
      {
        legalName: text(input.legalName, 160),
        addressLine1: text(input.addressLine1, 160),
        addressLine2: text(input.addressLine2, 160),
        city: text(input.city, 80),
        state: text(input.state, 2).toUpperCase(),
        postalCode: text(input.postalCode, 10),
        phone: text(input.phone, 30),
        taxId,
        groupNpi,
      },
      actor.userId,
    );
    audit(actor, context, "Updated the practice billing profile.", {
      organizationId,
      section: "profile",
      fields: ["legalName", "address", "phone", "taxId", "groupNpi"],
    });
    return saved;
  },

  saveProvider(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: Record<string, unknown>,
  ): void {
    assertPermission(actor, "manage_organization");
    const organizationId = organizationFor(actor);
    const userId = text(input.userId, 80);
    if (!BillingSetupRepository.providers(organizationId).some((provider) => provider.userId === userId)) {
      throw new BillingSetupValidationError("That provider is not an active clinician in this practice.");
    }
    const npi = text(input.npi, 10);
    if (npi && !isValidNpi(npi)) {
      throw new BillingSetupValidationError("NPI must be ten digits with a valid check digit.");
    }
    BillingSetupRepository.saveProvider(
      organizationId,
      userId,
      {
        npi,
        taxonomyCode: text(input.taxonomyCode, 10).toUpperCase(),
        licenseNumber: text(input.licenseNumber, 40),
        licenseState: text(input.licenseState, 2).toUpperCase(),
      },
      actor.userId,
    );
    audit(actor, context, `Updated billing identifiers for provider ${userId}.`, {
      organizationId,
      section: "provider",
      providerUserId: userId,
    });
  },

  saveChargeTemplate(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: Record<string, unknown>,
  ): ChargeTemplate {
    assertPermission(actor, "manage_organization");
    const organizationId = organizationFor(actor);
    const validated = validateTemplate(input);
    const id = text(input.id, 80);

    // One active template per note template; say so rather than let the unique
    // index fail with a database message.
    const clash = BillingSetupRepository.chargeTemplates(organizationId).find(
      (template) => template.active && template.noteTemplateId === validated.noteTemplateId && template.id !== id,
    );
    if (validated.active && clash) {
      throw new BillingSetupValidationError(
        `"${clash.name}" is already the active charge template for that note template. Deactivate it first.`,
      );
    }

    let saved: ChargeTemplate;
    if (id) {
      const existing = BillingSetupRepository.chargeTemplate(id);
      if (!existing || existing.organizationId !== organizationId) {
        throw new Error(`Charge template not found: ${id}`);
      }
      const expectedVersion = Number.isFinite(Number(input.expectedVersion)) ? Number(input.expectedVersion) : undefined;
      saved = BillingSetupRepository.updateChargeTemplate(id, validated, actor.userId, expectedVersion);
    } else {
      saved = BillingSetupRepository.createChargeTemplate(organizationId, validated, actor.userId);
    }

    audit(actor, context, `${id ? "Updated" : "Created"} charge template "${saved.name}".`, {
      organizationId,
      section: "charge-template",
      chargeTemplateId: saved.id,
      noteTemplateId: saved.noteTemplateId,
      primaryCode: saved.primaryCode,
      addOnPolicy: saved.addOnPolicy,
      placeOfServiceInPerson: saved.placeOfServiceInPerson,
      placeOfServiceTelehealth: saved.placeOfServiceTelehealth,
      telehealthModifier: saved.telehealthModifier,
      active: saved.active,
      version: saved.version,
    });
    return saved;
  },

  /**
   * Creates a charge template for each shipped note template the practice has not
   * set up yet. Existing templates are left exactly as they are.
   */
  createStarterTemplates(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    noteTemplates: Parameters<typeof starterChargeTemplates>[0],
  ): ChargeTemplate[] {
    assertPermission(actor, "manage_organization");
    const organizationId = organizationFor(actor);
    const existing = new Set(
      BillingSetupRepository.chargeTemplates(organizationId)
        .filter((template) => template.active)
        .map((template) => template.noteTemplateId),
    );
    const created = starterChargeTemplates(noteTemplates)
      .filter((starter) => !existing.has(starter.noteTemplateId) && isValidProcedureCode(starter.primaryCode))
      .map((starter) => BillingSetupRepository.createChargeTemplate(organizationId, starter, actor.userId));
    if (created.length > 0) {
      audit(actor, context, `Created ${created.length} starter charge template(s) from note templates.`, {
        organizationId,
        section: "charge-template",
        chargeTemplateIds: created.map((template) => template.id),
      });
    }
    return created;
  },

  saveFee(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: Record<string, unknown>,
  ): FeeScheduleEntry {
    assertPermission(actor, "manage_organization");
    const organizationId = organizationFor(actor);
    const code = normalizeProcedureCode(text(input.code, 12));
    const modifier = text(input.modifier, 2).toUpperCase();
    const amountCents = Number(input.amountCents);
    if (!isValidProcedureCode(code)) {
      throw new BillingSetupValidationError(`"${code || "(blank)"}" is not a five-character procedure code.`);
    }
    if (modifier && !isValidModifier(modifier)) {
      throw new BillingSetupValidationError("A fee modifier must be two characters, or blank for any modifier.");
    }
    if (!Number.isInteger(amountCents) || amountCents < 0 || amountCents > 10_000_000) {
      throw new BillingSetupValidationError("A fee must be a whole number of cents between $0.00 and $100,000.00.");
    }
    const saved = BillingSetupRepository.saveFee(
      organizationId,
      { code, modifier, description: text(input.description, 200), amountCents },
      actor.userId,
    );
    audit(actor, context, `Set the practice fee for ${code}${modifier ? `-${modifier}` : ""}.`, {
      organizationId,
      section: "fee-schedule",
      code,
      modifier,
      amountCents,
    });
    return saved;
  },

  removeFee(actor: ProviderContext, context: ClinicalExecutionContext, input: Record<string, unknown>): boolean {
    assertPermission(actor, "manage_organization");
    const organizationId = organizationFor(actor);
    const code = normalizeProcedureCode(text(input.code, 12));
    const modifier = text(input.modifier, 2).toUpperCase();
    const removed = BillingSetupRepository.removeFee(organizationId, code, modifier);
    if (removed) {
      audit(actor, context, `Removed the practice fee for ${code}${modifier ? `-${modifier}` : ""}.`, {
        organizationId,
        section: "fee-schedule",
        code,
        modifier,
        removed: true,
      });
    }
    return removed;
  },
};
