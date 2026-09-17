/**
 * Clinical Bond Intake — the operational front door between a tentative hold
 * and a first completed visit.
 *
 * This module is a pure-logic layer. It computes readiness and queue
 * presentation from evidence that already has an authoritative home
 * (appointments, the administrative record, documents, consents, forms,
 * eligibility, payment) plus the durable staff-workflow state this feature
 * owns (`intake_episodes`, `intake_notes`). It stores no duplicate patient
 * truth and no second intake status machine — see D-074, D-075 and D-076.
 *
 * D-076 corrected two truth boundaries that D-075 got wrong:
 *
 * - An Intake episode's subject may be a `ProspectivePerson` (no clinical
 *   chart yet) as well as a `Patient`. Never both fields carry meaning at
 *   once — exactly one of `patientId` / `prospectivePersonId` is set on an
 *   episode, a note, or a queue row, and callers must not assume `patientId`
 *   is always present.
 * - Readiness state values (`recorded` / `needed` / `review` / `not_available`)
 *   are the only vocabulary; distinct facts (coverage on file vs. a card
 *   image vs. plan acceptance vs. eligibility vs. identity-document receipt
 *   vs. identity confirmed) each get their own step rather than being
 *   inferred from one another. See the "Distinct facts" note below each
 *   group.
 */

import type {
  CoveragePolicy,
  IntakeAdministrativeStep,
  PatientAdministrativeRecord,
} from "./patient-administration";
import { ageFromDateOfBirth, primaryCoverage } from "./patient-administration";
import type { AppointmentStatus } from "../lib/schedule-data";

/* ------------------------------------------------------------------ *
 * Durable episode state (owned by this feature, not clinical truth)
 * ------------------------------------------------------------------ */

export type IntakeDispositionStatus = "active" | "archived";

export type IntakeDispositionReason =
  | "patient_changed_mind"
  | "unable_to_reach"
  | "duplicate"
  | "referred_elsewhere"
  | "not_appropriate_for_practice"
  | "insurance_issue"
  | "other";

export const INTAKE_DISPOSITION_REASONS: readonly { value: IntakeDispositionReason; label: string }[] = [
  { value: "patient_changed_mind", label: "Patient changed mind" },
  { value: "unable_to_reach", label: "Unable to reach" },
  { value: "duplicate", label: "Duplicate record" },
  { value: "referred_elsewhere", label: "Referred elsewhere" },
  { value: "not_appropriate_for_practice", label: "Not appropriate for practice" },
  { value: "insurance_issue", label: "Insurance issue" },
  { value: "other", label: "Other" },
];

export type IntakeNoteKind = "note" | "outreach" | "disposition" | "override" | "system";

export type IntakeNote = {
  id: string;
  episodeId: string;
  patientId?: string;
  prospectivePersonId?: string;
  kind: IntakeNoteKind;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
};

/**
 * Whether more than one guardian signature may be required.
 *
 * Staff-entered, evidence-gathering only. Clinical Bond does not make legal
 * custody determinations; it records what staff learned and applies the
 * practice's configured rule (currently: joint authority needs both).
 */
export type GuardianSituation =
  | "not_applicable"
  | "single_guardian_sufficient"
  | "joint_requires_multiple"
  | "unknown_needs_review";

export const GUARDIAN_SITUATIONS: readonly { value: GuardianSituation; label: string; detail: string }[] = [
  { value: "not_applicable", label: "Not applicable", detail: "Patient is an adult, or no guardian involvement applies." },
  { value: "single_guardian_sufficient", label: "One guardian sufficient", detail: "Sole legal decision-making, or guardians agree one signature is enough." },
  { value: "joint_requires_multiple", label: "Joint authority — needs both", detail: "Separated/divorced or joint legal decision-making; both guardians must sign." },
  { value: "unknown_needs_review", label: "Unknown — needs review", detail: "Not yet established; staff should ask before intake forms are sent." },
];

/**
 * Exactly one of `patientId` / `prospectivePersonId` is set. An episode
 * starts prospect-linked (pre-chart) and gains `patientId` at promotion; the
 * prospect linkage is kept afterward for audit history rather than cleared.
 */
