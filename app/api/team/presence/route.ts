import { NextResponse } from "next/server";
import {
  authenticatedClinicalRequest,
  clinicalActionError,
} from "../../../server/http/clinical-http";
import { PresenceTracker } from "../../../server/presence/presence-tracker";
import type { TeamPresence } from "../../../domain/team-collaboration";

export async function GET(req: Request) {
  try {
    authenticatedClinicalRequest(req);
    const presenceList = PresenceTracker.listPresence();
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
