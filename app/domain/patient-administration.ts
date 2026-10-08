/**
 * The administrative half of a patient record.
 *
 * Clinical truth (problems, allergies, medications, observations) already has a
 * normalized home. This is the rest of what a practice needs to operate a chart:
 * who the person is, how to reach them, who may be contacted about them, and which
 * clinicians outside this practice are involved in their care.
 *
 * Relationships are their own records rather than columns on the patient row. An
 * adolescent with two guardians, a legal representative and a school counsellor is
 * ordinary in psychiatry, and none of that fits in a fixed set of patient columns.
 */

/** Where the record stands administratively — distinct from the clinical `status`. */
export type PatientRecordStatus = "active" | "inactive" | "deceased" | "archived";

export const PATIENT_RECORD_STATUSES: readonly PatientRecordStatus[] = [
  "active",
  "inactive",
  "deceased",
  "archived",
];

export type PreferredContactMethod = "mobile" | "home" | "email" | "portal" | "mail";

export const PREFERRED_CONTACT_METHODS: readonly PreferredContactMethod[] = [
  "mobile",
  "home",
  "email",
  "portal",
  "mail",
];

/**
 * Permission to use a channel, recorded as a tri-state.
 *
 * `undefined` means nobody has asked yet, which is not the same as "no". Leaving a
 * voicemail about a psychiatric appointment without knowing the answer is a
 * disclosure decision, so the unknown state stays visible rather than defaulting.
 */
export type ContactPermission = boolean | undefined;

import type { PatientPhotoType, PatientIdCard } from "./patient";

export type PatientIdentity = {
  /** The name on the legal record. */
  legalName: string;
  /** What the patient is actually called, when it differs. */
  preferredName?: string;
  dob: string;
  /** Sex recorded for clinical/operational purposes; separate from gender identity. */
  sexAtBirth?: string;
  genderIdentity?: string;
  pronouns: string;
  mrn: string;
  preferredLanguage?: string;
  /** Needed for telehealth and for sending reminders at a sane local hour. */
  timeZone?: string;
  recordStatus: PatientRecordStatus;
  deceasedDate?: string;
  photoUrl?: string;
  photoType?: PatientPhotoType;
  idCard?: PatientIdCard;
};

export type PatientContact = {
  mobilePhone?: string;
  alternatePhone?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  preferredContactMethod?: PreferredContactMethod;
  allowVoicemail: ContactPermission;
  allowSms: ContactPermission;
  allowEmail: ContactPermission;
  contactNotes?: string;
};

/** Minimum patient details needed to identify a caller and hold calendar time. */
export type BookingPatientSummary = {
  id: string;
  name: string;
  dob: string;
  age: number;
  mrn: string;
  status: string;
  contact: Pick<PatientContact, "mobilePhone" | "email">;
};

export type RelatedPersonRole =
  | "emergency-contact"
  | "guardian"
  | "legal-representative"
  | "caregiver"
  | "authorized-contact"
  /** The person financially responsible for the account (guarantor). */
  | "responsible-party"
  | "other";

export const RELATED_PERSON_ROLES: readonly RelatedPersonRole[] = [
  "emergency-contact",
  "guardian",
  "legal-representative",
  "caregiver",
  "authorized-contact",
  "responsible-party",
  "other",
];

/**
 * How much may be discussed with this person.
 *
 * Someone can be the right person to call about a missed appointment and the wrong
 * person to discuss a diagnosis with. The scope is recorded per person rather than
 * inferred from their role.
 */
export type ContactConsentScope = "none" | "scheduling" | "clinical" | "full";

export const CONTACT_CONSENT_SCOPES: readonly ContactConsentScope[] = [
  "none",
  "scheduling",
  "clinical",
  "full",
];

export type RelatedPerson = {
  id: string;
  patientId: string;
  role: RelatedPersonRole;
  /** The everyday word for the relationship: "Mother", "Sister", "Case manager". */
  relationship?: string;
  name: string;
  phone?: string;
  alternatePhone?: string;
  email?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  consentScope: ContactConsentScope;
  /** Ordering within a role, so "first call in an emergency" is explicit. */
  priority: number;
  notes?: string;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
};