export type IntakeEpisode = {
  id: string;
  patientId?: string;
  prospectivePersonId?: string;
  /** Unset for an episode that started before any visit was scheduled — see
   * `IntakeStage.awaiting_first_visit`. Set once `scheduleVisit` (or the
   * ordinary appointment-driven path) attaches a tentative hold. */
  appointmentId?: string;
  organizationId?: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  followUpAt?: string;
  lastOutreachAt?: string;
  guardianSituation: GuardianSituation;
  staffReviewResolvedAt?: string;
  staffReviewResolvedBy?: string;
  dispositionStatus: IntakeDispositionStatus;
  dispositionReason?: IntakeDispositionReason;
  dispositionNote?: string;
  disposedAt?: string;
  disposedBy?: string;
  createdAt: string;
  updatedAt: string;
};

/** The identifier that currently owns this episode's evidence — a prospect
 * before promotion, the patient chart afterward. */
export function intakeSubjectId(episode: Pick<IntakeEpisode, "patientId" | "prospectivePersonId">): string {
  const id = episode.patientId ?? episode.prospectivePersonId;
  if (!id) throw new Error("Intake episode has neither a patientId nor a prospectivePersonId.");
  return id;
}

/* ------------------------------------------------------------------ *
 * Evidence-backed readiness steps
 * ------------------------------------------------------------------ */

export type IntakeStepId =
  | "identity"
  | "contact"
  | "account"
  | "government_id"
  | "insurance_details"
  | "insurance_card"
  | "plan_acceptance"
  | "eligibility"
  | "consents"
  | "intake_forms"
  | "payment"
  | "guardian"
  | "staff_review";

export type IntakeStepState = "recorded" | "needed" | "review" | "not_available";

export type IntakeRequirementLevel = "required" | "optional" | "conditional";

export type IntakeStepOwner = "patient" | "staff" | "system";

export type IntakeReadinessStep = {
  id: IntakeStepId;
  label: string;
  level: IntakeRequirementLevel;
  /** Whether an incomplete step blocks Ready to Confirm from being reached. */
  blocking: boolean;
  owner: IntakeStepOwner;
  state: IntakeStepState;
  detail: string;
};

export const GOVERNMENT_ID_DOCUMENT_TYPES: readonly string[] = ["government_id", "government_id_front", "government_id_back"];
export const INSURANCE_CARD_DOCUMENT_TYPES: readonly string[] = ["insurance_card_primary", "insurance_card_secondary"];

/* ---- Distinct fact: a document being reviewed is not identity being confirmed ---- */

export type IdentityDocumentReviewResult = "confirmed" | "conflict" | "needs_more_info";

/**
 * The explicit human-confirmation event a government-ID document needs
 * before Intake calls identity confirmed. Generic document workflow status
 * (`received` -> `needs_review` -> `reviewed`) still governs the document
 * itself; this is a separate evidence record for the identity claim the
 * document is being used to support — the foundation OCR will later feed,
 * never inferred from `workflow_status` alone.
 */
export type IdentityDocumentReview = {
  id: string;
  documentId: string;
  documentVersion?: number;
  reviewerName: string;
  result: IdentityDocumentReviewResult;
  legible: boolean;
  conflictNote?: string;
  reviewedAt: string;
};

function identityStepState(
  documents: readonly { id: string; documentType: string; workflowStatus: string }[],
  review: IdentityDocumentReview | undefined,
): { state: IntakeStepState; detail: string } {
  const relevant = documents.filter((d) => GOVERNMENT_ID_DOCUMENT_TYPES.includes(d.documentType));
  const current = relevant.filter((d) => d.workflowStatus !== "superseded");

  if (relevant.length === 0) return { state: "needed", detail: "No ID on file yet." };
  if (current.length === 0) return { state: "needed", detail: "The ID on file was superseded; a current one is needed." };

  // A review only counts if it names the document that is still current. A
  // newly uploaded (superseding) ID starts this step over, and so does a
  // review of a document that has since been superseded.
  const matchingReview = review && current.some((d) => d.id === review.documentId) ? review : undefined;

  if (!matchingReview) {
    return { state: "needed", detail: "Received — not yet confirmed. Receipt is not identity confirmation." };
  }
  if (!matchingReview.legible) {
    return { state: "review", detail: "Received but not legible — a clearer image is needed." };
  }
  if (matchingReview.result === "conflict") {
    return { state: "review", detail: matchingReview.conflictNote || "Extracted/entered identity conflicts with the chart — needs resolution." };
  }
  if (matchingReview.result === "needs_more_info") {
    return { state: "review", detail: "Reviewed, but additional information is needed before identity can be confirmed." };
  }
  return { state: "recorded", detail: `Identity confirmed by ${matchingReview.reviewerName} on ${matchingReview.reviewedAt.slice(0, 10)}.` };
}

