import { NextResponse } from "next/server";
import { assertPermission, getAuthenticatedProviderContext } from "../../server/auth/provider-context";
import { PracticeQueueRepository } from "../../server/repositories/practice-queue-repository";
import { clinicalActionError } from "../../server/http/clinical-http";
import { accessiblePatientIds } from "../../server/auth/patient-access";

export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    assertPermission(actor, "read_clinical");
    const { searchParams } = new URL(req.url);
    const queue = searchParams.get("queue");
    const requestedLimit = Number(searchParams.get("limit") || 500);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 500;

    // Practice-wide queues cross patients, so they are scoped to the reachable
    // population before any row is returned.
    const scope = accessiblePatientIds(actor);

    if (queue === "labs") {
      return NextResponse.json({ success: true, queue: "labs", rows: PracticeQueueRepository.labs(limit, scope) });
    }
    if (queue === "documents") {
      return NextResponse.json({ success: true, queue: "documents", rows: PracticeQueueRepository.documents(limit, scope) });
    }

    return NextResponse.json({ success: false, error: "queue must be labs or documents" }, { status: 400 });
  } catch (error) {
    return clinicalActionError(error);
  }
}
