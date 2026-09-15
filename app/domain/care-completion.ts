import type { ClinicalPermission } from "../server/auth/provider-context";

/**
 * Care completion (roadmap §21, DB-10).
 *
 * The board a clinician keeps open to answer one question: *have I actually
 * finished everything I meant to finish for these patients?*
 *
 * The whole module rests on a single rule, and every type below exists to make
 * that rule impossible to break by accident:
 *
 * **Care completion is a projection over authoritative workflows. It is not a
 * second clinical truth system.**
 *
 * A work item does not store "done". It asks the record that already owns the
 * fact — the signed encounter, the linked appointment, the order, the
 * acknowledgement, the charge — and reports what it found, together with the
 * evidence it found it in. That is why `authority` is on the rule definition
 * rather than on the item: whether a piece of work *can* be checked off by hand
 * is a property of the kind of work, decided once, not a per-render choice.
 *
 * Three things the clinician can do here mutate state, and all three are this
 * module's own: pinning a patient to a personal board, deferring an unresolved
 * item with a reason, and completing a genuinely manual task. Nothing else on
 * this surface writes; the items link into the existing workflows instead.
 */

/* ------------------------------------------------------------------------- */
/* Rule identity                                                              */
/* ------------------------------------------------------------------------- */

/**
 * Stable rule identity. Never display text.
 *
 * A deferral is stored against one of these plus an optional scope id, so
 * relabelling a rule in the UI cannot orphan the reason someone recorded for
 * putting that work off.
 */
export type CareCompletionRuleId =
  | "encounter-signed"
  | "follow-up-appointment"
  | "prescription-transmission"
  | "result-review"
  | "monitoring-labs"
  | "medication-change-message"
  | "transcription-review"
  | "coding-review"
  | "pcp-notification"
  | "patient-balance-reminder"
  | "manual-task";

export const CARE_COMPLETION_RULE_IDS: readonly CareCompletionRuleId[] = [
  "encounter-signed",
  "follow-up-appointment",
  "prescription-transmission",
  "result-review",
  "monitoring-labs",
  "medication-change-message",
  "transcription-review",
  "coding-review",
  "pcp-notification",
  "patient-balance-reminder",
  "manual-task",
];

export function isCareCompletionRuleId(value: unknown): value is CareCompletionRuleId {
  return typeof value === "string" && (CARE_COMPLETION_RULE_IDS as readonly string[]).includes(value);
}

/**
 * The durable identity of one work item on one patient's card.
 *
 * `ruleId` alone is not enough: a patient can have three unacknowledged results
 * and two overdue monitoring protocols, and deferring one of them must not
 * silence the others. The scope segment is whatever authoritative row the item
 * is about — an encounter, an observation, a protocol key — never a label.
 */
export function careCompletionItemKey(ruleId: CareCompletionRuleId, scopeId?: string | null): string {
  const scope = (scopeId ?? "").trim();
  return scope ? `${ruleId}:${scope}` : ruleId;
}

export function ruleIdFromItemKey(itemKey: string): CareCompletionRuleId | null {
  const head = itemKey.split(":", 1)[0];
  return isCareCompletionRuleId(head) ? head : null;
}

/* ------------------------------------------------------------------------- */
/* Item semantics                                                             */
/* ------------------------------------------------------------------------- */

/**
 * Where a "complete" may come from.
 *
 * `observed` items have no boolean of their own. Their completion is read out of
 * the authoritative record on every projection, which is what makes it
 * impossible for a checkbox to claim a prescription was sent.
 *
 * `manual` items are work that genuinely has no other record — "call the mother
 * on Thursday" — and they use a real task the clinician can check off.
 */
export type CareCompletionAuthority = "observed" | "manual";

/**
 * What the board is currently reporting about this item.
 *
 * `unavailable` is a first-class outcome rather than a hidden row: when the
 * source a rule would need does not exist in this build, saying so is the
 * truthful answer. It is never counted as complete and never counted as open.
 */
export type CareCompletionState = "complete" | "open" | "deferred" | "unavailable";

/**
 * The four semantics the product talks about, derived rather than stored.
 *
 * Deriving it is what keeps "observed" and "actionable" from contradicting each
 * other. Signing an encounter is both: its completion is observed from the
 * signed record, and the work itself is a real workflow the item links into.
 */
