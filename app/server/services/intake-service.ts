import {
  assertPermission,
  hasPermission,
  providerLabel,
  type ProviderContext,
} from "../auth/provider-context";
import { assertPatientAccess, canAccessPatient } from "../auth/patient-access";
import { assertProspectivePersonAccess, canAccessProspectivePerson } from "../auth/prospective-access";
import { AuditRepository } from "../repositories/audit-repository";
import { AppointmentRepository, type AppointmentRecord } from "../repositories/appointment-repository";
import { PatientRepository } from "../repositories/patient-repository";
import { PatientAdministrationRepository } from "../repositories/patient-administration-repository";
import { ProspectivePersonRepository } from "../repositories/prospective-person-repository";
import { ClinicalRecordRepository } from "../repositories/clinical-record-repository";
import { DocumentWorkflowRepository, type DocumentWorkflowStatus } from "../repositories/document-workflow-repository";
import { IntakeRepository, type IntakeSubject } from "../repositories/intake-repository";
import { workflowService } from "./workflow-service";
import type { CoveragePolicy, CoverageStatus, CoverageType, PatientAdministrativeRecord } from "../../domain/patient-administration";
import { primaryCoverage } from "../../domain/patient-administration";
import { isProspectivePersonId } from "../../lib/schedule-data";
import {
  computeIntakeChecklist,
  estimatePatientResponsibility,
  intakePriorityScore,
  intakeStage,
  matchPlanAcceptance,
  outstandingBlockers,
  sortIntakeQueue,
  DEFAULT_INTAKE_FRESHNESS_POLICY,
  GOVERNMENT_ID_DOCUMENT_TYPES,
  INSURANCE_CARD_DOCUMENT_TYPES,
  type BenefitEvidence,
  type ConsentSignature,
  type ConsentTemplate,
  type EligibilityResult,
  type FormSubmission,
  type GuardianSituation,
  type IdentityDocumentReviewResult,
  type IntakeDispositionReason,
  type IntakeEpisode,
  type IntakeNote,
  type IntakeNoteKind,
  type IntakeQueueRow,
  type IntakeReadinessStep,
  type PayerParticipationStatus,
  type PayerPlanParticipation,
  type PaymentMethodReference,
  type PaymentReadinessStatus,
} from "../../domain/intake";
import type { ClinicalExecutionContext } from "./clinical-service";

export class IntakeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "IntakeError";
  }
}

function auditActor(actor: ProviderContext) {
  return { userId: actor.userId, userName: providerLabel(actor), userRole: actor.role };
}

function meta(context: ClinicalExecutionContext) {
  return { source: context.source, requestId: context.requestId };
}

function assertIntakeRead(actor: ProviderContext) {
  // Mirrors D-074: staff who administer intake (edit_patient) do not need
  // clinical-chart reading authority to work the front-desk queue.
  if (!hasPermission(actor, "edit_patient")) assertPermission(actor, "read_clinical");
}

function assertIntakeWrite(actor: ProviderContext) {
  assertPermission(actor, "edit_patient");
}

/** D-076: a subject is a patient xor a prospect (or, once promoted, both —
 * the prospect linkage is preserved for history and evidence lookups keep
 * matching it). Access is asserted against whichever identity is present. */
function assertSubjectAccess(actor: ProviderContext, subject: IntakeSubject): void {
  if (subject.patientId) assertPatientAccess(actor, subject.patientId);
  else if (subject.prospectivePersonId) assertProspectivePersonAccess(actor, subject.prospectivePersonId);
  else throw new IntakeError("Intake record has no subject.", 500);
}

function canAccessSubject(actor: ProviderContext, subject: IntakeSubject): boolean {
  if (subject.patientId) return canAccessPatient(actor, subject.patientId);
  if (subject.prospectivePersonId) return canAccessProspectivePerson(actor, subject.prospectivePersonId);
  return false;
}

function text(value: unknown): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : undefined;
}

function episodeSubject(episode: IntakeEpisode): IntakeSubject {
  return { patientId: episode.patientId, prospectivePersonId: episode.prospectivePersonId };
}

/** A short label for audit descriptions and error messages — never used for access. */
function subjectLabel(subject: IntakeSubject): string {
  return subject.patientId ?? subject.prospectivePersonId ?? "unknown subject";
}

/** Builds a full PatientAdministrativeRecord directly from repositories, without the
 * per-view audit log that `patientAdministrationService.read` writes — the queue
 * reads many patients at once and a "viewed" event per row per refresh would
 * bury the decisions that event type exists to record. */
