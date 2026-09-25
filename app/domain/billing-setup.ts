/**
 * Practice billing setup: charge templates, the fee schedule, and the billing
 * identity a superbill prints (roadmap P9-B, BILL-1 / BILL-2, D-101).
 *
 * Everything in this file is practice-entered configuration. None of it is a
 * clinical fact and none of it is payer truth:
 *
 * - A **charge template** says how a kind of visit is billed here: the E/M code a
 *   note template is written toward, whether time-based psychotherapy add-ons
 *   apply, and the place of service and modifier for in-person versus telehealth
 *   visits. It never *chooses* the codes on a charge — those are the ones the
 *   clinician attested on the signed note — it supplies the claim-shaped details
 *   around them.
 * - The **fee schedule** is the practice's own price for a code. It is what makes
 *   a billed amount honest: the number came from somebody accountable at the
 *   practice, not from the screen. What a payer *allows* or *pays* is still
 *   unknowable here (P9-D) and is never derived from it.
 * - The **billing profile** is who the practice is on paper — legal name, address,
 *   tax ID, NPIs. Recorded, never verified: no registry lookup exists, and the
 *   screens say "as recorded by the practice".
 */

export type ChargeTemplateAddOnPolicy = "none" | "psychotherapy-time";

export const CHARGE_TEMPLATE_ADD_ON_POLICIES: readonly ChargeTemplateAddOnPolicy[] = [
  "none",
  "psychotherapy-time",
];

export type ChargeTemplate = {
  id: string;
  organizationId: string;
  name: string;
  /** The note template this charge template is matched to (`builtInTemplates[].id`). */
  noteTemplateId: string;
  /** The E/M or evaluation code the note template is written toward. Informational; the attested code wins. */
  primaryCode: string;
  primaryDescription: string;
  addOnPolicy: ChargeTemplateAddOnPolicy;
  /** CMS place-of-service code for an in-person visit, e.g. "11" (office). */
  placeOfServiceInPerson: string;
  /** Place of service for a telehealth visit, e.g. "10" (patient's home) or "02". */
  placeOfServiceTelehealth: string;
  /** Modifier appended to every line of a telehealth visit, e.g. "95". Empty for none. */
  telehealthModifier: string;
  active: boolean;
  version: number;
  updatedBy: string;
  updatedAt: string;
};

export type FeeScheduleEntry = {
  organizationId: string;
  code: string;
  /** Empty string when the fee applies regardless of modifier. */
  modifier: string;
  description: string;
  /** Integer cents. Never fractional, never a float. */
  amountCents: number;
  updatedBy: string;
  updatedAt: string;
};

export type PracticeBillingProfile = {
  organizationId: string;
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  /** Employer identification number, as recorded. */
  taxId: string;
  /** Type 2 (organizational) NPI, as recorded. */
  groupNpi: string;
  updatedBy: string | null;
  updatedAt: string | null;
};

export type ProviderBillingIdentity = {
  organizationId: string;
  userId: string;
  displayName: string;
  credentials: string;
  /** Type 1 (individual) NPI, as recorded. */
  npi: string;
  taxonomyCode: string;
  licenseNumber: string;
  licenseState: string;
  updatedBy: string | null;
  updatedAt: string | null;
};

export type BillingSetupView = {
  profile: PracticeBillingProfile;
  providers: ProviderBillingIdentity[];
  chargeTemplates: ChargeTemplate[];
  feeSchedule: FeeScheduleEntry[];
  /** Whether the caller may change any of it (owners and managers). */
  canEdit: boolean;
};

/* ------------------------------------------------------------------------- */
/* Validation                                                                 */
/* ------------------------------------------------------------------------- */

const CPT_PATTERN = /^\+?[0-9]{4}[0-9A-Z]$/;
const MODIFIER_PATTERN = /^[0-9A-Z]{2}$/;
const POS_PATTERN = /^[0-9]{2}$/;
const NPI_PATTERN = /^[0-9]{10}$/;
const EIN_PATTERN = /^[0-9]{2}-?[0-9]{7}$/;

/** "+90833" and "90833" are the same code; add-on notation is presentation. */
export function normalizeProcedureCode(code: string): string {
  return code.trim().toUpperCase().replace(/^\+/, "");
}

export function isValidProcedureCode(code: string): boolean {
  return CPT_PATTERN.test(code.trim().toUpperCase());
}

export function isValidModifier(modifier: string): boolean {
  return MODIFIER_PATTERN.test(modifier.trim().toUpperCase());
}

export function isValidPlaceOfService(value: string): boolean {
  return POS_PATTERN.test(value.trim());
}

/**
 * The NPI check digit (Luhn over "80840" + the first nine digits).
 *
 * A format check rather than a registry lookup: it catches a transposed digit,
 * and says nothing about whether the number belongs to this practice.
 */
