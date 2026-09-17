import {
  CARE_COMPLETION_GENERAL_MONITORING_INTERVAL_DAYS,
  type CareCompletionEvidence,
  type CareCompletionItem,
  type CareCompletionMonitoringProtocol,
  type CareCompletionRuleId,
  careCompletionItemKey,
  classifyCareCompletionItem,
  getCareCompletionRule,
  monitoringProtocolsForMedication,
} from "../../domain/care-completion";
import { normalizeClinicalTimestamp } from "../../domain/clinical-timestamp";
import type { ClinicalPermission } from "../auth/provider-context";

/**
 * The deterministic care-completion resolvers.
 *
 * Every function here answers one question about one patient by reading records
 * that already exist, and none of them writes. The separation is the point: a
 * rule that could both decide completion and record it would be a second source
 * of truth within one file.
 *
 * Two conventions hold throughout:
 *
 * 1. **A completion carries its evidence.** If a rule cannot name the row it
 *    read the fact from, it does not report complete.
 * 2. **A missing source is stated, not guessed.** Where a rule needs something
 *    this build does not hold, the item says so and is counted as neither done
 *    nor open.
 */

/* ------------------------------------------------------------------------- */
/* Evidence bundle                                                            */
/* ------------------------------------------------------------------------- */

export type CareCompletionEncounterFacts = {
  id: string;
  date: string;
  status: "draft" | "signed";
  followUp: string;
  /** The visit this encounter was started from, when it was started from one. */
  appointmentId?: string;
  signedAt?: string;
  updatedAt: string;
  /** Number of ambient transcript utterances captured on the draft. */
  transcriptUtteranceCount: number;
};

export type CareCompletionAppointmentFacts = {
  id: string;
  date: string;
  time: string;
  status: string;
  originAppointmentId?: string;
  followUpInterval?: string;
};

export type CareCompletionOrderFacts = {
  id: string;
  type: "medication" | "lab";
  name: string;
  status: string;
  encounterId?: string;
  createdAt: string;
};

export type CareCompletionTransactionFacts = {
  id: string;
  orderId: string;
  state: string;
  submittedAt?: string;
};

export type CareCompletionObservationFacts = {
  id: string;
  testName: string;
  category: string;
  effectiveAt: string;
  status: string;
  interpretation?: string;
  acknowledgedAt?: string;
};

export type CareCompletionMedicationFacts = {
  id: string;
  medicationName: string;
  genericName?: string;
  displayText: string;
  status: string;
};

export type CareCompletionMessageFacts = {
  id: string;
  senderRole: string;
  /** ISO instant, or null for a legacy row that cannot be placed in time. */
  createdAt: string | null;
};

export type CareCompletionNoteReferenceFacts = {
  id: string;
  encounterId: string;
  source: string;
  status: string;
};

export type CareCompletionChargeFacts = {
  id: string;
  encounterId: string;
  status: string;
  reviewedAt?: string;
  procedureCodeCount: number;
};

export type CareCompletionTaskFacts = {
  id: string;
  text: string;
  completed: boolean;
  due: string;
};

export type CareCompletionCareNetworkFacts = {
  id: string;
  role: string;
  name: string;
  organization?: string;
};

export type CareCompletionEvidenceBundle = {
  patientId: string;
  /** Newest first. */
  encounters: CareCompletionEncounterFacts[];
  appointments: CareCompletionAppointmentFacts[];
  orders: CareCompletionOrderFacts[];
  transactions: CareCompletionTransactionFacts[];
  observations: CareCompletionObservationFacts[];
  medications: CareCompletionMedicationFacts[];
  messages: CareCompletionMessageFacts[];
  noteReferences: CareCompletionNoteReferenceFacts[];
  charges: CareCompletionChargeFacts[];
  tasks: CareCompletionTaskFacts[];
  careNetwork: CareCompletionCareNetworkFacts[];
};

export type CareCompletionResolveOptions = {
  /** Capabilities held by the actor the board is being built for. */
  capabilities: ReadonlySet<ClinicalPermission>;
  /** Evaluation instant, injectable so tests do not depend on the wall clock. */
  now: Date;
};

/* ------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* ------------------------------------------------------------------------- */

