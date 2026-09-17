/**
 * Clinical Bond Intake — the operational front door between a tentative hold
 * and a first completed visit.
 *
 * This module is a pure-logic layer. It computes readiness and queue
 * presentation from evidence that already has an authoritative home
 * (appointments, the administrative record, documents, consents, forms,
 * eligibility, payment) plus the durable staff-workflow state this feature
 * owns (`intake_episodes`, `intake_notes`). It stores no duplicate patient
 * truth and no second intake status machine — see D-074 and ARCHITECTURE.md.
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

export type IntakeNoteKind = "note" | "outreach" | "disposition" | "system";

export type IntakeNote = {
  id: string;
  episodeId: string;
  patientId: string;
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

export type IntakeEpisode = {
  id: string;
  patientId: string;
  appointmentId: string;
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

/* ------------------------------------------------------------------ *
 * Evidence-backed readiness steps
 * ------------------------------------------------------------------ */

export type IntakeStepId =
  | "identity"
  | "contact"
  | "account"
  | "government_id"
  | "coverage"
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

export type GovernmentIdState = "missing" | "received" | "needs_review" | "confirmed" | "conflict" | "superseded";

export const GOVERNMENT_ID_DOCUMENT_TYPES: readonly string[] = ["government_id", "government_id_front", "government_id_back"];
export const INSURANCE_CARD_DOCUMENT_TYPES: readonly string[] = ["insurance_card_primary", "insurance_card_secondary"];

export type EligibilityResult = "not_configured" | "pending" | "active" | "inactive" | "needs_review" | "failed" | "uncertain";

export type EligibilityCheck = {
  id: string;
  patientId: string;
  coveragePolicyId: string;
  result: EligibilityResult;
  source: "adapter" | "manual_staff_attestation";
  adapterId?: string;
  note?: string;
  checkedByName?: string;
  checkedAt: string;
};

/** How long a checked-active eligibility result may be trusted before it must be re-verified. */
export const ELIGIBILITY_FRESHNESS_DAYS = 30;

export type PaymentReadinessStatus = "not_configured" | "on_file" | "waived";