export type CareNetworkRole =
  | "pcp"
  | "referring"
  | "therapist"
  | "psychiatrist"
  | "case-manager"
  | "other";

export const CARE_NETWORK_ROLES: readonly CareNetworkRole[] = [
  "pcp",
  "referring",
  "therapist",
  "psychiatrist",
  "case-manager",
  "other",
];

export type CareNetworkMember = {
  id: string;
  patientId: string;
  role: CareNetworkRole;
  name: string;
  organization?: string;
  phone?: string;
  fax?: string;
  email?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  /** National Provider Identifier, when known. Not a vendor key. */
  npi?: string;
  relationshipNote?: string;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
};


/**
 * Coverage.
 *
 * Priority is explicit rather than inferred from insert order: which policy is
 * primary decides where a claim goes first, and getting it backwards is a denial.
 * Self-pay is a coverage state in its own right, not the absence of a record —
 * "nobody has entered insurance yet" and "this patient is paying privately" are
 * different facts to a front office.
 */
export type CoverageType = "commercial" | "medicare" | "medicaid" | "self-pay" | "other";

export const COVERAGE_TYPES: readonly CoverageType[] = [
  "commercial",
  "medicare",
  "medicaid",
  "self-pay",
  "other",
];

export type CoverageStatus = "active" | "inactive" | "terminated" | "entered-in-error";

export type SubscriberRelationship = "self" | "spouse" | "child" | "other";

export const SUBSCRIBER_RELATIONSHIPS: readonly SubscriberRelationship[] = [
  "self",
  "spouse",
  "child",
  "other",
];

export type CoveragePolicy = {
  id: string;
  patientId: string;
  payerName: string;
  planName?: string;
  memberId?: string;
  groupNumber?: string;
  subscriberName?: string;
  subscriberDob?: string;
  relationship?: string;
  coverageType: CoverageType;
  isSelfPay: boolean;
  /** 1 is primary, 2 secondary, and so on. */
  priority: number;
  status: CoverageStatus;
  effectiveDate?: string;
  terminationDate?: string;
};

/**
 * A pharmacy this patient uses.
 *
 * The internal id is ours; `ncpdpId` is the directory identifier a vendor would
 * recognise and is deliberately not the primary key, so changing e-prescribing
 * vendors does not rewrite every patient's pharmacy.
 */
export type PatientPharmacy = {
  pharmacyId: string;
  name: string;
  ncpdpId?: string;
  phone?: string;
  fax?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  /** 1 is the preferred destination for new prescriptions. */
  priority: number;
  status: "active" | "inactive";
};

export function coveragePriorityLabel(priority: number): string {
  if (priority <= 1) return "Primary";
  if (priority === 2) return "Secondary";
  if (priority === 3) return "Tertiary";
  return `Priority ${priority}`;
}

/** The policy a claim should go to first, if there is one. */
export function primaryCoverage(policies: readonly CoveragePolicy[]): CoveragePolicy | undefined {
  return [...policies]
    .filter((policy) => policy.status === "active")
    .sort((a, b) => a.priority - b.priority)[0];
}

/** The pharmacy new prescriptions should be sent to, if one is set. */
export function preferredPharmacy(pharmacies: readonly PatientPharmacy[]): PatientPharmacy | undefined {
  return [...pharmacies]
    .filter((pharmacy) => pharmacy.status === "active")
    .sort((a, b) => a.priority - b.priority)[0];
}

export type PatientAdministrativeRecord = {
  patientId: string;
  identity: PatientIdentity;
  contact: PatientContact;
  /** Additional registration details; empty until asked. */
  demographics?: PatientDemographicDetails;
  relatedPeople: RelatedPerson[];
  careNetwork: CareNetworkMember[];
  coverage: CoveragePolicy[];
  pharmacies: PatientPharmacy[];
};