/**
 * The instant a stored clinical date names, or `null` when it names none.
 *
 * Encounter and appointment dates are not uniformly formatted in this product:
 * the schedule and the API write `2026-09-15`, while seeded rows and some UI
 * paths write `Sep 15, 2026`. `Date.parse` accepts both and places them
 * *differently* — a bare ISO date is UTC midnight, a display date is local
 * midnight — so west of UTC the display form sorts later than the ISO form for
 * the same day. Ordering encounters that way picked the wrong visit as the
 * card's focus, which is how a real follow-up plan came to produce no work item
 * at all.
 *
 * `normalizeClinicalTimestamp` is the product's existing answer to exactly this
 * (D-065): it recognises only forms this codebase is known to have written,
 * places a display date at UTC midnight of the day it names, and refuses to
 * guess at anything else. Reusing it makes the two formats directly comparable
 * and keeps an unplaceable date unplaceable rather than silently epoch-zero.
 */
function instant(value: string | null | undefined): number | null {
  const normalized = normalizeClinicalTimestamp(value);
  if (!normalized.iso) return null;
  const parsed = Date.parse(normalized.iso);
  return Number.isNaN(parsed) ? null : parsed;
}

function daysBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / (1000 * 60 * 60 * 24));
}

/** `2026-10-12` and `02:00 PM` as a clinician reads them back. */
export function formatAppointmentMoment(date: string, time: string): string {
  const parsed = instant(date);
  if (parsed === null) return `${date} · ${time}`;
  const label = new Date(parsed).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${label} · ${time}`;
}

function evidence(
  sourceKind: CareCompletionEvidence["sourceKind"],
  sourceId: string,
  label: string,
  occurredAt?: string,
): CareCompletionEvidence {
  return { sourceKind, sourceId, label, occurredAt };
}

function permitted(ruleId: CareCompletionRuleId, options: CareCompletionResolveOptions): boolean {
  const required = getCareCompletionRule(ruleId).requiredCapability;
  return !required || options.capabilities.has(required);
}

/**
 * Builds an item from its rule definition so label, deferability and target all
 * come from one place. Classification is derived last, from the finished item.
 */
function buildItem(
  ruleId: CareCompletionRuleId,
  input: {
    scopeId?: string;
    label?: string;
    detail?: string;
    state: CareCompletionItem["state"];
    explanation?: string;
    evidence?: CareCompletionEvidence[];
    action?: CareCompletionItem["action"];
    unavailableReason?: string;
    deferrable?: boolean;
  },
): CareCompletionItem {
  const rule = getCareCompletionRule(ruleId);
  const item: CareCompletionItem = {
    itemKey: careCompletionItemKey(ruleId, input.scopeId),
    ruleId,
    scopeId: input.scopeId,
    label: input.label ?? rule.label,
    detail: input.detail,
    authority: rule.authority,
    state: input.state,
    classification: "observed",
    explanation: input.explanation ?? rule.rationale,
    evidence: input.evidence ?? [],
    action: input.action,
    // An item that is already done, or that cannot be done here at all, is not
    // work anybody needs to explain putting off.
    deferrable:
      (input.deferrable ?? rule.deferrable) &&
      input.state !== "complete" &&
      input.state !== "unavailable",
    unavailableReason: input.unavailableReason ?? rule.unavailableReason,
  };
  item.classification = classifyCareCompletionItem(item);
  return item;
}

/* ------------------------------------------------------------------------- */
/* Focus encounter                                                            */
/* ------------------------------------------------------------------------- */

/**
 * The visit this card's visit-scoped rules are about.
 *
 * The most recent encounter, preferring an unsigned draft: an open draft is the
 * work in front of the clinician, and a card that reported on last month's
 * signed visit while a draft sat unsigned would be answering the wrong question.
 */
export function focusEncounter(
  bundle: CareCompletionEvidenceBundle,
): CareCompletionEncounterFacts | null {
  if (bundle.encounters.length === 0) return null;
  const sorted = [...bundle.encounters].sort((left, right) => {
    // An encounter whose date cannot be placed sorts last rather than first: a
    // visit nobody can date should not become the one the whole card reports on.
    const leftDay = instant(left.date) ?? Number.NEGATIVE_INFINITY;
    const rightDay = instant(right.date) ?? Number.NEGATIVE_INFINITY;
    if (leftDay !== rightDay) return rightDay - leftDay;
    // Same day: the most recently touched draft is the one in front of the
    // clinician. `updatedAt` is always an ISO instant, so this tiebreak is exact.
    return (instant(right.updatedAt) ?? 0) - (instant(left.updatedAt) ?? 0);
  });
  return sorted.find((encounter) => encounter.status === "draft") ?? sorted[0];
}

/* ------------------------------------------------------------------------- */
/* Rule: sign encounter                                                       */
/* ------------------------------------------------------------------------- */

export function resolveEncounterSigned(
  bundle: CareCompletionEvidenceBundle,
  options: CareCompletionResolveOptions,
): CareCompletionItem | null {
  if (!permitted("encounter-signed", options)) return null;
  const encounter = focusEncounter(bundle);
  if (!encounter) return null;

  if (encounter.status === "signed") {
    return buildItem("encounter-signed", {
      scopeId: encounter.id,
      label: "Encounter signed",
      detail: encounter.signedAt
        ? `Signed ${encounter.signedAt}`
        : `Signed encounter recorded for ${encounter.date}`,
      state: "complete",
      evidence: [
        evidence("encounter", encounter.id, `Signed encounter ${encounter.date}`, encounter.signedAt),
      ],
      action: {
        label: "Open note",
        targetSection: "Encounter",
        encounterId: encounter.id,
      },
    });
  }

  return buildItem("encounter-signed", {
    scopeId: encounter.id,
    detail: `Draft from ${encounter.date} is unsigned`,
    state: "open",
    evidence: [evidence("encounter", encounter.id, `Draft encounter ${encounter.date}`, encounter.updatedAt)],
    action: {
      label: "Open encounter",
      targetSection: "Encounter",
      encounterId: encounter.id,
    },
  });
}

/* ------------------------------------------------------------------------- */
/* Rule: follow-up appointment                                                */
/* ------------------------------------------------------------------------- */

/**
 * The statuses that stop an appointment from being evidence of a closed loop.
 *
 * A tentative hold has not become a booked follow-up. Cancelled and missed
 * visits no longer close the loop either. The board must keep the work open
 * until a linked appointment has a qualifying scheduled state.
 */
const NON_QUALIFYING_APPOINTMENT_STATUSES = new Set(["tentative", "cancelled", "no-show"]);

/**
 * Whether the encounter recorded an intention to see this patient again.
 *
 * Read from the note's own follow-up field or from the interval stamped on the
 * originating visit. Both are things a clinician wrote down; neither is
 * inferred from the shape of the chart.
 */
export function followUpRecommendation(
  encounter: CareCompletionEncounterFacts,
  appointments: readonly CareCompletionAppointmentFacts[],
): { recommended: boolean; interval?: string; source: "note" | "appointment" | "none" } {
  const origin = encounter.appointmentId
    ? appointments.find((appointment) => appointment.id === encounter.appointmentId)
    : undefined;

  if (origin?.followUpInterval) {
    return { recommended: true, interval: origin.followUpInterval, source: "appointment" };
  }
  const note = encounter.followUp?.trim();
  if (note) {
    return { recommended: true, interval: note.length <= 60 ? note : undefined, source: "note" };
  }
  return { recommended: false, source: "none" };
}

/**
 * The appointment that closes this encounter's follow-up loop.
 *
 * Linkage, not proximity: an appointment counts only when it was created as the
 * follow-up to this visit's own originating appointment. A patient with an
 * unrelated visit next month has not had this plan acted on, and treating any
 * future appointment as satisfying it is precisely the mistake that lets a
 * forgotten follow-up look finished.
 */
export function qualifyingFollowUpAppointment(
  encounter: CareCompletionEncounterFacts,
  appointments: readonly CareCompletionAppointmentFacts[],
): CareCompletionAppointmentFacts | null {
  if (!encounter.appointmentId) return null;
  const originDate = instant(encounter.date);

  const linked = appointments
    .filter((appointment) => appointment.originAppointmentId === encounter.appointmentId)
    .filter((appointment) => !NON_QUALIFYING_APPOINTMENT_STATUSES.has(appointment.status))
    .filter((appointment) => {
      // A link pointing backwards in time is not a follow-up.
      const when = instant(appointment.date);
      if (when === null || originDate === null) return true;
      return when >= originDate;
    })
    .sort((left, right) => (instant(left.date) ?? 0) - (instant(right.date) ?? 0));

  return linked[0] ?? null;
}

export function resolveFollowUpAppointment(
  bundle: CareCompletionEvidenceBundle,
  options: CareCompletionResolveOptions,
): CareCompletionItem | null {
  if (!permitted("follow-up-appointment", options)) return null;
  const encounter = focusEncounter(bundle);
  if (!encounter) return null;

  const recommendation = followUpRecommendation(encounter, bundle.appointments);
  if (!recommendation.recommended) return null;

  const scheduled = qualifyingFollowUpAppointment(encounter, bundle.appointments);
  if (scheduled) {
    return buildItem("follow-up-appointment", {
      scopeId: encounter.id,
      label: "Follow-up",
      detail: formatAppointmentMoment(scheduled.date, scheduled.time),
      state: "complete",
      evidence: [
        evidence(
          "appointment",
          scheduled.id,
          `Linked follow-up appointment ${scheduled.date} ${scheduled.time} (${scheduled.status})`,
        ),
      ],
      action: {
        label: "Open schedule",
        targetSection: "Schedule",
        appointmentId: scheduled.id,
      },
    });
  }

  const intervalSuffix = recommendation.interval ? ` — recommended ${recommendation.interval}` : "";

  // No originating appointment means there is nothing for a follow-up to be
  // linked to. Said out loud rather than quietly resolved: the loop really is
  // open, and the reason it cannot close automatically is worth knowing.
  const linkageNote = encounter.appointmentId
    ? undefined
    : "This encounter was not started from a scheduled visit, so no follow-up can be linked back to it. Scheduling from the visit closes the loop automatically.";

  return buildItem("follow-up-appointment", {
    scopeId: encounter.id,
    label: `Schedule follow-up${intervalSuffix}`,
    detail: linkageNote
      ? "No linked follow-up appointment exists"
      : "No linked follow-up appointment exists for this visit",
    state: "open",
    explanation: linkageNote
      ? `${getCareCompletionRule("follow-up-appointment").rationale} ${linkageNote}`
      : undefined,
    evidence: [
      evidence(
        "encounter",
        encounter.id,
        recommendation.source === "appointment"
          ? `Follow-up interval recorded on the originating visit`
          : `Follow-up plan recorded in the note from ${encounter.date}`,
      ),
    ],
    action: {
      label: "Schedule follow-up",
      targetSection: "Schedule",
      encounterId: encounter.id,
      appointmentId: encounter.appointmentId,
    },
  });
}

/* ------------------------------------------------------------------------- */
/* Rule: prescription transmission                                            */
/* ------------------------------------------------------------------------- */

/** Transport states that mean the prescription actually left this practice. */
const SENT_TRANSACTION_STATES = new Set(["submitted", "acknowledged", "accepted"]);

export function resolvePrescriptionTransmission(
  bundle: CareCompletionEvidenceBundle,
  options: CareCompletionResolveOptions,
): CareCompletionItem[] {
  if (!permitted("prescription-transmission", options)) return [];
  const encounter = focusEncounter(bundle);

  const medicationOrders = bundle.orders.filter((order) => {
    if (order.type !== "medication") return false;
    // Scoped to the visit when the order carries one, so the board reports on
    // the work of this encounter rather than everything ever prescribed.
    if (encounter && order.encounterId) return order.encounterId === encounter.id;
    return !order.encounterId && order.status !== "transmitted";
  });
  if (medicationOrders.length === 0) return [];

  return medicationOrders.map((order) => {
    const transactions = bundle.transactions.filter((tx) => tx.orderId === order.id);
    const sent = transactions.find((tx) => SENT_TRANSACTION_STATES.has(tx.state));

    if (order.status === "transmitted" && sent) {
      return buildItem("prescription-transmission", {
        scopeId: order.id,
        label: `Prescription sent — ${order.name}`,
        detail: `Transport state: ${sent.state}`,
        state: "complete",
        evidence: [
          evidence("order", order.id, `Order ${order.name} recorded as transmitted`),
          evidence(
            "prescription-transaction",
            sent.id,
            `Prescription transaction ${sent.state}`,
            sent.submittedAt,
          ),
        ],
        action: { label: "Open medications", targetSection: "Meds", orderId: order.id },
      });
    }

    // Transmitted with no transaction to show for it, or a transaction that
    // failed or never resolved. Neither is "sent", and the difference matters
    // enough to say which one happened.
    const detail = (() => {
      if (order.status === "staged") return "Staged — not yet authorized";
      if (order.status === "authorized") return "Authorized — not yet transmitted";
      if (order.status === "transmission_failed") return "Transmission failed — needs review";
      if (order.status === "transmission_uncertain") return "Transmission outcome uncertain — needs review";
      if (order.status === "transmitted") {
        return "Recorded as transmitted, but no authoritative transport record confirms it";
      }
      return `Order status: ${order.status}`;
    })();

    return buildItem("prescription-transmission", {
      scopeId: order.id,
      label: `Send prescription — ${order.name}`,
      detail,
      state: "open",
      evidence: [
        evidence("order", order.id, `Order ${order.name} status ${order.status}`, order.createdAt),
        ...transactions.map((tx) =>
          evidence("prescription-transaction", tx.id, `Transaction state ${tx.state}`, tx.submittedAt),
        ),
      ],
      action: { label: "Open medications", targetSection: "Meds", orderId: order.id },
    });
  });
}

/* ------------------------------------------------------------------------- */
/* Rule: result review                                                        */
/* ------------------------------------------------------------------------- */

export function resolveResultReview(
  bundle: CareCompletionEvidenceBundle,
  options: CareCompletionResolveOptions,
): CareCompletionItem[] {
  if (!permitted("result-review", options)) return [];

  return bundle.observations
    .filter((observation) => observation.category === "lab")
    .filter((observation) => observation.status === "final" || observation.status === "amended")
    .filter((observation) => !observation.acknowledgedAt)
    .slice(0, 5)
    .map((observation) =>
      buildItem("result-review", {
        scopeId: observation.id,
        label: `Review result — ${observation.testName}`,
        detail: observation.interpretation
          ? `${observation.interpretation} · resulted ${observation.effectiveAt}`
          : `Resulted ${observation.effectiveAt}`,
        state: "open",
        evidence: [
          evidence(
            "observation",
            observation.id,
            `${observation.testName} has no recorded acknowledgement`,
            observation.effectiveAt,
          ),
        ],
        action: {
          label: "Open results",
          targetSection: "Labs",
          observationId: observation.id,
        },
      }),
    );
}

/* ------------------------------------------------------------------------- */
/* Rule: monitoring labs                                                      */
/* ------------------------------------------------------------------------- */

export type MonitoringFinding = {
  protocolKey: string;
  medicationLabel: string;
  medicationId: string;
  reviewLabel: string;
  intervalLabel: string;
  basis: string;
  lastResultAt: string | null;
  daysSinceLastResult: number | null;
};

/**
 * Which active medications have gone past their configured review interval.
 *
 * The interval and the reasoning come from the protocol catalogue, which is
 * data rather than code precisely so a practice can revise a cadence. Nothing
 * here orders anything: the output is "worth a look, and here is why".
 */
export function monitoringFindings(
  bundle: CareCompletionEvidenceBundle,
  now: Date,
): MonitoringFinding[] {
  const findings: MonitoringFinding[] = [];
  const active = bundle.medications.filter((medication) => medication.status === "active");
  const nowMs = now.getTime();
  const seen = new Set<string>();

  const matchingResult = (protocol: CareCompletionMonitoringProtocol) => {
    const matches = bundle.observations
      .filter((observation) => {
        const name = observation.testName.toLowerCase();
        return protocol.resultMatch.some((needle) => name.includes(needle));
      })
      .map((observation) => ({ observation, at: instant(observation.effectiveAt) }))
      .filter((entry): entry is { observation: CareCompletionObservationFacts; at: number } => entry.at !== null)
      .sort((left, right) => right.at - left.at);
    return matches[0] ?? null;
  };

  for (const medication of active) {
    const protocols = monitoringProtocolsForMedication(medication.medicationName, medication.genericName);
    for (const protocol of protocols) {
      if (seen.has(protocol.key)) continue;
      const latest = matchingResult(protocol);
      const days = latest ? daysBetween(latest.at, nowMs) : null;
      // Never monitored, or monitored longer ago than the configured interval.
      if (latest && days !== null && days <= protocol.intervalDays) continue;
      seen.add(protocol.key);
      findings.push({
        protocolKey: protocol.key,
        medicationLabel: protocol.medicationLabel,
        medicationId: medication.id,
        reviewLabel: protocol.reviewLabel,
        intervalLabel: protocol.intervalLabel,
        basis: protocol.basis,
        lastResultAt: latest?.observation.effectiveAt ?? null,
        daysSinceLastResult: days,
      });
    }
  }

  // The general fallback: an active medication list and no monitoring result of
  // any kind on file for a long time. Only offered when no specific protocol
  // already fired, so a patient is not told the same thing twice.
  if (findings.length === 0 && active.length > 0) {
    const latestLab = bundle.observations
      .filter((observation) => observation.category === "lab")
      .map((observation) => instant(observation.effectiveAt))
      .filter((value): value is number => value !== null)
      .sort((left, right) => right - left)[0];
    const days = latestLab === undefined ? null : daysBetween(latestLab, nowMs);
    if (days === null || days > CARE_COMPLETION_GENERAL_MONITORING_INTERVAL_DAYS) {
      findings.push({
        protocolKey: "general-medication-monitoring",
        medicationLabel: `${active.length} active medication${active.length === 1 ? "" : "s"}`,
        medicationId: active[0].id,
        reviewLabel: "whether any baseline or interval monitoring is indicated",
        intervalLabel: `every ${CARE_COMPLETION_GENERAL_MONITORING_INTERVAL_DAYS} days`,
        basis:
          "Practice-configured general interval: an active medication list with no laboratory monitoring on file for this long is worth a deliberate look. This is a configured default, not a statement that any particular test is required.",
        lastResultAt: null,
        daysSinceLastResult: days,
      });
    }
  }

  return findings;
}

export function resolveMonitoringLabs(
  bundle: CareCompletionEvidenceBundle,
  options: CareCompletionResolveOptions,
): CareCompletionItem[] {
  if (!permitted("monitoring-labs", options)) return [];

  return monitoringFindings(bundle, options.now).map((finding) => {
    // The clinician acting on this means placing a real lab order. An order
    // created after the last qualifying result is what closes it — not the
    // recommendation being read, and not a checkbox.
    const sinceMs = instant(finding.lastResultAt) ?? 0;
    const respondingOrder = bundle.orders.find(
      (order) => order.type === "lab" && (instant(order.createdAt) ?? 0) > sinceMs,
    );

    if (respondingOrder) {
      return buildItem("monitoring-labs", {
        scopeId: finding.protocolKey,
        label: `Monitoring labs ordered — ${finding.medicationLabel}`,
        detail: respondingOrder.name,
        state: "complete",
        explanation: finding.basis,
        evidence: [
          evidence(
            "order",
            respondingOrder.id,
            `Lab order ${respondingOrder.name} (${respondingOrder.status})`,
            respondingOrder.createdAt,
          ),
        ],
        action: { label: "Open results", targetSection: "Labs", orderId: respondingOrder.id },
      });
    }

    const lastSeen =
      finding.lastResultAt === null
        ? "no matching result on file"
        : `last ${finding.daysSinceLastResult} days ago`;

    return buildItem("monitoring-labs", {
      scopeId: finding.protocolKey,
      label: `Review monitoring labs — ${finding.medicationLabel}`,
      detail: `Consider ${finding.reviewLabel} · configured ${finding.intervalLabel} · ${lastSeen}`,
      state: "open",
      explanation: finding.basis,
      evidence: [
        evidence("medication", finding.medicationId, `Active medication: ${finding.medicationLabel}`),
        ...(finding.lastResultAt
          ? [evidence("observation", finding.protocolKey, `Most recent matching result`, finding.lastResultAt)]
          : []),
      ],
      action: { label: "Open results", targetSection: "Labs" },
    });
  });
}

/* ------------------------------------------------------------------------- */
/* Rule: medication-change communication                                      */
/* ------------------------------------------------------------------------- */

export function resolveMedicationChangeMessage(
  bundle: CareCompletionEvidenceBundle,
  options: CareCompletionResolveOptions,
): CareCompletionItem | null {
  if (!permitted("medication-change-message", options)) return null;
  const encounter = focusEncounter(bundle);
  if (!encounter || encounter.status !== "signed") return null;

  const encounterOrders = bundle.orders.filter(
    (order) => order.type === "medication" && order.encounterId === encounter.id,
  );
  if (encounterOrders.length === 0) return null;

  // The note's own signing instant is the boundary. A row whose instant cannot
  // be read is not counted either way: it is unusable evidence, not an absence.
  const signedAtMs = instant(encounter.signedAt) ?? instant(encounter.updatedAt);
  const sent = signedAtMs === null
    ? undefined
    : bundle.messages.find((message) => {
        if (message.senderRole !== "provider") return false;
        const at = instant(message.createdAt);
        return at !== null && at >= signedAtMs;
      });

  if (sent) {
    return buildItem("medication-change-message", {
      scopeId: encounter.id,
      label: "Medication-change summary sent",
      detail: `Sent ${new Date(instant(sent.createdAt)!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      state: "complete",
      evidence: [
        evidence("message", sent.id, "Message sent to the patient after this note was signed", sent.createdAt ?? undefined),
      ],
      action: { label: "Open messages", targetSection: "Messages" },
    });
  }

  const followUp = qualifyingFollowUpAppointment(encounter, bundle.appointments);
  const names = encounterOrders.map((order) => order.name).join(", ");

  return buildItem("medication-change-message", {
    scopeId: encounter.id,
    label: "Send medication-change summary",
    detail: followUp
      ? `${names} · include follow-up ${formatAppointmentMoment(followUp.date, followUp.time)}`
      : `${names} · no follow-up appointment to include yet`,
    state: "open",
    evidence: encounterOrders.map((order) =>
      evidence("order", order.id, `Medication order placed during this visit: ${order.name}`, order.createdAt),
    ),
    action: { label: "Open messages", targetSection: "Messages", encounterId: encounter.id },
  });
}

