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

export type RelatedPersonRole =
  | "emergency-contact"
  | "guardian"
  | "legal-representative"
  | "caregiver"
  | "authorized-contact"
  | "other";

export const RELATED_PERSON_ROLES: readonly RelatedPersonRole[] = [
  "emergency-contact",
  "guardian",
  "legal-representative",
  "caregiver",
  "authorized-contact",
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
  relatedPeople: RelatedPerson[];
  careNetwork: CareNetworkMember[];
  coverage: CoveragePolicy[];
  pharmacies: PatientPharmacy[];
};

const ROLE_LABELS: Record<RelatedPersonRole, string> = {
  "emergency-contact": "Emergency contact",
  guardian: "Parent / guardian",
  "legal-representative": "Legal representative",
  caregiver: "Caregiver",
  "authorized-contact": "Authorized contact",
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

function parseDateOfBirth(dob: string): { year: number; month: number; day: number } | null {
  const value = (dob || "").trim();
  if (!value) return null;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };

  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return { year: Number(us[3]), month: Number(us[1]), day: Number(us[2]) };

  return null;
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