/**
 * A front-desk view of facts already saved in the administrative record. These
 * are evidence pointers, not a second intake state machine: a form submission,
 * consent signature, or payer eligibility response needs its own record.
 */
export type IntakeAdministrativeStep = {
  id: "identity" | "contact" | "preferences" | "people" | "coverage" | "pharmacy";
  label: string;
  state: "recorded" | "needed" | "review";
  detail: string;
};

export function intakeAdministrativeSteps(record: PatientAdministrativeRecord): IntakeAdministrativeStep[] {
  const identityReady = Boolean(record.identity.legalName.trim())
    && ageFromDateOfBirth(record.identity.dob) !== undefined;
  const phoneReady = (record.contact.mobilePhone || "").replace(/\D/g, "").length >= 7;
  const emailReady = /^[^\s@]+\x40[^\s@]+\.[^\s@]+$/.test((record.contact.email || "").trim());
  const contactPermissionsAsked = record.contact.allowVoicemail !== undefined
    && record.contact.allowSms !== undefined
    && record.contact.allowEmail !== undefined;
  const activePerson = record.relatedPeople.some((person) =>
    person.status === "active" && (person.role === "guardian" || person.role === "emergency-contact")
  );
  const policy = primaryCoverage(record.coverage);
  const pharmacy = preferredPharmacy(record.pharmacies);

  return [
    {
      id: "identity", label: "Name and birth date",
      state: identityReady ? "recorded" : "needed",
      detail: identityReady ? "Recorded in the patient chart" : "Record a full name and valid birth date",
    },
    {
      id: "contact", label: "Callback phone and email",
      state: phoneReady && emailReady ? "recorded" : "needed",
      detail: phoneReady && emailReady
        ? "Both ways to follow up are recorded"
        : `${phoneReady ? "" : "Callback phone"}${!phoneReady && !emailReady ? " and " : ""}${emailReady ? "" : "email"} needed`,
    },
    {
      id: "preferences", label: "Contact permissions",
      state: contactPermissionsAsked ? "recorded" : "review",
      detail: contactPermissionsAsked
        ? "Voicemail, text, and email choices recorded"
        : "Ask what may be left or sent; unknown is not consent",
    },
    {
      id: "people", label: "Guardian or emergency contact",
      state: activePerson ? "recorded" : "review",
      detail: activePerson ? "A related person is on file" : "Add a contact if applicable",
    },
    {
      id: "coverage", label: "Coverage or self-pay",
      state: policy ? "recorded" : "needed",
      detail: policy
        ? policy.isSelfPay ? "Self-pay recorded" : `${policy.payerName} recorded; eligibility not verified`
        : "Record a policy or an explicit self-pay choice",
    },
    {
      id: "pharmacy", label: "Preferred pharmacy",
      state: pharmacy ? "recorded" : "review",
      detail: pharmacy ? pharmacy.name : "Ask and add when relevant to treatment",
    },
  ];
}

const ROLE_LABELS: Record<RelatedPersonRole, string> = {
  "emergency-contact": "Emergency contact",
  guardian: "Parent / guardian",
  "legal-representative": "Legal representative",
  caregiver: "Caregiver",
  "authorized-contact": "Authorized contact",
  "responsible-party": "Responsible party (guarantor)",
  other: "Other",
};

const CARE_ROLE_LABELS: Record<CareNetworkRole, string> = {
  pcp: "Primary care",
  referring: "Referring clinician",
  therapist: "Therapist",
  psychiatrist: "Psychiatrist",
  "case-manager": "Case manager",
  other: "Other",
};

const CONSENT_LABELS: Record<ContactConsentScope, string> = {
  none: "No disclosure",
  scheduling: "Scheduling only",
  clinical: "Clinical information",
  full: "Full access",
};

export function relatedPersonRoleLabel(role: RelatedPersonRole): string {
  return ROLE_LABELS[role] ?? ROLE_LABELS.other;
}

export function careNetworkRoleLabel(role: CareNetworkRole): string {
  return CARE_ROLE_LABELS[role] ?? CARE_ROLE_LABELS.other;
}