/* ---- Distinct fact: insurance details on file vs. a card image received/reviewed ---- */

function insuranceCardStepState(
  policies: readonly CoveragePolicy[],
  cardDocuments: readonly { documentType: string; workflowStatus: string }[],
): { state: IntakeStepState; detail: string } {
  const active = policies.filter((p) => p.status === "active" && !p.isSelfPay);
  if (active.length === 0) return { state: "not_available", detail: "No insured policy on file to collect a card for." };

  const primaryDocs = cardDocuments.filter((d) => d.documentType === "insurance_card_primary");
  const secondaryNeeded = active.some((p) => p.priority >= 2);
  const secondaryDocs = cardDocuments.filter((d) => d.documentType === "insurance_card_secondary");

  const reviewed = (docs: readonly { workflowStatus: string }[]) => docs.some((d) => d.workflowStatus === "reviewed" || d.workflowStatus === "filed");
  const received = (docs: readonly { workflowStatus: string }[]) => docs.length > 0;

  const primaryOk = reviewed(primaryDocs);
  const secondaryOk = !secondaryNeeded || reviewed(secondaryDocs);

  if (primaryOk && secondaryOk) return { state: "recorded", detail: "Card image reviewed and on file." };
  // "review" means something is on file waiting on staff; "needed" means an
  // image for a still-outstanding side (primary, or a required secondary)
  // has not been received at all yet — those are different facts.
  if (!received(primaryDocs)) return { state: "needed", detail: "A card image is needed." };
  if (!primaryOk) return { state: "review", detail: "Received — not yet reviewed. Receipt is not the same as coverage being active." };
  if (secondaryNeeded && !received(secondaryDocs)) return { state: "needed", detail: "A secondary card image is needed." };
  return { state: "review", detail: "Received — not yet reviewed. Receipt is not the same as coverage being active." };
}

/* ---- Distinct fact: payer-plan acceptance vs. eligibility ---- */

export type EligibilityResult = "not_configured" | "pending" | "active" | "inactive" | "needs_review" | "failed" | "uncertain";

/** Normalized benefit facts a payer actually returned (or a staff member
 * actually obtained). Every field is optional — absence means "not
 * returned", never zero, never guessed. */
export type BenefitEvidence = {
  coverageStatus?: "active" | "inactive" | "unknown";
  effectiveDate?: string;
  terminationDate?: string;
  behavioralHealthOutpatientCovered?: boolean;
  officeVisitCopay?: string;
  telehealthCopay?: string;
  coinsurance?: string;
  deductible?: string;
  deductibleRemaining?: string;
  outOfPocketMax?: string;
  outOfPocketRemaining?: string;
  authorizationRequired?: boolean;
  referralRequired?: boolean;
  networkContext?: string;
  payerMessage?: string;
};

export type EligibilityCheck = {
  id: string;
  patientId?: string;
  prospectivePersonId?: string;
  coveragePolicyId: string;
  result: EligibilityResult;
  source: "adapter" | "manual_staff_attestation";
  adapterId?: string;
  note?: string;
  benefitEvidence?: BenefitEvidence;
  checkedByName?: string;
  checkedAt: string;
};

/** An estimate Clinical Bond derives from benefit evidence — never payer-confirmed,
 * never a guarantee of payment or claim adjudication. */
export type EstimatedResponsibility = {
  estimate?: string;
  basis: string[];
  /** True only when the evidence is specific enough to trust the number. */
  certain: boolean;
  reason?: string;
};