/* ------------------------------------------------------------------------- */
/* Rule: transcription / AI-extracted content review                          */
/* ------------------------------------------------------------------------- */

export function resolveTranscriptionReview(
  bundle: CareCompletionEvidenceBundle,
  options: CareCompletionResolveOptions,
): CareCompletionItem | null {
  if (!permitted("transcription-review", options)) return null;
  const encounter = focusEncounter(bundle);
  if (!encounter) return null;

  const forEncounter = bundle.noteReferences.filter(
    (reference) => reference.encounterId === encounter.id && reference.source === "ai-extracted",
  );
  if (forEncounter.length === 0 && encounter.transcriptUtteranceCount === 0) return null;

  const proposed = forEncounter.filter((reference) => reference.status === "proposed");
  if (proposed.length === 0 && forEncounter.length > 0) {
    return buildItem("transcription-review", {
      scopeId: encounter.id,
      label: "AI-extracted note content reviewed",
      detail: `${forEncounter.length} extracted reference${forEncounter.length === 1 ? "" : "s"} confirmed or rejected`,
      state: "complete",
      evidence: forEncounter
        .slice(0, 3)
        .map((reference) => evidence("note-reference", reference.id, `Reference ${reference.status}`)),
      action: { label: "Open encounter", targetSection: "Encounter", encounterId: encounter.id },
    });
  }

  if (proposed.length === 0) {
    // A transcript exists but nothing was extracted from it. There is nothing
    // to confirm or reject, so there is no review to report.
    return null;
  }

  return buildItem("transcription-review", {
    scopeId: encounter.id,
    label: "Review AI-extracted note content",
    detail: `${proposed.length} extracted reference${proposed.length === 1 ? "" : "s"} awaiting confirmation`,
    state: "open",
    evidence: proposed
      .slice(0, 3)
      .map((reference) => evidence("note-reference", reference.id, "Proposed AI-extracted reference")),
    action: { label: "Open encounter", targetSection: "Encounter", encounterId: encounter.id },
  });
}

