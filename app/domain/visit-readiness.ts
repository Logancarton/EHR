import type { CareCompletionItem, CareCompletionRuleId } from "./care-completion";
import type { CoveragePolicy } from "./patient-administration";
import type { ChargeTemplate } from "./billing-setup";
import { chargeTemplateForNoteTemplate, normalizeProcedureCode } from "./billing-setup";
import type { PatientMonitoringItem } from "../lib/clinical-protocols";
import type { CurrentSafetyFlag } from "./clinical-measurements";
import { formatCalendarDate } from "../lib/clinical-date";

/**
 * Visit readiness (NOTE-READY-1, D-100).
 *
 * The prompts a clinician sees *while writing the note*: what the note is still
 * missing, what billing and insurance need, and which labs, medication and
 * follow-up loops are open for this patient.
 *
 * This is a projection, never a store. Every item is derived on each render from
 * a source that already owns the fact:
 *
 * - the draft itself and the coding engine's documentation goals (note);
 * - the practice's charge templates, fee schedule and billing identifiers, the
 *   coverage on file, and the encounter's coded diagnosis references (billing);
 * - medication surveillance from the D-099 monitoring policy — the same engine and
 *   evidence the chart Overview uses — and the care-completion rules, unchanged,
 *   for results, prescriptions, messages and follow-up.
 *
 * Nothing here can be checked off by hand. An item closes when its source
 * changes — the section is written, the time is recorded, the lab is ordered — so
 * the panel cannot drift from the record the way a separate checklist would.
 * Where a source could not be read the group says so; it never reads as "all
 * clear" because a request failed.
 */

export type ReadinessGroupId = "note" | "billing" | "labs" | "meds" | "follow-up";

export const READINESS_GROUPS: ReadonlyArray<{ id: ReadinessGroupId; label: string }> = [
  { id: "note", label: "Note" },
  { id: "billing", label: "Billing & insurance" },
  { id: "labs", label: "Labs & monitoring" },
  { id: "meds", label: "Medications" },
  { id: "follow-up", label: "Follow-up" },
];

export type ReadinessState = "open" | "complete" | "deferred" | "unavailable" | "info";

/** Where an item's fix lives. The panel turns each into a real control. */
export type ReadinessAction =
  | { kind: "focus-section"; section: string; label: string }
  | { kind: "therapy-time"; label: string }
  | { kind: "open-chart"; section: "Overview" | "Meds" | "Labs" | "Messages" | "History"; label: string }
  | { kind: "open-schedule"; label: string }
  | { kind: "open-billing"; label: string }
  | { kind: "patient-admin"; label: string }
  | { kind: "retry"; label: string };

export type ReadinessItem = {
  id: string;
  group: ReadinessGroupId;
  state: ReadinessState;
  label: string;
  detail?: string;
  /** Whose fact this is: the draft on screen, the chart, or the practice's setup. */
  source: "note" | "chart" | "practice";
  action?: ReadinessAction;
};

export type ReadinessGroup = {
  id: ReadinessGroupId;
  label: string;
  items: ReadinessItem[];
  open: number;
  /** Set when this group's source could not be read. Never rendered as empty. */
  error?: string;
  loading?: boolean;
};

/* ------------------------------------------------------------------------- */
/* Server view                                                                */
/* ------------------------------------------------------------------------- */

export type CoverageFinding = {
  id: string;
  state: "open" | "complete" | "info";
  label: string;
  detail?: string;
};

export type EncounterDiagnosisEvidence = {
  /** Confirmed problem references on this encounter that carry a code. */
  confirmedCoded: number;
  /** Proposed problem references that carry a code — they count once confirmed at signing. */
  proposedCoded: number;
  /** Active coded problems on the chart, whether or not the note references them. */
  chartCodedProblems: number;
};