export type CareCompletionClassification = "observed" | "actionable" | "manual" | "deferred";

/** Where clicking an item takes the clinician, in the chart's own vocabulary. */
export type CareCompletionTargetSection =
  | "Overview"
  | "Encounter"
  | "Meds"
  | "Labs"
  | "Messages"
  | "History"
  | "Schedule"
  | "Billing";

/**
 * One piece of authoritative evidence behind a resolved item.
 *
 * Every observed completion carries at least one. A checkmark with no evidence
 * would be exactly the free-standing boolean this module exists to avoid.
 */
export type CareCompletionEvidence = {
  /** The authoritative record class the fact came from. */
  sourceKind:
    | "encounter"
    | "appointment"
    | "order"
    | "prescription-transaction"
    | "observation"
    | "message"
    | "note-reference"
    | "billing-charge"
    | "care-network"
    | "task"
    | "medication";
  sourceId: string;
  label: string;
  /** ISO instant when the evidencing event occurred, where the record holds one. */
  occurredAt?: string;
};

export type CareCompletionDeferralReasonCode =
  | "waiting-for-patient"
  | "waiting-for-labs"
  | "waiting-for-outside-records"
  | "waiting-for-roi"
  | "waiting-for-pcp"
  | "patient-checking-schedule"
  | "not-clinically-indicated-now"
  | "other";

export const CARE_COMPLETION_DEFERRAL_REASONS: ReadonlyArray<{
  code: CareCompletionDeferralReasonCode;
  label: string;
}> = [
  { code: "waiting-for-patient", label: "Waiting for patient" },
  { code: "waiting-for-labs", label: "Waiting for labs" },
  { code: "waiting-for-outside-records", label: "Waiting for outside records" },
  { code: "waiting-for-roi", label: "Waiting for ROI" },
  { code: "waiting-for-pcp", label: "Waiting for PCP" },
  { code: "patient-checking-schedule", label: "Patient needs to check schedule" },
  { code: "not-clinically-indicated-now", label: "Not clinically indicated now" },
  { code: "other", label: "Other" },
];

export function isCareCompletionDeferralReasonCode(
  value: unknown,
): value is CareCompletionDeferralReasonCode {
  return (
    typeof value === "string" &&
    CARE_COMPLETION_DEFERRAL_REASONS.some((reason) => reason.code === value)
  );
}

export function deferralReasonLabel(code: CareCompletionDeferralReasonCode): string {
  return CARE_COMPLETION_DEFERRAL_REASONS.find((reason) => reason.code === code)?.label ?? "Other";
}

/** The provider-recorded deferral attached to an item, as the board sees it. */
export type CareCompletionDeferralView = {
  id: string;
  reasonCode: CareCompletionDeferralReasonCode;
  reasonText?: string;
  deferredBy: string;
  deferredByName: string;
  deferredAt: string;
  resumeAt?: string;
  version: number;
};

export type CareCompletionItem = {
  /** Durable identity: `ruleId` plus the authoritative row it is about. */
  itemKey: string;
  ruleId: CareCompletionRuleId;
  scopeId?: string;
  label: string;
  /** Short line under the label describing the current authoritative finding. */
  detail?: string;
  authority: CareCompletionAuthority;
  state: CareCompletionState;
  classification: CareCompletionClassification;
  /** Why this rule produced an item for this patient at all. */
  explanation: string;
  evidence: CareCompletionEvidence[];
  /** Present when the item links into a real workflow rather than ending here. */
  action?: {
    label: string;
    targetSection: CareCompletionTargetSection;
    /** Passed through to the chart so a click lands on the right record. */
    encounterId?: string;
    appointmentId?: string;
    observationId?: string;
    orderId?: string;
    taskId?: string;
  };
  deferrable: boolean;
  deferral?: CareCompletionDeferralView;
  /** Stated when `state` is `unavailable`: which source does not exist yet. */
  unavailableReason?: string;
};

/**
 * Deferred is not complete, and this is the one function that decides so.
 *
 * Counting it anywhere else would eventually let a card read "7 of 7" while
 * three loops were still open with reasons attached.
 */
export type CareCompletionProgress = {
  complete: number;
  open: number;
  deferred: number;
  unavailable: number;
  /** Items whose loop can actually be closed here: complete + open + deferred. */
  applicable: number;
  /** True only when every applicable item is complete. */
  closed: boolean;
};

