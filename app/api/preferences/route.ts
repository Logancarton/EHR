import { NextResponse } from "next/server";
import {
  getAuthenticatedProviderContext,
  providerLabel,
} from "../../server/auth/provider-context";
import { PreferenceRepository, PreferenceConcurrencyError } from "../../server/repositories/preference-repository";
import { AuditRepository } from "../../server/repositories/audit-repository";
import { clinicalActionError } from "../../server/http/clinical-http";

/** Owned by `PUT /api/workspace-state`; see the merge in this route's PUT handler. */
const WORKSPACE_STATE_KEY = "workspaceState";
/**
 * The rail fields `PUT /api/preferences/rails` owns, merged back for the same reason.
 *
 * Only these four. `activeRightPanel` and `rightPanelOpen` also live under `rails`,
 * but the rails endpoint does not accept them and this route's writer is their only
 * writer, so carving out the whole `rails` object would stop the companion panel
 * remembering which tool was open.
 */
const RAIL_PIN_KEYS = ["left", "right", "leftWidth", "rightWidth"] as const;

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
    //
    // The pinned rails are the same shape of thing and were missing the same
    // protection. `/api/preferences/rails` exists precisely so the rail editor does not
    // have to hold the whole record — but this handler still accepted `rails.left` and
    // `rails.right` from a writer that had only ever read them, so a page whose
    // in-memory preferences were seeded from defaults (an empty local cache, or a
    // hydration that had not landed) would PUT those defaults straight over a rail the
    // clinician had just changed. The unpin reached the server and was overwritten a
    // moment later, which is why "Unpin from Companion Rail" appeared to work and did
    // not survive on another device. Every legitimate pin change — reset to defaults,
    // adopting a practice template, applying a saved layout — already writes through
    // the rails endpoint too, so taking these four fields from the stored record
    // costs nothing and closes the race.
    const existing = PreferenceRepository.getPreferences(actor.userId) as Record<string, unknown>;
    const merged = {
      ...body.preferences,
      [WORKSPACE_STATE_KEY]: existing[WORKSPACE_STATE_KEY],
    };
    if (merged[WORKSPACE_STATE_KEY] === undefined) delete merged[WORKSPACE_STATE_KEY];

    const existingRails = (existing.rails ?? {}) as Record<string, unknown>;
    const incomingRails = (merged.rails ?? {}) as Record<string, unknown>;
    const mergedRails: Record<string, unknown> = { ...incomingRails };
    for (const key of RAIL_PIN_KEYS) {
      if (existingRails[key] === undefined) delete mergedRails[key];
      else mergedRails[key] = existingRails[key];
    }
    if (merged.rails !== undefined || Object.keys(mergedRails).length > 0) {
      merged.rails = mergedRails;
    }

    const expectedRev =
      typeof body.expectedRevision === "number"
        ? body.expectedRevision
        : undefined;

    // Preference ownership is the authenticated session, never a client-supplied providerId.
    const updated = PreferenceRepository.savePreferences(merged, actor.userId, expectedRev);

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
    if (error instanceof PreferenceConcurrencyError) {
      return NextResponse.json(
        {
          success: false,
          error: "Revision conflict: workspace preferences were modified in another session",
          conflict: true,
          serverRevision: error.serverRevision,
          serverPreferences: error.serverPreferences,
        },
        { status: 409 },
      );
    }
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  return PUT(req);
}