export type VisitReadinessServerView = {
  patientId: string;
  encounterId: string | null;
  resolvedAt: string;
  care: { items: CareCompletionItem[] } | { error: string };
  /**
   * Safety flags from the latest administration of each rating scale. Optional so
   * a response from an older build degrades to "could not be read", never to
   * "no safety concern".
   */
  safety?: { flags: CurrentSafetyFlag[] } | { error: string };
  /** D-099 medication surveillance, evaluated against the effective policy. */
  monitoring: { items: PatientMonitoringItem[] } | { error: string };
  coverage: { findings: CoverageFinding[] } | { error: string };
  /** Null when the encounter has not reached the server yet — not "no diagnoses". */
  diagnosis: EncounterDiagnosisEvidence | null;
  billing:
    | {
        chargeTemplates: ChargeTemplate[];
        feeCodes: Array<{ code: string; modifier: string }>;
        rendering: { hasNpi: boolean };
      }
    | { error: string };
};

/* ------------------------------------------------------------------------- */
/* Coverage                                                                   */
/* ------------------------------------------------------------------------- */

function isPast(date: string | undefined, today: string): boolean {
  return Boolean(date && /^\d{4}-\d{2}-\d{2}/.test(date) && date.slice(0, 10) < today);
}

/**
 * What the recorded coverage is missing for a claim or a superbill.
 *
 * Stated as "recorded", never "eligible": no payer has been asked anything, so a
 * complete record means only that the fields a claim needs are filled in.
 */
export function coverageReadiness(policies: readonly CoveragePolicy[], today: string): CoverageFinding[] {
  const active = policies
    .filter((policy) => policy.status === "active")
    .sort((left, right) => left.priority - right.priority);
  const primary = active[0];

  if (!primary) {
    return [
      {
        id: "coverage-none",
        state: "open",
        label: "No coverage recorded",
        detail: "Record the patient's insurance, or record self-pay, so the charge knows who is billed.",
      },
    ];
  }

  if (primary.isSelfPay || primary.coverageType === "self-pay") {
    return [
      {
        id: "coverage-self-pay",
        state: "complete",
        label: "Self-pay recorded",
        detail: "A superbill can be produced once the charge is reviewed.",
      },
    ];
  }

  const findings: CoverageFinding[] = [];
  const payer = primary.payerName || "Primary insurance";
  if (!primary.memberId?.trim()) {
    findings.push({ id: "coverage-member-id", state: "open", label: `${payer}: member ID not recorded` });
  }
  const dependent = primary.relationship && primary.relationship !== "self";
  if (dependent && !primary.subscriberName?.trim()) {
    findings.push({ id: "coverage-subscriber-name", state: "open", label: `${payer}: subscriber name not recorded` });
  }
  if (dependent && !primary.subscriberDob?.trim()) {
    findings.push({ id: "coverage-subscriber-dob", state: "open", label: `${payer}: subscriber date of birth not recorded` });
  }
  if (isPast(primary.terminationDate, today)) {
    findings.push({
      id: "coverage-terminated",
      state: "open",
      label: `${payer} ended ${primary.terminationDate}`,
      detail: "The policy on file has a termination date in the past. Confirm current coverage with the patient.",
    });
  }
  if (findings.length === 0) {
    findings.push({
      id: "coverage-recorded",
      state: "complete",
      label: `${payer} recorded`,
      detail: "The fields a claim needs are on file. Eligibility has not been verified with the payer.",
    });
  }
  return findings;
}

/* ------------------------------------------------------------------------- */
/* Client-side combination                                                    */
/* ------------------------------------------------------------------------- */

/** Care-completion rules that belong beside a note, and the group each goes in. */
/**
 * `monitoring-labs` is deliberately absent. D-099 makes the monitoring policy the
 * owner of medication-surveillance timing, and the chart Overview asserts it from
 * that policy; showing care completion's older catalogue beside it would give the
 * clinician two answers to one question.
 */
const CARE_RULE_GROUP: Partial<Record<CareCompletionRuleId, ReadinessGroupId>> = {
  "result-review": "labs",
  "prescription-transmission": "meds",
  "medication-change-message": "meds",
  "follow-up-appointment": "follow-up",
  "pcp-notification": "follow-up",
  "manual-task": "follow-up",
  "coding-review": "billing",
  "patient-balance-reminder": "billing",
};

