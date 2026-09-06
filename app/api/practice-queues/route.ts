import { NextResponse } from "next/server";
import { assertPermission, getProviderContext } from "../../server/auth/provider-context";
import { PracticeQueueRepository } from "../../server/repositories/practice-queue-repository";
import { clinicalActionError } from "../../server/http/clinical-http";

export async function GET(req: Request) {
  try {
    const actor = getProviderContext(req);
    assertPermission(actor, "read_clinical");
    const { searchParams } = new URL(req.url);
    const queue = searchParams.get("queue");
    const requestedLimit = Number(searchParams.get("limit") || 500);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 500;

    if (queue === "labs") {
      return NextResponse.json({ success: true, queue: "labs", rows: PracticeQueueRepository.labs(limit) });
    }
    if (queue === "documents") {
      return NextResponse.json({ success: true, queue: "documents", rows: PracticeQueueRepository.documents(limit) });
    }

    return NextResponse.json({ success: false, error: "queue must be labs or documents" }, { status: 400 });
  } catch (error) {
    return clinicalActionError(error);
  }
}