export function consentScopeLabel(scope: ContactConsentScope): string {
  return CONSENT_LABELS[scope] ?? CONSENT_LABELS.none;
}

/**
 * Age, derived from date of birth.
 *
 * Age was previously a stored column, which meant every chart quietly aged out of
 * date between writes. Date of birth is the fact; age is a view of it.
 *
 * Accepts the ISO dates the database stores and the `MM/DD/YYYY` form the seed
 * fixtures and intake forms use.
 */
export function ageFromDateOfBirth(dob: string, now: Date = new Date()): number | undefined {
  const parsed = parseDateOfBirth(dob);
  if (!parsed) return undefined;

  let age = now.getFullYear() - parsed.year;
  const beforeBirthdayThisYear =
    now.getMonth() + 1 < parsed.month ||
    (now.getMonth() + 1 === parsed.month && now.getDate() < parsed.day);
  if (beforeBirthdayThisYear) age -= 1;
  return age >= 0 && age < 150 ? age : undefined;
}

/** A held caller slot must point to enough recorded identity/contact to follow up. */
export function tentativeIntakeError(input: {
  name: string;
  dob: string;
  phone?: string;
  email?: string;
}): string | null {
  if (!input.name.trim()) return "Enter the patient's full name.";
  if (ageFromDateOfBirth(input.dob) === undefined) return "Enter a valid date of birth.";
  if ((input.phone || "").replace(/\D/g, "").length < 7) return "Enter a callback phone number with at least 7 digits.";
  if (!/^[^\s@]+\x40[^\s@]+\.[^\s@]+$/.test((input.email || "").trim())) return "Enter a valid email address.";
  return null;
}

function parseDateOfBirth(dob: string): { year: number; month: number; day: number } | null {
  const value = (dob || "").trim();
  if (!value) return null;

  function validDate(year: number, month: number, day: number) {
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
      ? { year, month, day }
      : null;
  }

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return validDate(Number(us[3]), Number(us[1]), Number(us[2]));

  return null;
}

/**
 * A date of birth as YYYY-MM-DD, whichever accepted shape it was stored in, or null
 * when it cannot be read. Records hold both "04/18/1992" (seeded and typed charts)
 * and "1992-04-18" (date inputs), so identity checks must compare this, never the
 * raw text: a raw comparison hid duplicate charts and refused a patient's own
 * correct birth date at the portal.
 */