export function summarizeCareCompletion(
  items: readonly CareCompletionItem[],
): CareCompletionProgress {
  let complete = 0;
  let open = 0;
  let deferred = 0;
  let unavailable = 0;

  for (const item of items) {
    if (item.state === "complete") complete += 1;
    else if (item.state === "open") open += 1;
    else if (item.state === "deferred") deferred += 1;
    else unavailable += 1;
  }

  const applicable = complete + open + deferred;
  return {
    complete,
    open,
    deferred,
    unavailable,
    applicable,
    // An empty card is not a closed loop; it is a card with nothing on it.
    closed: applicable > 0 && complete === applicable,
  };
}

export function classifyCareCompletionItem(item: {
  state: CareCompletionState;
  authority: CareCompletionAuthority;
  action?: unknown;
}): CareCompletionClassification {
  if (item.state === "deferred") return "deferred";
  if (item.authority === "manual") return "manual";
  return item.action ? "actionable" : "observed";
}

/* ------------------------------------------------------------------------- */
/* Rule catalogue                                                             */
/* ------------------------------------------------------------------------- */

export type CareCompletionRuleAvailability = "available" | "unavailable";

export type CareCompletionRuleDefinition = {
  id: CareCompletionRuleId;
  label: string;
  icon: string;
  authority: CareCompletionAuthority;
  availability: CareCompletionRuleAvailability;
  /** Which authoritative records decide this rule's completion. */
  evidenceSources: readonly string[];
  /** Why the rule exists, shown to the clinician rather than hidden in code. */
  rationale: string;
  deferrable: boolean;
  targetSection: CareCompletionTargetSection;
  /** Withheld entirely from actors without this capability. */
  requiredCapability?: ClinicalPermission;
  /** Present when `availability` is `unavailable`: what is missing, exactly. */
  unavailableReason?: string;
};