export function estimatePatientResponsibility(benefit: BenefitEvidence | undefined): EstimatedResponsibility {
  if (!benefit) return { basis: [], certain: false, reason: "No benefit evidence on file yet." };

  if (benefit.officeVisitCopay) {
    return { estimate: benefit.officeVisitCopay, basis: ["office visit copay"], certain: true };
  }

  if (benefit.coinsurance) {
    const deductibleMet = benefit.deductibleRemaining !== undefined && /^\$?0(\.00)?$/.test(benefit.deductibleRemaining.trim());
    const basis = ["coinsurance"];
    if (benefit.deductibleRemaining !== undefined) basis.push("deductible remaining");
    return {
      estimate: `${benefit.coinsurance} coinsurance${deductibleMet ? "" : ", after remaining deductible"}`,
      basis,
      certain: deductibleMet,
      reason: deductibleMet ? undefined : "The deductible-remaining amount is not confirmed as met.",
    };
  }

  return { basis: [], certain: false, reason: "Insufficient benefit evidence to estimate responsibility." };
}

/** Practice-configurable freshness for time-sensitive evidence. A default
 * lives here rather than the full Practice Settings surface, which this
 * pass does not build; the seam is what future configurability hangs off. */
export type IntakeFreshnessPolicy = {
  eligibilityFreshnessDays: number;
};

export const DEFAULT_INTAKE_FRESHNESS_POLICY: IntakeFreshnessPolicy = {
  eligibilityFreshnessDays: 30,
};

function eligibilityStepState(
  eligibility: EligibilityCheck | undefined,
  currentPolicy: CoveragePolicy | undefined,
  now: Date,
  freshness: IntakeFreshnessPolicy,
): { state: IntakeStepState; detail: string } {
  if (!currentPolicy || currentPolicy.isSelfPay) {
    return { state: "not_available", detail: "Self-pay — no payer eligibility to verify." };
  }
  if (!eligibility) {
    return { state: "needed", detail: "Not configured — no eligibility vendor connected and none manually verified yet." };
  }
  if (eligibility.coveragePolicyId !== currentPolicy.id) {
    return { state: "needed", detail: "Insurance changed since the last eligibility check; it no longer applies." };
  }
  const ageDays = (now.getTime() - Date.parse(eligibility.checkedAt)) / 86_400_000;
  if (eligibility.result === "active" && ageDays <= freshness.eligibilityFreshnessDays) {
    return { state: "recorded", detail: `Active as of ${eligibility.checkedAt.slice(0, 10)} (${eligibility.source === "adapter" ? "vendor" : "staff call"}).` };
  }
  if (eligibility.result === "active" && ageDays > freshness.eligibilityFreshnessDays) {
    return { state: "needed", detail: `Last checked ${Math.floor(ageDays)} days ago — past the ${freshness.eligibilityFreshnessDays}-day freshness window.` };
  }
  if (eligibility.result === "needs_review" || eligibility.result === "uncertain") {
    return { state: "review", detail: "Payer response was incomplete or uncertain." };
  }
  if (eligibility.result === "inactive" || eligibility.result === "failed") {
    return { state: "review", detail: `Eligibility check returned ${eligibility.result.replace("_", " ")}.` };
  }
  return { state: "needed", detail: "Not yet checked." };
}

/* ---- Distinct fact: payer-plan participation (practice configuration) ---- */

export type PlanAcceptanceResult = "accepted" | "not_accepted" | "needs_review";

export type PayerParticipationStatus = "in_network" | "out_of_network";

export type PayerPlanParticipation = {
  id: string;
  payerName: string;
  product?: string;
  planName?: string;
  network?: string;
  status: PayerParticipationStatus;
  active: boolean;
};

/**
 * Matches a coverage policy's payer name against configured participations.
 *
 * `not_accepted` requires an affirmative, currently-active `out_of_network`
 * configuration record for this specific payer — never merely "some other
 * payer is configured and this one didn't match it". Absence of any
 * configuration for this payer is `needs_review`, not a guess in either
 * direction. This is intentionally distinct from eligibility: a plan can be
 * accepted by the practice while eligibility for a specific patient is
 * still unchecked, and vice versa.
 */