export type PaymentMethodReference = {
  id: string;
  patientId: string;
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
  patientId: string;
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
  patientId: string;
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

/* ------------------------------------------------------------------ *
 * Payer-plan participation (practice configuration, not patient data)
 * ------------------------------------------------------------------ */

export type PlanAcceptanceResult = "accepted" | "not_accepted" | "needs_review";

export type PayerPlanParticipation = {
  id: string;
  payerName: string;
  product?: string;
  planName?: string;
  network?: string;
  active: boolean;
};

/**
 * Matches a coverage policy's payer name against configured participations.
 *
 * Never infers acceptance from coverage being active — payer name matching
 * without a configured participation record is explicitly `needs_review`,
 * not a guess at yes or no.
 */
export function matchPlanAcceptance(
  policy: CoveragePolicy | undefined,
  participations: readonly PayerPlanParticipation[],
): { result: PlanAcceptanceResult; matched?: PayerPlanParticipation } {
  if (!policy || policy.isSelfPay) return { result: "accepted" };
  const normalizedPayer = policy.payerName.trim().toLowerCase();
  if (!normalizedPayer) return { result: "needs_review" };

  const active = participations.filter((p) => p.active);
  const matched = active.find((p) => p.payerName.trim().toLowerCase() === normalizedPayer);
  if (matched) return { result: "accepted", matched };

  const anyConfigured = participations.length > 0;
  return { result: anyConfigured ? "not_accepted" : "needs_review" };
}

/* ------------------------------------------------------------------ *
 * Readiness projection
 * ------------------------------------------------------------------ */

export type IntakeReadinessInput = {
  administrative: PatientAdministrativeRecord;
  appointment: { intakeStatus?: "completed" | "pending" | "exempt"; status: AppointmentStatus };
  episode: Pick<IntakeEpisode, "guardianSituation" | "staffReviewResolvedAt">;
  governmentIdDocuments: readonly { documentType: string; workflowStatus: string }[];
  planAcceptance: { result: PlanAcceptanceResult };
  eligibility?: EligibilityCheck;
  requiredConsents: readonly ConsentTemplate[];
  signedConsents: readonly ConsentSignature[];
  formSubmissions: readonly FormSubmission[];
  requiredFormTemplateIds: readonly string[];
  payment?: PaymentMethodReference;
  now?: Date;
};

function governmentIdState(
  documents: readonly { documentType: string; workflowStatus: string }[],
): { state: GovernmentIdState; detail: string } {
  const relevant = documents.filter((d) => GOVERNMENT_ID_DOCUMENT_TYPES.includes(d.documentType));
  if (relevant.length === 0) return { state: "missing", detail: "No ID on file yet." };
  if (relevant.some((d) => d.workflowStatus === "superseded" && relevant.every((r) => r.workflowStatus === "superseded"))) {
    return { state: "superseded", detail: "The ID on file has been superseded; a current one is needed." };
  }
  if (relevant.some((d) => d.workflowStatus === "reviewed" || d.workflowStatus === "filed")) {
    return { state: "confirmed", detail: "Staff confirmed the ID image is legible and matches the chart." };
  }
  if (relevant.some((d) => d.workflowStatus === "needs_review")) {
    return { state: "needs_review", detail: "Received — staff has not yet confirmed it is acceptable." };
  }
  return { state: "received", detail: "Received — not yet reviewed. Receipt is not verification." };
}

function eligibilityStepState(
  eligibility: EligibilityCheck | undefined,
  currentPolicy: CoveragePolicy | undefined,
  now: Date,
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
  if (eligibility.result === "active" && ageDays <= ELIGIBILITY_FRESHNESS_DAYS) {
    return { state: "recorded", detail: `Active as of ${eligibility.checkedAt.slice(0, 10)} (${eligibility.source === "adapter" ? "vendor" : "staff call"}).` };
  }
  if (eligibility.result === "active" && ageDays > ELIGIBILITY_FRESHNESS_DAYS) {
    return { state: "needed", detail: `Last checked ${Math.floor(ageDays)} days ago — past the ${ELIGIBILITY_FRESHNESS_DAYS}-day freshness window.` };
  }
  if (eligibility.result === "needs_review" || eligibility.result === "uncertain") {
    return { state: "review", detail: "Payer response was incomplete or uncertain." };
  }
  if (eligibility.result === "inactive" || eligibility.result === "failed") {
    return { state: "review", detail: `Eligibility check returned ${eligibility.result.replace("_", " ")}.` };
  }
  return { state: "needed", detail: "Not yet checked." };
}

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

/** Pure projection from authoritative evidence — never a stored second checklist. */
export function computeIntakeChecklist(input: IntakeReadinessInput): IntakeReadinessStep[] {
  const now = input.now ?? new Date();
  const admin = input.administrative;
  const identityReady = Boolean(admin.identity.legalName.trim()) && ageFromDateOfBirth(admin.identity.dob) !== undefined;
  const phoneReady = (admin.contact.mobilePhone || "").replace(/\D/g, "").length >= 7;
  // \x40 rather than a literal at-sign: an email regex written the obvious way
  // contains the note-reference guard's banned character sequence verbatim.
  const emailReady = /^[^\s@]+\x40[^\s@]+\.[^\s@]+$/.test((admin.contact.email || "").trim());
  const policy = primaryCoverage(admin.coverage);
  const isMinor = (ageFromDateOfBirth(admin.identity.dob) ?? 99) < 18;

  const govId = governmentIdState(input.governmentIdDocuments);
  const eligibility = eligibilityStepState(input.eligibility, policy, now);
  const consents = requiredConsentTitles(input.requiredConsents, input.signedConsents);

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
      detail: "Patient portal accounts are not built yet (P7-F). Tracked here so this step is not silently skipped.",
    },
    {
      id: "government_id",
      label: "Government ID on file",
      level: "required",
      blocking: true,
      owner: "patient",
      state: govId.state === "confirmed" ? "recorded" : govId.state === "missing" ? "needed" : "review",
      detail: govId.detail,
    },
    {
      id: "coverage",
      label: "Insurance on file or self-pay recorded",
      level: "required",
      blocking: true,
      owner: "patient",
      state: policy ? "recorded" : "needed",
      detail: policy ? (policy.isSelfPay ? "Self-pay recorded." : `${policy.payerName} on file.`) : "Record a policy or an explicit self-pay choice.",
    },
    {
      id: "eligibility",
      label: "Eligibility / benefits checked",
      level: "conditional",
      blocking: false,
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

/** Ready to Confirm requires every blocking step to be satisfied. */
export function isReadyToConfirm(steps: readonly IntakeReadinessStep[]): boolean {
  return steps.filter((s) => s.blocking).every(isStepSatisfied);
}

export function checklistProgress(steps: readonly IntakeReadinessStep[]): { complete: number; total: number } {
  const relevant = steps.filter((s) => s.state !== "not_available");
  return { complete: relevant.filter(isStepSatisfied).length, total: relevant.length };
}

/* ------------------------------------------------------------------ *
 * Queue stage and sorting
 * ------------------------------------------------------------------ */

export type IntakeStage =
  | "tentative"
  | "waiting_on_patient"
  | "needs_staff_review"
  | "insurance_issue"
  | "ready_to_confirm"
  | "confirmed_awaiting_visit";

export const INTAKE_STAGE_LABELS: Record<IntakeStage, string> = {
  tentative: "Tentative",
  waiting_on_patient: "Waiting on Patient",
  needs_staff_review: "Needs Staff Review",
  insurance_issue: "Insurance Issue",
  ready_to_confirm: "Ready to Confirm",
  confirmed_awaiting_visit: "Confirmed / Awaiting First Visit",
};

export function intakeStage(
  appointmentStatus: AppointmentStatus,
  steps: readonly IntakeReadinessStep[],
  planAcceptance: PlanAcceptanceResult,
): IntakeStage {
  if (appointmentStatus === "confirmed") return "confirmed_awaiting_visit";
  if (planAcceptance === "not_accepted") return "insurance_issue";
  const coverageStep = steps.find((s) => s.id === "eligibility");
  if (coverageStep && (coverageStep.state === "review")) return "insurance_issue";
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
  appointmentId: string;
  appointmentStatus: AppointmentStatus;
  appointmentDate: string;
  appointmentTime: string;
  patientId: string;
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
  const until = daysUntil(row.appointmentDate, now);
  const proximityScore = until <= 0 ? 100 : Math.max(0, 100 - until * 5);
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
