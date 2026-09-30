import { NextResponse } from "next/server";
import {
  authenticatedClinicalRequest,
  clinicalActionError,
} from "../../../server/http/clinical-http";
import { PresenceTracker } from "../../../server/presence/presence-tracker";
import type { TeamPresence } from "../../../domain/team-collaboration";
import { sharePractice } from "../../../server/services/collaboration-service";

export async function GET(req: Request) {
  try {
    const { actor } = authenticatedClinicalRequest(req);
    // Who is online, and where, is visible to colleagues in the same practice
    // only; it listed every signed-in member of every practice.
    const presenceList = PresenceTracker.listPresence().filter(
      (record) => record.userId === actor.userId || sharePractice(actor.userId, record.userId),
    );
    return NextResponse.json({ success: true, presence: presenceList });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const { actor } = authenticatedClinicalRequest(req);
    const body = await req.json().catch(() => ({}));

    const explicitStatus = body.status as TeamPresence | undefined;
    let record;

    if (explicitStatus === "offline" || explicitStatus === "away" || explicitStatus === "online") {
      record = PresenceTracker.setExplicitStatus(actor.userId, explicitStatus);
    } else {
      record = PresenceTracker.recordHeartbeat(actor.userId, body.location);
    }

    return NextResponse.json({ success: true, presence: record });
  } catch (error) {
    return clinicalActionError(error);
  }
}