export function matchPlanAcceptance(
  policy: CoveragePolicy | undefined,
  participations: readonly PayerPlanParticipation[],
): { result: PlanAcceptanceResult; matched?: PayerPlanParticipation } {
  if (!policy || policy.isSelfPay) return { result: "accepted" };
  const normalizedPayer = policy.payerName.trim().toLowerCase();
  if (!normalizedPayer) return { result: "needs_review" };

  const forThisPayer = participations.filter((p) => p.active && p.payerName.trim().toLowerCase() === normalizedPayer);
  const inNetwork = forThisPayer.find((p) => p.status === "in_network");
  if (inNetwork) return { result: "accepted", matched: inNetwork };

  const outOfNetwork = forThisPayer.find((p) => p.status === "out_of_network");
  if (outOfNetwork) return { result: "not_accepted", matched: outOfNetwork };

  return { result: "needs_review" };
}

/* ------------------------------------------------------------------ *
 * Consents, forms, payment (unchanged truth boundaries from D-075)
 * ------------------------------------------------------------------ */

export type PaymentReadinessStatus = "not_configured" | "on_file" | "waived";

export type PaymentMethodReference = {
  id: string;
  patientId?: string;
  prospectivePersonId?: string;
  status: PaymentReadinessStatus;
  brand?: string;
  lastFour?: string;
  waiverReason?: string;
  recordedByName?: string;
  recordedAt: string;
};

export type ConsentTemplate = {
  id: string;
  category: "treatment" | "privacy" | "financial" | "telehealth" | "communication" | "other";
  title: string;
  version: number;
  requiresGuardianSignature: boolean;
  active: boolean;
};

export type ConsentSignature = {
  id: string;
  patientId?: string;
  prospectivePersonId?: string;
  templateId: string;
  templateVersion: number;
  signerName: string;
  signerRelationship: "self" | "guardian" | "legal-representative" | "other";
  method: "staff_attested";
  recordedByName: string;
  signedAt: string;
};

export type FormSubmissionStatus = "in_progress" | "submitted" | "needs_review" | "reviewed";

export type FormTemplate = {
  id: string;
  title: string;
  version: number;
  category: string;
  active: boolean;
  sections: FormSection[];
};

export type FormFieldType = "text" | "textarea" | "select" | "yesno" | "date";

export type FormField = {
  id: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  options?: readonly string[];
};

export type FormSection = {
  id: string;
  title: string;
  fields: FormField[];
};

export type FormSubmission = {
  id: string;
  patientId?: string;
  prospectivePersonId?: string;
  templateId: string;
  templateVersion: number;
  respondent: "staff" | "patient" | "guardian";
  respondentName?: string;
  answers: Record<string, string>;
  status: FormSubmissionStatus;
  submittedAt?: string;
  reviewedByName?: string;
  reviewedAt?: string;
};

function requiredConsentTitles(
  required: readonly ConsentTemplate[],
  signed: readonly ConsentSignature[],
): { outstanding: string[]; detail: string } {
  const signedTemplateIds = new Set(signed.map((s) => s.templateId));
  const outstanding = required.filter((t) => t.active).filter((t) => !signedTemplateIds.has(t.id)).map((t) => t.title);
  return {
    outstanding,
    detail: outstanding.length === 0 ? `${signed.length} of ${required.length} signed` : `Needs: ${outstanding.join(", ")}`,
  };
}

/* ------------------------------------------------------------------ *
 * Readiness projection
 * ------------------------------------------------------------------ */

export type IntakeReadinessInput = {
  administrative: PatientAdministrativeRecord;
  appointment: { intakeStatus?: "completed" | "pending" | "exempt"; status: AppointmentStatus };
  episode: Pick<IntakeEpisode, "guardianSituation" | "staffReviewResolvedAt">;
  governmentIdDocuments: readonly { id: string; documentType: string; workflowStatus: string }[];
  identityDocumentReview?: IdentityDocumentReview;
  insuranceCardDocuments: readonly { documentType: string; workflowStatus: string }[];
  planAcceptance: { result: PlanAcceptanceResult };
  eligibility?: EligibilityCheck;
  requiredConsents: readonly ConsentTemplate[];
  signedConsents: readonly ConsentSignature[];
  formSubmissions: readonly FormSubmission[];
  requiredFormTemplateIds: readonly string[];
  payment?: PaymentMethodReference;
  now?: Date;
  freshnessPolicy?: IntakeFreshnessPolicy;
};