function readAdministrativeRecord(patientId: string): PatientAdministrativeRecord | null {
  const patient = PatientRepository.getById(patientId);
  if (!patient) return null;
  return {
    patientId,
    identity: patient.identity,
    contact: patient.contact,
    relatedPeople: PatientAdministrationRepository.listRelatedPeople(patientId),
    careNetwork: PatientAdministrationRepository.listCareNetwork(patientId),
    coverage: PatientAdministrationRepository.listCoverage(patientId),
    pharmacies: PatientAdministrationRepository.listPharmacies(patientId),
  };
}

/** Mirrors `PatientAdministrationRepository.listCoverage`'s row shape — used
 * here so a prospect's pre-chart coverage reads through the same mapping a
 * chart's coverage does, from the same `insurance_policies` table (D-077). */
function mapCoverageRow(r: any): CoveragePolicy {
  return {
    id: r.id,
    patientId: r.patient_id ?? r.prospective_person_id,
    payerName: r.payer_name,
    planName: text(r.plan_name),
    memberId: text(r.member_id),
    groupNumber: text(r.group_number),
    subscriberName: text(r.subscriber_name),
    subscriberDob: text(r.subscriber_dob),
    relationship: text(r.relationship),
    coverageType: (text(r.coverage_type) as CoverageType) || "commercial",
    isSelfPay: Number(r.is_self_pay) === 1,
    priority: Number(r.coverage_priority) || 1,
    status: (text(r.status) as CoverageStatus) || "active",
    effectiveDate: text(r.effective_date),
    terminationDate: text(r.termination_date),
  };
}

/**
 * The pre-chart equivalent. Related people, care network, and pharmacies
 * live on tables that stay chart-only (`patient_related_people`, ...); a
 * prospect has no equivalent for those yet. Coverage and documents (D-077)
 * now read the same `insurance_policies`/`documents` tables a chart reads,
 * matched by `prospective_person_id` instead of `patient_id` — the same
 * durable rows, not a parallel prospect-only store.
 */
function readProspectAdministrativeRecord(prospectiveId: string): PatientAdministrativeRecord | null {
  const prospect = ProspectivePersonRepository.getById(prospectiveId);
  if (!prospect) return null;
  return {
    patientId: prospectiveId,
    identity: {
      legalName: prospect.name,
      dob: prospect.dob || "",
      pronouns: "",
      mrn: "",
      recordStatus: "active",
    },
    contact: {
      mobilePhone: prospect.mobilePhone,
      email: prospect.email,
      allowVoicemail: undefined,
      allowSms: undefined,
      allowEmail: undefined,
    },
    relatedPeople: [],
    careNetwork: [],
    coverage: ClinicalRecordRepository.insuranceBySubject({ prospectivePersonId: prospectiveId }).map(mapCoverageRow),
    pharmacies: [],
  };
}

function readSubjectAdministrativeRecord(subject: IntakeSubject): PatientAdministrativeRecord | null {
  if (subject.patientId) return readAdministrativeRecord(subject.patientId);
  if (subject.prospectivePersonId) return readProspectAdministrativeRecord(subject.prospectivePersonId);
  return null;
}

/** D-077: reads by whichever subject id(s) the episode carries — a
 * prospect's pre-chart documents and a chart's documents are the same table. */
function documentsFor(subject: IntakeSubject) {
  return ClinicalRecordRepository.documentsBySubject(subject) as Array<{ id: string; document_type: string; workflow_status: string }>;
}

function governmentIdDocuments(subject: IntakeSubject) {
  return documentsFor(subject)
    .filter((row) => GOVERNMENT_ID_DOCUMENT_TYPES.includes(row.document_type))
    .map((row) => ({ id: row.id, documentType: row.document_type, workflowStatus: row.workflow_status || "received" }));
}

function insuranceCardDocuments(subject: IntakeSubject) {
  return documentsFor(subject)
    .filter((row) => INSURANCE_CARD_DOCUMENT_TYPES.includes(row.document_type))
    .map((row) => ({ id: row.id, documentType: row.document_type, workflowStatus: row.workflow_status || "received" }));
}

type ReadinessBundle = {
  episode: IntakeEpisode;
  subject: IntakeSubject;
  steps: IntakeReadinessStep[];
  planAcceptance: ReturnType<typeof matchPlanAcceptance>["result"];
  requiredConsents: ConsentTemplate[];
  signedConsents: ConsentSignature[];
  formSubmissions: FormSubmission[];
  requiredFormTemplates: { id: string; title: string; version: number }[];
  payment: PaymentMethodReference | null;
  participations: PayerPlanParticipation[];
};

