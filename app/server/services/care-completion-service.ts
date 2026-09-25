import {
  type CareCompletionBoard,
  type CareCompletionDeferralReasonCode,
  type CareCompletionItem,
  type CareCompletionPatientCard,
  type CareCompletionRuleId,
  isCareCompletionDeferralReasonCode,
  isCareCompletionRuleId,
  listUnavailableCareCompletionRules,
  ruleIdFromItemKey,
  summarizeCareCompletion,
} from "../../domain/care-completion";
import {
  type ClinicalPermission,
  type ProviderContext,
  hasPermission,
  providerLabel,
} from "../auth/provider-context";
import {
  accessSelectionForActor,
  assertPatientAccess,
  canAccessPatient,
} from "../auth/patient-access";
import { AuditRepository } from "../repositories/audit-repository";
import { AppointmentRepository } from "../repositories/appointment-repository";
import { BillingRepository } from "../repositories/billing-repository";
import {
  CareCompletionRepository,
  type CareCompletionDeferralRecord,
} from "../repositories/care-completion-repository";
import { ClinicalRecordRepository } from "../repositories/clinical-record-repository";
import { EncounterRepository } from "../repositories/encounter-repository";
import { NoteReferenceRepository } from "../repositories/note-reference-repository";
import { OrderRepository } from "../repositories/order-repository";
import { PatientAdministrationRepository } from "../repositories/patient-administration-repository";
import { PatientRepository } from "../repositories/patient-repository";
import { PrescriptionTransactionRepository } from "../repositories/prescription-transaction-repository";
import { TaskRepository } from "../repositories/task-repository";
import { getDatabase } from "../db/connection";
import type { ClinicalExecutionContext } from "./clinical-service";
import {
  type CareCompletionEvidenceBundle,
  focusEncounter,
  resolveCareCompletionItems,
} from "./care-completion-rules";

/**
 * The provider's personal care-completion board.
 *
 * Two responsibilities, kept apart on purpose:
 *
 * - **Projection.** Gather authoritative evidence for one patient, run the
 *   deterministic rules over it, and return what they found. This path never
 *   writes.
 * - **This module's own state.** A pin, a deferral. Both are personal workflow
 *   records, neither is clinical truth, and both go through the same boundary:
 *   authenticated actor → organization → patient access → capability →
 *   persistence → audit.
 *
 * The security rule that shapes every read: **a pin is not authorization.** The
 * board never loads a patient because their id appears in a pin row. Access is
 * re-resolved on every read and every write, and a pin whose access has gone
 * away contributes a count and nothing else — not a name, not an initial, not
 * an MRN.
 */

export class CareCompletionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CareCompletionError";
  }
}

const MAX_REASON_TEXT = 500;
/** Beyond this the board stops being scannable and starts being a queue. */
const MAX_PINNED_PATIENTS = 40;

function auditActor(actor: ProviderContext) {
  return { userId: actor.userId, userName: providerLabel(actor), userRole: actor.role };
}

function meta(context: ClinicalExecutionContext) {
  return { source: context.source, requestId: context.requestId };
}

/** The organization this actor is acting in; a pin must belong to one. */
function actingOrganization(actor: ProviderContext): string {
  const selection = accessSelectionForActor(actor);
  const organizationId = selection.organizationIds[0] ?? selection.assignedScopeOrganizationIds[0];
  if (!organizationId) {
    throw new CareCompletionError(
      "You do not belong to an organization, so you cannot keep a personal worklist.",
      403,
    );
  }
  return organizationId;
}

function assertCapability(actor: ProviderContext, capability: ClinicalPermission): void {
  if (!hasPermission(actor, capability)) {
    throw new CareCompletionError(
      `User ${actor.userId} lacks permission ${capability}.`,
      403,
    );
  }
}

function capabilitiesOf(actor: ProviderContext): Set<ClinicalPermission> {
  const all: ClinicalPermission[] = [
    "read_clinical",
    "edit_draft",
    "sign_encounter",
    "stage_order",
    "authorize_order",
    "transmit_order",
    "send_message",
    "manage_tasks",
    "read_schedule",
    "manage_appointments",
    "edit_patient",
    "manage_clinical_record",
    "acknowledge_result",
    "amend_signed_record",
    "collaborate_team",
    "manage_team_tasks",
    "manage_integrations",
    "manage_organization",
    "manage_templates",
    "view_financial",
  ];
  return new Set(all.filter((capability) => hasPermission(actor, capability)));
}