export const CARE_COMPLETION_RULES: readonly CareCompletionRuleDefinition[] = [
  {
    id: "encounter-signed",
    label: "Sign encounter",
    icon: "draw",
    authority: "observed",
    availability: "available",
    evidenceSources: ["encounters.status", "encounters.signed_at"],
    rationale:
      "A visit is not documented until the note is signed. Completion is read from the signed legal record, which this board can display but never write.",
    deferrable: true,
    targetSection: "Encounter",
    requiredCapability: "read_clinical",
  },
  {
    id: "follow-up-appointment",
    label: "Schedule follow-up",
    icon: "event_upcoming",
    authority: "observed",
    availability: "available",
    evidenceSources: ["encounters.follow_up", "appointments.origin_appointment_id", "appointments.status"],
    rationale:
      "A follow-up plan recorded in the note is an intention; an appointment linked to the originating visit is the fact. Only the linked appointment completes this item.",
    deferrable: true,
    targetSection: "Schedule",
    requiredCapability: "read_schedule",
  },
  {
    id: "prescription-transmission",
    label: "Send prescription",
    icon: "medication",
    authority: "observed",
    availability: "available",
    evidenceSources: ["orders.status", "prescription_transactions.state"],
    rationale:
      "Staged and authorized are not sent. Completion requires the authoritative order and transport state to say the prescription actually left.",
    deferrable: true,
    targetSection: "Meds",
    requiredCapability: "read_clinical",
  },
  {
    id: "result-review",
    label: "Review result",
    icon: "biotech",
    authority: "observed",
    availability: "available",
    evidenceSources: ["observations.acknowledged_at", "observations.disposition"],
    rationale:
      "A result that arrived is not a result that was read. Completion comes from the authoritative acknowledgement, recorded in the chart by a clinician.",
    deferrable: true,
    targetSection: "Labs",
    requiredCapability: "read_clinical",
  },
  {
    id: "monitoring-labs",
    label: "Review monitoring labs",
    icon: "labs",
    authority: "observed",
    availability: "available",
    evidenceSources: ["patient_medications.status", "observations.effective_at", "orders.type"],
    rationale:
      "A configured monitoring interval has elapsed for an active medication. This is a recommendation to review, never an order: the clinician decides what, if anything, to order.",
    deferrable: true,
    targetSection: "Labs",
    requiredCapability: "read_clinical",
  },
  {
    id: "medication-change-message",
    label: "Send medication-change summary",
    icon: "forward_to_inbox",
    authority: "observed",
    availability: "available",
    evidenceSources: ["orders.encounter_id", "messages.sender_role", "messages.created_at"],
    rationale:
      "Medication orders were placed during this visit. Completion requires an actual message from this practice to the patient after the note was signed.",
    deferrable: true,
    targetSection: "Messages",
    requiredCapability: "send_message",
  },
  {
    id: "transcription-review",
    label: "Review AI-extracted note content",
    icon: "graphic_eq",
    authority: "observed",
    availability: "available",
    evidenceSources: ["note_references.source", "note_references.status"],
    rationale:
      "AI-extracted references are proposals until a clinician confirms or rejects each one. Transcription never becomes the signed note on its own.",
    deferrable: true,
    targetSection: "Encounter",
    requiredCapability: "read_clinical",
  },
  {
    id: "coding-review",
    label: "Review billing recommendation",
    icon: "receipt_long",
    authority: "observed",
    availability: "available",
    evidenceSources: ["billing_charges.status", "billing_charges.reviewed_at"],
    rationale:
      "Codes frozen from the signed note are a recommendation until someone accountable reviews them. Completion is the review recorded on the charge itself.",
    deferrable: true,
    targetSection: "Billing",
    requiredCapability: "view_financial",
  },
  {
    id: "pcp-notification",
    label: "Notify PCP",
    icon: "share",
    authority: "observed",
    availability: "unavailable",
    evidenceSources: ["patient_care_network.role"],
    rationale:
      "A primary care clinician is recorded in the care network, so a medication-change summary may be clinically appropriate to send.",
    deferrable: false,
    targetSection: "Overview",
    requiredCapability: "read_clinical",
    unavailableReason:
      "Disclosure to an outside clinician requires a release-of-information authorization, and this build has no authorization record and no document-exchange transport. A PCP existing in the care network is not permission to disclose, so the workflow stays closed rather than being simulated.",
  },
  {
    id: "patient-balance-reminder",
    label: "Send payment reminder",
    icon: "payments",
    authority: "observed",
    availability: "unavailable",
    evidenceSources: [],
    rationale:
      "A patient with an outstanding balance may need a reminder before their next visit.",
    deferrable: false,
    targetSection: "Billing",
    requiredCapability: "view_financial",
    unavailableReason:
      "No authoritative patient balance exists. Charges carry codes and units and no amount, and no remittance has ever been received (roadmap P9-D/P9-F). A reminder here would have to invent the number it was reminding about, so no item is produced.",
  },
  {
    id: "manual-task",
    label: "Manual task",
    icon: "checklist",
    authority: "manual",
    availability: "available",
    evidenceSources: ["tasks.completed"],
    rationale:
      "Work with no other record — a call to make, a form to chase. This is the only item class the board itself may mark complete.",
    deferrable: true,
    targetSection: "Overview",
    requiredCapability: "manage_tasks",
  },
];

const RULE_BY_ID = new Map(CARE_COMPLETION_RULES.map((rule) => [rule.id, rule]));

export function getCareCompletionRule(id: CareCompletionRuleId): CareCompletionRuleDefinition {
  const rule = RULE_BY_ID.get(id);
  if (!rule) throw new Error(`Unknown care-completion rule: ${id}`);
  return rule;
}

export function listUnavailableCareCompletionRules(): CareCompletionRuleDefinition[] {
  return CARE_COMPLETION_RULES.filter((rule) => rule.availability === "unavailable");
}

/* ------------------------------------------------------------------------- */
/* Monitoring protocol catalogue                                              */
/* ------------------------------------------------------------------------- */

/**
 * Configurable monitoring intervals, kept as data with a stated basis.
 *
 * These are **practice-configurable defaults, not clinical truth**, and the
 * shape enforces that reading: every entry has to say where its interval comes
 * from and what the clinician is being asked to consider. Nothing here creates
 * an order. The most a protocol can do is put "review whether this is needed"
 * on a card, with its reasoning attached, for a human to agree or disagree with.
 *
 * Intervals live here rather than inside a React component so a practice can
 * revise a cadence without anyone touching the board.
 */