export function isValidNpi(value: string): boolean {
  const digits = value.trim();
  if (!NPI_PATTERN.test(digits)) return false;
  const payload = `80840${digits.slice(0, 9)}`;
  let sum = 0;
  for (let index = 0; index < payload.length; index += 1) {
    let digit = Number(payload[payload.length - 1 - index]);
    if (index % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[9]);
}

export function isValidTaxId(value: string): boolean {
  return EIN_PATTERN.test(value.trim());
}

/** Dollars typed by a person, to integer cents. Null when it is not a price. */
export function parseMoneyToCents(value: string): number | null {
  const cleaned = value.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const dollars = Math.floor(absolute / 100).toLocaleString("en-US");
  return `${sign}$${dollars}.${String(absolute % 100).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------------- */
/* Application                                                                */
/* ------------------------------------------------------------------------- */

export type VisitModality = "in-person" | "telehealth" | "unknown";

/**
 * How the appointment row's free-text modality reads for billing.
 *
 * `unknown` is its own answer. An encounter opened outside the schedule has no
 * appointment, and guessing "office" for it would put a place of service on a
 * claim that nobody recorded.
 */
export function visitModalityFromAppointment(modality: string | null | undefined): VisitModality {
  const value = (modality ?? "").trim().toLowerCase();
  if (!value) return "unknown";
  if (/(tele|video|virtual|phone|audio|remote)/.test(value)) return "telehealth";
  if (/(in-person|in person|office|clinic)/.test(value)) return "in-person";
  return "unknown";
}

export function placeOfServiceFor(template: ChargeTemplate | null, modality: VisitModality): string | null {
  if (!template || modality === "unknown") return null;
  const value = modality === "telehealth" ? template.placeOfServiceTelehealth : template.placeOfServiceInPerson;
  return value.trim() || null;
}

export function modifiersFor(template: ChargeTemplate | null, modality: VisitModality): string[] {
  if (!template || modality !== "telehealth") return [];
  const modifier = template.telehealthModifier.trim().toUpperCase();
  return modifier ? [modifier] : [];
}

/**
 * The practice's fee for one billed line.
 *
 * A modifier-specific fee wins over the code's general fee. No match is `null`,
 * never zero: zero is a price, and nobody at the practice set it.
 */
export function feeForLine(
  schedule: readonly FeeScheduleEntry[],
  code: string,
  modifiers: readonly string[] = [],
): FeeScheduleEntry | null {
  const normalized = normalizeProcedureCode(code);
  const matches = schedule.filter((entry) => normalizeProcedureCode(entry.code) === normalized);
  for (const modifier of modifiers) {
    const specific = matches.find((entry) => entry.modifier === modifier.toUpperCase());
    if (specific) return specific;
  }
  return matches.find((entry) => entry.modifier === "") ?? null;
}

export function chargeTemplateForNoteTemplate(
  templates: readonly ChargeTemplate[],
  noteTemplateId: string | null | undefined,
): ChargeTemplate | null {
  if (!noteTemplateId) return null;
  return templates.find((template) => template.active && template.noteTemplateId === noteTemplateId) ?? null;
}

/**
 * Starter templates offered from the note templates the product ships.
 *
 * Offered, not seeded: a practice clicks to create them and can then change any
 * field. The code each one names is the one its note template already advertises,
 * so nothing here decides a code the product did not already show the clinician.
 */
export function starterChargeTemplates(
  noteTemplates: ReadonlyArray<{
    id: string;
    name: string;
    suggestedCoding: string;
    defaultPsychotherapyMinutes: number;
  }>,
): Array<Omit<ChargeTemplate, "id" | "organizationId" | "version" | "updatedBy" | "updatedAt">> {
  return noteTemplates.map((template) => {
    const code = normalizeProcedureCode(template.suggestedCoding.split(/\s|\+/).filter(Boolean)[0] ?? "");
    return {
      name: template.name,
      noteTemplateId: template.id,
      primaryCode: code,
      primaryDescription: template.name,
      addOnPolicy: template.defaultPsychotherapyMinutes > 0 ? "psychotherapy-time" : "none",
      placeOfServiceInPerson: "11",
      placeOfServiceTelehealth: "10",
      telehealthModifier: "95",
      active: true,
    };
  });
}

/** What still keeps a superbill from carrying the practice's identity. */
export function billingProfileGaps(
  profile: PracticeBillingProfile,
  provider: ProviderBillingIdentity | null,
): string[] {
  const gaps: string[] = [];
  if (!profile.legalName.trim()) gaps.push("Practice legal name");
  if (!profile.addressLine1.trim() || !profile.city.trim() || !profile.state.trim() || !profile.postalCode.trim()) {
    gaps.push("Practice address");
  }
  if (!profile.taxId.trim()) gaps.push("Practice tax ID");
  if (!provider || !provider.npi.trim()) gaps.push("Rendering provider NPI");
  return gaps;
}