/* ------------------------------------------------------------------------- */
/* Evidence assembly                                                          */
/* ------------------------------------------------------------------------- */

function transcriptCount(encounter: { workingState?: { ambientTranscript?: unknown[] } }): number {
  const transcript = encounter.workingState?.ambientTranscript;
  return Array.isArray(transcript) ? transcript.length : 0;
}

/**
 * Reads every authoritative record the rules need for one patient.
 *
 * Callers must have already established that this actor may reach the patient:
 * this function does no authorization of its own, which is why it is not
 * exported past the service.
 */
function gatherEvidence(patientId: string): CareCompletionEvidenceBundle {
  const db = getDatabase();

  const encounters = EncounterRepository.getByPatient(patientId).map((encounter) => ({
    id: encounter.id,
    date: encounter.date,
    status: encounter.status,
    followUp: encounter.followUp,
    appointmentId: encounter.appointmentId,
    signedAt: encounter.signedAt,
    updatedAt: encounter.updatedAt,
    transcriptUtteranceCount: transcriptCount(encounter),
  }));

  const appointments = AppointmentRepository.list({ patientId }).map((appointment) => ({
    id: appointment.id,
    date: appointment.date,
    time: appointment.time,
    status: appointment.status,
    originAppointmentId: appointment.originAppointmentId,
    followUpInterval: appointment.followUpInterval,
  }));

  const orders = OrderRepository.list({ patientId }).map((order) => ({
    id: order.id,
    type: order.type,
    name: order.name,
    status: order.status,
    encounterId: order.encounterId,
    createdAt: order.createdAt,
  }));

  const transactions = PrescriptionTransactionRepository.listByPatient(patientId).map((tx) => ({
    id: tx.id,
    orderId: tx.orderId,
    state: tx.state,
    submittedAt: tx.submittedAt,
  }));

  const observations = ClinicalRecordRepository.observations(patientId, undefined, 200).map((row: any) => ({
    id: row.id,
    testName: row.test_name,
    category: row.category,
    effectiveAt: row.effective_at,
    status: row.status,
    interpretation: row.interpretation || undefined,
    acknowledgedAt: row.acknowledged_at || undefined,
  }));

  const medications = ClinicalRecordRepository.medications(patientId).map((row: any) => ({
    id: row.id,
    medicationName: row.medication_name,
    genericName: row.generic_name || undefined,
    displayText: row.display_text,
    status: row.status,
  }));

  // Messages are read directly because the repository projection groups by
  // thread and discards the stored instant this rule depends on.
  const messages = (
    db
      .prepare("SELECT id, sender_role, created_at FROM messages WHERE patient_id = ?")
      .all(patientId) as any[]
  ).map((row) => ({
    id: row.id,
    senderRole: row.sender_role,
    createdAt: row.created_at ?? null,
  }));

  const noteReferences = encounters.flatMap((encounter) =>
    NoteReferenceRepository.listForEncounter(encounter.id).map((reference) => ({
      id: reference.id,
      encounterId: reference.encounterId,
      source: reference.source,
      status: reference.status,
    })),
  );

  const charges = BillingRepository.listCharges({ patientIds: [patientId] }).map((charge) => ({
    id: charge.id,
    encounterId: charge.encounterId,
    status: charge.status,
    reviewedAt: charge.reviewedAt ?? undefined,
    procedureCodeCount: charge.procedureCodes.length,
  }));

  const tasks = TaskRepository.getTasks(patientId).map((task) => ({
    id: task.id,
    text: task.text,
    completed: task.completed,
    due: task.due,
  }));

  const careNetwork = PatientAdministrationRepository.listCareNetwork(patientId).map((member) => ({
    id: member.id,
    role: member.role,
    name: member.name,
    organization: member.organization,
  }));

  return {
    patientId,
    encounters,
    appointments,
    orders,
    transactions,
    observations,
    medications,
    messages,
    noteReferences,
    charges,
    tasks,
    careNetwork,
  };
}

/**
 * Applies this provider's recorded deferrals over the resolved items.
 *
 * The precedence rule is the one that keeps a deferral from ever becoming a
 * completion: an item the authoritative record says is **complete** stays
 * complete and its now-obsolete deferral is dropped from the view. Only
 * unresolved work can be shown as deferred.
 */