/* ------------------------------------------------------------------------- */
/* Rule: coding review                                                        */
/* ------------------------------------------------------------------------- */

export function resolveCodingReview(
  bundle: CareCompletionEvidenceBundle,
  options: CareCompletionResolveOptions,
): CareCompletionItem | null {
  // Withheld entirely without financial authority, rather than shown disabled:
  // a clinical user without billing scope does not need a permanently open item
  // about work they are not permitted to do.
  if (!permitted("coding-review", options)) return null;
  const encounter = focusEncounter(bundle);
  if (!encounter || encounter.status !== "signed") return null;

  const charge = bundle.charges.find((row) => row.encounterId === encounter.id && row.status !== "void");
  if (!charge) {
    return buildItem("coding-review", {
      scopeId: encounter.id,
      label: "Prepare billing recommendation",
      detail: "No charge has been prepared from this signed note",
      state: "open",
      evidence: [evidence("encounter", encounter.id, "Signed note with no prepared charge", encounter.signedAt)],
      action: { label: "Open billing", targetSection: "Billing", encounterId: encounter.id },
    });
  }

  if (charge.status === "reviewed") {
    return buildItem("coding-review", {
      scopeId: encounter.id,
      label: "Billing recommendation reviewed",
      detail: `${charge.procedureCodeCount} procedure code${charge.procedureCodeCount === 1 ? "" : "s"} reviewed`,
      state: "complete",
      evidence: [
        evidence("billing-charge", charge.id, "Charge reviewed by an accountable user", charge.reviewedAt),
      ],
      action: { label: "Open billing", targetSection: "Billing", encounterId: encounter.id },
    });
  }

  return buildItem("coding-review", {
    scopeId: encounter.id,
    detail: `Charge prepared with ${charge.procedureCodeCount} procedure code${charge.procedureCodeCount === 1 ? "" : "s"}, not yet reviewed`,
    state: "open",
    evidence: [evidence("billing-charge", charge.id, `Charge status ${charge.status}`)],
    action: { label: "Open billing", targetSection: "Billing", encounterId: encounter.id },
  });
}