/** Coding goals, mapped to the note section that satisfies each. */
const GOAL_SECTION: Record<string, string> = {
  hpi: "intervalHistory",
  response: "treatmentResponse",
  tolerability: "sideEffects",
  mse: "mse",
  "rx-management": "plan",
  safety: "riskAssessment",
};

/** Sections the coding goals do not cover but a finished note still needs. */
const REQUIRED_SECTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "chiefComplaint", label: "Chief complaint" },
  { id: "assessment", label: "Assessment" },
  { id: "plan", label: "Treatment plan" },
  { id: "followUp", label: "Follow-up" },
];

export type ReadinessDraftFacts = {
  sections: Record<string, string>;
  goals: ReadonlyArray<{ id: string; label: string; detail: string; met: boolean; codeImpact: string }>;
  primaryCode: string;
  addonCodes: readonly string[];
  evidenceBasis: "structured" | "mixed" | "inferred";
  noteTemplateId: string;
  /** Whether the chosen note template is a psychotherapy visit. */
  templateExpectsPsychotherapy: boolean;
  psychotherapyMinutes: number;
};

export type BuildVisitReadinessInput = {
  draft: ReadinessDraftFacts;
  /** The server view, or null while it is loading. */
  server: VisitReadinessServerView | null;
  /** Set when the server view request itself failed. */
  serverError: string | null;
  /** Encounter references could not be refreshed; coding may be reading prose. */
  referenceRefreshFailed: boolean;
  /**
   * The note is signed and immutable. Its documentation gaps are history now, not
   * work: they are reported as information and no longer counted as open.
   */
  isSigned?: boolean;
};

function careActionFor(item: CareCompletionItem): ReadinessAction | undefined {
  const target = item.action?.targetSection;
  if (!target || !item.action) return undefined;
  if (target === "Schedule") return { kind: "open-schedule", label: item.action.label };
  if (target === "Billing") return { kind: "open-billing", label: item.action.label };
  if (target === "Encounter") return undefined;
  return { kind: "open-chart", section: target, label: item.action.label };
}

function careItems(items: readonly CareCompletionItem[]): ReadinessItem[] {
  const result: ReadinessItem[] = [];
  for (const item of items) {
    const group = CARE_RULE_GROUP[item.ruleId];
    if (!group) continue;
    result.push({
      id: `care:${item.itemKey}`,
      group,
      state: item.state,
      label: item.label,
      detail: item.state === "unavailable" ? item.unavailableReason : item.detail,
      source: "chart",
      action: item.state === "open" || item.state === "deferred" ? careActionFor(item) : undefined,
    });
  }
  return result;
}

function monitoringItems(items: readonly PatientMonitoringItem[]): ReadinessItem[] {
  return items.map((entry) => {
    const due = entry.status === "overdue" || entry.status === "due";
    const last = formatCalendarDate(entry.lastDoneDate);
    const timing =
      entry.lastDoneDate === null
        ? "none on file"
        : entry.status === "overdue"
          ? `last ${last}, overdue`
          : entry.status === "due"
            ? `last ${last}, due now`
            : entry.status === "due-soon"
              ? `due ${formatCalendarDate(entry.dueDate)}`
              : `last ${last}`;
    return {
      id: `monitoring:${entry.ruleId}:${entry.canonicalMedication}`,
      group: "labs" as const,
      state: due ? ("open" as const) : entry.status === "due-soon" ? ("info" as const) : ("complete" as const),
      label: `${entry.requiredMeasure} — ${entry.medication}`,
      detail: `${entry.intervalLabel} · ${timing}`,
      source: "chart" as const,
      action: due ? { kind: "open-chart" as const, section: "Labs" as const, label: "Open labs" } : undefined,
    };
  });
}

/**
 * A current safety flag outranks every documentation gap: it is listed first and
 * stays open until this note's Risk Assessment is written. It replaces the plain
 * safety goal rather than sitting beside it, so the clinician sees one item that
 * says why risk must be assessed today.
 */
