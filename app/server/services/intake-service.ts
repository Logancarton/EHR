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
import { MeasurementRepository } from "../repositories/measurement-repository";
import { workflowService } from "./workflow-service";
import { randomBytes, createHash } from "node:crypto";
import {
  ASRS_INSTRUMENT,
  GAD7_INSTRUMENT,
  PHQ9_INSTRUMENT,
  type AssessmentInstrumentDefinition,
  type AssessmentInstrumentType,
  type AssessmentRecord,
} from "../../domain/clinical-measurements";
import {
  DEFAULT_FORM_REQUEST_TTL_DAYS,
  REMOTE_ASSESSMENT_LABELS,
  cleanSafetyPlanAnswers,
  normalizeRequestedForms,
  phq9Item9Endorsed,
  requestedConsentTemplateIds,
  requestedInstruments,
  safetyPlanDocumentText,
  safetyPlanRequested,
  type RemoteAssessmentInstrument,
  type RequestedForm,
} from "../../domain/patient-form-requests";
import { MessageRepository } from "../repositories/message-repository";
import { MessageAttachmentRepository, resolveMessageAttachments } from "../repositories/message-attachment-repository";
import type { CoveragePolicy, CoverageStatus, CoverageType, PatientAdministrativeRecord } from "../../domain/patient-administration";
import { primaryCoverage, sameDateOfBirth } from "../../domain/patient-administration";
import { isProspectivePersonId, type VisitType } from "../../lib/schedule-data";
import {
  computeIntakeChecklist,
  estimatePatientResponsibility,
  intakePriorityScore,
  intakeStage,
  intakeSubjectId,
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
  type FormSection,
  type FormSubmission,
  type GuardianSituation,
  type IdentityDocumentReviewResult,
  type IntakeDispositionReason,
  type IntakeEpisode,
  type IntakeNote,
  type IntakeNoteKind,
  type IntakePortalInvitation,
  type IntakePortalInvitationStatus,
  type IntakeQueueRow,
  type IntakeReadinessStep,
  type IntakeSelfServiceAssessmentItem,
  type IntakeSelfServiceConsentItem,
  type IntakeSelfServicePackage,
  type IntakeSelfServiceSubmission,
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
  portalInvitation?: IntakePortalInvitation | null;
  requiredConsents: ConsentTemplate[];
  signedConsents: ConsentSignature[];
  formSubmissions: FormSubmission[];
  requiredFormTemplates: { id: string; title: string; version: number }[];
  assessments: AssessmentRecord[];
  payment: PaymentMethodReference | null;
  participations: PayerPlanParticipation[];
};

/** `computeIntakeChecklist`'s `appointment` field is unused by every current
 * step — carried in the input shape for a future step that wants it — so a
 * standalone episode (no visit scheduled yet) can pass this placeholder
 * safely rather than needing a real appointment to compute readiness at all. */
const NO_APPOINTMENT_PLACEHOLDER: Pick<AppointmentRecord, "status" | "intakeStatus"> = {
  status: "tentative",
  intakeStatus: "pending",
};