function buildReadiness(
  admin: PatientAdministrativeRecord,
  appointment: Pick<AppointmentRecord, "status" | "intakeStatus">,
  episode: IntakeEpisode,
): ReadinessBundle {
  const subject = episodeSubject(episode);
  const requiredConsents = IntakeRepository.listActiveConsentTemplates();
  const signedConsents = IntakeRepository.listSignedConsents(subject);
  const formSubmissions = IntakeRepository.listFormSubmissions(subject);
  const requiredFormTemplates = IntakeRepository.listActiveFormTemplates().map((t) => ({ id: t.id, title: t.title, version: t.version }));
  const eligibility = IntakeRepository.latestEligibilityCheck(subject) ?? undefined;
  const payment = IntakeRepository.latestPaymentReference(subject);
  const participations = IntakeRepository.listPayerPlanParticipations();
  const policy = primaryCoverage(admin.coverage);
  const planAcceptance = matchPlanAcceptance(policy, participations).result;

  const govIdDocs = governmentIdDocuments(subject);
  const identityReview = IntakeRepository.latestIdentityDocumentReview(govIdDocs.map((d) => d.id)) ?? undefined;

  const steps = computeIntakeChecklist({
    administrative: admin,
    appointment: { status: appointment.status, intakeStatus: appointment.intakeStatus },
    episode: { guardianSituation: episode.guardianSituation, staffReviewResolvedAt: episode.staffReviewResolvedAt },
    governmentIdDocuments: govIdDocs,
    identityDocumentReview: identityReview,
    insuranceCardDocuments: insuranceCardDocuments(subject),
    planAcceptance: { result: planAcceptance },
    eligibility,
    requiredConsents,
    signedConsents,
    formSubmissions,
    requiredFormTemplateIds: requiredFormTemplates.map((t) => t.id),
    payment: payment ?? undefined,
    freshnessPolicy: DEFAULT_INTAKE_FRESHNESS_POLICY,
  });

  return { episode, subject, steps, planAcceptance, requiredConsents, signedConsents, formSubmissions, requiredFormTemplates, payment, participations };
}

/** An appointment is a candidate front door into intake if it is tentative or
 * explicitly marked intake-pending, and has not yet reached a first completed visit. */
function isIntakeCandidate(appointment: AppointmentRecord): boolean {
  if (appointment.status === "completed") return false;
  return appointment.status === "tentative" || appointment.intakeStatus === "pending";
}