function safetyItems(input: BuildVisitReadinessInput): ReadinessItem[] {
  const safety = input.server?.safety;
  if (!input.server) return [];
  const riskWritten = (input.draft.sections.riskAssessment ?? "").trim().length >= 10;
  if (!safety || "error" in safety) {
    return [
      {
        id: "safety:unavailable",
        group: "note",
        state: "unavailable",
        label: "Safety screening history could not be read",
        detail: safety && "error" in safety ? safety.error : "Not provided by the server. Review rating scales before relying on this list.",
        source: "chart",
        action: { kind: "open-chart", section: "Overview", label: "Open overview" },
      },
    ];
  }
  return safety.flags.map((flag, index) => ({
    id: `safety:${flag.assessmentId}:${index}`,
    group: "note" as const,
    state: riskWritten ? ("complete" as const) : ("open" as const),
    label: riskWritten
      ? `Risk assessed for ${flag.title} safety flag`
      : `Safety flag: ${flag.title}, ${formatCalendarDate(flag.administeredAt)}`,
    detail: riskWritten ? undefined : `${flag.flag} Write the Risk Assessment for this visit.`,
    source: "chart" as const,
    action: riskWritten ? undefined : { kind: "focus-section" as const, section: "riskAssessment", label: "Go to Risk Assessment" },
  }));
}

function noteItems(input: BuildVisitReadinessInput): ReadinessItem[] {
  const { draft } = input;
  const items: ReadinessItem[] = safetyItems(input);
  const openSections = new Set<string>();
  const safetyFlagged = items.some((item) => item.id.startsWith("safety:") && item.id !== "safety:unavailable");

  for (const goal of draft.goals) {
    if (goal.id === "psychotherapy") continue; // billing group owns therapy time
    if (goal.id === "safety" && safetyFlagged) {
      if (!goal.met) openSections.add("riskAssessment");
      continue;
    }
    const section = GOAL_SECTION[goal.id];
    if (!goal.met && section) openSections.add(section);
    items.push({
      id: `goal:${goal.id}`,
      group: "note",
      state: goal.met ? "complete" : "open",
      label: goal.label,
      detail: goal.met ? undefined : goal.codeImpact || goal.detail,
      source: "note",
      action: !goal.met && section ? { kind: "focus-section", section, label: "Go to section" } : undefined,
    });
  }

  for (const required of REQUIRED_SECTIONS) {
    if (openSections.has(required.id)) continue;
    const written = (draft.sections[required.id] ?? "").trim().length > 0;
    items.push({
      id: `section:${required.id}`,
      group: "note",
      state: written ? "complete" : "open",
      label: written ? `${required.label} written` : `${required.label} is empty`,
      source: "note",
      action: written ? undefined : { kind: "focus-section", section: required.id, label: "Write it" },
    });
  }

  if (input.referenceRefreshFailed) {
    items.push({
      id: "note:evidence-refresh",
      group: "note",
      state: "open",
      label: "Linked records could not be refreshed",
      detail: "Coding may be using note-text fallback rather than confirmed reference provenance.",
      source: "chart",
      action: { kind: "retry", label: "Retry" },
    });
  }
  return items;
}