export function normalizeDateOfBirth(dob: string | null | undefined): string | null {
  const parsed = parseDateOfBirth(dob ?? "");
  if (!parsed) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parsed.year}-${pad(parsed.month)}-${pad(parsed.day)}`;
}

/** True only when both are readable and name the same calendar day. */
export function sameDateOfBirth(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeDateOfBirth(a);
  return left !== null && left === normalizeDateOfBirth(b);
}

/** One display shape (MM/DD/YYYY) for a date of birth; unreadable text is shown as given. */
export function formatDateOfBirth(dob: string | null | undefined): string {
  const normalized = normalizeDateOfBirth(dob);
  if (!normalized) return (dob ?? "").trim();
  const [year, month, day] = normalized.split("-");
  return `${month}/${day}/${year}`;
}

/**
 * Every written form of a date of birth a search should match: as stored, as
 * displayed (MM/DD/YYYY) and as ISO. Searching only the stored text missed the
 * date exactly as the screen shows it.
 */
export function dateOfBirthSearchText(dob: string | null | undefined): string {
  return [dob ?? "", formatDateOfBirth(dob), normalizeDateOfBirth(dob) ?? ""].join(" ");
}

/** The name to show, preferring what the patient actually goes by. */
export function displayPatientName(identity: Pick<PatientIdentity, "legalName" | "preferredName">): string {
  return identity.preferredName?.trim() || identity.legalName;
}

/**
 * Whether a channel may be used right now.
 *
 * Unknown is treated as "do not use" at the point of contact, while staying visible
 * as unknown in the record so someone can ask.
 */
export function mayContactBy(permission: ContactPermission): boolean {
  return permission === true;
}

/** A US number as (480) 555-0100; anything else as entered. */
export function formatPhoneNumber(phone: string | null | undefined): string {
  const raw = (phone ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return raw;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

/**
 * The callback phone and payment method the chart header shows beside identity.
 *
 * Both come from the administrative record. "Not recorded" is said as itself, and
 * self-pay is named as a payment method rather than shown as missing insurance.
 */
export function chartHeaderAccountSummary(
  record: Pick<PatientAdministrativeRecord, "contact" | "coverage">,
): { phone: string | null; coverage: string | null; coverageDetail: string | null } {
  const phone = record.contact.mobilePhone?.trim() || record.contact.alternatePhone?.trim() || "";
  const policy = primaryCoverage(record.coverage);
  let coverage: string | null = null;
  let coverageDetail: string | null = null;
  if (policy?.isSelfPay || policy?.coverageType === "self-pay") {
    coverage = "Self-pay";
  } else if (policy) {
    coverage = policy.payerName;
    coverageDetail = policy.planName?.trim() || null;
  }
  return { phone: phone ? formatPhoneNumber(phone) : null, coverage, coverageDetail };
}

/**
 * Demographics beyond identity: what a registration "Additional info" page holds.
 *
 * Every field is optional and "Declined" is its own answer, distinct from "not
 * asked yet", for the same reason self-pay is distinct from missing coverage.
 * Race and ethnicity use the 2024 federal (SPD 15) minimum categories and allow
 * more than one.
 */
export const RACE_ETHNICITY_OPTIONS = [
  "American Indian or Alaska Native",
  "Asian",
  "Black or African American",
  "Hispanic or Latino",
  "Middle Eastern or North African",
  "Native Hawaiian or Pacific Islander",
  "White",
  "Declined",
] as const;

export const SEXUAL_ORIENTATION_OPTIONS = [
  "Straight or heterosexual",
  "Lesbian or gay",
  "Bisexual",
  "Something else",
  "Don't know",
  "Declined",
] as const;

export const MARITAL_STATUS_OPTIONS = [
  "Single",
  "Married",
  "Domestic partner",
  "Separated",
  "Divorced",
  "Widowed",
  "Declined",
] as const;

export const EDUCATION_OPTIONS = [
  "Less than high school",
  "High school or GED",
  "Some college",
  "Associate degree",
  "Bachelor's degree",
  "Graduate degree",
  "Declined",
] as const;

export type PatientDemographicDetails = {
  raceEthnicity?: string[];
  sexualOrientation?: string;
  maritalStatus?: string;
  previousName?: string;
  occupation?: string;
  employer?: string;
  education?: string;
  religiousAffiliation?: string;
  /** The clinician primarily responsible for this patient in the practice. */
  primaryProvider?: string;
  /** How the patient came to the practice: self, physician, insurer, website… */
  referralSource?: string;
  /** Who referred them, when someone did. */
  referredBy?: string;
};

const DETAIL_TEXT_FIELDS = [
  "sexualOrientation", "maritalStatus", "previousName", "occupation", "employer",
  "education", "religiousAffiliation", "primaryProvider", "referralSource", "referredBy",
] as const;

/** Keeps known fields only, trims text, and drops unknown race/ethnicity values. */
export function cleanDemographicDetails(input: unknown): PatientDemographicDetails {
  const raw = (input ?? {}) as Record<string, unknown>;
  const details: PatientDemographicDetails = {};
  for (const field of DETAIL_TEXT_FIELDS) {
    const value = raw[field];
    if (typeof value === "string") details[field] = value.trim().slice(0, 200);
  }
  if (Array.isArray(raw.raceEthnicity)) {
    const allowed = new Set<string>(RACE_ETHNICITY_OPTIONS);
    const values = [...new Set(raw.raceEthnicity.filter((v): v is string => typeof v === "string" && allowed.has(v)))];
    details.raceEthnicity = values.includes("Declined") ? ["Declined"] : values;
  }
  return details;
}