export const intakeService = {
  /** The global queue: every active intake episode this actor may see — for
   * both prospective people and patients undergoing intake. */
  buildQueue(actor: ProviderContext): IntakeQueueRow[] {
    assertIntakeRead(actor);

    const allAppointments = AppointmentRepository.list();
    const activeEpisodes = new Map(IntakeRepository.listActiveEpisodes().map((e) => [e.appointmentId, e]));

    const rows: IntakeQueueRow[] = [];
    for (const appointment of allAppointments) {
      if (appointment.status === "completed") continue;
      const existingEpisode = activeEpisodes.get(appointment.id);
      if (!existingEpisode && !isIntakeCandidate(appointment)) continue;

      const isProspective = isProspectivePersonId(appointment.patientId);
      if (!canAccessSubject(actor, isProspective ? { prospectivePersonId: appointment.patientId } : { patientId: appointment.patientId })) continue;

      const episode = existingEpisode
        ?? (isIntakeCandidate(appointment)
          ? IntakeRepository.getOrCreateForAppointment({
              ...(isProspective ? { prospectivePersonId: appointment.patientId } : { patientId: appointment.patientId }),
              appointmentId: appointment.id,
              organizationId: actor.organizationId,
            })
          : null);
      if (!episode || episode.dispositionStatus !== "active") continue;

      const admin = readSubjectAdministrativeRecord(episodeSubject(episode));
      if (!admin) continue;

      const bundle = buildReadiness(admin, appointment, episode);
      const stage = intakeStage(appointment.status, bundle.steps, bundle.planAcceptance);

      rows.push({
        episode,
        appointmentId: appointment.id,
        appointmentStatus: appointment.status,
        appointmentDate: appointment.date,
        appointmentTime: appointment.time,
        patientId: episode.patientId,
        prospectivePersonId: episode.prospectivePersonId,
        patientName: appointment.patientName,
        stage,
        steps: bundle.steps,
        planAcceptance: bundle.planAcceptance,
      });
    }

    return sortIntakeQueue(rows);
  },

  priorityScore(row: IntakeQueueRow): number {
    return intakePriorityScore(row);
  },

  /** Everything the Intake detail panel needs — `id` may be a patient id or a
   * prospective-person id; the caller already knows which one it has from a
   * queue row. */
  getDetail(actor: ProviderContext, id: string) {
    assertIntakeRead(actor);
    const isProspective = isProspectivePersonId(id);
    const subjectForAccess: IntakeSubject = isProspective ? { prospectivePersonId: id } : { patientId: id };
    assertSubjectAccess(actor, subjectForAccess);

    const admin = readSubjectAdministrativeRecord(subjectForAccess);
    if (!admin) throw new IntakeError(`${isProspective ? "Prospective record" : "Patient"} not found: ${id}`, 404);

    const appointments = AppointmentRepository.list({ patientId: id }).filter(isIntakeCandidate);
    const target = appointments.sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    if (!target) throw new IntakeError(`No active intake appointment for ${id}`, 404);

    const episode = IntakeRepository.getOrCreateForAppointment({
      ...subjectForAccess,
      appointmentId: target.id,
      organizationId: actor.organizationId,
    });
    const bundle = buildReadiness(admin, target, episode);
    const stage = intakeStage(target.status, bundle.steps, bundle.planAcceptance);
    const estimatedResponsibility = estimatePatientResponsibility(
      IntakeRepository.latestEligibilityCheck(bundle.subject)?.benefitEvidence,
    );

    return {
      episode,
      appointment: target,
      administrative: admin,
      stage,
      steps: bundle.steps,
      planAcceptance: bundle.planAcceptance,
      notes: IntakeRepository.listNotes(episode.id),
      consents: { required: bundle.requiredConsents, signed: bundle.signedConsents },
      forms: { required: bundle.requiredFormTemplates, submissions: bundle.formSubmissions },
      eligibility: IntakeRepository.latestEligibilityCheck(bundle.subject),
      estimatedResponsibility,
      payment: bundle.payment,
      documents: governmentIdDocuments(bundle.subject),
      insuranceCardDocuments: insuranceCardDocuments(bundle.subject),
    };
  },

  /* ---- Staff workflow state (episode-owned, not clinical truth) ---- */

  assign(actor: ProviderContext, context: ClinicalExecutionContext, episodeId: string, staffId: string, staffName: string) {
    assertIntakeWrite(actor);
    const episode = requireEpisode(episodeId);
    assertSubjectAccess(actor, episodeSubject(episode));
    const updated = IntakeRepository.updateEpisode(episodeId, { assignedStaffId: staffId, assignedStaffName: staffName })!;
    audit(actor, context, updated, `Assigned intake for ${subjectLabel(episodeSubject(episode))} to ${staffName}.`, { staffId });
    return updated;
  },

  unassign(actor: ProviderContext, context: ClinicalExecutionContext, episodeId: string) {
    assertIntakeWrite(actor);
    const episode = requireEpisode(episodeId);
    assertSubjectAccess(actor, episodeSubject(episode));
    const updated = IntakeRepository.updateEpisode(episodeId, { assignedStaffId: undefined, assignedStaffName: undefined })!;
    audit(actor, context, updated, `Unassigned intake for ${subjectLabel(episodeSubject(episode))}.`, {});
    return updated;
  },

  addNote(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    episodeId: string,
    body: string,
    kind: IntakeNoteKind = "note",
  ): IntakeNote {
    assertIntakeWrite(actor);
    const episode = requireEpisode(episodeId);
    assertSubjectAccess(actor, episodeSubject(episode));
    const trimmed = body.trim();
    if (!trimmed) throw new IntakeError("Note text is required.", 400);

    const note = IntakeRepository.addNote({
      episodeId,
      ...episodeSubject(episode),
      kind,
      body: trimmed,
      authorId: actor.userId,
      authorName: providerLabel(actor),
    });

    const patch: Record<string, unknown> = {};
    if (kind === "outreach") patch.lastOutreachAt = note.createdAt;
    if (Object.keys(patch).length > 0) IntakeRepository.updateEpisode(episodeId, patch);

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "intake_note_added",
      patientId: episode.patientId,
      description: `Added ${kind} to intake for ${subjectLabel(episodeSubject(episode))}.`,
      metadata: { episodeId, noteId: note.id, kind, ...meta(context) },
    });
    return note;
  },

  setFollowUp(actor: ProviderContext, context: ClinicalExecutionContext, episodeId: string, followUpAt: string | null) {
    assertIntakeWrite(actor);
    const episode = requireEpisode(episodeId);
    assertSubjectAccess(actor, episodeSubject(episode));
    const updated = IntakeRepository.updateEpisode(episodeId, { followUpAt: followUpAt ?? undefined })!;
    audit(actor, context, updated, `Set intake follow-up for ${subjectLabel(episodeSubject(episode))} to ${followUpAt || "none"}.`, { followUpAt });
    return updated;
  },

  setGuardianSituation(actor: ProviderContext, context: ClinicalExecutionContext, episodeId: string, situation: GuardianSituation) {
    assertIntakeWrite(actor);
    const episode = requireEpisode(episodeId);
    assertSubjectAccess(actor, episodeSubject(episode));
    const updated = IntakeRepository.updateEpisode(episodeId, { guardianSituation: situation })!;
    audit(actor, context, updated, `Recorded guardian situation for ${subjectLabel(episodeSubject(episode))}: ${situation}.`, { situation });
    return updated;
  },

  resolveStaffReview(actor: ProviderContext, context: ClinicalExecutionContext, episodeId: string) {
    assertIntakeWrite(actor);
    const episode = requireEpisode(episodeId);
    assertSubjectAccess(actor, episodeSubject(episode));
    const updated = IntakeRepository.updateEpisode(episodeId, {
      staffReviewResolvedAt: new Date().toISOString(),
      staffReviewResolvedBy: providerLabel(actor),
    })!;
    audit(actor, context, updated, `Resolved staff review for ${subjectLabel(episodeSubject(episode))}.`, {});
    return updated;
  },

  reopenStaffReview(actor: ProviderContext, context: ClinicalExecutionContext, episodeId: string) {
    assertIntakeWrite(actor);
    const episode = requireEpisode(episodeId);
    assertSubjectAccess(actor, episodeSubject(episode));
    const updated = IntakeRepository.updateEpisode(episodeId, {
      staffReviewResolvedAt: undefined,
      staffReviewResolvedBy: undefined,
    })!;
    audit(actor, context, updated, `Reopened staff review for ${subjectLabel(episodeSubject(episode))}.`, {});
    return updated;
  },

  dispose(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    episodeId: string,
    reason: IntakeDispositionReason,
    note?: string,
  ) {
    assertIntakeWrite(actor);
    const episode = requireEpisode(episodeId);
    assertSubjectAccess(actor, episodeSubject(episode));
    const now = new Date().toISOString();
    const updated = IntakeRepository.updateEpisode(episodeId, {
      dispositionStatus: "archived",
      dispositionReason: reason,
      dispositionNote: note,
      disposedAt: now,
      disposedBy: providerLabel(actor),
    })!;
    IntakeRepository.addNote({
      episodeId,
      ...episodeSubject(episode),
      kind: "disposition",
      body: `Archived: ${reason}${note ? ` — ${note}` : ""}`,
      authorId: actor.userId,
      authorName: providerLabel(actor),
    });
    audit(actor, context, updated, `Archived intake for ${subjectLabel(episodeSubject(episode))} (${reason}).`, { reason, note });
    return updated;
  },

  reactivate(actor: ProviderContext, context: ClinicalExecutionContext, episodeId: string) {
    assertIntakeWrite(actor);
    const episode = requireEpisode(episodeId);
    assertSubjectAccess(actor, episodeSubject(episode));
    const updated = IntakeRepository.updateEpisode(episodeId, {
      dispositionStatus: "active",
      dispositionReason: undefined,
      dispositionNote: undefined,
      disposedAt: undefined,
      disposedBy: undefined,
    })!;
    audit(actor, context, updated, `Reactivated intake for ${subjectLabel(episodeSubject(episode))}.`, {});
    return updated;
  },

  /**
   * The escape hatch section 8 asks for: readiness is never forced complete,
   * but an authorized human may confirm anyway. Blockers are recomputed
   * server-side (never trusted from the client) and recorded — as an audit
   * event and as an intake note — alongside the required reason, before the
   * same ordinary appointment-status transition every other confirmation uses.
   */
  confirmWithOverride(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: { episodeId: string; appointmentId: string; reason: string },
  ) {
    assertIntakeWrite(actor);
    const episode = requireEpisode(input.episodeId);
    assertSubjectAccess(actor, episodeSubject(episode));
    const reason = input.reason.trim();
    if (!reason) throw new IntakeError("A reason is required to confirm with incomplete requirements.", 400);

    const admin = readSubjectAdministrativeRecord(episodeSubject(episode));
    if (!admin) throw new IntakeError("Could not re-read the current record to confirm readiness.", 404);
    const appointment = AppointmentRepository.getById(input.appointmentId);
    if (!appointment) throw new IntakeError(`Appointment not found: ${input.appointmentId}`, 404);
    const bundle = buildReadiness(admin, appointment, episode);
    const blockers = outstandingBlockers(bundle.steps);

    const blockerSummary = blockers.length === 0
      ? "No blockers were outstanding — confirmed through the override path anyway."
      : `Outstanding at confirmation: ${blockers.map((b) => b.label).join(", ")}.`;

    IntakeRepository.addNote({
      episodeId: episode.id,
      ...episodeSubject(episode),
      kind: "override",
      body: `Confirmed with incomplete requirements. Reason: ${reason}. ${blockerSummary}`,
      authorId: actor.userId,
      authorName: providerLabel(actor),
    });

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "intake_confirmed_with_override",
      patientId: episode.patientId,
      description: `Confirmed appointment ${input.appointmentId} with ${blockers.length} outstanding requirement(s): ${reason}.`,
      metadata: {
        episodeId: episode.id,
        appointmentId: input.appointmentId,
        reason,
        blockers: blockers.map((b) => b.id),
        ...meta(context),
      },
    });

    return workflowService.updateAppointmentStatus(input.appointmentId, "confirmed", actor, context);
  },

  /* ---- Identity document review (distinct from generic document workflow) ---- */

  /** D-077: subject-aware — a prospect can confirm identity before a chart
   * exists, using the same evidence record a chart's review would use. */
  recordIdentityDocumentReview(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: IntakeSubject & {
      documentId: string;
      result: IdentityDocumentReviewResult;
      legible: boolean;
      conflictNote?: string;
    },
  ) {
    assertIntakeWrite(actor);
    assertSubjectAccess(actor, input);
    if (input.result === "conflict" && !input.conflictNote?.trim()) {
      throw new IntakeError("Describe the conflict before recording it.", 400);
    }

    const review = IntakeRepository.recordIdentityDocumentReview({
      ...subjectOnly(input),
      documentId: input.documentId,
      reviewerId: actor.userId,
      reviewerName: providerLabel(actor),
      result: input.result,
      legible: input.legible,
      conflictNote: input.conflictNote,
    });

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "intake_identity_document_reviewed",
      patientId: input.patientId,
      description: `Reviewed identity document ${input.documentId}: ${input.result}${input.legible ? "" : " (not legible)"}.`,
      metadata: { documentId: input.documentId, result: input.result, reviewId: review.id, prospectivePersonId: input.prospectivePersonId, ...meta(context) },
    });
    return review;
  },

  /* ---- Documents and coverage (D-077: available before a chart exists) ---- */

  /** Uploads a document owned by whichever subject the episode currently
   * has — the exact same `documents`/`document_versions` rows a chart's
   * Documents surface reads, just reached through Intake for a prospect who
   * has none yet. Content is plain-text, matching this build's honest
   * synthetic-storage boundary (no binary/object storage exists to pretend
   * otherwise — see `PatientDocuments.tsx`). */
  uploadDocument(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: IntakeSubject & { documentType: string; title: string; contentText?: string },
  ) {
    assertIntakeWrite(actor);
    assertSubjectAccess(actor, input);
    const title = input.title.trim();
    if (!title) throw new IntakeError("A document title is required.", 400);

    const record = ClinicalRecordRepository.createDocumentForSubject(
      { ...subjectOnly(input), documentType: input.documentType, title, mimeType: "text/plain", contentText: input.contentText },
      { userId: actor.userId, displayName: providerLabel(actor) },
      { type: "clinician", system: "ehr-local" },
    );

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "document_created",
      patientId: input.patientId,
      description: `Uploaded ${input.documentType.replace(/_/g, " ")} "${record.title}"${input.prospectivePersonId ? " (pre-chart)" : ""}.`,
      metadata: { documentId: record.id, documentType: input.documentType, prospectivePersonId: input.prospectivePersonId, ...meta(context) },
    });
    return record;
  },

  /** Advances a document one step through the generic review workflow
   * (received -> needs_review -> reviewed -> filed -> superseded). Access is
   * resolved from the document's own current subject, not trusted from the
   * client, so a stale or mismatched id cannot reach a record it should not. */
  transitionDocument(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: { documentId: string; toStatus: DocumentWorkflowStatus; note?: string; supersededByDocumentId?: string },
  ) {
    assertIntakeWrite(actor);
    const doc = ClinicalRecordRepository.getDocumentById(input.documentId);
    if (!doc) throw new IntakeError(`Document not found: ${input.documentId}`, 404);
    const subject: IntakeSubject = { patientId: text(doc.patient_id), prospectivePersonId: text(doc.prospective_person_id) };
    assertSubjectAccess(actor, subject);

    const result = DocumentWorkflowRepository.transition(
      input.documentId,
      input.toStatus,
      { userId: actor.userId, displayName: providerLabel(actor) },
      { note: input.note, supersededByDocumentId: input.supersededByDocumentId },
    );

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "document_workflow_changed",
      patientId: subject.patientId,
      description: `Moved document ${input.documentId} to ${input.toStatus}.`,
      metadata: { documentId: input.documentId, toStatus: input.toStatus, prospectivePersonId: subject.prospectivePersonId, ...meta(context) },
    });
    return result;
  },

  /** Records a coverage policy (or an explicit self-pay choice) for whichever
   * subject the episode currently has — the same `insurance_policies` row a
   * chart's Coverage editor writes, reached through Intake for a prospect. */
  addCoverage(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: IntakeSubject & {
      payerName?: string;
      planName?: string;
      memberId?: string;
      groupNumber?: string;
      subscriberName?: string;
      subscriberDob?: string;
      relationship?: string;
      effectiveDate?: string;
      coverageType?: string;
      coveragePriority?: number;
      isSelfPay?: boolean;
    },
  ) {
    assertIntakeWrite(actor);
    assertSubjectAccess(actor, input);
    if (!input.isSelfPay && !input.payerName?.trim()) {
      throw new IntakeError("Enter a payer, or mark this self-pay.", 400);
    }

    const record = ClinicalRecordRepository.addInsuranceForSubject(
      {
        ...subjectOnly(input),
        payerName: input.isSelfPay ? (input.payerName?.trim() || "Self-pay") : input.payerName!.trim(),
        planName: input.planName,
        memberId: input.memberId,
        groupNumber: input.groupNumber,
        subscriberName: input.subscriberName,
        subscriberDob: input.subscriberDob,
        relationship: input.relationship,
        effectiveDate: input.effectiveDate,
        coverageType: input.isSelfPay ? "self-pay" : (input.coverageType || "commercial"),
        coveragePriority: input.coveragePriority ?? 1,
        isSelfPay: Boolean(input.isSelfPay),
      },
      { userId: actor.userId, displayName: providerLabel(actor) },
      { type: "clinician", system: "ehr-local" },
    );

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "clinical_fact_created",
      patientId: input.patientId,
      description: `Recorded ${input.isSelfPay ? "self-pay" : "coverage"} for ${record.payer_name}${input.prospectivePersonId ? " (pre-chart)" : ""}.`,
      metadata: { entityType: "insurance", entityId: record.id, prospectivePersonId: input.prospectivePersonId, ...meta(context) },
    });
    return record;
  },

  /* ---- Consent, form, eligibility, and payment mutations ---- */

  recordConsentSignature(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: IntakeSubject & { templateId: string; signerName: string; signerRelationship: ConsentSignature["signerRelationship"] },
  ) {
    assertIntakeWrite(actor);
    assertSubjectAccess(actor, input);
    const template = IntakeRepository.getConsentTemplate(input.templateId);
    if (!template) throw new IntakeError(`Consent template not found: ${input.templateId}`, 404);
    if (!input.signerName.trim()) throw new IntakeError("A signer name is required.", 400);

    const signature = IntakeRepository.recordConsentSignature({
      ...subjectOnly(input),
      templateId: template.id,
      templateVersion: template.version,
      signerName: input.signerName.trim(),
      signerRelationship: input.signerRelationship,
      recordedById: actor.userId,
      recordedByName: providerLabel(actor),
    });

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "intake_consent_signed",
      patientId: input.patientId,
      description: `Recorded staff-attested signature for "${template.title}" v${template.version} (${input.signerRelationship}: ${input.signerName}).`,
      metadata: { templateId: template.id, signatureId: signature.id, ...meta(context) },
    });
    return signature;
  },

  saveFormSubmission(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: IntakeSubject & {
      templateId: string;
      submissionId?: string;
      answers: Record<string, string>;
      status: "in_progress" | "submitted";
      respondent?: FormSubmission["respondent"];
      respondentName?: string;
    },
  ) {
    assertIntakeWrite(actor);
    assertSubjectAccess(actor, input);
    const template = IntakeRepository.getFormTemplate(input.templateId);
    if (!template) throw new IntakeError(`Form template not found: ${input.templateId}`, 404);

    const submission = IntakeRepository.saveFormSubmission({
      ...subjectOnly(input),
      id: input.submissionId,
      templateId: template.id,
      templateVersion: template.version,
      respondent: input.respondent || "staff",
      respondentName: input.respondentName || providerLabel(actor),
      answers: input.answers,
      status: input.status,
    });

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "intake_form_submission_saved",
      patientId: input.patientId,
      description: `${input.status === "submitted" ? "Submitted" : "Saved draft of"} "${template.title}" v${template.version}.`,
      metadata: { templateId: template.id, submissionId: submission.id, status: submission.status, ...meta(context) },
    });
    return submission;
  },

  reviewFormSubmission(actor: ProviderContext, context: ClinicalExecutionContext, submissionId: string, reviewNotes?: string) {
    assertIntakeWrite(actor);
    const submission = IntakeRepository.getFormSubmission(submissionId);
    if (!submission) throw new IntakeError(`Form submission not found: ${submissionId}`, 404);
    assertSubjectAccess(actor, submission);

    const updated = IntakeRepository.reviewFormSubmission(submissionId, {
      reviewedById: actor.userId,
      reviewedByName: providerLabel(actor),
      reviewNotes,
    })!;

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "intake_form_submission_reviewed",
      patientId: submission.patientId,
      description: `Reviewed intake form submission ${submissionId}.`,
      metadata: { submissionId, ...meta(context) },
    });
    return updated;
  },

  recordEligibilityCheck(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: IntakeSubject & { coveragePolicyId: string; result: EligibilityResult; note?: string; benefitEvidence?: BenefitEvidence },
  ) {
    assertIntakeWrite(actor);
    assertSubjectAccess(actor, input);
    const check = IntakeRepository.recordEligibilityCheck({
      ...subjectOnly(input),
      coveragePolicyId: input.coveragePolicyId,
      result: input.result,
      source: "manual_staff_attestation",
      note: input.note,
      benefitEvidence: input.benefitEvidence,
      checkedById: actor.userId,
      checkedByName: providerLabel(actor),
    });

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "intake_eligibility_recorded",
      patientId: input.patientId,
      description: `Recorded staff-attested eligibility check: ${input.result}.`,
      metadata: { coveragePolicyId: input.coveragePolicyId, result: input.result, checkId: check.id, ...meta(context) },
    });
    return check;
  },

  recordPaymentReadiness(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: IntakeSubject & { status: PaymentReadinessStatus; brand?: string; lastFour?: string; waiverReason?: string },
  ) {
    assertIntakeWrite(actor);
    assertSubjectAccess(actor, input);
    if (input.status === "waived" && !input.waiverReason?.trim()) {
      throw new IntakeError("A reason is required to waive the payment-method requirement.", 400);
    }

    const record = IntakeRepository.recordPaymentReference({
      ...subjectOnly(input),
      status: input.status,
      brand: input.brand,
      lastFour: input.lastFour,
      waiverReason: input.waiverReason,
      recordedById: actor.userId,
      recordedByName: providerLabel(actor),
    });

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "intake_payment_readiness_recorded",
      patientId: input.patientId,
      description: input.status === "waived"
        ? `Waived payment-method requirement: ${input.waiverReason}.`
        : `Recorded payment method on file (${input.brand ?? "card"} ending ${input.lastFour ?? "----"}).`,
      metadata: { status: input.status, ...meta(context) },
    });
    return record;
  },

  /* ---- Payer-plan participation (practice configuration) ---- */

  listPayerPlanParticipations(actor: ProviderContext) {
    assertIntakeRead(actor);
    return IntakeRepository.listPayerPlanParticipations();
  },

  addPayerPlanParticipation(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: { payerName: string; product?: string; planName?: string; network?: string; status: PayerParticipationStatus; notes?: string },
  ) {
    assertPermission(actor, "manage_organization");
    if (!input.payerName.trim()) throw new IntakeError("A payer name is required.", 400);
    const record = IntakeRepository.addPayerPlanParticipation({ ...input, createdBy: actor.userId });
    AuditRepository.log({
      ...auditActor(actor),
      eventType: "integration_configuration_updated",
      description: `Recorded ${record.status.replace("_", " ")} payer-plan participation: ${record.payerName}${record.planName ? ` / ${record.planName}` : ""}.`,
      metadata: { participationId: record.id, status: record.status, ...meta(context) },
    });
    return record;
  },
};

/** Strips extra fields down to just the subject id pair — keeps repository
 * calls from accidentally forwarding unrelated input fields as columns. */
function subjectOnly(subject: IntakeSubject): IntakeSubject {
  return { patientId: subject.patientId, prospectivePersonId: subject.prospectivePersonId };
}

export type IntakeDetail = ReturnType<typeof intakeService.getDetail>;

function requireEpisode(episodeId: string): IntakeEpisode {
  const episode = IntakeRepository.getEpisodeById(episodeId);
  if (!episode) throw new IntakeError(`Intake episode not found: ${episodeId}`, 404);
  return episode;
}

function audit(
  actor: ProviderContext,
  context: ClinicalExecutionContext,
  episode: IntakeEpisode,
  description: string,
  metadata: Record<string, unknown>,
) {
  AuditRepository.log({
    ...auditActor(actor),
    eventType: "intake_episode_updated",
    patientId: episode.patientId,
    description,
    metadata: { episodeId: episode.id, ...metadata, ...meta(context) },
  });
}