function billingItems(input: BuildVisitReadinessInput): { items: ReadinessItem[]; error?: string } {
  const { draft, server } = input;
  const items: ReadinessItem[] = [];
  const basisLabel =
    draft.evidenceBasis === "structured"
      ? "supported by linked records"
      : draft.evidenceBasis === "mixed"
        ? "partly supported by linked records"
        : "read from the note text only";

  items.push({
    id: "billing:suggested-code",
    group: "billing",
    state: "info",
    label: `Suggested ${[draft.primaryCode, ...draft.addonCodes].join(" + ")}`,
    detail: `A suggestion ${basisLabel}. You confirm the codes at signing.`,
    source: "note",
  });

  // Psychotherapy time is the one billing fact written in the note itself.
  const addOnExpected = draft.templateExpectsPsychotherapy || draft.psychotherapyMinutes > 0;
  if (addOnExpected) {
    const supported = draft.psychotherapyMinutes >= 16;
    items.push({
      id: "billing:therapy-time",
      group: "billing",
      state: supported ? "complete" : "open",
      label: supported
        ? `${draft.addonCodes.join(", ") || "Add-on"} supported by ${draft.psychotherapyMinutes} min`
        : "Psychotherapy time not recorded",
      detail: supported ? undefined : "An add-on code needs at least 16 minutes of psychotherapy documented.",
      source: "note",
      action: supported ? undefined : { kind: "therapy-time", label: "Record time" },
    });
  }

  if (server?.diagnosis) {
    const { confirmedCoded, proposedCoded, chartCodedProblems } = server.diagnosis;
    if (confirmedCoded > 0) {
      items.push({
        id: "billing:diagnosis",
        group: "billing",
        state: "complete",
        label: `${confirmedCoded} coded diagnosis${confirmedCoded === 1 ? "" : "es"} linked`,
        source: "chart",
      });
    } else if (proposedCoded > 0) {
      items.push({
        id: "billing:diagnosis",
        group: "billing",
        state: "open",
        label: `${proposedCoded} coded diagnosis${proposedCoded === 1 ? "" : "es"} awaiting confirmation`,
        detail: "Proposed links count toward the charge once you confirm them at signing.",
        source: "chart",
      });
    } else {
      items.push({
        id: "billing:diagnosis",
        group: "billing",
        state: "open",
        label: "No coded diagnosis linked to this note",
        detail:
          chartCodedProblems > 0
            ? "Name the diagnosis you addressed in the Assessment so it links to the coded problem on the chart."
            : "The chart has no coded problem yet. Add one to the problem list, then address it in the Assessment.",
        source: "chart",
        action:
          chartCodedProblems > 0
            ? { kind: "focus-section", section: "assessment", label: "Go to Assessment" }
            : { kind: "open-chart", section: "Overview", label: "Open problem list" },
      });
    }
  } else if (server && !server.diagnosis) {
    items.push({
      id: "billing:diagnosis",
      group: "billing",
      state: "info",
      label: "Diagnosis links appear once the draft saves",
      source: "note",
    });
  }

  if (!server) return { items };

  if ("error" in server.coverage) {
    items.push({
      id: "billing:coverage-error",
      group: "billing",
      state: "unavailable",
      label: "Coverage could not be read",
      detail: server.coverage.error,
      source: "chart",
      action: { kind: "retry", label: "Retry" },
    });
  } else {
    for (const finding of server.coverage.findings) {
      items.push({
        id: `billing:${finding.id}`,
        group: "billing",
        state: finding.state,
        label: finding.label,
        detail: finding.detail,
        source: "chart",
        action: finding.state === "open" ? { kind: "patient-admin", label: "Update insurance" } : undefined,
      });
    }
  }

  if ("error" in server.billing) {
    items.push({
      id: "billing:setup-error",
      group: "billing",
      state: "unavailable",
      label: "Practice billing setup could not be read",
      detail: server.billing.error,
      source: "practice",
    });
  } else {
    const template = chargeTemplateForNoteTemplate(server.billing.chargeTemplates, draft.noteTemplateId);
    if (template) {
      const pos = [template.placeOfServiceInPerson && `POS ${template.placeOfServiceInPerson} in person`,
        template.placeOfServiceTelehealth && `${template.placeOfServiceTelehealth} telehealth`]
        .filter(Boolean)
        .join(" / ");
      items.push({
        id: "billing:charge-template",
        group: "billing",
        state: "complete",
        label: `Charge template: ${template.name}`,
        detail: [pos, template.telehealthModifier && `modifier ${template.telehealthModifier} for telehealth`]
          .filter(Boolean)
          .join(" · "),
        source: "practice",
      });
    } else {
      items.push({
        id: "billing:charge-template",
        group: "billing",
        state: "open",
        label: "No charge template for this visit type",
        detail: "Without one the charge carries no place of service or telehealth modifier.",
        source: "practice",
        action: { kind: "open-billing", label: "Set up in Billing" },
      });
    }

    const codes = [draft.primaryCode, ...draft.addonCodes].map(normalizeProcedureCode);
    const priced = new Set(server.billing.feeCodes.map((entry) => normalizeProcedureCode(entry.code)));
    const unpriced = codes.filter((code) => !priced.has(code));
    items.push(
      unpriced.length === 0
        ? {
            id: "billing:fees",
            group: "billing",
            state: "complete",
            label: "Practice fees set for these codes",
            source: "practice",
          }
        : {
            id: "billing:fees",
            group: "billing",
            state: "open",
            label: `No practice fee for ${unpriced.join(", ")}`,
            detail: "The charge will show no amount for these lines until the fee schedule has one.",
            source: "practice",
            action: { kind: "open-billing", label: "Open fee schedule" },
          },
    );

    if (!server.billing.rendering.hasNpi) {
      items.push({
        id: "billing:npi",
        group: "billing",
        state: "open",
        label: "Your NPI is not recorded for billing",
        detail: "A superbill for this visit would print without a rendering provider NPI.",
        source: "practice",
        action: { kind: "open-billing", label: "Open Billing" },
      });
    }
  }

  return { items };
}