/* ------------------------------------------------------------------------- */
/* Rule: PCP notification (unavailable boundary)                              */
/* ------------------------------------------------------------------------- */

export function resolvePcpNotification(
  bundle: CareCompletionEvidenceBundle,
  options: CareCompletionResolveOptions,
): CareCompletionItem | null {
  if (!permitted("pcp-notification", options)) return null;
  const encounter = focusEncounter(bundle);
  if (!encounter || encounter.status !== "signed") return null;

  const hasMedicationWork = bundle.orders.some(
    (order) => order.type === "medication" && order.encounterId === encounter.id,
  );
  if (!hasMedicationWork) return null;

  const pcp = bundle.careNetwork.find((member) => member.role === "pcp");
  if (!pcp) return null;

  // A PCP existing in the care network is not permission to disclose to them.
  // There is no authorization record in this build and no document-exchange
  // transport, so the only truthful state is "cannot be done here", named.
  return buildItem("pcp-notification", {
    scopeId: encounter.id,
    label: `Notify PCP — ${pcp.name}`,
    detail: pcp.organization ? `${pcp.organization} · disclosure workflow unavailable` : "Disclosure workflow unavailable",
    state: "unavailable",
    evidence: [
      evidence("care-network", pcp.id, `Primary care clinician recorded: ${pcp.name}`),
    ],
  });
}

