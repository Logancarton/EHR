import { NextResponse } from "next/server";
import { getAuthenticatedProviderContext } from "../../server/auth/provider-context";
import { clinicalActionError } from "../../server/http/clinical-http";
import { IntakeError, intakeService } from "../../server/services/intake-service";
import type { DocumentWorkflowStatus } from "../../server/repositories/document-workflow-repository";
import type {
  BenefitEvidence,
  ConsentSignature,
  EligibilityResult,
  FormSubmission,
  GuardianSituation,
  IdentityDocumentReviewResult,
  IntakeDispositionReason,
  PayerParticipationStatus,
  PaymentReadinessStatus,
} from "../../domain/intake";

/**
 * The Intake queue and its staff-workflow mutations.
 *
 * Readiness itself is never written here — it is computed on every read from
 * authoritative records (see `computeIntakeChecklist`). What this route reads
 * and writes is the durable state Intake actually owns: which episode is
 * assigned to whom, its notes/outreach, follow-up, staff-review sign-off, and
 * disposition, plus the evidence records (consent signatures, form
 * submissions, eligibility attestations, payment readiness, identity-document
 * review) that have no other authoritative home yet.
 *
 * `patientId` in a request body may be a chart id or a prospective-person id
 * (D-076) — the caller already knows which one it has from the queue row it
 * came from, and every service method resolves access accordingly.
 */

function executionContext(req: Request) {
  return { source: "api" as const, requestId: req.headers.get("x-request-id") || undefined };
}

