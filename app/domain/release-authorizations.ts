/**
 * Release of information (ROI): a patient's written authorization for the
 * practice to share their records with, or obtain records from, a named party.
 *
 * The record holds the elements an authorization needs to be valid — what is
 * shared, with whom, for what purpose, until when, and the patient's signature —
 * plus the statements the patient must be told: they may revoke it in writing,
 * treatment does not depend on signing, and information shared may be
 * redisclosed by the recipient. Substance-use-disorder treatment records carry
 * stricter rules and are only included when named explicitly, with their own
 * notice. Psychotherapy notes need a separate authorization and are not offered.
 *
 * The text the patient reads is fixed when the request is created and stored with
 * the record, so what was signed is exactly what was shown. The wording is a
 * prototype default; a practice's own counsel-reviewed text should replace it
 * before real patients sign (P11).
 */
export type ReleaseDirection = "release-to" | "obtain-from" | "exchange";

export const RELEASE_DIRECTION_LABELS: Record<ReleaseDirection, string> = {
  "release-to": "Share my records with",
  "obtain-from": "Get my records from",
  exchange: "Share with and get records from",
};

export const RELEASE_CATEGORIES = [
  { id: "diagnoses", label: "Diagnoses and problem list" },
  { id: "medications", label: "Medications and prescriptions" },
  { id: "treatment-summary", label: "Treatment plan and summaries" },
  { id: "visit-notes", label: "Visit notes (not psychotherapy notes)" },
  { id: "assessments", label: "Rating scales and assessments" },
  { id: "labs", label: "Lab results" },
  { id: "attendance", label: "Appointment dates and attendance" },
  { id: "billing", label: "Billing and insurance information" },
  { id: "substance-use", label: "Substance use disorder treatment records" },
] as const;

export type ReleaseCategory = (typeof RELEASE_CATEGORIES)[number]["id"];

const CATEGORY_LABELS = new Map<string, string>(RELEASE_CATEGORIES.map((c) => [c.id, c.label]));

export type ReleaseDraft = {
  direction: ReleaseDirection;
  partyName: string;
  partyOrganization?: string;
  partyPhone?: string;
  partyFax?: string;
  partyAddress?: string;
  categories: ReleaseCategory[];
  purpose: string;
  /** YYYY-MM-DD. */
  expiresOn: string;
};

export type ReleaseStatus = "requested" | "signed" | "revoked" | "expired";

export type ReleaseAuthorization = ReleaseDraft & {
  id: string;
  patientId: string;
  status: ReleaseStatus;
  authorizationText: string;
  createdAt: string;
  createdByName: string;
  invitationId?: string;
  signedAt?: string;
  signerName?: string;
  revokedAt?: string;
  revokedByName?: string;
  revocationNote?: string;
};

/** Validates a draft from a request body. Returns the first problem or the clean draft. */
export function normalizeReleaseDraft(input: unknown, today: string): { draft: ReleaseDraft } | { error: string } {
  const raw = (input ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const direction = raw.direction as ReleaseDirection;
  if (!(direction in RELEASE_DIRECTION_LABELS)) return { error: "Choose whether records are shared, obtained, or both." };
  const partyName = text(raw.partyName);
  if (!partyName) return { error: "Name the person or organization the release is with." };
  const categories = Array.isArray(raw.categories)
    ? [...new Set(raw.categories.filter((c): c is ReleaseCategory => CATEGORY_LABELS.has(c as string)))]
    : [];
  if (categories.length === 0) return { error: "Choose what information the release covers." };
  const purpose = text(raw.purpose);
  if (!purpose) return { error: "State the purpose of the release." };
  const expiresOn = text(raw.expiresOn);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || Number.isNaN(Date.parse(`${expiresOn}T00:00:00Z`))) {
    return { error: "Give the date the release expires." };
  }
  if (expiresOn <= today) return { error: "The expiry date must be after today." };
  return {
    draft: {
      direction,
      partyName,
      partyOrganization: text(raw.partyOrganization) || undefined,
      partyPhone: text(raw.partyPhone) || undefined,
      partyFax: text(raw.partyFax) || undefined,
      partyAddress: text(raw.partyAddress) || undefined,
      categories,
      purpose,
      expiresOn,
    },
  };
}

export function releasePartyLabel(release: Pick<ReleaseDraft, "partyName" | "partyOrganization">): string {
  return release.partyOrganization ? `${release.partyName}, ${release.partyOrganization}` : release.partyName;
}

/** A short title: "Release of information — share with Dr. Lee, Valley Clinic". */
export function releaseTitle(release: Pick<ReleaseDraft, "direction" | "partyName" | "partyOrganization">): string {
  const verb = release.direction === "release-to" ? "share with" : release.direction === "obtain-from" ? "get from" : "exchange with";
  return `Release of information — ${verb} ${releasePartyLabel(release)}`;
}

/** Effective status: a signed release past its expiry reads as expired. */
export function releaseStatus(release: Pick<ReleaseAuthorization, "status" | "expiresOn">, today: string): ReleaseStatus {
  if ((release.status === "signed" || release.status === "requested") && release.expiresOn < today) return "expired";
  return release.status;
}

/** The authorization the patient reads and signs, fixed at request time. */
export function releaseAuthorizationText(
  draft: ReleaseDraft,
  patient: { name: string; dob?: string },
  practiceName: string,
): string {
  const party = [releasePartyLabel(draft), draft.partyAddress, draft.partyPhone && `phone ${draft.partyPhone}`, draft.partyFax && `fax ${draft.partyFax}`]
    .filter(Boolean)
    .join("; ");
  const who =
    draft.direction === "release-to"
      ? `${practiceName} to share my health information with ${party}.`
      : draft.direction === "obtain-from"
        ? `${party} to share my health information with ${practiceName}.`
        : `${practiceName} and ${party} to share my health information with each other.`;
  const lines = [
    `Patient: ${patient.name}${patient.dob ? ` (date of birth ${patient.dob})` : ""}`,
    "",
    `I authorize ${who}`,
    "",
    "Information covered:",
    ...draft.categories.map((c) => `• ${CATEGORY_LABELS.get(c) ?? c}`),
    "",
    `Purpose: ${draft.purpose}`,
    `This authorization expires on ${draft.expiresOn}.`,
    "",
    "I understand that:",
    `• I may revoke this authorization at any time by telling ${practiceName} in writing, except for information already shared because of it.`,
    "• My treatment, payment, enrollment or eligibility for benefits will not depend on whether I sign it.",
    "• Information shared under this authorization may be shared again by the recipient and may no longer be protected by federal privacy law.",
    "• I may ask for a copy of this authorization.",
  ];
  if (draft.categories.includes("substance-use")) {
    lines.push(
      "",
      "Substance use disorder records: these records are protected by federal confidentiality rules (42 CFR Part 2). " +
        "I specifically consent to sharing them as described above. A recipient may use or share them again only as that law allows, " +
        "including its limits on using them in legal proceedings against me.",
    );
  }
  return lines.join("\n");
}