export type CareCompletionMonitoringProtocol = {
  /** Stable key; used as the deferral scope so a revised label keeps its history. */
  key: string;
  /** Matched case-insensitively against the medication's name and generic name. */
  medicationMatch: readonly string[];
  medicationLabel: string;
  /** What the clinician is being asked to consider ordering, in plain words. */
  reviewLabel: string;
  /** Substrings matched against recorded observation test names. */
  resultMatch: readonly string[];
  intervalDays: number;
  intervalLabel: string;
  /** Why this cadence, stated so a clinician can disagree with it knowingly. */
  basis: string;
};

export const CARE_COMPLETION_MONITORING_PROTOCOLS: readonly CareCompletionMonitoringProtocol[] = [
  {
    key: "lithium-maintenance",
    medicationMatch: ["lithium"],
    medicationLabel: "Lithium",
    reviewLabel: "serum lithium level with renal and thyroid function",
    resultMatch: ["lithium", "creatinine", "tsh", "bun"],
    intervalDays: 180,
    intervalLabel: "every 6 months",
    basis:
      "Practice-configured maintenance cadence for a narrow-therapeutic-index medication with renal and thyroid considerations. Interval and scope are configuration, not a fixed clinical assertion; adjust per patient and current guidance.",
  },
  {
    key: "clozapine-anc",
    medicationMatch: ["clozapine", "clozaril", "versacloz"],
    medicationLabel: "Clozapine",
    reviewLabel: "CBC with differential / absolute neutrophil count",
    // ANC lives in a differential, so a bare WBC is deliberately not accepted as
    // satisfying this protocol: neutropenia is the question being asked.
    resultMatch: ["absolute neutrophil", "anc", "differential"],
    intervalDays: 28,
    intervalLabel: "at the configured monitoring interval",
    basis:
      "Clozapine monitoring is neutrophil-based; a white-cell count alone does not answer it. The required cadence is set by the applicable REMS/monitoring programme and by the patient's current status, which this build does not hold — so this surfaces a review prompt at a configured default interval and never an order.",
  },
  {
    key: "antipsychotic-metabolic",
    medicationMatch: ["quetiapine", "seroquel", "olanzapine", "risperidone", "aripiprazole"],
    medicationLabel: "Second-generation antipsychotic",
    reviewLabel: "fasting lipids and HbA1c or fasting glucose",
    resultMatch: ["lipid", "a1c", "glucose"],
    intervalDays: 365,
    intervalLabel: "every 12 months",
    basis:
      "Practice-configured metabolic surveillance cadence for second-generation antipsychotics. Frequency is configuration and may be shortened for a patient with metabolic risk.",
  },
  {
    key: "mood-stabilizer-hepatic-renal",
    medicationMatch: ["lamotrigine", "lamictal", "valproate", "divalproex", "depakote", "carbamazepine"],
    medicationLabel: "Anticonvulsant mood stabilizer",
    reviewLabel: "CMP with hepatic and renal function (and a drug level where applicable)",
    resultMatch: ["cmp", "comprehensive metabolic", "alt", "ast", "valproic", "carbamazepine"],
    intervalDays: 365,
    intervalLabel: "every 12 months",
    basis:
      "Practice-configured periodic hepatic and renal surveillance for anticonvulsant mood stabilizers. Interval is configuration; a recent dose change or symptom may warrant sooner review.",
  },
];

/**
 * The general fallback: an active medication list with no monitoring result of
 * any kind on file for a long time is worth a look, even when no specific
 * protocol matched. Configured separately so it can be turned down or off
 * without touching the protocol table.
 */
export const CARE_COMPLETION_GENERAL_MONITORING_INTERVAL_DAYS = 365;

export function monitoringProtocolsForMedication(
  medicationName: string,
  genericName?: string | null,
): CareCompletionMonitoringProtocol[] {
  const haystack = `${medicationName} ${genericName ?? ""}`.toLowerCase();
  return CARE_COMPLETION_MONITORING_PROTOCOLS.filter((protocol) =>
    protocol.medicationMatch.some((needle) => haystack.includes(needle)),
  );
}

/* ------------------------------------------------------------------------- */
/* Board shape                                                                */
/* ------------------------------------------------------------------------- */