function applyDeferrals(
  items: readonly CareCompletionItem[],
  deferrals: readonly CareCompletionDeferralRecord[],
): { items: CareCompletionItem[]; obsolete: CareCompletionDeferralRecord[] } {
  const byKey = new Map(deferrals.map((deferral) => [deferral.itemKey, deferral]));
  const obsolete: CareCompletionDeferralRecord[] = [];

  const next = items.map((item) => {
    const deferral = byKey.get(item.itemKey);
    if (!deferral) return item;
    byKey.delete(item.itemKey);

    if (item.state !== "open") {
      // The underlying workflow moved on. The reason is history now, not a
      // state the board should still be reporting.
      if (item.state === "complete") obsolete.push(deferral);
      return item;
    }

    const deferred: CareCompletionItem = {
      ...item,
      state: "deferred",
      deferral: {
        id: deferral.id,
        reasonCode: deferral.reasonCode,
        reasonText: deferral.reasonText ?? undefined,
        deferredBy: deferral.deferredBy,
        deferredByName: deferral.deferredByName,
        deferredAt: deferral.deferredAt,
        resumeAt: deferral.resumeAt ?? undefined,
        version: deferral.version,
      },
    };
    deferred.classification = "deferred";
    return deferred;
  });

  return { items: next, obsolete };
}

/* ------------------------------------------------------------------------- */
/* Service                                                                    */
/* ------------------------------------------------------------------------- */