function intakeErrorResponse(error: unknown) {
  if (error instanceof IntakeError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  return clinicalActionError(error);
}

/** Splits a request body's `patientId` into the subject pair the service layer expects. */
function subjectFromBody(body: { patientId?: string; prospectivePersonId?: string }) {
  if (body.prospectivePersonId) return { prospectivePersonId: body.prospectivePersonId };
  return { patientId: body.patientId };
}

export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("patientId") || searchParams.get("prospectivePersonId");

    if (id) {
      return NextResponse.json({ success: true, detail: intakeService.getDetail(actor, id) });
    }

    if (searchParams.get("payerPlans")) {
      return NextResponse.json({ success: true, participations: intakeService.listPayerPlanParticipations(actor) });
    }

    return NextResponse.json({ success: true, queue: intakeService.buildQueue(actor) });
  } catch (error) {
    return intakeErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const context = executionContext(req);
    const body = await req.json();
    const action = body?.action;

    switch (action) {
      case "assign": {
        const { episodeId, staffId, staffName } = body;
        return NextResponse.json({ success: true, episode: intakeService.assign(actor, context, episodeId, staffId, staffName) });
      }
      case "unassign": {
        const { episodeId } = body;
        return NextResponse.json({ success: true, episode: intakeService.unassign(actor, context, episodeId) });
      }
      case "add_note": {
        const { episodeId, body: noteBody, kind } = body;
        return NextResponse.json({ success: true, note: intakeService.addNote(actor, context, episodeId, noteBody, kind) });
      }
      case "set_follow_up": {
        const { episodeId, followUpAt } = body;
        return NextResponse.json({ success: true, episode: intakeService.setFollowUp(actor, context, episodeId, followUpAt ?? null) });
      }
      case "set_guardian_situation": {
        const { episodeId, situation } = body as { episodeId: string; situation: GuardianSituation };
        return NextResponse.json({ success: true, episode: intakeService.setGuardianSituation(actor, context, episodeId, situation) });
      }
      case "resolve_staff_review": {
        const { episodeId } = body;
        return NextResponse.json({ success: true, episode: intakeService.resolveStaffReview(actor, context, episodeId) });
      }
      case "reopen_staff_review": {
        const { episodeId } = body;
        return NextResponse.json({ success: true, episode: intakeService.reopenStaffReview(actor, context, episodeId) });
      }
      case "dispose": {
        const { episodeId, reason, note } = body as { episodeId: string; reason: IntakeDispositionReason; note?: string };
        return NextResponse.json({ success: true, episode: intakeService.dispose(actor, context, episodeId, reason, note) });
      }
      case "reactivate": {
        const { episodeId } = body;
        return NextResponse.json({ success: true, episode: intakeService.reactivate(actor, context, episodeId) });
      }
      case "confirm_with_override": {
        const { episodeId, appointmentId, reason } = body as { episodeId: string; appointmentId: string; reason: string };
        return NextResponse.json({ success: true, appointment: intakeService.confirmWithOverride(actor, context, { episodeId, appointmentId, reason }) });
      }
      case "record_identity_document_review": {
        const { documentId, result, legible, conflictNote } = body as {
          documentId: string; result: IdentityDocumentReviewResult; legible: boolean; conflictNote?: string;
        };
        return NextResponse.json({
          success: true,
          review: intakeService.recordIdentityDocumentReview(actor, context, { ...subjectFromBody(body), documentId, result, legible, conflictNote }),
        });
      }
      case "upload_document": {
        const { documentType, title, contentText } = body as { documentType: string; title: string; contentText?: string };
        return NextResponse.json({
          success: true,
          document: intakeService.uploadDocument(actor, context, { ...subjectFromBody(body), documentType, title, contentText }),
        });
      }
      case "transition_document": {
        const { documentId, toStatus, note, supersededByDocumentId } = body as {
          documentId: string; toStatus: DocumentWorkflowStatus; note?: string; supersededByDocumentId?: string;
        };
        return NextResponse.json({
          success: true,
          result: intakeService.transitionDocument(actor, context, { documentId, toStatus, note, supersededByDocumentId }),
        });
      }
      case "add_coverage": {
        const { payerName, planName, memberId, groupNumber, subscriberName, subscriberDob, relationship, effectiveDate, coverageType, coveragePriority, isSelfPay } = body as {
          payerName?: string; planName?: string; memberId?: string; groupNumber?: string; subscriberName?: string;
          subscriberDob?: string; relationship?: string; effectiveDate?: string; coverageType?: string; coveragePriority?: number; isSelfPay?: boolean;
        };
        return NextResponse.json({
          success: true,
          coverage: intakeService.addCoverage(actor, context, {
            ...subjectFromBody(body), payerName, planName, memberId, groupNumber, subscriberName,
            subscriberDob, relationship, effectiveDate, coverageType, coveragePriority, isSelfPay,
          }),
        });
      }
      case "record_consent_signature": {
        const { templateId, signerName, signerRelationship } = body as {
          templateId: string; signerName: string; signerRelationship: ConsentSignature["signerRelationship"];
        };
        return NextResponse.json({
          success: true,
          signature: intakeService.recordConsentSignature(actor, context, { ...subjectFromBody(body), templateId, signerName, signerRelationship }),
        });
      }
      case "save_form_submission": {
        const { templateId, submissionId, answers, status, respondent, respondentName } = body as {
          templateId: string; submissionId?: string; answers: Record<string, string>;
          status: "in_progress" | "submitted"; respondent?: FormSubmission["respondent"]; respondentName?: string;
        };
        return NextResponse.json({
          success: true,
          submission: intakeService.saveFormSubmission(actor, context, { ...subjectFromBody(body), templateId, submissionId, answers, status, respondent, respondentName }),
        });
      }
      case "review_form_submission": {
        const { submissionId, reviewNotes } = body;
        return NextResponse.json({ success: true, submission: intakeService.reviewFormSubmission(actor, context, submissionId, reviewNotes) });
      }
      case "record_eligibility_check": {
        const { coveragePolicyId, result, note, benefitEvidence } = body as {
          coveragePolicyId: string; result: EligibilityResult; note?: string; benefitEvidence?: BenefitEvidence;
        };
        return NextResponse.json({
          success: true,
          eligibility: intakeService.recordEligibilityCheck(actor, context, { ...subjectFromBody(body), coveragePolicyId, result, note, benefitEvidence }),
        });
      }
      case "record_payment_readiness": {
        const { status, brand, lastFour, waiverReason } = body as {
          status: PaymentReadinessStatus; brand?: string; lastFour?: string; waiverReason?: string;
        };
        return NextResponse.json({
          success: true,
          payment: intakeService.recordPaymentReadiness(actor, context, { ...subjectFromBody(body), status, brand, lastFour, waiverReason }),
        });
      }
      case "add_payer_plan_participation": {
        const { payerName, product, planName, network, status, notes } = body as {
          payerName: string; product?: string; planName?: string; network?: string; status: PayerParticipationStatus; notes?: string;
        };
        return NextResponse.json({
          success: true,
          participation: intakeService.addPayerPlanParticipation(actor, context, { payerName, product, planName, network, status, notes }),
        });
      }
      default:
        return NextResponse.json({ success: false, error: `Unsupported intake action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return intakeErrorResponse(error);
  }
}