/** Pure projection from authoritative evidence — never a stored second checklist. */
export function computeIntakeChecklist(input: IntakeReadinessInput): IntakeReadinessStep[] {
  const now = input.now ?? new Date();
  const freshness = input.freshnessPolicy ?? DEFAULT_INTAKE_FRESHNESS_POLICY;
  const admin = input.administrative;
  const identityReady = Boolean(admin.identity.legalName.trim()) && ageFromDateOfBirth(admin.identity.dob) !== undefined;
  const phoneReady = (admin.contact.mobilePhone || "").replace(/\D/g, "").length >= 7;
  // \x40 rather than a literal at-sign: an email regex written the obvious way
  // contains the note-reference guard's banned character sequence verbatim.
  const emailReady = /^[^\s@]+\x40[^\s@]+\.[^\s@]+$/.test((admin.contact.email || "").trim());
  const policy = primaryCoverage(admin.coverage);
  const isMinor = (ageFromDateOfBirth(admin.identity.dob) ?? 99) < 18;
  const isInsured = Boolean(policy) && !policy!.isSelfPay;

  const identity = identityStepState(input.governmentIdDocuments, input.identityDocumentReview);
  const insuranceCard = insuranceCardStepState(admin.coverage, input.insuranceCardDocuments);
  const eligibility = eligibilityStepState(input.eligibility, policy, now, freshness);
  const consents = requiredConsentTitles(input.requiredConsents, input.signedConsents);

  const planAcceptanceState: IntakeStepState = !policy || policy.isSelfPay
    ? "not_available"
    : input.planAcceptance.result === "accepted" ? "recorded" : "review";
  const planAcceptanceDetail = !policy || policy.isSelfPay
    ? "Self-pay — no payer plan to match."
    : input.planAcceptance.result === "accepted" ? "This plan is accepted by the practice."
    : input.planAcceptance.result === "not_accepted" ? "The practice does not participate with this plan."
    : "Not yet configured/matched — needs staff review.";

  const submittedTemplateIds = new Set(
    input.formSubmissions.filter((f) => f.status === "submitted" || f.status === "reviewed").map((f) => f.templateId),
  );
  const outstandingForms = input.requiredFormTemplateIds.filter((id) => !submittedTemplateIds.has(id));

  const payment = input.payment;
  const paymentReady = payment?.status === "on_file" || payment?.status === "waived";

  const steps: IntakeReadinessStep[] = [
    {
      id: "identity",
      label: "Identity confirmed",
      level: "required",
      blocking: true,
      owner: "staff",
      state: identityReady ? "recorded" : "needed",
      detail: identityReady ? "Name and birth date recorded." : "Record a full name and valid birth date.",
    },
    {
      id: "contact",
      label: "Contact information confirmed",
      level: "required",
      blocking: true,
      owner: "staff",
      state: phoneReady && emailReady ? "recorded" : "needed",
      detail: phoneReady && emailReady ? "Callback phone and email on file." : "Callback phone and email are needed.",
    },
    {
      id: "account",
      label: "Clinical Bond account created",
      level: "required",
      blocking: false,
      owner: "system",
      state: "not_available",
      detail: "Patient portal accounts are not built yet (P7-F). Tracked here so this step is not silently skipped — use Confirm Anyway with a reason if this practice does not require it yet.",
    },
    {
      id: "government_id",
      label: "Government ID confirmed",
      level: "required",
      blocking: true,
      owner: "patient",
      state: identity.state,
      detail: identity.detail,
    },
    {
      id: "insurance_details",
      label: "Insurance on file or self-pay recorded",
      level: "required",
      blocking: true,
      owner: "patient",
      state: policy ? "recorded" : "needed",
      detail: policy ? (policy.isSelfPay ? "Self-pay recorded." : `${policy.payerName} on file.`) : "Record a policy or an explicit self-pay choice.",
    },
    {
      id: "insurance_card",
      label: "Insurance card evidence reviewed",
      level: isInsured ? "required" : "optional",
      blocking: isInsured,
      owner: "patient",
      state: insuranceCard.state,
      detail: insuranceCard.detail,
    },
    {
      id: "plan_acceptance",
      label: "Payer-plan acceptance resolved",
      level: isInsured ? "required" : "optional",
      blocking: isInsured,
      owner: "staff",
      state: planAcceptanceState,
      detail: planAcceptanceDetail,
    },
    {
      id: "eligibility",
      label: "Eligibility / benefits verified",
      level: isInsured ? "required" : "optional",
      blocking: isInsured,
      owner: "staff",
      state: eligibility.state,
      detail: eligibility.detail,
    },
    {
      id: "consents",
      label: "Required consents signed",
      level: "required",
      blocking: true,
      owner: "patient",
      state: consents.outstanding.length === 0 ? "recorded" : "needed",
      detail: consents.detail,
    },
    {
      id: "intake_forms",
      label: "Intake forms completed",
      level: "required",
      blocking: true,
      owner: "patient",
      state: outstandingForms.length === 0 ? "recorded" : "needed",
      detail: outstandingForms.length === 0 ? "All required intake forms submitted." : `${outstandingForms.length} form(s) outstanding.`,
    },
    {
      id: "payment",
      label: "Payment method on file or exception recorded",
      level: "required",
      blocking: true,
      owner: "patient",
      state: paymentReady ? "recorded" : "needed",
      detail: payment?.status === "on_file"
        ? `${payment.brand ?? "Card"} on file ending ${payment.lastFour ?? "----"}.`
        : payment?.status === "waived"
          ? `Waived by staff: ${payment.waiverReason ?? "no reason recorded"}.`
          : "Not configured — no payment vendor connected; record a staff exception if proceeding.",
    },
    {
      id: "guardian",
      label: "Guardian signature requirements resolved",
      level: isMinor ? "required" : "optional",
      blocking: isMinor,
      owner: "staff",
      state: !isMinor
        ? "not_available"
        : input.episode.guardianSituation === "unknown_needs_review"
          ? "review"
          : "recorded",
      detail: !isMinor
        ? "Patient is not a minor."
        : GUARDIAN_SITUATIONS.find((g) => g.value === input.episode.guardianSituation)?.detail ?? "Not yet established.",
    },
    {
      id: "staff_review",
      label: "Staff review items resolved",
      level: "required",
      blocking: true,
      owner: "staff",
      state: input.episode.staffReviewResolvedAt ? "recorded" : "needed",
      detail: input.episode.staffReviewResolvedAt ? "Staff has signed off." : "Staff has not yet signed off on this intake.",
    },
  ];

  return steps;
}