/* ------------------------------------------------------------------------- */
/* Rule: manual tasks                                                         */
/* ------------------------------------------------------------------------- */

export function resolveManualTasks(
  bundle: CareCompletionEvidenceBundle,
  options: CareCompletionResolveOptions,
): CareCompletionItem[] {
  if (!permitted("manual-task", options)) return [];

  return bundle.tasks.slice(0, 8).map((task) =>
    buildItem("manual-task", {
      scopeId: task.id,
      label: task.text,
      detail: task.completed ? "Completed" : `Due ${task.due}`,
      state: task.completed ? "complete" : "open",
      evidence: [
        evidence("task", task.id, task.completed ? "Task marked complete" : "Task open"),
      ],
      action: {
        label: task.completed ? "Reopen task" : "Mark done",
        targetSection: "Overview",
        taskId: task.id,
      },
    }),
  );
}

/* ------------------------------------------------------------------------- */
/* Composition                                                                */
/* ------------------------------------------------------------------------- */

/**
 * Evaluates every rule against one patient's evidence.
 *
 * Order is deliberate and stable: the work most likely to be forgotten — the
 * next appointment — sits at the top of the card, and the same patient produces
 * the same order on every refresh so a clinician's eye can stay in one place.
 */
export function resolveCareCompletionItems(
  bundle: CareCompletionEvidenceBundle,
  options: CareCompletionResolveOptions,
): CareCompletionItem[] {
  return [
    resolveFollowUpAppointment(bundle, options),
    resolveEncounterSigned(bundle, options),
    ...resolvePrescriptionTransmission(bundle, options),
    ...resolveResultReview(bundle, options),
    ...resolveMonitoringLabs(bundle, options),
    resolveMedicationChangeMessage(bundle, options),
    resolveTranscriptionReview(bundle, options),
    resolveCodingReview(bundle, options),
    resolvePcpNotification(bundle, options),
    ...resolveManualTasks(bundle, options),
  ].filter((item): item is CareCompletionItem => item !== null);
}