const STATE_ORDER: Record<ReadinessState, number> = { open: 0, deferred: 1, info: 2, unavailable: 3, complete: 4 };

/**
 * A part the server did not send is unavailable, not empty — so a response from a
 * different build (a deploy mid-session, a stale cached answer) degrades to a
 * stated gap instead of breaking the note.
 */
function normalizeServerView(server: VisitReadinessServerView | null): VisitReadinessServerView | null {
  if (!server) return null;
  const missing = { error: "not provided by the server" };
  return {
    ...server,
    care: server.care ?? missing,
    safety: server.safety ?? missing,
    monitoring: server.monitoring ?? missing,
    coverage: server.coverage ?? missing,
    billing: server.billing ?? missing,
    diagnosis: server.diagnosis ?? null,
  };
}

export function buildVisitReadiness(rawInput: BuildVisitReadinessInput): { groups: ReadinessGroup[]; openCount: number } {
  const input = { ...rawInput, server: normalizeServerView(rawInput.server) };
  const loading = !input.server && !input.serverError;
  const byGroup = new Map<ReadinessGroupId, ReadinessItem[]>(READINESS_GROUPS.map((group) => [group.id, []]));
  const errors = new Map<ReadinessGroupId, string>();

  const signedHistory = (item: ReadinessItem): ReadinessItem =>
    input.isSigned && item.source === "note" && item.state === "open"
      ? { ...item, state: "info", detail: "Not documented in the signed note. A correction is the only way to add it now.", action: undefined }
      : item;
  for (const item of noteItems(input)) byGroup.get(item.group)!.push(signedHistory(item));
  for (const item of billingItems(input).items) byGroup.get(item.group)!.push(signedHistory(item));

  if (input.serverError) {
    for (const group of ["labs", "meds", "follow-up"] as const) errors.set(group, input.serverError);
  } else if (input.server) {
    if ("error" in input.server.care) {
      for (const group of ["labs", "meds", "follow-up"] as const) errors.set(group, input.server.care.error);
    } else {
      for (const item of careItems(input.server.care.items)) byGroup.get(item.group)!.push(item);
    }
    if ("error" in input.server.monitoring) {
      errors.set("labs", `medication monitoring policy: ${input.server.monitoring.error}`);
    } else {
      for (const item of monitoringItems(input.server.monitoring.items)) byGroup.get(item.group)!.push(item);
    }
  }

  const groups = READINESS_GROUPS.map((definition) => {
    const items = [...byGroup.get(definition.id)!].sort((left, right) => STATE_ORDER[left.state] - STATE_ORDER[right.state]);
    return {
      id: definition.id,
      label: definition.label,
      items,
      open: items.filter((item) => item.state === "open").length,
      error: errors.get(definition.id),
      loading: loading && definition.id !== "note",
    };
  });

  return { groups, openCount: groups.reduce((sum, group) => sum + group.open, 0) };
}