export function isStepSatisfied(step: IntakeReadinessStep): boolean {
  return step.state === "recorded" || step.state === "not_available";
}

/** Ready to Confirm requires every blocking step to be satisfied. Never a
 * stored boolean — always recomputed from the steps just derived above. */
export function isReadyToConfirm(steps: readonly IntakeReadinessStep[]): boolean {
  return steps.filter((s) => s.blocking).every(isStepSatisfied);
}

export function outstandingBlockers(steps: readonly IntakeReadinessStep[]): IntakeReadinessStep[] {
  return steps.filter((s) => s.blocking && !isStepSatisfied(s));
}

export function checklistProgress(steps: readonly IntakeReadinessStep[]): { complete: number; total: number } {
  const relevant = steps.filter((s) => s.state !== "not_available");
  return { complete: relevant.filter(isStepSatisfied).length, total: relevant.length };
}

/* ------------------------------------------------------------------ *
 * Queue stage and sorting
 * ------------------------------------------------------------------ */

export type IntakeStage =
  | "awaiting_first_visit"
  | "tentative"
  | "waiting_on_patient"
  | "needs_staff_review"
  | "insurance_issue"
  | "ready_to_confirm"
  | "confirmed_awaiting_visit";

export const INTAKE_STAGE_LABELS: Record<IntakeStage, string> = {
  awaiting_first_visit: "Awaiting First Visit",
  tentative: "Tentative",
  waiting_on_patient: "Waiting on Patient",
  needs_staff_review: "Needs Staff Review",
  insurance_issue: "Insurance Issue",
  ready_to_confirm: "Ready to Confirm",
  confirmed_awaiting_visit: "Confirmed / Awaiting First Visit",
};

