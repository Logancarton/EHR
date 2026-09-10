import { NextResponse } from "next/server";
import {
  getAuthenticatedProviderContext,
  providerLabel,
} from "../../server/auth/provider-context";
import { PreferenceRepository } from "../../server/repositories/preference-repository";
import { AuditRepository } from "../../server/repositories/audit-repository";
import { clinicalActionError } from "../../server/http/clinical-http";

/** Owned by `PUT /api/workspace-state`; see the merge in this route's PUT handler. */
const WORKSPACE_STATE_KEY = "workspaceState";

export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const preferences = PreferenceRepository.getPreferences(actor.userId);
    return NextResponse.json({ success: true, preferences });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function PUT(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const body = await req.json();

    if (!body.preferences || typeof body.preferences !== "object" || Array.isArray(body.preferences)) {
      return NextResponse.json({ success: false, error: "preferences object is required" }, { status: 400 });
    }

    // Workspace restoration state is stored inside the same preference record but is
    // owned by its own endpoint and its own writer. A display-preferences write must
    // not carry it away: the client round-tripping it back is not something to rely
    // on, and preferences now save on every hide, collapse and density change.
    const existing = PreferenceRepository.getPreferences(actor.userId) as Record<string, unknown>;
    const merged = {
      ...body.preferences,
      [WORKSPACE_STATE_KEY]: existing[WORKSPACE_STATE_KEY],
    };
    if (merged[WORKSPACE_STATE_KEY] === undefined) delete merged[WORKSPACE_STATE_KEY];

    // Preference ownership is the authenticated session, never a client-supplied providerId.
    const updated = PreferenceRepository.savePreferences(merged, actor.userId);

    AuditRepository.log({
      userId: actor.userId,
      userName: providerLabel(actor),
      userRole: actor.role,
      eventType: "preference_updated",
      description: `Updated workspace display preferences: density=${updated.density}, preset=${updated.activePresetId}`,
      metadata: { density: updated.density, activePresetId: updated.activePresetId },
    });

    return NextResponse.json({ success: true, preferences: updated });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  return PUT(req);
}
