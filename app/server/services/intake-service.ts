import {
  assertPermission,
  hasPermission,
  providerLabel,
  type ProviderContext,
} from "../auth/provider-context";
import { assertPatientAccess, canAccessPatient } from "../auth/patient-access";
import { AuditRepository } from "../repositories/audit-repository";
import { AppointmentRepository, type AppointmentRecord } from "../repositories/appointment-repository";
import { PatientRepository } from "../repositories/patient-repository";
import { PatientAdministrationRepository } from "../repositories/patient-administration-repository";
import { ClinicalRecordRepository } from "../repositories/clinical-record-repository";
import { IntakeRepository } from "../repositories/intake-repository";
import type { PatientAdministrativeRecord } from "../../domain/patient-administration";
import { primaryCoverage } from "../../domain/patient-administration";
import {
  computeIntakeChecklist,
  intakePriorityScore,
  intakeStage,
  matchPlanAcceptance,
  sortIntakeQueue,
  type ConsentSignature,
  type ConsentTemplate,
  type EligibilityResult,
  type FormSubmission,
  type GuardianSituation,
  type IntakeDispositionReason,
  type IntakeEpisode,
  type IntakeNote,
  type IntakeNoteKind,
  type IntakeQueueRow,
  type IntakeReadinessStep,
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

function governmentIdDocuments(patientId: string) {
  return ClinicalRecordRepository.documents(patientId).map((row: any) => ({
    documentType: row.document_type as string,
    workflowStatus: (row.workflow_status as string) || "received",
  }));
}

type ReadinessBundle = {
  episode: IntakeEpisode;
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
  const requiredConsents = IntakeRepository.listActiveConsentTemplates();
  const signedConsents = IntakeRepository.listSignedConsents(admin.patientId);
  const formSubmissions = IntakeRepository.listFormSubmissions(admin.patientId);
  const requiredFormTemplates = IntakeRepository.listActiveFormTemplates().map((t) => ({ id: t.id, title: t.title, version: t.version }));
  const eligibility = IntakeRepository.latestEligibilityCheck(admin.patientId) ?? undefined;
  const payment = IntakeRepository.latestPaymentReference(admin.patientId);
  const participations = IntakeRepository.listPayerPlanParticipations();
  const policy = primaryCoverage(admin.coverage);
  const planAcceptance = matchPlanAcceptance(policy, participations).result;

  const steps = computeIntakeChecklist({
    administrative: admin,
    appointment: { status: appointment.status, intakeStatus: appointment.intakeStatus },
    episode: { guardianSituation: episode.guardianSituation, staffReviewResolvedAt: episode.staffReviewResolvedAt },
    governmentIdDocuments: governmentIdDocuments(admin.patientId),
    planAcceptance: { result: planAcceptance },
    eligibility,
    requiredConsents,
    signedConsents,
    formSubmissions,
    requiredFormTemplateIds: requiredFormTemplates.map((t) => t.id),
    payment: payment ?? undefined,
  });

  return { episode, steps, planAcceptance, requiredConsents, signedConsents, formSubmissions, requiredFormTemplates, payment, participations };
}

/** An appointment is a candidate front door into intake if it is tentative or
 * explicitly marked intake-pending, and has not yet reached a first completed visit. */
function isIntakeCandidate(appointment: AppointmentRecord): boolean {
  if (appointment.status === "completed") return false;
  return appointment.status === "tentative" || appointment.intakeStatus === "pending";
}

export const intakeService = {
  /** The global queue: every active intake episode this actor may see. */
  buildQueue(actor: ProviderContext): IntakeQueueRow[] {
    assertIntakeRead(actor);

    const allAppointments = AppointmentRepository.list();
    const activeEpisodes = new Map(IntakeRepository.listActiveEpisodes().map((e) => [e.appointmentId, e]));

    const rows: IntakeQueueRow[] = [];
    for (const appointment of allAppointments) {
      if (appointment.status === "completed") continue;
      const existingEpisode = activeEpisodes.get(appointment.id);
      if (!existingEpisode && !isIntakeCandidate(appointment)) continue;
      if (!canAccessPatient(actor, appointment.patientId)) continue;

      const episode = existingEpisode
        ?? (isIntakeCandidate(appointment)
          ? IntakeRepository.getOrCreateForAppointment({ patientId: appointment.patientId, appointmentId: appointment.id, organizationId: actor.organizationId })
          : null);
      if (!episode || episode.dispositionStatus !== "active") continue;

      const admin = readAdministrativeRecord(appointment.patientId);
      if (!admin) continue;

      const bundle = buildReadiness(admin, appointment, episode);
      const stage = intakeStage(appointment.status, bundle.steps, bundle.planAcceptance);

      rows.push({
        episode,
        appointmentId: appointment.id,
        appointmentStatus: appointment.status,
        appointmentDate: appointment.date,
        appointmentTime: appointment.time,
        patientId: appointment.patientId,
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

  /** Everything the Intake detail panel needs for one patient's active episode. */
  getDetail(actor: ProviderContext, patientId: string) {
    assertIntakeRead(actor);
    assertPatientAccess(actor, patientId);

    const admin = readAdministrativeRecord(patientId);
    if (!admin) throw new IntakeError(`Patient not found: ${patientId}`, 404);

    const appointments = AppointmentRepository.list({ patientId }).filter(isIntakeCandidate);
    const target = appointments.sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    if (!target) throw new IntakeError(`No active intake appointment for patient ${patientId}`, 404);

    const episode = IntakeRepository.getOrCreateForAppointment({ patientId, appointmentId: target.id, organizationId: actor.organizationId });
    const bundle = buildReadiness(admin, target, episode);
    const stage = intakeStage(target.status, bundle.steps, bundle.planAcceptance);

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
      eligibility: IntakeRepository.latestEligibilityCheck(patientId),
      payment: bundle.payment,
      documents: governmentIdDocuments(patientId),
    };
  },

  /* ---- Staff workflow state (episode-owned, not clinical truth) ---- */

  assign(actor: ProviderContext, context: ClinicalExecutionContext, episodeId: string, staffId: string, staffName: string) {
    assertIntakeWrite(actor);
    const episode = requireEpisode(episodeId);
    assertPatientAccess(actor, episode.patientId);
    const updated = IntakeRepository.updateEpisode(episodeId, { assignedStaffId: staffId, assignedStaffName: staffName })!;
    audit(actor, context, updated, `Assigned intake for ${episode.patientId} to ${staffName}.`, { staffId });
    return updated;
  },

  unassign(actor: ProviderContext, context: ClinicalExecutionContext, episodeId: string) {
    assertIntakeWrite(actor);
    const episode = requireEpisode(episodeId);
    assertPatientAccess(actor, episode.patientId);
    const updated = IntakeRepository.updateEpisode(episodeId, { assignedStaffId: undefined, assignedStaffName: undefined })!;
    audit(actor, context, updated, `Unassigned intake for ${episode.patientId}.`, {});
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
    assertPatientAccess(actor, episode.patientId);
    const trimmed = body.trim();
    if (!trimmed) throw new IntakeError("Note text is required.", 400);

    const note = IntakeRepository.addNote({
      episodeId,
      patientId: episode.patientId,
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
      description: `Added ${kind} to intake for ${episode.patientId}.`,
      metadata: { episodeId, noteId: note.id, kind, ...meta(context) },
    });
    return note;
  },

  setFollowUp(actor: ProviderContext, context: ClinicalExecutionContext, episodeId: string, followUpAt: string | null) {
    assertIntakeWrite(actor);
    const episode = requireEpisode(episodeId);
    assertPatientAccess(actor, episode.patientId);
    const updated = IntakeRepository.updateEpisode(episodeId, { followUpAt: followUpAt ?? undefined })!;
    audit(actor, context, updated, `Set intake follow-up for ${episode.patientId} to ${followUpAt || "none"}.`, { followUpAt });
    return updated;
  },

  setGuardianSituation(actor: ProviderContext, context: ClinicalExecutionContext, episodeId: string, situation: GuardianSituation) {
    assertIntakeWrite(actor);
    const episode = requireEpisode(episodeId);
    assertPatientAccess(actor, episode.patientId);
    const updated = IntakeRepository.updateEpisode(episodeId, { guardianSituation: situation })!;
    audit(actor, context, updated, `Recorded guardian situation for ${episode.patientId}: ${situation}.`, { situation });
    return updated;
  },

  resolveStaffReview(actor: ProviderContext, context: ClinicalExecutionContext, episodeId: string) {
    assertIntakeWrite(actor);
    const episode = requireEpisode(episodeId);
    assertPatientAccess(actor, episode.patientId);
    const updated = IntakeRepository.updateEpisode(episodeId, {
      staffReviewResolvedAt: new Date().toISOString(),
      staffReviewResolvedBy: providerLabel(actor),
    })!;
    audit(actor, context, updated, `Resolved staff review for ${episode.patientId}.`, {});
    return updated;
  },

  reopenStaffReview(actor: ProviderContext, context: ClinicalExecutionContext, episodeId: string) {
    assertIntakeWrite(actor);
    const episode = requireEpisode(episodeId);
    assertPatientAccess(actor, episode.patientId);
    const updated = IntakeRepository.updateEpisode(episodeId, {
      staffReviewResolvedAt: undefined,
      staffReviewResolvedBy: undefined,
    })!;
    audit(actor, context, updated, `Reopened staff review for ${episode.patientId}.`, {});
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
    assertPatientAccess(actor, episode.patientId);
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
      patientId: episode.patientId,
      kind: "disposition",
      body: `Archived: ${reason}${note ? ` — ${note}` : ""}`,
      authorId: actor.userId,
      authorName: providerLabel(actor),
    });
    audit(actor, context, updated, `Archived intake for ${episode.patientId} (${reason}).`, { reason, note });
    return updated;
  },

  reactivate(actor: ProviderContext, context: ClinicalExecutionContext, episodeId: string) {
    assertIntakeWrite(actor);
    const episode = requireEpisode(episodeId);
    assertPatientAccess(actor, episode.patientId);
    const updated = IntakeRepository.updateEpisode(episodeId, {
      dispositionStatus: "active",
      dispositionReason: undefined,
      dispositionNote: undefined,
      disposedAt: undefined,
      disposedBy: undefined,
    })!;
    audit(actor, context, updated, `Reactivated intake for ${episode.patientId}.`, {});
    return updated;
  },

  /* ---- Consent, form, eligibility, and payment mutations ---- */

  recordConsentSignature(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: { patientId: string; templateId: string; signerName: string; signerRelationship: ConsentSignature["signerRelationship"] },
  ) {
    assertIntakeWrite(actor);
    assertPatientAccess(actor, input.patientId);
    const template = IntakeRepository.getConsentTemplate(input.templateId);
    if (!template) throw new IntakeError(`Consent template not found: ${input.templateId}`, 404);
    if (!input.signerName.trim()) throw new IntakeError("A signer name is required.", 400);

    const signature = IntakeRepository.recordConsentSignature({
      patientId: input.patientId,
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
    input: {
      patientId: string;
      templateId: string;
      submissionId?: string;
      answers: Record<string, string>;
      status: "in_progress" | "submitted";
      respondent?: FormSubmission["respondent"];
      respondentName?: string;
    },
  ) {
    assertIntakeWrite(actor);
    assertPatientAccess(actor, input.patientId);
    const template = IntakeRepository.getFormTemplate(input.templateId);
    if (!template) throw new IntakeError(`Form template not found: ${input.templateId}`, 404);

    const submission = IntakeRepository.saveFormSubmission({
      id: input.submissionId,
      patientId: input.patientId,
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
    assertPatientAccess(actor, submission.patientId);

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
    input: { patientId: string; coveragePolicyId: string; result: EligibilityResult; note?: string },
  ) {
    assertIntakeWrite(actor);
    assertPatientAccess(actor, input.patientId);
    const check = IntakeRepository.recordEligibilityCheck({
      patientId: input.patientId,
      coveragePolicyId: input.coveragePolicyId,
      result: input.result,
      source: "manual_staff_attestation",
      note: input.note,
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
    input: { patientId: string; status: PaymentReadinessStatus; brand?: string; lastFour?: string; waiverReason?: string },
  ) {
    assertIntakeWrite(actor);
    assertPatientAccess(actor, input.patientId);
    if (input.status === "waived" && !input.waiverReason?.trim()) {
      throw new IntakeError("A reason is required to waive the payment-method requirement.", 400);
    }

    const record = IntakeRepository.recordPaymentReference({
      patientId: input.patientId,
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
    input: { payerName: string; product?: string; planName?: string; network?: string; notes?: string },
  ) {
    assertPermission(actor, "manage_organization");
    if (!input.payerName.trim()) throw new IntakeError("A payer name is required.", 400);
    const record = IntakeRepository.addPayerPlanParticipation({ ...input, createdBy: actor.userId });
    AuditRepository.log({
      ...auditActor(actor),
      eventType: "integration_configuration_updated",
      description: `Added payer-plan participation: ${record.payerName}${record.planName ? ` / ${record.planName}` : ""}.`,
      metadata: { participationId: record.id, ...meta(context) },
    });
    return record;
  },
};

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