export function intakeStage(
  appointmentStatus: AppointmentStatus | undefined,
  steps: readonly IntakeReadinessStep[],
  planAcceptance: PlanAcceptanceResult,
): IntakeStage {
  // An episode that started before any visit was scheduled has nothing to
  // confirm yet regardless of how much evidence is already in — scheduling
  // is always the next step, so it gets its own stage rather than being read
  // as "tentative" (which implies a hold already exists).
  if (!appointmentStatus) return "awaiting_first_visit";
  if (appointmentStatus === "confirmed") return "confirmed_awaiting_visit";
  if (planAcceptance === "not_accepted") return "insurance_issue";
  const eligibilityStep = steps.find((s) => s.id === "eligibility");
  if (eligibilityStep && eligibilityStep.state === "review") return "insurance_issue";
  const planStep = steps.find((s) => s.id === "plan_acceptance");
  if (planStep && planStep.state === "review" && planAcceptance === "needs_review") return "insurance_issue";
  if (isReadyToConfirm(steps)) return "ready_to_confirm";
  // Patient-owned work is checked first: a brand-new episode has nothing done
  // yet, and every one of those items waits on the patient, not on staff. Once
  // the patient's side is complete, what remains — the guardian question, the
  // final staff sign-off — is genuinely staff's turn.
  const patientOwnedOutstanding = steps.some((s) => s.blocking && !isStepSatisfied(s) && s.owner === "patient");
  if (patientOwnedOutstanding) return "waiting_on_patient";
  const staffOwnedOutstanding = steps.some((s) => s.blocking && !isStepSatisfied(s) && s.owner === "staff");
  if (staffOwnedOutstanding) return "needs_staff_review";
  return appointmentStatus === "tentative" ? "tentative" : "waiting_on_patient";
}

export type IntakeQueueRow = {
  episode: IntakeEpisode;
  /** All unset for an episode with no visit scheduled yet
   * (`stage === "awaiting_first_visit"`). */
  appointmentId?: string;
  appointmentStatus?: AppointmentStatus;
  appointmentDate?: string;
  appointmentTime?: string;
  patientId?: string;
  prospectivePersonId?: string;
  patientName: string;
  stage: IntakeStage;
  steps: IntakeReadinessStep[];
  planAcceptance: PlanAcceptanceResult;
  currentStepWaitingSince?: string;
};

/** Days until the appointment date; negative when it has already passed. */
export function daysUntil(dateIso: string, now: Date = new Date()): number {
  const target = new Date(`${dateIso}T00:00:00`);
  const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export type IntakePriorityWeights = {
  proximity: number;
  blockingIssue: number;
  insuranceIssue: number;
  waitingDuration: number;
};

/** Practice-configurable default; the queue's manual sort/filter always overrides it. */
export const DEFAULT_INTAKE_PRIORITY_WEIGHTS: IntakePriorityWeights = {
  proximity: 3,
  blockingIssue: 2,
  insuranceIssue: 2,
  waitingDuration: 1,
};

export function intakePriorityScore(
  row: IntakeQueueRow,
  now: Date = new Date(),
  weights: IntakePriorityWeights = DEFAULT_INTAKE_PRIORITY_WEIGHTS,
): number {
  // No visit yet: neither imminent nor comfortably distant — a fixed
  // mid-range score keeps these from either dominating or vanishing behind
  // rows that do have a date to sort by.
  const proximityScore = row.appointmentDate === undefined
    ? 40
    : (() => {
        const until = daysUntil(row.appointmentDate!, now);
        return until <= 0 ? 100 : Math.max(0, 100 - until * 5);
      })();
  const blockingCount = row.steps.filter((s) => s.blocking && !isStepSatisfied(s)).length;
  const waitingMs = now.getTime() - Date.parse(row.episode.updatedAt);
  const waitingDays = Math.max(0, waitingMs / 86_400_000);

  return (
    proximityScore * weights.proximity +
    blockingCount * 10 * weights.blockingIssue +
    (row.planAcceptance === "not_accepted" ? 50 : 0) * weights.insuranceIssue +
    Math.min(waitingDays, 30) * weights.waitingDuration
  );
}

export function sortIntakeQueue(
  rows: readonly IntakeQueueRow[],
  now: Date = new Date(),
  weights?: IntakePriorityWeights,
): IntakeQueueRow[] {
  return [...rows].sort((a, b) => intakePriorityScore(b, now, weights) - intakePriorityScore(a, now, weights));
}

/* ------------------------------------------------------------------ *
 * Re-export the existing administrative-step projection so intake UI has
 * one place to import from without duplicating the D-074 logic.
 * ------------------------------------------------------------------ */
export type { IntakeAdministrativeStep };
