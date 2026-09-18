import { getDatabase } from "../db/connection";
import type {
  BenefitEvidence,
  ConsentSignature,
  ConsentTemplate,
  EligibilityCheck,
  EligibilityResult,
  FormSection,
  FormSubmission,
  FormSubmissionStatus,
  FormTemplate,
  GuardianSituation,
  IdentityDocumentReview,
  IdentityDocumentReviewResult,
  IntakeDispositionReason,
  IntakeEpisode,
  IntakeNote,
  IntakeNoteKind,
  PayerParticipationStatus,
  PayerPlanParticipation,
  PaymentMethodReference,
  PaymentReadinessStatus,
} from "../../domain/intake";

/** Exactly one of these two is set — see `intakeSubjectId()` in the domain layer. */
export type IntakeSubject = { patientId?: string; prospectivePersonId?: string };

function text(value: unknown): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : undefined;
}

function identifier(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function subjectOf(r: { patient_id?: string | null; prospective_person_id?: string | null }): IntakeSubject {
  return { patientId: text(r.patient_id), prospectivePersonId: text(r.prospective_person_id) };
}

function episodeProjection(r: any): IntakeEpisode {
  return {
    id: r.id,
    ...subjectOf(r),
    appointmentId: text(r.appointment_id),
    organizationId: text(r.organization_id),
    assignedStaffId: text(r.assigned_staff_id),
    assignedStaffName: text(r.assigned_staff_name),
    followUpAt: text(r.follow_up_at),
    lastOutreachAt: text(r.last_outreach_at),
    guardianSituation: (r.guardian_situation as GuardianSituation) || "not_applicable",
    staffReviewResolvedAt: text(r.staff_review_resolved_at),
    staffReviewResolvedBy: text(r.staff_review_resolved_by),
    dispositionStatus: r.disposition_status === "archived" ? "archived" : "active",
    dispositionReason: text(r.disposition_reason) as IntakeDispositionReason | undefined,
    dispositionNote: text(r.disposition_note),
    disposedAt: text(r.disposed_at),
    disposedBy: text(r.disposed_by),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function noteProjection(r: any): IntakeNote {
  return {
    id: r.id,
    episodeId: r.episode_id,
    ...subjectOf(r),
    kind: (r.kind as IntakeNoteKind) || "note",
    body: r.body,
    authorId: r.author_id,
    authorName: r.author_name,
    createdAt: r.created_at,
  };
}

function consentTemplateProjection(r: any): ConsentTemplate {
  return {
    id: r.id,
    category: r.category,
    title: r.title,
    version: Number(r.version) || 1,
    requiresGuardianSignature: Number(r.requires_guardian_signature) === 1,
    active: Number(r.active) === 1,
  };
}

function consentSignatureProjection(r: any): ConsentSignature {
  return {
    id: r.id,
    ...subjectOf(r),
    templateId: r.template_id,
    templateVersion: Number(r.template_version) || 1,
    signerName: r.signer_name,
    signerRelationship: r.signer_relationship,
    method: "staff_attested",
    recordedByName: r.recorded_by_name,
    signedAt: r.signed_at,
  };
}

function formTemplateProjection(r: any): FormTemplate {
  let sections: FormSection[] = [];
  try {
    sections = JSON.parse(r.sections_json || "[]");
  } catch {
    sections = [];
  }
  return {
    id: r.id,
    title: r.title,
    version: Number(r.version) || 1,
    category: r.category,
    active: Number(r.active) === 1,
    sections,
  };
}

function formSubmissionProjection(r: any): FormSubmission {
  let answers: Record<string, string> = {};
  try {
    answers = JSON.parse(r.answers_json || "{}");
  } catch {
    answers = {};
  }
  return {
    id: r.id,
    ...subjectOf(r),
    templateId: r.template_id,
    templateVersion: Number(r.template_version) || 1,
    respondent: r.respondent,
    respondentName: text(r.respondent_name),
    answers,
    status: r.status as FormSubmissionStatus,
    submittedAt: text(r.submitted_at),
    reviewedByName: text(r.reviewed_by_name),
    reviewedAt: text(r.reviewed_at),
  };
}

function payerPlanProjection(r: any): PayerPlanParticipation {
  return {
    id: r.id,
    payerName: r.payer_name,
    product: text(r.product),
    planName: text(r.plan_name),
    network: text(r.network),
    status: (r.status as PayerParticipationStatus) || "in_network",
    active: Number(r.active) === 1,
  };
}

function eligibilityCheckProjection(r: any): EligibilityCheck {
  let benefitEvidence: BenefitEvidence | undefined;
  if (r.benefit_evidence_json) {
    try {
      benefitEvidence = JSON.parse(r.benefit_evidence_json);
    } catch {
      benefitEvidence = undefined;
    }
  }
  return {
    id: r.id,
    ...subjectOf(r),
    coveragePolicyId: r.coverage_policy_id,
    result: r.result as EligibilityResult,
    source: r.source,
    adapterId: text(r.adapter_id),
    note: text(r.note),
    benefitEvidence,
    checkedByName: text(r.checked_by_name),
    checkedAt: r.checked_at,
  };
}

function paymentReferenceProjection(r: any): PaymentMethodReference {
  return {
    id: r.id,
    ...subjectOf(r),
    status: r.status as PaymentReadinessStatus,
    brand: text(r.brand),
    lastFour: text(r.last_four),
    waiverReason: text(r.waiver_reason),
    recordedByName: text(r.recorded_by_name),
    recordedAt: r.recorded_at,
  };
}

function identityDocumentReviewProjection(r: any): IdentityDocumentReview {
  return {
    id: r.id,
    documentId: r.document_id,
    documentVersion: r.document_version != null ? Number(r.document_version) : undefined,
    reviewerName: r.reviewer_name,
    result: r.result as IdentityDocumentReviewResult,
    legible: Number(r.legible) === 1,
    conflictNote: text(r.conflict_note),
    reviewedAt: r.reviewed_at,
  };
}

/**
 * Matches evidence recorded under either id. After promotion an episode
 * carries both `patientId` and `prospectivePersonId` (the prospect linkage
 * is preserved, not cleared — see `linkEpisodeToPatient`), and evidence
 * collected before promotion is still valid evidence for the same person.
 * Passing both ids here is what makes that pre-promotion evidence still
 * readable afterward, rather than needing to duplicate every row at
 * promotion time.
 */
function subjectClause(subject: IntakeSubject): { sql: string; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];
  if (subject.patientId) {
    clauses.push("patient_id = ?");
    params.push(subject.patientId);
  }
  if (subject.prospectivePersonId) {
    clauses.push("prospective_person_id = ?");
    params.push(subject.prospectivePersonId);
  }
  if (clauses.length === 0) throw new Error("An intake subject requires either a patientId or a prospectivePersonId.");
  return { sql: clauses.join(" OR "), params };
}

export type CreateIntakeEpisodeInput = IntakeSubject & {
  appointmentId: string;
  organizationId?: string;
};

export const IntakeRepository = {
  /* ---- Episodes ---- */

  getEpisodeById(id: string): IntakeEpisode | null {
    const db = getDatabase();
    const row = db.prepare(`SELECT * FROM intake_episodes WHERE id = ?`).get(id) as any;
    return row ? episodeProjection(row) : null;
  },

  getEpisodeByAppointment(appointmentId: string): IntakeEpisode | null {
    const db = getDatabase();
    const row = db.prepare(`SELECT * FROM intake_episodes WHERE appointment_id = ?`).get(appointmentId) as any;
    return row ? episodeProjection(row) : null;
  },

  /** Every episode still marked active, regardless of the linked appointment's status. */
  listActiveEpisodes(): IntakeEpisode[] {
    const db = getDatabase();
    const rows = db.prepare(`SELECT * FROM intake_episodes WHERE disposition_status = 'active'`).all() as any[];
    return rows.map(episodeProjection);
  },

  /** The episode a subject started before any visit was scheduled, if any —
   * `appointment_id IS NULL` is the durable marker for that, enforced unique
   * per subject by a partial index so this stays a true get-or-create. */
  getStandaloneEpisode(subject: IntakeSubject): IntakeEpisode | null {
    const db = getDatabase();
    const clause = subjectClause(subject);
    const row = db
      .prepare(`SELECT * FROM intake_episodes WHERE appointment_id IS NULL AND (${clause.sql})`)
      .get(...clause.params) as any;
    return row ? episodeProjection(row) : null;
  },

  getOrCreateStandalone(subject: IntakeSubject, organizationId?: string): IntakeEpisode {
    const existing = this.getStandaloneEpisode(subject);
    if (existing) return existing;
    if (!subject.patientId && !subject.prospectivePersonId) {
      throw new Error("An intake episode requires either a patientId or a prospectivePersonId.");
    }

    const db = getDatabase();
    const at = new Date().toISOString();
    const id = identifier("intake");
    try {
      db.prepare(
        `INSERT INTO intake_episodes (
          id, patient_id, prospective_person_id, appointment_id, organization_id, guardian_situation,
          disposition_status, created_at, updated_at
        ) VALUES (?,?,?,NULL,?,'not_applicable','active',?,?)`,
      ).run(id, subject.patientId ?? null, subject.prospectivePersonId ?? null, organizationId ?? null, at, at);
      return this.getEpisodeById(id)!;
    } catch (error) {
      // Another request may have won the partial-unique-index race after our
      // initial read. Converge on that durable episode; never surface a raw
      // SQLite uniqueness error for an operation whose contract is get-or-create.
      const raced = this.getStandaloneEpisode(subject);
      if (raced) return raced;
      throw error;
    }
  },

  /** Attaches a newly-scheduled visit to a standalone episode — the same
   * episode row, not a new one, so its notes/evidence history carries
   * straight through into the ordinary appointment-driven queue. */
  linkEpisodeToAppointment(id: string, appointmentId: string): IntakeEpisode | null {
    const existing = this.getEpisodeById(id);
    if (!existing) return null;
    const db = getDatabase();
    db.prepare(`UPDATE intake_episodes SET appointment_id = ?, updated_at = ? WHERE id = ?`).run(appointmentId, new Date().toISOString(), id);
    return this.getEpisodeById(id);
  },

  getOrCreateForAppointment(input: CreateIntakeEpisodeInput): IntakeEpisode {
    const existing = this.getEpisodeByAppointment(input.appointmentId);
    if (existing) return existing;
    if (!input.patientId && !input.prospectivePersonId) {
      throw new Error("An intake episode requires either a patientId or a prospectivePersonId.");
    }

    const db = getDatabase();
    const at = new Date().toISOString();
    const id = identifier("intake");
    try {
      db.prepare(
        `INSERT INTO intake_episodes (
          id, patient_id, prospective_person_id, appointment_id, organization_id, guardian_situation,
          disposition_status, created_at, updated_at
        ) VALUES (?,?,?,?,?,'not_applicable','active',?,?)`,
      ).run(id, input.patientId ?? null, input.prospectivePersonId ?? null, input.appointmentId, input.organizationId ?? null, at, at);
      return this.getEpisodeById(id)!;
    } catch (error) {
      const raced = this.getEpisodeByAppointment(input.appointmentId);
      if (raced) return raced;
      throw error;
    }
  },

  updateEpisode(id: string, patch: Record<string, unknown>): IntakeEpisode | null {
    const existing = this.getEpisodeById(id);
    if (!existing) return null;
    const db = getDatabase();
    const merged = { ...existing, ...patch } as IntakeEpisode;
    db.prepare(
      `UPDATE intake_episodes SET
        assigned_staff_id=?, assigned_staff_name=?, follow_up_at=?, last_outreach_at=?,
        guardian_situation=?, staff_review_resolved_at=?, staff_review_resolved_by=?,
        disposition_status=?, disposition_reason=?, disposition_note=?, disposed_at=?, disposed_by=?,
        updated_at=?
       WHERE id = ?`,
    ).run(
      merged.assignedStaffId ?? null,
      merged.assignedStaffName ?? null,
      merged.followUpAt ?? null,
      merged.lastOutreachAt ?? null,
      merged.guardianSituation,
      merged.staffReviewResolvedAt ?? null,
      merged.staffReviewResolvedBy ?? null,
      merged.dispositionStatus,
      merged.dispositionReason ?? null,
      merged.dispositionNote ?? null,
      merged.disposedAt ?? null,
      merged.disposedBy ?? null,
      new Date().toISOString(),
      id,
    );
    return this.getEpisodeById(id);
  },

  /**
   * Promotion: an episode that was prospect-linked gains `patient_id`. The
   * prospect linkage is kept, not cleared — the front-door history stays
   * attached for audit even though `patientId` now takes precedence.
   */
  linkEpisodeToPatient(id: string, patientId: string): IntakeEpisode | null {
    const existing = this.getEpisodeById(id);
    if (!existing) return null;
    const db = getDatabase();
    db.prepare(`UPDATE intake_episodes SET patient_id = ?, updated_at = ? WHERE id = ?`).run(patientId, new Date().toISOString(), id);
    return this.getEpisodeById(id);
  },

  /** All active episodes still linked to a given prospect (normally zero or one). */
  listEpisodesByProspect(prospectiveId: string): IntakeEpisode[] {
    const db = getDatabase();
    const rows = db.prepare(`SELECT * FROM intake_episodes WHERE prospective_person_id = ?`).all(prospectiveId) as any[];
    return rows.map(episodeProjection);
  },

  /* ---- Notes ---- */

  listNotes(episodeId: string): IntakeNote[] {
    const db = getDatabase();
    const rows = db
      .prepare(`SELECT * FROM intake_notes WHERE episode_id = ? ORDER BY created_at ASC`)
      .all(episodeId) as any[];
    return rows.map(noteProjection);
  },

  addNote(input: IntakeSubject & { episodeId: string; kind: IntakeNoteKind; body: string; authorId: string; authorName: string }): IntakeNote {
    const db = getDatabase();
    const at = new Date().toISOString();
    const id = identifier("inote");
    db.prepare(
      `INSERT INTO intake_notes (id, episode_id, patient_id, prospective_person_id, kind, body, author_id, author_name, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(id, input.episodeId, input.patientId ?? null, input.prospectivePersonId ?? null, input.kind, input.body, input.authorId, input.authorName, at);
    return noteProjection(db.prepare(`SELECT * FROM intake_notes WHERE id = ?`).get(id));
  },

  /* ---- Consents ---- */

  listActiveConsentTemplates(): ConsentTemplate[] {
    const db = getDatabase();
    const rows = db.prepare(`SELECT * FROM consent_templates WHERE active = 1 ORDER BY category, title`).all() as any[];
    return rows.map(consentTemplateProjection);
  },

  getConsentTemplate(id: string): ConsentTemplate | null {
    const db = getDatabase();
    const row = db.prepare(`SELECT * FROM consent_templates WHERE id = ?`).get(id) as any;
    return row ? consentTemplateProjection(row) : null;
  },

  listSignedConsents(subject: IntakeSubject): ConsentSignature[] {
    const db = getDatabase();
    const clause = subjectClause(subject);
    const rows = db
      .prepare(`SELECT * FROM consent_signatures WHERE ${clause.sql} ORDER BY signed_at DESC`)
      .all(...clause.params) as any[];
    return rows.map(consentSignatureProjection);
  },

  recordConsentSignature(input: IntakeSubject & {
    templateId: string;
    templateVersion: number;
    signerName: string;
    signerRelationship: ConsentSignature["signerRelationship"];
    recordedById: string;
    recordedByName: string;
    signedAt?: string;
  }): ConsentSignature {
    const db = getDatabase();
    const at = new Date().toISOString();
    const id = identifier("consent");
    db.prepare(
      `INSERT INTO consent_signatures (
        id, patient_id, prospective_person_id, template_id, template_version, signer_name, signer_relationship,
        method, recorded_by_id, recorded_by_name, signed_at, created_at
      ) VALUES (?,?,?,?,?,?,?,'staff_attested',?,?,?,?)`,
    ).run(
      id,
      input.patientId ?? null,
      input.prospectivePersonId ?? null,
      input.templateId,
      input.templateVersion,
      input.signerName,
      input.signerRelationship,
      input.recordedById,
      input.recordedByName,
      input.signedAt || at,
      at,
    );
    return consentSignatureProjection(db.prepare(`SELECT * FROM consent_signatures WHERE id = ?`).get(id));
  },

  /* ---- Forms ---- */

  listActiveFormTemplates(): FormTemplate[] {
    const db = getDatabase();
    const rows = db.prepare(`SELECT * FROM form_templates WHERE active = 1 ORDER BY title`).all() as any[];
    return rows.map(formTemplateProjection);
  },

  getFormTemplate(id: string): FormTemplate | null {
    const db = getDatabase();
    const row = db.prepare(`SELECT * FROM form_templates WHERE id = ?`).get(id) as any;
    return row ? formTemplateProjection(row) : null;
  },

  listFormSubmissions(subject: IntakeSubject): FormSubmission[] {
    const db = getDatabase();
    const clause = subjectClause(subject);
    const rows = db
      .prepare(`SELECT * FROM form_submissions WHERE ${clause.sql} ORDER BY created_at DESC`)
      .all(...clause.params) as any[];
    return rows.map(formSubmissionProjection);
  },

  getFormSubmission(id: string): FormSubmission | null {
    const db = getDatabase();
    const row = db.prepare(`SELECT * FROM form_submissions WHERE id = ?`).get(id) as any;
    return row ? formSubmissionProjection(row) : null;
  },

  /**
   * A submitted or reviewed submission is a filed record; saving new answers
   * against it creates a new submission instead of overwriting it, so a
   * completed intake form cannot be silently rewritten after the fact.
   */
  saveFormSubmission(input: IntakeSubject & {
    id?: string;
    templateId: string;
    templateVersion: number;
    respondent: FormSubmission["respondent"];
    respondentName?: string;
    answers: Record<string, string>;
    status: "in_progress" | "submitted";
  }): FormSubmission {
    const db = getDatabase();
    const now = new Date().toISOString();
    const existing = input.id ? this.getFormSubmission(input.id) : null;
    const mayUpdateInPlace = existing && existing.status === "in_progress";

    if (mayUpdateInPlace) {
      db.prepare(
        `UPDATE form_submissions SET
          answers_json=?, status=?, respondent=?, respondent_name=?, submitted_at=?, updated_at=?
         WHERE id = ?`,
      ).run(
        JSON.stringify(input.answers),
        input.status,
        input.respondent,
        input.respondentName ?? null,
        input.status === "submitted" ? now : null,
        now,
        existing!.id,
      );
      return this.getFormSubmission(existing!.id)!;
    }

    const id = identifier("form");
    db.prepare(
      `INSERT INTO form_submissions (
        id, patient_id, prospective_person_id, template_id, template_version, respondent, respondent_name,
        answers_json, status, submitted_at, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      input.patientId ?? null,
      input.prospectivePersonId ?? null,
      input.templateId,
      input.templateVersion,
      input.respondent,
      input.respondentName ?? null,
      JSON.stringify(input.answers),
      input.status,
      input.status === "submitted" ? now : null,
      now,
      now,
    );
    return this.getFormSubmission(id)!;
  },

  reviewFormSubmission(id: string, input: { reviewedById: string; reviewedByName: string; reviewNotes?: string }): FormSubmission | null {
    const existing = this.getFormSubmission(id);
    if (!existing) return null;
    const db = getDatabase();
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE form_submissions SET status='reviewed', reviewed_by_id=?, reviewed_by_name=?, review_notes=?, reviewed_at=?, updated_at=?
       WHERE id = ?`,
    ).run(input.reviewedById, input.reviewedByName, input.reviewNotes ?? null, now, now, id);
    return this.getFormSubmission(id);
  },

  /* ---- Identity document review ---- */

  latestIdentityDocumentReview(documentIds: readonly string[]): IdentityDocumentReview | null {
    if (documentIds.length === 0) return null;
    const db = getDatabase();
    const placeholders = documentIds.map(() => "?").join(",");
    const row = db
      .prepare(`SELECT * FROM identity_document_reviews WHERE document_id IN (${placeholders}) ORDER BY reviewed_at DESC, rowid DESC LIMIT 1`)
      .get(...documentIds) as any;
    return row ? identityDocumentReviewProjection(row) : null;
  },

  recordIdentityDocumentReview(input: IntakeSubject & {
    documentId: string;
    documentVersion?: number;
    reviewerId: string;
    reviewerName: string;
    result: IdentityDocumentReviewResult;
    legible: boolean;
    conflictNote?: string;
    confirmedFields?: Record<string, boolean>;
  }): IdentityDocumentReview {
    const db = getDatabase();
    const at = new Date().toISOString();
    const id = identifier("idreview");
    db.prepare(
      `INSERT INTO identity_document_reviews (
        id, patient_id, prospective_person_id, document_id, document_version, reviewer_id, reviewer_name,
        result, legible, conflict_note, confirmed_fields_json, reviewed_at, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      input.patientId ?? null,
      input.prospectivePersonId ?? null,
      input.documentId,
      input.documentVersion ?? null,
      input.reviewerId,
      input.reviewerName,
      input.result,
      input.legible ? 1 : 0,
      input.conflictNote ?? null,
      input.confirmedFields ? JSON.stringify(input.confirmedFields) : null,
      at,
      at,
    );
    return identityDocumentReviewProjection(db.prepare(`SELECT * FROM identity_document_reviews WHERE id = ?`).get(id));
  },

  /* ---- Payer-plan participation (practice configuration) ---- */

  listPayerPlanParticipations(): PayerPlanParticipation[] {
    const db = getDatabase();
    const rows = db.prepare(`SELECT * FROM payer_plan_participations ORDER BY payer_name`).all() as any[];
    return rows.map(payerPlanProjection);
  },

  addPayerPlanParticipation(input: {
    payerName: string;
    product?: string;
    planName?: string;
    network?: string;
    status: PayerParticipationStatus;
    effectiveDate?: string;
    notes?: string;
    createdBy: string;
  }): PayerPlanParticipation {
    const db = getDatabase();
    const at = new Date().toISOString();
    const id = identifier("payer");
    db.prepare(
      `INSERT INTO payer_plan_participations (
        id, payer_name, product, plan_name, network, status, effective_date, active, notes,
        source, created_by, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,1,?,'practice_configured',?,?,?)`,
    ).run(
      id,
      input.payerName,
      input.product ?? null,
      input.planName ?? null,
      input.network ?? null,
      input.status,
      input.effectiveDate ?? null,
      input.notes ?? null,
      input.createdBy,
      at,
      at,
    );
    return payerPlanProjection(db.prepare(`SELECT * FROM payer_plan_participations WHERE id = ?`).get(id));
  },

  /* ---- Eligibility ---- */

  latestEligibilityCheck(subject: IntakeSubject): EligibilityCheck | null {
    const db = getDatabase();
    const clause = subjectClause(subject);
    const row = db
      .prepare(`SELECT * FROM eligibility_checks WHERE ${clause.sql} ORDER BY checked_at DESC, rowid DESC LIMIT 1`)
      .get(...clause.params) as any;
    return row ? eligibilityCheckProjection(row) : null;
  },

  recordEligibilityCheck(input: IntakeSubject & {
    coveragePolicyId: string;
    result: EligibilityResult;
    source: "adapter" | "manual_staff_attestation";
    adapterId?: string;
    note?: string;
    benefitEvidence?: BenefitEvidence;
    checkedById?: string;
    checkedByName?: string;
  }): EligibilityCheck {
    const db = getDatabase();
    const at = new Date().toISOString();
    const id = identifier("elig");
    db.prepare(
      `INSERT INTO eligibility_checks (
        id, patient_id, prospective_person_id, coverage_policy_id, result, source, adapter_id, note,
        benefit_evidence_json, checked_by_id, checked_by_name, checked_at, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      input.patientId ?? null,
      input.prospectivePersonId ?? null,
      input.coveragePolicyId,
      input.result,
      input.source,
      input.adapterId ?? null,
      input.note ?? null,
      input.benefitEvidence ? JSON.stringify(input.benefitEvidence) : null,
      input.checkedById ?? null,
      input.checkedByName ?? null,
      at,
      at,
    );
    return eligibilityCheckProjection(db.prepare(`SELECT * FROM eligibility_checks WHERE id = ?`).get(id));
  },

  /* ---- Payment readiness ---- */

  latestPaymentReference(subject: IntakeSubject): PaymentMethodReference | null {
    const db = getDatabase();
    const clause = subjectClause(subject);
    const row = db
      .prepare(`SELECT * FROM payment_method_references WHERE ${clause.sql} ORDER BY recorded_at DESC, rowid DESC LIMIT 1`)
      .get(...clause.params) as any;
    return row ? paymentReferenceProjection(row) : null;
  },

  recordPaymentReference(input: IntakeSubject & {
    status: PaymentReadinessStatus;
    brand?: string;
    lastFour?: string;
    expiration?: string;
    waiverReason?: string;
    recordedById?: string;
    recordedByName?: string;
  }): PaymentMethodReference {
    const db = getDatabase();
    const at = new Date().toISOString();
    const id = identifier("pay");
    db.prepare(
      `INSERT INTO payment_method_references (
        id, patient_id, prospective_person_id, status, processor_ref, brand, last_four, expiration, waiver_reason,
        recorded_by_id, recorded_by_name, recorded_at, created_at
      ) VALUES (?,?,?,?,NULL,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      input.patientId ?? null,
      input.prospectivePersonId ?? null,
      input.status,
      input.brand ?? null,
      input.lastFour ?? null,
      input.expiration ?? null,
      input.waiverReason ?? null,
      input.recordedById ?? null,
      input.recordedByName ?? null,
      at,
      at,
    );
    return paymentReferenceProjection(db.prepare(`SELECT * FROM payment_method_references WHERE id = ?`).get(id));
  },
};
