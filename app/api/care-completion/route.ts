import { NextResponse } from "next/server";
import { getAuthenticatedProviderContext } from "../../server/auth/provider-context";
import { clinicalActionError } from "../../server/http/clinical-http";
import {
  CareCompletionError,
  careCompletionService,
} from "../../server/services/care-completion-service";
import { CareCompletionConcurrencyError } from "../../server/repositories/care-completion-repository";

/**
 * The care-completion board.
 *
 * Every request re-establishes the whole chain before anything is read or
 * written: authenticated session → organization → patient access → capability.
 * Nothing here trusts a patient id because it arrived in the request, and
 * nothing here trusts a pin row as evidence that the actor may see the patient
 * it names.
 *
 * The mutations this route accepts are care completion's own state only — a
 * personal pin, and a recorded reason that unresolved work is waiting. It
 * cannot sign, prescribe, schedule, acknowledge or send anything; those stay in
 * the workflows that own them, which the board links into.
 */

function careCompletionErrorResponse(error: unknown) {
  if (error instanceof CareCompletionError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  if (error instanceof CareCompletionConcurrencyError) {
    return NextResponse.json(
      {
        success: false,
        conflict: true,
        error: error.message,
        serverVersion: error.serverVersion,
      },
      { status: 409 },
    );
  }
  return clinicalActionError(error);
}

export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const { searchParams } = new URL(req.url);

    // A single-patient question: "is this chart on my board?" Answered without
    // building the whole projection, and only for a patient this actor reaches.
    const pinnedFor = searchParams.get("pinnedFor");
    if (pinnedFor) {
      return NextResponse.json({
        success: true,
        patientId: pinnedFor,
        pinned: careCompletionService.isPinned(actor, pinnedFor),
      });
    }

    return NextResponse.json({ success: true, board: careCompletionService.buildBoard(actor) });
  } catch (error) {
    return careCompletionErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const body = await req.json();
    const context = {
      source: "api" as const,
      requestId: req.headers.get("x-request-id") || undefined,
    };

    const patientId = typeof body?.patientId === "string" ? body.patientId.trim() : "";
    if (!patientId) {
      return NextResponse.json({ success: false, error: "patientId is required" }, { status: 400 });
    }

    switch (body?.action) {
      case "pin": {
        const pin = careCompletionService.pinPatient(actor, patientId, context, {
          source: typeof body.source === "string" ? body.source : undefined,
        });
        return NextResponse.json({ success: true, pin }, { status: 201 });
      }
      case "unpin": {
        const result = careCompletionService.unpinPatient(actor, patientId, context);
        return NextResponse.json({ success: true, ...result });
      }
      case "defer": {
        const deferral = careCompletionService.deferItem(
          actor,
          {
            patientId,
            itemKey: String(body.itemKey ?? ""),
            reasonCode: body.reasonCode,
            reasonText: typeof body.reasonText === "string" ? body.reasonText : undefined,
            resumeAt: typeof body.resumeAt === "string" ? body.resumeAt : undefined,
            expectedVersion:
              typeof body.expectedVersion === "number" ? body.expectedVersion : undefined,
          },
          context,
        );
        return NextResponse.json({ success: true, deferral }, { status: 201 });
      }
      case "resume": {
        const deferral = careCompletionService.resumeItem(
          actor,
          {
            patientId,
            itemKey: String(body.itemKey ?? ""),
            expectedVersion:
              typeof body.expectedVersion === "number" ? body.expectedVersion : undefined,
          },
          context,
        );
        return NextResponse.json({ success: true, deferral });
      }
      default:
        return NextResponse.json(
          { success: false, error: "action must be pin, unpin, defer, or resume" },
          { status: 400 },
        );
    }
  } catch (error) {
    return careCompletionErrorResponse(error);
  }
}
