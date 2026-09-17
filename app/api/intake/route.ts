import { NextResponse } from "next/server";
import { getAuthenticatedProviderContext } from "../../server/auth/provider-context";
import { clinicalActionError } from "../../server/http/clinical-http";
import { IntakeError, intakeService } from "../../server/services/intake-service";
import type {
  ConsentSignature,
  EligibilityResult,
  FormSubmission,
  GuardianSituation,
  IntakeDispositionReason,
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
 * submissions, eligibility attestations, payment readiness) that have no
 * other authoritative home yet.
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

export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId");

    if (patientId) {
      return NextResponse.json({ success: true, detail: intakeService.getDetail(actor, patientId) });
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
      case "record_consent_signature": {
        const { patientId, templateId, signerName, signerRelationship } = body as {
          patientId: string; templateId: string; signerName: string; signerRelationship: ConsentSignature["signerRelationship"];
        };
        return NextResponse.json({
          success: true,
          signature: intakeService.recordConsentSignature(actor, context, { patientId, templateId, signerName, signerRelationship }),
        });
      }
      case "save_form_submission": {
        const { patientId, templateId, submissionId, answers, status, respondent, respondentName } = body as {
          patientId: string; templateId: string; submissionId?: string; answers: Record<string, string>;
          status: "in_progress" | "submitted"; respondent?: FormSubmission["respondent"]; respondentName?: string;
        };
        return NextResponse.json({
          success: true,
          submission: intakeService.saveFormSubmission(actor, context, { patientId, templateId, submissionId, answers, status, respondent, respondentName }),
        });
      }
      case "review_form_submission": {
        const { submissionId, reviewNotes } = body;
        return NextResponse.json({ success: true, submission: intakeService.reviewFormSubmission(actor, context, submissionId, reviewNotes) });
      }
      case "record_eligibility_check": {
        const { patientId, coveragePolicyId, result, note } = body as {
          patientId: string; coveragePolicyId: string; result: EligibilityResult; note?: string;
        };
        return NextResponse.json({
          success: true,
          eligibility: intakeService.recordEligibilityCheck(actor, context, { patientId, coveragePolicyId, result, note }),
        });
      }
      case "record_payment_readiness": {
        const { patientId, status, brand, lastFour, waiverReason } = body as {
          patientId: string; status: PaymentReadinessStatus; brand?: string; lastFour?: string; waiverReason?: string;
        };
        return NextResponse.json({
          success: true,
          payment: intakeService.recordPaymentReadiness(actor, context, { patientId, status, brand, lastFour, waiverReason }),
        });
      }
      case "add_payer_plan_participation": {
        const { payerName, product, planName, network, notes } = body;
        return NextResponse.json({
          success: true,
          participation: intakeService.addPayerPlanParticipation(actor, context, { payerName, product, planName, network, notes }),
        });
      }
      default:
        return NextResponse.json({ success: false, error: `Unsupported intake action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return intakeErrorResponse(error);
  }
}