export type CareCompletionPatientCard = {
  patientId: string;
  patientName: string;
  patientMrn: string;
  patientInitials: string;
  pinnedAt: string;
  /** The encounter this card's visit-scoped rules were resolved against. */
  focusEncounterId?: string;
  focusEncounterDate?: string;
  items: CareCompletionItem[];
  progress: CareCompletionProgress;
};

export type CareCompletionBoard = {
  /** ISO instant the projection was computed, so a stale card can say so. */
  resolvedAt: string;
  cards: CareCompletionPatientCard[];
  /**
   * Pins whose patient the actor can no longer reach.
   *
   * Reported as a count and nothing else. A pin is not authorization, so a pin
   * that outlived its access must not leak the name it was pinned under.
   */
  inaccessiblePinCount: number;
  /** Rules that exist but cannot run here, with the reason stated. */
  unavailableRules: ReadonlyArray<{ id: CareCompletionRuleId; label: string; reason: string }>;
};

/* ------------------------------------------------------------------------- */
/* Spoken and typed deferral requests                                         */
/* ------------------------------------------------------------------------- */

const REASON_PATTERNS: ReadonlyArray<{ code: CareCompletionDeferralReasonCode; pattern: RegExp }> = [
  { code: "waiting-for-roi", pattern: /\b(roi|release of information|release-of-information|authorization to disclose)\b/i },
  { code: "waiting-for-pcp", pattern: /\b(pcp|primary care|family doctor)\b/i },
  { code: "waiting-for-labs", pattern: /\b(lab|labs|level|result|results|draw)\b/i },
  { code: "waiting-for-outside-records", pattern: /\b(outside records|prior records|records request|old chart)\b/i },
  { code: "patient-checking-schedule", pattern: /\b(work schedule|check(?:ing)? (?:their|her|his) schedule|call(?:ing)? back to schedule)\b/i },
  { code: "not-clinically-indicated-now", pattern: /\b(not indicated|not clinically indicated|no longer needed|not needed now)\b/i },
  { code: "waiting-for-patient", pattern: /\b(patient|they|she|he) (?:will|is going to|needs to|has to)\b/i },
];

/**
 * Maps a spoken reason onto the recorded vocabulary, conservatively.
 *
 * The free text the clinician actually said is always stored alongside the code
 * — the code is for grouping, not for replacing what they meant. Anything the
 * patterns do not recognise becomes `other` with the words intact, which is
 * honest: a category nobody chose should not be asserted.
 */
export function inferDeferralReasonCode(text: string | undefined): CareCompletionDeferralReasonCode {
  if (!text) return "other";
  for (const entry of REASON_PATTERNS) {
    if (entry.pattern.test(text)) return entry.code;
  }
  return "other";
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Whether a free-text phrase names exactly one work item on a board.
 *
 * Deliberately strict, and deliberately weighted. What an item *is* — its rule
 * identity and its label — decides the match; the detail line only breaks ties.
 * Without that split, an item whose prose happens to mention another item's
 * subject competes with it: "no follow-up appointment to include yet" sits in
 * the medication-summary line, and scoring it equally made "the follow-up
 * appointment" ambiguous between two unrelated pieces of work.
 *
 * A phrase that still reaches two items returns both rather than picking one.
 * A fuzzy match that deferred the wrong work is a clinical safety failure, not
 * a UX annoyance, so the caller refuses and asks.
 */
export function matchWorkItemsByHint(
  items: readonly CareCompletionItem[],
  hint: string,
): CareCompletionItem[] {
  const needle = normalizeForMatch(hint);
  if (!needle) return [];

  const words = needle.split(" ").filter((word) => word.length >= 3);
  const scored = items
    .map((item) => {
      const identity = normalizeForMatch(`${item.ruleId} ${item.label}`);
      const detail = normalizeForMatch(item.detail ?? "");
      const exact = identity.includes(needle) ? 1 : 0;
      const identityWords = words.filter((word) => identity.includes(word)).length;
      const detailWords = words.filter((word) => detail.includes(word)).length;
      // Identity dominates: a whole-phrase hit on the name outweighs any amount
      // of incidental agreement in a sentence beneath it.
      const score = exact * (words.length + 1) * 100 + identityWords * 10 + detailWords;
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (scored.length === 0) return [];
  const best = scored[0].score;
  return scored.filter((entry) => entry.score === best).map((entry) => entry.item);
}