export const careCompletionService = {
  /**
   * The patients this actor has pinned *and can still reach*.
   *
   * Two separate facts, and the second one is re-derived every time. A pin row
   * is only a request to look; whether the look is permitted is decided here.
   */
  accessiblePins(actor: ProviderContext): {
    accessible: Array<{ patientId: string; pinnedAt: string }>;
    inaccessibleCount: number;
  } {
    const pins = CareCompletionRepository.listPins(actor.userId);
    const accessible: Array<{ patientId: string; pinnedAt: string }> = [];
    let inaccessibleCount = 0;

    for (const pin of pins) {
      if (canAccessPatient(actor, pin.patientId)) {
        accessible.push({ patientId: pin.patientId, pinnedAt: pin.pinnedAt });
      } else {
        inaccessibleCount += 1;
      }
    }

    return { accessible, inaccessibleCount };
  },

  buildBoard(
    actor: ProviderContext,
    options: { now?: Date } = {},
  ): CareCompletionBoard {
    assertCapability(actor, "read_clinical");
    const now = options.now ?? new Date();
    const { accessible, inaccessibleCount } = careCompletionService.accessiblePins(actor);
    const capabilities = capabilitiesOf(actor);

    const deferrals = CareCompletionRepository.listDeferrals(
      actor.userId,
      accessible.map((pin) => pin.patientId),
    );

    const cards: CareCompletionPatientCard[] = [];
    for (const pin of accessible.slice(0, MAX_PINNED_PATIENTS)) {
      const patient = PatientRepository.getById(pin.patientId);
      // A pinned patient whose record has gone is not an error and not a name:
      // it simply drops off the board.
      if (!patient) {
        continue;
      }

      const bundle = gatherEvidence(pin.patientId);
      const resolved = resolveCareCompletionItems(bundle, { capabilities, now });
      const patientDeferrals = deferrals.filter((deferral) => deferral.patientId === pin.patientId);
      const { items } = applyDeferrals(resolved, patientDeferrals);
      const encounter = focusEncounter(bundle);

      cards.push({
        patientId: patient.id,
        patientName: patient.name,
        patientMrn: patient.mrn,
        patientInitials: patient.initials,
        pinnedAt: pin.pinnedAt,
        focusEncounterId: encounter?.id,
        focusEncounterDate: encounter?.date,
        items,
        progress: summarizeCareCompletion(items),
      });
    }

    return {
      resolvedAt: now.toISOString(),
      cards,
      inaccessiblePinCount: inaccessibleCount,
      unavailableRules: listUnavailableCareCompletionRules()
        // A rule the actor could never see is not a boundary worth explaining.
        .filter((rule) => !rule.requiredCapability || capabilities.has(rule.requiredCapability))
        .map((rule) => ({
          id: rule.id,
          label: rule.label,
          reason: rule.unavailableReason ?? "This rule has no authoritative source in this build.",
        })),
    };
  },

  /**
   * The same rules for one patient, pinned or not (D-100).
   *
   * What the note's readiness panel asks: the loops open for the chart being
   * written, with this actor's deferrals applied. It reads exactly what the board
   * reads — no second rule set — and it is gated on patient access first, so the
   * answer never confirms a chart the actor cannot open.
   */
  patientItems(
    actor: ProviderContext,
    patientId: string,
    options: { now?: Date } = {},
  ): CareCompletionItem[] {
    assertCapability(actor, "read_clinical");
    assertPatientAccess(actor, patientId);
    if (!PatientRepository.getById(patientId)) {
      throw new CareCompletionError(`Patient not found: ${patientId}`, 404);
    }
    const now = options.now ?? new Date();
    const bundle = gatherEvidence(patientId);
    const resolved = resolveCareCompletionItems(bundle, { capabilities: capabilitiesOf(actor), now });
    const deferrals = CareCompletionRepository.listDeferrals(actor.userId, [patientId]);
    return applyDeferrals(resolved, deferrals).items;
  },

  pinPatient(
    actor: ProviderContext,
    patientId: string,
    context: ClinicalExecutionContext,
    options: { source?: string } = {},
  ) {
    assertCapability(actor, "read_clinical");
    // Access first, and from the authoritative membership rather than from the
    // request: a patient this actor cannot reach cannot be pinned, and the
    // refusal must not confirm whether that patient exists.
    assertPatientAccess(actor, patientId);

    const patient = PatientRepository.getById(patientId);
    if (!patient) throw new CareCompletionError(`Patient not found: ${patientId}`, 404);

    const existingPins = CareCompletionRepository.listPins(actor.userId);
    if (
      existingPins.length >= MAX_PINNED_PATIENTS &&
      !existingPins.some((pin) => pin.patientId === patientId)
    ) {
      throw new CareCompletionError(
        `Your worklist already holds ${MAX_PINNED_PATIENTS} patients. Clear one before pinning another.`,
        409,
      );
    }

    const alreadyPinned = Boolean(CareCompletionRepository.getPin(actor.userId, patientId));
    const pin = CareCompletionRepository.pin({
      organizationId: actingOrganization(actor),
      userId: actor.userId,
      patientId,
      pinnedBy: actor.userId,
      source: options.source,
    });

    // Re-pinning an already-pinned patient changes nothing, so it is not an
    // event. Audit records decisions, not clicks.
    if (!alreadyPinned) {
      AuditRepository.log({
        ...auditActor(actor),
        eventType: "care_completion_patient_pinned",
        patientId,
        description: `Pinned ${patient.name} to a personal care-completion worklist. This is a view preference and grants no chart access, care-team membership, or clinical responsibility.`,
        metadata: { pinId: pin.id, pinSource: pin.source, ...meta(context) },
      });
    }

    return pin;
  },

  unpinPatient(actor: ProviderContext, patientId: string, context: ClinicalExecutionContext) {
    assertCapability(actor, "read_clinical");
    assertPatientAccess(actor, patientId);

    const removed = CareCompletionRepository.unpin(actor.userId, patientId);
    if (removed) {
      AuditRepository.log({
        ...auditActor(actor),
        eventType: "care_completion_patient_unpinned",
        patientId,
        description: `Removed a patient from a personal care-completion worklist. No chart, schedule, or clinical record was changed.`,
        metadata: { ...meta(context) },
      });
    }
    return { removed };
  },

  /**
   * Records that one unresolved work item is waiting, and why.
   *
   * The item must exist on this actor's own board for this patient right now,
   * and it must be deferrable and unresolved. Validating against the live
   * projection rather than against the request is what stops a crafted item key
   * from writing a row about work that does not exist — and stops anything from
   * "deferring" a loop the record already closed.
   */
  deferItem(
    actor: ProviderContext,
    input: {
      patientId: string;
      itemKey: string;
      reasonCode: CareCompletionDeferralReasonCode;
      reasonText?: string;
      resumeAt?: string;
      expectedVersion?: number;
    },
    context: ClinicalExecutionContext,
    options: { now?: Date } = {},
  ) {
    assertCapability(actor, "read_clinical");
    assertPatientAccess(actor, input.patientId);

    if (!isCareCompletionDeferralReasonCode(input.reasonCode)) {
      throw new CareCompletionError("A recognized deferral reason is required.", 400);
    }
    const ruleId = ruleIdFromItemKey(input.itemKey);
    if (!ruleId || !isCareCompletionRuleId(ruleId)) {
      throw new CareCompletionError(`Unrecognized care-completion work item: ${input.itemKey}`, 400);
    }
    if (input.reasonText && input.reasonText.length > MAX_REASON_TEXT) {
      throw new CareCompletionError(
        `A deferral note may be at most ${MAX_REASON_TEXT} characters.`,
        400,
      );
    }
    const resumeAt = normalizeResumeAt(input.resumeAt);

    const item = careCompletionService.resolveItem(actor, input.patientId, input.itemKey, options);
    if (!item) {
      throw new CareCompletionError(
        `That work item is not currently on this patient's board: ${input.itemKey}`,
        404,
      );
    }
    if (item.state === "complete") {
      throw new CareCompletionError(
        "That work is already complete in the authoritative record, so there is nothing to defer.",
        409,
      );
    }
    if (!item.deferrable) {
      throw new CareCompletionError("That work item cannot be deferred.", 409);
    }

    const patient = PatientRepository.getById(input.patientId);
    const deferral = CareCompletionRepository.defer({
      organizationId: actingOrganization(actor),
      userId: actor.userId,
      patientId: input.patientId,
      ruleId,
      itemKey: input.itemKey,
      reasonCode: input.reasonCode,
      reasonText: input.reasonText?.trim() || null,
      deferredBy: actor.userId,
      deferredByName: providerLabel(actor),
      resumeAt,
      encounterId: item.action?.encounterId ?? null,
      expectedVersion: input.expectedVersion,
    });

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "care_completion_item_deferred",
      patientId: input.patientId,
      description: `Deferred care-completion item "${item.label}" for ${patient?.name ?? input.patientId}. Deferred work remains unresolved; it is not a completion.`,
      metadata: {
        itemKey: input.itemKey,
        ruleId,
        reasonCode: input.reasonCode,
        resumeAt: resumeAt ?? undefined,
        version: deferral.version,
        ...meta(context),
      },
    });

    return deferral;
  },

  resumeItem(
    actor: ProviderContext,
    input: { patientId: string; itemKey: string; expectedVersion?: number },
    context: ClinicalExecutionContext,
  ) {
    assertCapability(actor, "read_clinical");
    assertPatientAccess(actor, input.patientId);

    const resumed = CareCompletionRepository.resume(
      actor.userId,
      input.patientId,
      input.itemKey,
      input.expectedVersion,
    );
    if (!resumed) {
      throw new CareCompletionError("That work item is not currently deferred.", 404);
    }

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "care_completion_item_resumed",
      patientId: input.patientId,
      description: `Resumed deferred care-completion item ${input.itemKey}. The work returns to unresolved; completion still comes from the authoritative workflow.`,
      metadata: { itemKey: input.itemKey, ruleId: resumed.ruleId, version: resumed.version, ...meta(context) },
    });

    return resumed;
  },

  /**
   * One item from one patient's live projection.
   *
   * Used by the defer path and by the AI proposal path so both validate against
   * what the rules actually produced rather than against a string a client sent.
   */
  resolveItem(
    actor: ProviderContext,
    patientId: string,
    itemKey: string,
    options: { now?: Date } = {},
  ): CareCompletionItem | null {
    assertPatientAccess(actor, patientId);
    const bundle = gatherEvidence(patientId);
    const items = resolveCareCompletionItems(bundle, {
      capabilities: capabilitiesOf(actor),
      now: options.now ?? new Date(),
    });
    return items.find((item) => item.itemKey === itemKey) ?? null;
  },

  /** Every item currently on one accessible patient's card, deferrals applied. */
  itemsForPatient(
    actor: ProviderContext,
    patientId: string,
    options: { now?: Date } = {},
  ): CareCompletionItem[] {
    assertCapability(actor, "read_clinical");
    assertPatientAccess(actor, patientId);
    const bundle = gatherEvidence(patientId);
    const resolved = resolveCareCompletionItems(bundle, {
      capabilities: capabilitiesOf(actor),
      now: options.now ?? new Date(),
    });
    const deferrals = CareCompletionRepository.listDeferrals(actor.userId, [patientId]);
    return applyDeferrals(resolved, deferrals).items;
  },

  isPinned(actor: ProviderContext, patientId: string): boolean {
    if (!canAccessPatient(actor, patientId)) return false;
    return Boolean(CareCompletionRepository.getPin(actor.userId, patientId));
  },
};

/**
 * A resume date is a day, not an instant: "bring this back Friday" has no time
 * of day attached. Anything unparseable is rejected rather than stored as text
 * that no reminder could ever act on.
 */
function normalizeResumeAt(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const parsed = Date.parse(raw.length === 10 ? `${raw}T00:00:00.000Z` : raw);
  if (Number.isNaN(parsed)) {
    throw new CareCompletionError("A resume date must be a valid date.", 400);
  }
  return new Date(parsed).toISOString();
}

export type { CareCompletionRuleId };