function buildReadiness(
  admin: PatientAdministrativeRecord,
  appointment: Pick<AppointmentRecord, "status" | "intakeStatus"> | undefined,
  episode: IntakeEpisode,
): ReadinessBundle {
  const subject = episodeSubject(episode);
  const portalInvitation = IntakeRepository.getLatestPortalInvitationForEpisode(episode.id);
  const requiredConsents = IntakeRepository.listActiveConsentTemplates();
  const signedConsents = IntakeRepository.listSignedConsents(subject);
  const formSubmissions = IntakeRepository.listFormSubmissions(subject);
  const requiredFormTemplates = IntakeRepository.listActiveFormTemplates().map((t) => ({ id: t.id, title: t.title, version: t.version }));
  const assessments = MeasurementRepository.listAssessmentsBySubject(subject);
  const eligibility = IntakeRepository.latestEligibilityCheck(subject) ?? undefined;
  const payment = IntakeRepository.latestPaymentReference(subject);
  const participations = IntakeRepository.listPayerPlanParticipations();
  const policy = primaryCoverage(admin.coverage);
  const planAcceptance = matchPlanAcceptance(policy, participations).result;

  const govIdDocs = governmentIdDocuments(subject);
  const identityReview = IntakeRepository.latestIdentityDocumentReview(govIdDocs.map((d) => d.id)) ?? undefined;

  const resolvedAppointment = appointment ?? NO_APPOINTMENT_PLACEHOLDER;
  const steps = computeIntakeChecklist({
    administrative: admin,
    appointment: { status: resolvedAppointment.status, intakeStatus: resolvedAppointment.intakeStatus },
    episode: { guardianSituation: episode.guardianSituation, staffReviewResolvedAt: episode.staffReviewResolvedAt },
    portalInvitation,
    governmentIdDocuments: govIdDocs,
    identityDocumentReview: identityReview,
    insuranceCardDocuments: insuranceCardDocuments(subject),
    planAcceptance: { result: planAcceptance },
    eligibility,
    requiredConsents,
    signedConsents,
    formSubmissions,
    requiredFormTemplateIds: requiredFormTemplates.map((t) => t.id),
    assessments,
    payment: payment ?? undefined,
    freshnessPolicy: DEFAULT_INTAKE_FRESHNESS_POLICY,
  });

  return { episode, subject, steps, planAcceptance, portalInvitation, requiredConsents, signedConsents, formSubmissions, requiredFormTemplates, assessments, payment, participations };
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
    const allActiveEpisodes = IntakeRepository.listActiveEpisodes();
    const appointmentEpisodes = new Map(
      allActiveEpisodes.filter((e) => e.appointmentId).map((e) => [e.appointmentId!, e]),
    );
    const standaloneEpisodes = allActiveEpisodes.filter((e) => !e.appointmentId);

    const rows: IntakeQueueRow[] = [];
    for (const appointment of allAppointments) {
      if (appointment.status === "completed") continue;
      const existingEpisode = appointmentEpisodes.get(appointment.id);
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
        portalInvitation: bundle.portalInvitation,
      });
    }

    // A subject can start intake work — identity, coverage, documents,
    // consents — before any visit is on the books at all. These episodes
    // have no appointment to iterate from above, so they get their own pass.
    for (const episode of standaloneEpisodes) {
      if (episode.dispositionStatus !== "active") continue;
      if (!canAccessSubject(actor, episodeSubject(episode))) continue;

      const admin = readSubjectAdministrativeRecord(episodeSubject(episode));
      if (!admin) continue;

      const bundle = buildReadiness(admin, undefined, episode);
      const stage = intakeStage(undefined, bundle.steps, bundle.planAcceptance);

      rows.push({
        episode,
        patientId: episode.patientId,
        prospectivePersonId: episode.prospectivePersonId,
        patientName: admin.identity.legalName,
        stage,
        steps: bundle.steps,
        planAcceptance: bundle.planAcceptance,
        portalInvitation: bundle.portalInvitation,
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

    // No visit scheduled yet: work the standalone episode instead of 404ing —
    // identity, coverage, document and consent evidence can all progress
    // before a first appointment exists.
    const episode = target
      ? IntakeRepository.getOrCreateForAppointment({ ...subjectForAccess, appointmentId: target.id, organizationId: actor.organizationId })
      : IntakeRepository.getOrCreateStandalone(subjectForAccess, actor.organizationId);
    const bundle = buildReadiness(admin, target, episode);
    const stage = intakeStage(target?.status, bundle.steps, bundle.planAcceptance);
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
      portalInvitation: bundle.portalInvitation,
      notes: IntakeRepository.listNotes(episode.id),
      consents: { required: bundle.requiredConsents, signed: bundle.signedConsents },
      forms: { required: bundle.requiredFormTemplates, submissions: bundle.formSubmissions },
      assessments: bundle.assessments,
      eligibility: IntakeRepository.latestEligibilityCheck(bundle.subject),
      estimatedResponsibility,
      payment: bundle.payment,
      documents: governmentIdDocuments(bundle.subject),
      insuranceCardDocuments: insuranceCardDocuments(bundle.subject),
    };
  },

  /**
   * Starts intake work for a subject with no visit scheduled yet — the
   * standalone episode `getDetail` would otherwise create lazily on first
   * read, done explicitly here so "New Intake" without a tentative hold has
   * something to select immediately rather than depending on that fallback.
   */
  startStandalone(actor: ProviderContext, context: ClinicalExecutionContext, subject: IntakeSubject) {
    assertIntakeWrite(actor);
    assertSubjectAccess(actor, subject);
    const episode = IntakeRepository.getOrCreateStandalone(subject, actor.organizationId);
    audit(actor, context, episode, `Started intake for ${subjectLabel(subject)} with no visit scheduled yet.`, {});
    return episode;
  },

  /**
   * Schedules the first tentative hold for an episode that started with no
   * visit — the same episode row gains an appointment rather than a second
   * one being created, so its notes/evidence history carries straight
   * through into the ordinary appointment-driven queue and detail view.
   */
  scheduleVisit(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: { episodeId: string; date: string; time: string; type?: VisitType; duration?: string },
  ) {
    assertIntakeWrite(actor);
    const episode = requireEpisode(input.episodeId);
    const subject = episodeSubject(episode);
    assertSubjectAccess(actor, subject);
    if (episode.appointmentId) {
      throw new IntakeError("This intake already has a scheduled visit.", 409);
    }
    if (!input.date || !input.time) {
      throw new IntakeError("A date and time are required to schedule a visit.", 400);
    }

    const admin = readSubjectAdministrativeRecord(subject);
    if (!admin) throw new IntakeError("Could not re-read the current record to schedule a visit.", 404);

    const appointment = workflowService.createAppointment(
      {
        patientId: intakeSubjectId(episode),
        patientName: admin.identity.legalName,
        date: input.date,
        time: input.time,
        type: input.type ?? "60-min Intake",
        duration: input.duration,
        status: "tentative",
        chiefComplaint: "New patient intake",
      },
      actor,
      context,
    );

    const updated = IntakeRepository.linkEpisodeToAppointment(episode.id, appointment.id)!;
    audit(actor, context, updated, `Scheduled a tentative visit for ${subjectLabel(subject)} on ${input.date} at ${input.time}.`, {
      appointmentId: appointment.id,
    });
    return { episode: updated, appointment };
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
    input: IntakeSubject & {
      templateId: string;
      signerName: string;
      signerRelationship: ConsentSignature["signerRelationship"];
      method?: ConsentSignature["method"];
      signatureData?: string;
      attestationStatement?: string;
    },
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
      method: input.method,
      signatureData: input.signatureData,
      attestationStatement: input.attestationStatement,
      recordedById: actor.userId,
      recordedByName: providerLabel(actor),
    });

    const methodDesc = input.method === "drawn_canvas" ? "drawn digital" : input.method === "typed_attestation" ? "typed legal" : "staff-attested";
    AuditRepository.log({
      ...auditActor(actor),
      eventType: "intake_consent_signed",
      patientId: input.patientId,
      description: `Recorded ${methodDesc} signature for "${template.title}" v${template.version} (${input.signerRelationship}: ${input.signerName}).`,
      metadata: { templateId: template.id, signatureId: signature.id, method: signature.method, ...meta(context) },
    });
    return signature;
  },

  recordAssessment(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: IntakeSubject & {
      instrument: AssessmentInstrumentType;
      responses: Record<number | string, number>;
      notes?: string;
    },
  ) {
    assertIntakeWrite(actor);
    assertSubjectAccess(actor, input);
    const assessment = MeasurementRepository.recordAssessment(
      {
        patientId: input.patientId,
        prospectivePersonId: input.prospectivePersonId,
        instrument: input.instrument,
        responses: input.responses as Record<number, number>,
        notes: input.notes,
        source: "clinician",
      },
      {
        userId: actor.userId,
        displayName: providerLabel(actor),
      },
      { type: context.source, ref: context.requestId },
    );

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "clinical_assessment_recorded",
      patientId: input.patientId || undefined,
      description: `Administered ${assessment.title} (Score ${assessment.totalScore}/${assessment.maxScore} · ${assessment.severity}).`,
      metadata: {
        assessmentId: assessment.id,
        instrument: assessment.instrument,
        score: assessment.totalScore,
        severity: assessment.severity,
        flags: assessment.flags,
        ...meta(context),
      },
    });

    return assessment;
  },

  reviewAssessment(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: { assessmentId: string; notes?: string },
  ) {
    assertIntakeWrite(actor);
    const existing = MeasurementRepository.getAssessment(input.assessmentId);
    if (!existing) throw new IntakeError(`Assessment not found: ${input.assessmentId}`, 404);
    assertSubjectAccess(actor, existing.patientId ? { patientId: existing.patientId } : { prospectivePersonId: existing.prospectivePersonId || undefined });

    const updated = MeasurementRepository.reviewAssessment(
      input.assessmentId,
      {
        userId: actor.userId,
        displayName: providerLabel(actor),
      },
      input.notes,
    );

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "clinical_assessment_reviewed",
      patientId: existing.patientId || undefined,
      description: `Reviewed assessment ${existing.title}.`,
      metadata: { assessmentId: input.assessmentId, ...meta(context) },
    });

    return updated;
  },

  createFormTemplate(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: { title: string; category?: string; sections: FormSection[]; active?: boolean },
  ) {
    assertIntakeWrite(actor);
    if (!input.title?.trim()) throw new IntakeError("A form title is required.", 400);
    const template = IntakeRepository.createFormTemplate(input);
    AuditRepository.log({
      ...auditActor(actor),
      eventType: "form_template_created",
      description: `Created form template "${template.title}".`,
      metadata: { templateId: template.id, ...meta(context) },
    });
    return template;
  },

  updateFormTemplate(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    id: string,
    updates: { title?: string; category?: string; sections?: FormSection[]; active?: boolean },
  ) {
    assertIntakeWrite(actor);
    const template = IntakeRepository.updateFormTemplate(id, updates);
    if (!template) throw new IntakeError(`Form template not found: ${id}`, 404);
    AuditRepository.log({
      ...auditActor(actor),
      eventType: "form_template_updated",
      description: `Updated form template "${template.title}" to version ${template.version}.`,
      metadata: { templateId: template.id, version: template.version, ...meta(context) },
    });
    return template;
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

  issuePortalInvitation(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: { episodeId: string; ttlDays?: number; targetEmail?: string; targetPhone?: string; requireDobVerification?: boolean },
  ): { invitation: IntakePortalInvitation; token: string; linkUrl: string } {
    assertIntakeWrite(actor);
    const episode = requireEpisode(input.episodeId);
    assertSubjectAccess(actor, episodeSubject(episode));

    const admin = readSubjectAdministrativeRecord(episodeSubject(episode));
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const ttlDays = input.ttlDays && input.ttlDays > 0 ? input.ttlDays : 7;
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000).toISOString();

    const invitation = IntakeRepository.createPortalInvitation({
      ...episodeSubject(episode),
      episodeId: episode.id,
      tokenHash,
      targetEmail: input.targetEmail ?? admin?.contact?.email,
      targetPhone: input.targetPhone ?? admin?.contact?.mobilePhone,
      dobVerificationRequired: input.requireDobVerification ?? true,
      expiresAt,
      createdById: actor.userId,
      createdByName: providerLabel(actor),
    });

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "intake_portal_invitation_issued",
      patientId: episode.patientId,
      description: `Issued self-service intake portal invitation for episode ${episode.id} (expires ${expiresAt.slice(0, 10)}).`,
      metadata: { episodeId: episode.id, invitationId: invitation.id, expiresAt, ...meta(context) },
    });

    IntakeRepository.addNote({
      episodeId: episode.id,
      ...episodeSubject(episode),
      kind: "outreach",
      body: `Self-service intake invitation link issued by ${providerLabel(actor)} (expires ${expiresAt.slice(0, 10)}).`,
      authorId: actor.userId,
      authorName: providerLabel(actor),
    });

    return {
      invitation,
      token,
      linkUrl: `/intake/self-service?token=${token}`,
    };
  },

  /**
   * Forms a clinician sends an established patient from the chart: chosen rating
   * scales and consents, behind the same single-subject token and date-of-birth
   * check as the intake packet.
   *
   * No portal, SMS or email transport is connected (D-107), so nothing is sent by
   * the system. The request is recorded in a new message thread that says so, and
   * the link is returned once, to the requesting user, to pass on themselves. The
   * token is never stored or written into the thread; only its hash is kept.
   */
  requestPatientForms(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: { patientId: string; items: unknown; ttlDays?: number; note?: string },
  ): { threadId: string; invitation: IntakePortalInvitation; token: string; linkUrl: string } {
    assertPatientAccess(actor, input.patientId);
    const normalized = normalizeRequestedForms(input.items);
    if ("error" in normalized) throw new IntakeError(normalized.error, 400);
    const items: RequestedForm[] = normalized.items;

    const activeTemplates = new Map(IntakeRepository.listActiveConsentTemplates().map((t) => [t.id, t]));
    for (const templateId of requestedConsentTemplateIds(items)) {
      if (!activeTemplates.has(templateId)) throw new IntakeError("A requested consent is not an active template.", 400);
    }

    const admin = readSubjectAdministrativeRecord({ patientId: input.patientId });
    if (!admin) throw new IntakeError(`Patient not found: ${input.patientId}`, 404);

    const ttlDays = input.ttlDays && input.ttlDays > 0 && input.ttlDays <= 30 ? Math.round(input.ttlDays) : DEFAULT_FORM_REQUEST_TTL_DAYS;
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000).toISOString();
    const titles = items.map((item) =>
      item.kind === "assessment"
        ? REMOTE_ASSESSMENT_LABELS[item.instrument]
        : item.kind === "safety-plan"
          ? "Safety plan"
          : activeTemplates.get(item.templateId)!.title,
    );
    const note = input.note?.trim();
    const content = [
      ...(note ? [note, ""] : []),
      `Forms requested: ${titles.join(", ")}.`,
      `A secure link (date of birth required, expires ${expiresAt.slice(0, 10)}) was given to ${providerLabel(actor)} to pass to the patient.`,
      "Not delivered by Clinical Bond: no portal, SMS or email service is connected.",
    ].join("\n");

    const thread = workflowService.createMessageThread(
      {
        patientId: input.patientId,
        subject: titles.length === 1 ? `Please complete: ${titles[0]}` : `Please complete ${titles.length} forms`,
        category: "general",
        urgency: "routine",
        content,
        channel: "portal",
      },
      actor,
      context,
    );

    const token = randomBytes(32).toString("base64url");
    const invitation = IntakeRepository.createPortalInvitation({
      patientId: input.patientId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      targetEmail: admin.contact?.email,
      targetPhone: admin.contact?.mobilePhone,
      dobVerificationRequired: true,
      expiresAt,
      createdById: actor.userId,
      createdByName: providerLabel(actor),
      requestedItems: items,
      threadId: thread.id,
    });

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "patient_forms_requested",
      patientId: input.patientId,
      description: `Requested forms from the chart: ${titles.join(", ")} (link expires ${expiresAt.slice(0, 10)}; not delivered by the system).`,
      metadata: { invitationId: invitation.id, threadId: thread.id, items, expiresAt, ...meta(context) },
    });

    return { threadId: thread.id, invitation, token, linkUrl: `/intake/self-service?token=${token}` };
  },

  /** Forms requested from this chart and where each stands. */
  listPatientFormRequests(actor: ProviderContext, patientId: string): PatientFormRequestSummary[] {
    assertPatientAccess(actor, patientId);
    const templates = new Map(IntakeRepository.listAllConsentTemplates().map((t) => [t.id, t.title]));
    return IntakeRepository.listChartFormRequests(patientId).map((inv) => ({
      id: inv.id,
      status: inv.status,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      completedAt: inv.completedAt,
      createdByName: inv.createdByName,
      threadId: inv.threadId,
      titles: (inv.requestedItems ?? []).map((item) =>
        item.kind === "assessment"
          ? REMOTE_ASSESSMENT_LABELS[item.instrument]
          : item.kind === "safety-plan"
            ? "Safety plan"
            : templates.get(item.templateId) ?? "Consent",
      ),
    }));
  },

  /**
   * Stops a chart form link from opening. Only an open request on this chart can
   * be revoked; the thread records who revoked it.
   */
  revokePatientFormRequest(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: { patientId: string; invitationId: string },
  ): PatientFormRequestSummary {
    assertPatientAccess(actor, input.patientId);
    assertPermission(actor, "send_message");
    const invitation = IntakeRepository.getPortalInvitationById(input.invitationId);
    if (!invitation || invitation.patientId !== input.patientId || !invitation.requestedItems) {
      throw new IntakeError("Form request not found for this chart.", 404);
    }
    if (invitation.status !== "pending" && invitation.status !== "accessed") {
      throw new IntakeError(`This request is already ${invitation.status}.`, 409);
    }
    IntakeRepository.revokePortalInvitation(invitation.id);
    if (invitation.threadId) {
      MessageRepository.addMessage({
        patientId: input.patientId,
        threadId: invitation.threadId,
        senderRole: "provider",
        senderName: providerLabel(actor),
        content: `Form link revoked by ${providerLabel(actor)}. It can no longer be opened.`,
      });
    }
    AuditRepository.log({
      ...auditActor(actor),
      eventType: "intake_portal_invitation_revoked",
      patientId: input.patientId,
      description: `Revoked chart form request ${invitation.id}.`,
      metadata: { invitationId: invitation.id, threadId: invitation.threadId, ...meta(context) },
    });
    return this.listPatientFormRequests(actor, input.patientId).find((r) => r.id === invitation.id)!;
  },

  revokePortalInvitation(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    invitationId: string,
  ): IntakePortalInvitation {
    assertIntakeWrite(actor);
    const invitation = IntakeRepository.getPortalInvitationById(invitationId);
    if (!invitation) throw new IntakeError("Invitation not found.", 404);
    assertSubjectAccess(actor, { patientId: invitation.patientId, prospectivePersonId: invitation.prospectivePersonId });

    const updated = IntakeRepository.revokePortalInvitation(invitationId);
    if (!updated) throw new IntakeError("Failed to revoke invitation.", 500);

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "intake_portal_invitation_revoked",
      patientId: invitation.patientId,
      description: `Revoked self-service intake portal invitation ${invitationId}.`,
      metadata: { invitationId, episodeId: invitation.episodeId, ...meta(context) },
    });

    return updated;
  },

  getPortalInvitation(actor: ProviderContext, episodeId: string): IntakePortalInvitation | null {
    assertIntakeRead(actor);
    const episode = requireEpisode(episodeId);
    assertSubjectAccess(actor, episodeSubject(episode));
    return IntakeRepository.getLatestPortalInvitationForEpisode(episodeId);
  },

  /**
   * Patient-Facing Self-Service Endpoint (P7-F)
   * Strict Authority Boundary: Authenticates solely via cryptographic single-use invitation token.
   * Does NOT require or accept clinician ProviderContext.
   */
  getSelfServicePackage(token: string, dobAttempt?: string): IntakeSelfServicePackage {
    if (!token || typeof token !== "string" || !token.trim()) {
      throw new IntakeError("A valid invitation token is required.", 400);
    }

    const tokenHash = createHash("sha256").update(token.trim()).digest("hex");
    const invitation = IntakeRepository.getPortalInvitationByTokenHash(tokenHash);
    if (!invitation) {
      throw new IntakeError("This intake invitation is invalid or does not exist.", 404);
    }
    if (invitation.status === "revoked") {
      throw new IntakeError("This invitation link is no longer active (revoked). Please contact staff to request a new link.", 410);
    }
    if (invitation.status === "expired") {
      throw new IntakeError("This intake invitation has expired. Please contact the clinic for a refreshed link.", 410);
    }

    // Mark as accessed on first opening if pending
    if (invitation.status === "pending") {
      IntakeRepository.updatePortalInvitation(invitation.id, {
        status: "accessed",
        lastAccessedAt: new Date().toISOString(),
      });
      invitation.status = "accessed";
    }

    const subject: IntakeSubject = {
      patientId: invitation.patientId,
      prospectivePersonId: invitation.prospectivePersonId,
    };
    const admin = readSubjectAdministrativeRecord(subject);
    if (!admin) {
      throw new IntakeError("Subject record associated with this invitation could not be found.", 404);
    }

    const actualDob = (admin.identity.dob || "").trim();
    let dobVerified = !invitation.dobVerificationRequired;
    if (invitation.dobVerificationRequired && dobAttempt !== undefined) {
      if (sameDateOfBirth(dobAttempt, actualDob)) {
        dobVerified = true;
      } else {
        throw new IntakeError("The provided date of birth does not match our records. Please verify and try again.", 403);
      }
    }

    // If DOB verification is required and not yet verified, return minimal identity shell
    if (!dobVerified) {
      const firstName = admin.identity.legalName.split(" ")[0] || "Patient";
      return {
        invitationId: invitation.id,
        purpose: invitation.requestedItems ? "chart-request" : "intake",
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        subject: {
          displayName: firstName,
          isProspective: Boolean(invitation.prospectivePersonId),
          dobVerificationRequired: true,
          dobVerified: false,
        },
        consentTemplates: [],
        assessmentInstruments: [],
        overallProgress: {
          dobVerified: false,
          demographicsConfirmed: false,
          consentsSignedCount: 0,
          totalConsentsCount: 0,
          assessmentsCompletedCount: 0,
          totalAssessmentsCount: 0,
          isFullyComplete: false,
        },
      };
    }

    // Full packet when verified
    const requested = invitation.requestedItems;
    const episode = invitation.episodeId ? IntakeRepository.getEpisodeById(invitation.episodeId) : null;
    let appointmentInfo: IntakeSelfServicePackage["appointment"];
    if (episode?.appointmentId) {
      const appt = AppointmentRepository.getById(episode.appointmentId);
      if (appt) {
        appointmentInfo = {
          date: appt.date,
          time: appt.time,
          visitType: appt.type,
          providerName: appt.providerName,
        };
      }
    }

    // Consents. A chart request shows only the templates it named, and counts a
    // template as signed only when it was signed for this request: a consent signed
    // last year is not this year's re-consent.
    const requestedTemplateIds = requested ? new Set(requestedConsentTemplateIds(requested)) : null;
    const templates = IntakeRepository.listActiveConsentTemplates().filter(
      (t) => !requestedTemplateIds || requestedTemplateIds.has(t.id),
    );
    const signed = IntakeRepository.listSignedConsents(subject);
    const signedMap = new Map(
      signed
        .filter((s) => !requested || s.signedAt >= invitation.createdAt)
        .map((s) => [s.templateId, s]),
    );

    const consentTemplates: IntakeSelfServiceConsentItem[] = templates.map((t) => {
      const existing = signedMap.get(t.id);
      return {
        id: t.id,
        title: t.title,
        category: t.category,
        version: t.version,
        bodyText: t.bodyText,
        requiresGuardianSignature: t.requiresGuardianSignature,
        signed: Boolean(existing),
        signedAt: existing?.signedAt,
        signerName: existing?.signerName,
      };
    });

    // Assessments. The intake packet is PHQ-9 and GAD-7, complete once any exists
    // for this subject. A chart request lists what it asked for, complete only once
    // this request was submitted: the chart's earlier scores are not today's.
    const instruments: RemoteAssessmentInstrument[] = requested ? requestedInstruments(requested) : ["phq-9", "gad-7"];
    const existingAssessments = requested ? [] : MeasurementRepository.listAssessmentsBySubject(subject);
    const assessmentInstruments: IntakeSelfServiceAssessmentItem[] = instruments.map((type) => {
      const definition = REMOTE_INSTRUMENT_DEFINITIONS[type];
      const existing = existingAssessments.find((a) => a.instrument === type);
      return {
        type,
        title: definition.title,
        description: definition.description,
        completed: requested ? invitation.status === "completed" : Boolean(existing),
        score: existing?.totalScore,
        maxScore: definition.maxScore,
        severity: existing?.severity,
        questions: definition.questions.map((q) => ({
          id: q.id,
          text: q.text,
          options: q.options.map((o) => ({ value: o.value, label: o.label })),
        })),
      };
    });

    const consentsSignedCount = consentTemplates.filter((c) => c.signed).length;
    const assessmentsCompletedCount = assessmentInstruments.filter((a) => a.completed).length;
    const isFullyComplete =
      invitation.status === "completed" ||
      // A requested safety plan is only complete once submitted.
      (!safetyPlanRequested(requested) &&
      (consentsSignedCount === consentTemplates.length && assessmentsCompletedCount === assessmentInstruments.length));

    return {
      invitationId: invitation.id,
      purpose: requested ? "chart-request" : "intake",
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      subject: {
        displayName: admin.identity.legalName,
        preferredName: admin.identity.preferredName,
        dob: admin.identity.dob,
        phone: admin.contact.mobilePhone,
        email: admin.contact.email,
        emergencyContactName: admin.relatedPeople?.find((r) => r.role === "emergency-contact")?.name,
        emergencyContactPhone: admin.relatedPeople?.find((r) => r.role === "emergency-contact")?.phone,
        emergencyContactRelationship: admin.relatedPeople?.find((r) => r.role === "emergency-contact")?.relationship,
        isProspective: Boolean(invitation.prospectivePersonId),
        dobVerificationRequired: invitation.dobVerificationRequired,
        dobVerified: true,
      },
      appointment: appointmentInfo,
      consentTemplates,
      assessmentInstruments,
      safetyPlanRequested: safetyPlanRequested(requested),
      overallProgress: {
        dobVerified: true,
        demographicsConfirmed: Boolean(admin.contact.mobilePhone && admin.contact.email),
        consentsSignedCount,
        totalConsentsCount: consentTemplates.length,
        assessmentsCompletedCount,
        totalAssessmentsCount: assessmentInstruments.length,
        isFullyComplete,
      },
    };
  },

  /**
   * Patient-Facing Self-Service Submission (P7-F)
   * Authenticates by token, records verifiable signatures, scores rating scales,
   * updates contact info, completes the invitation, and updates the intake episode.
   */
  submitSelfServicePackage(input: IntakeSelfServiceSubmission): {
    confirmationCode: string;
    completedAt: string;
    signedConsentsCount: number;
    completedAssessmentsCount: number;
  } {
    if (!input.token || !input.token.trim()) {
      throw new IntakeError("Token is required.", 400);
    }
    const tokenHash = createHash("sha256").update(input.token.trim()).digest("hex");
    const invitation = IntakeRepository.getPortalInvitationByTokenHash(tokenHash);
    if (!invitation) throw new IntakeError("Invalid invitation token.", 404);
    if (invitation.status === "revoked") throw new IntakeError("This invitation was revoked.", 410);
    if (invitation.status === "expired") throw new IntakeError("This invitation has expired.", 410);
    if (invitation.status === "completed") {
      throw new IntakeError("This intake packet has already been completed.", 409);
    }

    const subject: IntakeSubject = {
      patientId: invitation.patientId,
      prospectivePersonId: invitation.prospectivePersonId,
    };
    const admin = readSubjectAdministrativeRecord(subject);
    if (!admin) throw new IntakeError("Subject record not found.", 404);

    if (invitation.dobVerificationRequired) {
      const cleanAttempt = (input.dobVerification || "").trim();
      const actualDob = (admin.identity.dob || "").trim();
      if (!sameDateOfBirth(cleanAttempt, actualDob)) {
        throw new IntakeError("Date of birth verification failed. Please verify your birth date.", 403);
      }
    }

    const requested = invitation.requestedItems;

    // 1. Update contact information if provided. Only the intake packet asks for
    // it; a forms link sent from a chart cannot rewrite the chart's contact record.
    if (input.contact && !requested) {
      if (invitation.prospectivePersonId) {
        ProspectivePersonRepository.update(invitation.prospectivePersonId, {
          mobilePhone: input.contact.mobilePhone || undefined,
          email: input.contact.email || undefined,
        });
      } else if (invitation.patientId) {
        PatientRepository.update(invitation.patientId, {
          contact: {
            mobilePhone: input.contact.mobilePhone,
            email: input.contact.email,
          },
        });
      }
    }

    // 2. Record signed consents
    // A chart request records only what it asked for.
    const allowedTemplateIds = requested ? new Set(requestedConsentTemplateIds(requested)) : null;
    let signedConsentsCount = 0;
    if (input.consents && input.consents.length > 0) {
      for (const consent of input.consents) {
        if (!consent.signerName?.trim()) continue;
        if (allowedTemplateIds && !allowedTemplateIds.has(consent.templateId)) continue;
        IntakeRepository.recordConsentSignature({
          ...subject,
          templateId: consent.templateId,
          templateVersion: consent.templateVersion,
          signerName: consent.signerName.trim(),
          signerRelationship: consent.signerRelationship || "self",
          method: consent.method || "drawn_canvas",
          signatureData: consent.signatureData,
          attestationStatement:
            consent.attestationStatement ||
            `I, ${consent.signerName.trim()}, electronically affirm and sign this document via the Clinical Bond Patient Self-Service Portal.`,
          recordedById: "patient-portal",
          recordedByName: "Patient Self-Service Portal",
        });
        signedConsentsCount++;
      }
    }

    // 3. Record psychiatric rating scales
    const allowedInstruments = new Set<string>(requested ? requestedInstruments(requested) : ["phq-9", "gad-7"]);
    let completedAssessmentsCount = 0;
    const completedSummaries: string[] = [];
    let item9Endorsed = false;
    if (input.assessments && input.assessments.length > 0) {
      for (const item of input.assessments) {
        const answers = item.responses || {};
        if (Object.keys(answers).length === 0) continue;
        if (!allowedInstruments.has(item.instrument)) continue;

        const record = MeasurementRepository.recordAssessment(
          {
            patientId: invitation.patientId,
            prospectivePersonId: invitation.prospectivePersonId,
            instrument: item.instrument,
            responses: answers,
            administeredAt: new Date().toISOString(),
            source: "patient",
            notes: requested ? "Self-administered via forms link sent from the chart" : "Self-administered via patient portal intake",
          },
          {
            userId: "patient-portal",
            displayName: "Patient Self-Service Portal",
          },
          {
            type: "patient",
          },
        );
        completedAssessmentsCount++;
        const label = REMOTE_ASSESSMENT_LABELS[item.instrument as RemoteAssessmentInstrument] ?? item.instrument;
        const definition = REMOTE_INSTRUMENT_DEFINITIONS[item.instrument as RemoteAssessmentInstrument];
        completedSummaries.push(
          `${label}: ${record?.totalScore ?? "scored"}${definition ? `/${definition.maxScore}` : ""}${record?.severity ? ` (${record.severity})` : ""}`,
        );
        if (phq9Item9Endorsed(item.instrument, answers)) item9Endorsed = true;
      }
    }

    // 3b. A requested safety plan is filed in Documents as the patient's own
    // draft, for the clinician to review with them. It is never a reviewed plan.
    let safetyPlanDocumentId: string | null = null;
    const safetyPlanAnswers = safetyPlanRequested(requested) ? cleanSafetyPlanAnswers(input.safetyPlan) : {};
    if (invitation.patientId && Object.keys(safetyPlanAnswers).length > 0) {
      const completedOn = new Date().toISOString().slice(0, 10);
      const document = ClinicalRecordRepository.createDocumentForSubject(
        {
          patientId: invitation.patientId,
          documentType: "safety_plan",
          title: `Safety plan — patient draft, not yet reviewed (${completedOn})`,
          mimeType: "text/plain",
          contentText: safetyPlanDocumentText(safetyPlanAnswers, completedOn),
        },
        { userId: "patient-portal", displayName: "Patient (forms link)" },
        { type: "patient", system: "patient-portal", ref: invitation.id },
      ) as { id: string };
      safetyPlanDocumentId = document.id;
    }

    // 4. Mark invitation completed
    const completedAt = new Date().toISOString();
    IntakeRepository.updatePortalInvitation(invitation.id, {
      status: "completed",
      completedAt,
    });

    const confirmationCode = "CB-IN-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    // 5. Audit & episode note
    AuditRepository.log({
      userId: "patient-portal",
      userName: "Patient Portal",
      userRole: "patient",
      eventType: requested ? "patient_forms_submitted" : "intake_self_service_submitted",
      patientId: invitation.patientId,
      description: requested
        ? `Patient submitted requested forms (${signedConsentsCount} consent(s), ${completedAssessmentsCount} rating scale(s))${item9Endorsed ? " with PHQ-9 item 9 endorsed" : ""}. Confirmation: ${confirmationCode}.`
        : `Patient submitted self-service intake packet (${signedConsentsCount} consent(s), ${completedAssessmentsCount} assessment(s)). Confirmation: ${confirmationCode}.`,
      metadata: {
        invitationId: invitation.id,
        episodeId: invitation.episodeId,
        confirmationCode,
        signedConsentsCount,
        completedAssessmentsCount,
        ...(invitation.threadId ? { threadId: invitation.threadId } : {}),
        ...(item9Endorsed ? { phq9Item9Endorsed: true } : {}),
        ...(safetyPlanDocumentId ? { safetyPlanDocumentId } : {}),
      },
    });

    // A chart request reports back into the thread that sent it, where the
    // clinician's inbox already shows the patient's side of the conversation. A
    // positive PHQ-9 item 9 makes the thread urgent and says so first.
    if (invitation.threadId && invitation.patientId) {
      const lines = [
        ...(item9Endorsed
          ? ["SAFETY: PHQ-9 item 9 was endorsed (thoughts of being better off dead or of self-harm). Review and contact the patient today. The patient was shown 988 and 911 crisis resources on submission."]
          : []),
        `Forms completed ${completedAt.slice(0, 10)} (confirmation ${confirmationCode}).`,
        ...completedSummaries,
        ...(signedConsentsCount ? [`Signed ${signedConsentsCount} consent(s).`] : []),
        ...(safetyPlanDocumentId
          ? ["Safety plan filled out by the patient and filed in Documents (attached). It has not been reviewed with a clinician."]
          : safetyPlanRequested(requested)
            ? ["Safety plan was requested but left blank."]
            : []),
        ...(completedAssessmentsCount ? ["Scores are recorded in the chart's rating-scale history."] : []),
      ];
      const reply = MessageRepository.addMessage({
        patientId: invitation.patientId,
        threadId: invitation.threadId,
        senderRole: "patient",
        senderName: "Patient (forms link)",
        content: lines.join("\n"),
      });
      if (safetyPlanDocumentId) {
        MessageAttachmentRepository.attach(
          reply.id,
          invitation.patientId,
          resolveMessageAttachments(invitation.patientId, [{ kind: "document", recordId: safetyPlanDocumentId }]),
          "Patient (forms link)",
        );
      }
      if (item9Endorsed) MessageRepository.raiseUrgency(invitation.threadId, "urgent");
    }

    if (invitation.episodeId) IntakeRepository.addNote({
      episodeId: invitation.episodeId,
      ...subject,
      kind: "outreach",
      body: `Self-service intake packet completed by patient on ${completedAt.slice(0, 10)}. Confirmation: ${confirmationCode}. Signed ${signedConsentsCount} consent(s) and completed ${completedAssessmentsCount} clinical screen(s).`,
      authorId: "patient-portal",
      authorName: "Patient Self-Service Portal",
    });

    return {
      confirmationCode,
      completedAt,
      signedConsentsCount,
      completedAssessmentsCount,
    };
  },
};

/** The definition behind each scale a patient may complete from a link. */
const REMOTE_INSTRUMENT_DEFINITIONS: Record<RemoteAssessmentInstrument, AssessmentInstrumentDefinition> = {
  "phq-9": PHQ9_INSTRUMENT,
  "gad-7": GAD7_INSTRUMENT,
  "asrs-v1.1": ASRS_INSTRUMENT,
};

/** Strips extra fields down to just the subject id pair — keeps repository
 * calls from accidentally forwarding unrelated input fields as columns. */
function subjectOnly(subject: IntakeSubject): IntakeSubject {
  return { patientId: subject.patientId, prospectivePersonId: subject.prospectivePersonId };
}

export type IntakeDetail = ReturnType<typeof intakeService.getDetail>;

export type PatientFormRequestSummary = {
  id: string;
  status: IntakePortalInvitation["status"];
  titles: string[];
  createdAt: string;
  expiresAt: string;
  completedAt?: string;
  createdByName: string;
  threadId?: string;
};

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
